/**
 * Compliance tRPC router.
 *
 * Mounted into the existing appRouter as `compliance.*`. Every procedure:
 *  - is gated by the COMPLIANCE_MODULE feature flag,
 *  - enforces a normalized PERMISSION on the server (never a hidden button),
 *  - enforces per-client access scoping (defends against cross-client IDOR),
 *  - and records tamper-evident audit events for material changes.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { parse as parseCookieHeader } from "cookie";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import type { User } from "../../drizzle/schema";
import { getSubmissionById } from "../db";
import { requireDb } from "./db";
import {
  userComplianceRoles, complianceRoles as complianceRolesTable,
} from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { PERMISSIONS, type Permission, type ComplianceRole } from "@shared/compliance/constants";
import { hasPermission } from "./rbac";
import { isComplianceModuleEnabled, complianceFlagSnapshot } from "./flags";
import * as store from "./store";
import { consumeUnits } from "./authorizations";
import { loadAuditChain, verifyAuditChain, getEventsForRecord } from "./audit";

// ─── Actor + subject helpers ─────────────────────────────────────────────────
const SESSION_ID_COOKIE = "admin_session_id";
const IMPERSONATION_COOKIE = "impersonation_original_session";

interface Ctx {
  user: User;
  req: { headers: { cookie?: string; "user-agent"?: string }; ip?: string; socket?: { remoteAddress?: string } };
}

function actorFromCtx(ctx: Ctx): store.Actor {
  const cookies = parseCookieHeader(ctx.req.headers.cookie ?? "");
  const ip = ctx.req.ip ?? ctx.req.socket?.remoteAddress ?? "unknown";
  const actor: store.Actor = {
    actorId: ctx.user.id,
    actorName: ctx.user.name ?? ctx.user.email ?? "Staff",
    actorRole: ctx.user.role,
    orgId: ctx.user.orgId ?? null,
    sessionId: cookies[SESSION_ID_COOKIE] ?? null,
    originalActorId: cookies[IMPERSONATION_COOKIE] ? ctx.user.id : null,
    ip,
    userAgent: ctx.req.headers["user-agent"] ?? null,
  };
  return actor;
}

/** Load the user's normalized compliance-role keys (best-effort). */
async function loadComplianceRoles(userId: number): Promise<ComplianceRole[]> {
  try {
    const db = await requireDb();
    const rows = await db
      .select({ key: complianceRolesTable.key })
      .from(userComplianceRoles)
      .innerJoin(complianceRolesTable, eq(userComplianceRoles.roleId, complianceRolesTable.id))
      .where(eq(userComplianceRoles.userId, userId));
    return rows.map((r) => r.key as ComplianceRole);
  } catch {
    return [];
  }
}

/** Build a procedure that requires the compliance module + a specific permission. */
function permProcedure(perm: Permission) {
  return protectedProcedure.use(async ({ ctx, next }) => {
    if (!isComplianceModuleEnabled()) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Compliance module is not enabled." });
    }
    const complianceRoleKeys = await loadComplianceRoles(ctx.user.id);
    if (!hasPermission({ role: ctx.user.role, complianceRoles: complianceRoleKeys }, perm)) {
      throw new TRPCError({ code: "FORBIDDEN", message: `Missing permission: ${perm}` });
    }
    return next();
  });
}

/**
 * Per-client access scoping. Internal staff (admin/super_admin/worker/viewer)
 * and holders of compliance roles see all clients; an assessor may only touch a
 * client assigned to them or referred to their org. Defends against cross-client
 * IDOR by resolving the submission server-side.
 */
async function assertClientAccess(user: User, submissionId: number): Promise<void> {
  const submission = await getSubmissionById(submissionId);
  if (!submission) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" });
  if (user.role === "assessor") {
    const assigned = submission.assessorId === user.id;
    const orgMatch = submission.referredOrgId != null && submission.referredOrgId === user.orgId;
    if (!assigned && !orgMatch) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Not assigned to this client" });
    }
  }
}

// ─── Input schemas ───────────────────────────────────────────────────────────
const submissionIdInput = z.object({ submissionId: z.number().int().positive() });

export const complianceRouter = router({
  /** Public: flag snapshot so the UI matches the server. */
  flags: publicProcedure.query(() => complianceFlagSnapshot()),

  readiness: router({
    get: permProcedure(PERMISSIONS.READINESS_VIEW).input(submissionIdInput).query(async ({ input, ctx }) => {
      await assertClientAccess(ctx.user, input.submissionId);
      return store.getReadiness(input.submissionId);
    }),
    recompute: permProcedure(PERMISSIONS.READINESS_VIEW).input(submissionIdInput).mutation(async ({ input, ctx }) => {
      await assertClientAccess(ctx.user, input.submissionId);
      return store.recomputeReadiness(actorFromCtx(ctx), input.submissionId);
    }),
  }),

  eligibility: router({
    list: permProcedure(PERMISSIONS.ELIGIBILITY_VIEW).input(submissionIdInput).query(async ({ input, ctx }) => {
      await assertClientAccess(ctx.user, input.submissionId);
      return store.listEligibilityBySubmission(input.submissionId);
    }),
    create: permProcedure(PERMISSIONS.ELIGIBILITY_MANAGE).input(z.object({
      submissionId: z.number().int().positive(),
      medicaidStatus: z.enum(["active", "inactive", "pending", "unknown"]).default("unknown"),
      managedCareStatus: z.string().max(64).optional(),
      mco: z.string().max(128).optional(),
      cin: z.string().max(64).optional(),
      verificationSource: z.string().max(128).optional(),
      verificationReference: z.string().max(128).optional(),
      verificationMethod: z.string().max(64).optional(),
      effectiveStartDate: z.coerce.date().optional(),
      effectiveEndDate: z.coerce.date().optional(),
      status: z.enum(["verified", "pending", "expired", "not_eligible", "superseded"]).default("pending"),
      notes: z.string().max(2000).optional(),
    })).mutation(async ({ input, ctx }) => {
      await assertClientAccess(ctx.user, input.submissionId);
      const { cin, ...rest } = input;
      return store.createEligibilityVerification(actorFromCtx(ctx), {
        ...rest, cin: cin ?? null, verifiedDate: input.status === "verified" ? new Date() : null,
      });
    }),
  }),

  enrollment: router({
    list: permProcedure(PERMISSIONS.ELIGIBILITY_VIEW).input(submissionIdInput).query(async ({ input, ctx }) => {
      await assertClientAccess(ctx.user, input.submissionId);
      return store.listEnrollmentBySubmission(input.submissionId);
    }),
    create: permProcedure(PERMISSIONS.ELIGIBILITY_MANAGE).input(z.object({
      submissionId: z.number().int().positive(),
      program: z.string().max(128).optional(),
      scn: z.string().max(128).optional(),
      mco: z.string().max(128).optional(),
      serviceRegion: z.string().max(128).optional(),
      enrollmentStart: z.coerce.date().optional(),
      enrollmentEnd: z.coerce.date().optional(),
      enrollmentStatus: z.enum(["active", "terminated", "pending", "suspended"]).default("pending"),
    })).mutation(async ({ input, ctx }) => {
      await assertClientAccess(ctx.user, input.submissionId);
      return store.createEnrollmentEpisode(actorFromCtx(ctx), input);
    }),
  }),

  referrals: router({
    list: permProcedure(PERMISSIONS.REFERRAL_VIEW).input(submissionIdInput).query(async ({ input, ctx }) => {
      await assertClientAccess(ctx.user, input.submissionId);
      return store.listReferralsBySubmission(input.submissionId);
    }),
    create: permProcedure(PERMISSIONS.REFERRAL_MANAGE).input(z.object({
      submissionId: z.number().int().positive(),
      referralIdentifier: z.string().max(128).optional(),
      referringEntity: z.string().max(256).optional(),
      referralSource: z.string().max(128).optional(),
      referralDate: z.coerce.date().optional(),
      receivedDate: z.coerce.date().optional(),
      requestedService: z.string().max(256).optional(),
      enhancedPopulationCategory: z.string().max(128).optional(),
      scn: z.string().max(128).optional(),
      referralStatus: z.enum(["received", "in_review", "accepted", "rejected", "expired", "withdrawn"]).default("received"),
    })).mutation(async ({ input, ctx }) => {
      await assertClientAccess(ctx.user, input.submissionId);
      return store.createReferral(actorFromCtx(ctx), input);
    }),
    setStatus: permProcedure(PERMISSIONS.REFERRAL_MANAGE).input(z.object({
      referralId: z.number().int().positive(),
      submissionId: z.number().int().positive(),
      status: z.enum(["received", "in_review", "accepted", "rejected", "expired", "withdrawn"]),
      reason: z.string().max(2000).optional(),
    })).mutation(async ({ input, ctx }) => {
      await assertClientAccess(ctx.user, input.submissionId);
      return store.updateReferralStatus(actorFromCtx(ctx), input.referralId, input.status, input.reason);
    }),
  }),

  authorizations: router({
    list: permProcedure(PERMISSIONS.AUTHORIZATION_VIEW).input(submissionIdInput).query(async ({ input, ctx }) => {
      await assertClientAccess(ctx.user, input.submissionId);
      return store.listAuthorizationsBySubmission(input.submissionId);
    }),
    create: permProcedure(PERMISSIONS.AUTHORIZATION_MANAGE).input(z.object({
      submissionId: z.number().int().positive(),
      authorizationNumber: z.string().max(128).optional(),
      referralId: z.number().int().positive().optional(),
      serviceCategory: z.string().max(128).optional(),
      serviceCode: z.string().max(64).optional(),
      modifier: z.string().max(32).optional(),
      authorizedUnits: z.number().int().nonnegative(),
      unitType: z.enum(["meal", "box", "delivery", "day", "week", "unit"]).default("unit"),
      frequency: z.string().max(64).optional(),
      /** Money as a decimal string to avoid float rounding. */
      rate: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
      rateSource: z.string().max(128).optional(),
      startDate: z.coerce.date().optional(),
      endDate: z.coerce.date().optional(),
      restrictions: z.string().max(2000).optional(),
      status: z.enum(["draft", "active", "exhausted", "expired", "suspended", "voided"]).default("draft"),
    })).mutation(async ({ input, ctx }) => {
      await assertClientAccess(ctx.user, input.submissionId);
      return store.createAuthorization(actorFromCtx(ctx), input);
    }),
    consume: permProcedure(PERMISSIONS.AUTHORIZATION_MANAGE).input(z.object({
      authorizationId: z.number().int().positive(),
      submissionId: z.number().int().positive(),
      units: z.number().int().positive(),
      reason: z.string().max(2000).optional(),
    })).mutation(async ({ input, ctx }) => {
      await assertClientAccess(ctx.user, input.submissionId);
      const actor = actorFromCtx(ctx);
      return consumeUnits({
        authorizationId: input.authorizationId,
        requested: input.units,
        reason: input.reason,
        actor: { actorId: actor.actorId, actorName: actor.actorName, actorRole: actor.actorRole, sessionId: actor.sessionId, ip: actor.ip, requestId: actor.requestId },
      });
    }),
  }),

  requirements: router({
    listDefinitions: permProcedure(PERMISSIONS.REQUIREMENT_VIEW).query(() => store.listRequirementDefinitionsWithVersions()),
    createDefinition: permProcedure(PERMISSIONS.REQUIREMENT_MANAGE).input(z.object({
      key: z.string().min(2).max(96),
      category: z.string().max(96).optional(),
      title: z.string().min(2).max(256),
      plainDescription: z.string().max(4000).optional(),
      sourceOrganization: z.string().max(128).optional(),
      sourceDocument: z.string().max(256).optional(),
      sourceUrl: z.string().url().max(512).optional(),
      effectiveDate: z.coerce.date().optional(),
      endDate: z.coerce.date().optional(),
      serviceCategory: z.string().max(128).optional(),
      population: z.string().max(128).optional(),
      program: z.string().max(128).optional(),
      blocking: z.boolean().default(true),
      riskLevel: z.enum(["low", "medium", "high", "critical"]).default("medium"),
      version: z.number().int().positive().default(1),
      approvalStatus: z.enum(["draft", "internal_review", "attorney_review", "approved", "retired"]).default("draft"),
    })).mutation(async ({ input, ctx }) => {
      const { key, category, ...version } = input;
      return store.createRequirementDefinitionWithVersion(actorFromCtx(ctx), { key, category, version });
    }),
    assign: permProcedure(PERMISSIONS.REQUIREMENT_MANAGE).input(z.object({
      submissionId: z.number().int().positive(),
      serviceDate: z.coerce.date(),
      serviceCategory: z.string().max(128).optional(),
      program: z.string().max(128).optional(),
      population: z.string().max(128).optional(),
      scn: z.string().max(128).optional(),
      mco: z.string().max(128).optional(),
    })).mutation(async ({ input, ctx }) => {
      await assertClientAccess(ctx.user, input.submissionId);
      const { submissionId, ...rest } = input;
      return store.assignApplicableRequirements(actorFromCtx(ctx), submissionId, rest);
    }),
    listAssignments: permProcedure(PERMISSIONS.REQUIREMENT_VIEW).input(submissionIdInput).query(async ({ input, ctx }) => {
      await assertClientAccess(ctx.user, input.submissionId);
      return store.listAssignmentsBySubmission(input.submissionId);
    }),
    setAssignmentStatus: permProcedure(PERMISSIONS.REQUIREMENT_MANAGE).input(z.object({
      assignmentId: z.number().int().positive(),
      submissionId: z.number().int().positive(),
      status: z.enum(["pending", "in_progress", "satisfied", "failed", "waived", "not_applicable"]),
    })).mutation(async ({ input, ctx }) => {
      await assertClientAccess(ctx.user, input.submissionId);
      return store.setAssignmentStatus(actorFromCtx(ctx), input.assignmentId, input.status);
    }),
  }),

  exceptions: router({
    request: permProcedure(PERMISSIONS.EXCEPTION_REQUEST).input(z.object({
      submissionId: z.number().int().positive(),
      assignmentId: z.number().int().positive().optional(),
      exceptionType: z.string().min(2).max(64),
      justification: z.string().min(5).max(4000),
      effectiveDate: z.coerce.date().optional(),
      expirationDate: z.coerce.date().optional(),
    })).mutation(async ({ input, ctx }) => {
      await assertClientAccess(ctx.user, input.submissionId);
      return store.requestException(actorFromCtx(ctx), input);
    }),
    approve: permProcedure(PERMISSIONS.EXCEPTION_APPROVE).input(z.object({
      exceptionId: z.number().int().positive(),
    })).mutation(async ({ input, ctx }) => {
      return store.approveException(actorFromCtx(ctx), input.exceptionId);
    }),
  }),

  audit: router({
    verifyIntegrity: permProcedure(PERMISSIONS.AUDIT_VIEW).query(async () => {
      const db = await requireDb();
      const chain = await loadAuditChain(db);
      return verifyAuditChain(chain);
    }),
    forRecord: permProcedure(PERMISSIONS.AUDIT_VIEW).input(z.object({
      recordType: z.string().max(64),
      recordId: z.union([z.string(), z.number()]),
    })).query(async ({ input }) => {
      const db = await requireDb();
      return getEventsForRecord(db, input.recordType, input.recordId);
    }),
  }),
});

export type ComplianceRouter = typeof complianceRouter;
