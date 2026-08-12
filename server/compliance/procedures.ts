/**
 * Shared building blocks for the compliance tRPC routers: the permission-gated
 * procedure factory, the actor extractor, and per-client access scoping. Kept in
 * its own module so both `router.ts` and `routerOps.ts` can use them without a
 * circular import.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { parse as parseCookieHeader } from "cookie";
import { protectedProcedure } from "../_core/trpc";
import type { User } from "../../drizzle/schema";
import { getSubmissionById } from "../db";
import { requireDb } from "./db";
import { userComplianceRoles, complianceRoles as complianceRolesTable } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { type Permission, type ComplianceRole } from "@shared/compliance/constants";
import { hasPermission } from "./rbac";
import { isComplianceModuleEnabled } from "./flags";
import { type Actor } from "./store";

const SESSION_ID_COOKIE = "admin_session_id";
const IMPERSONATION_COOKIE = "impersonation_original_session";

export interface Ctx {
  user: User;
  req: { headers: { cookie?: string; "user-agent"?: string }; ip?: string; socket?: { remoteAddress?: string } };
}

export function actorFromCtx(ctx: Ctx): Actor {
  const cookies = parseCookieHeader(ctx.req.headers.cookie ?? "");
  const ip = ctx.req.ip ?? ctx.req.socket?.remoteAddress ?? "unknown";
  return {
    actorId: ctx.user.id,
    actorName: ctx.user.name ?? ctx.user.email ?? "Staff",
    actorRole: ctx.user.role,
    orgId: ctx.user.orgId ?? null,
    sessionId: cookies[SESSION_ID_COOKIE] ?? null,
    originalActorId: cookies[IMPERSONATION_COOKIE] ? ctx.user.id : null,
    ip,
    userAgent: ctx.req.headers["user-agent"] ?? null,
  };
}

/** Load the user's normalized compliance-role keys (best-effort). */
export async function loadComplianceRoles(userId: number): Promise<ComplianceRole[]> {
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
export function permProcedure(perm: Permission) {
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
 * Per-client access scoping. Internal staff and holders of compliance roles see
 * all clients; an assessor may only touch a client assigned to them or referred
 * to their org. Defends against cross-client IDOR by resolving the submission
 * server-side rather than trusting the client-supplied id.
 */
export async function assertClientAccess(user: User, submissionId: number): Promise<void> {
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

export const submissionIdInput = z.object({ submissionId: z.number().int().positive() });

/**
 * Resolve whether a user holds a SECOND permission (beyond the one the procedure
 * gate already required) — used e.g. to decide if a viewer may see attorney-client
 * privileged records. Loads the user's normalized compliance roles best-effort.
 */
export async function callerHasPermission(user: User, perm: Permission): Promise<boolean> {
  const complianceRoles = await loadComplianceRoles(user.id);
  return hasPermission({ role: user.role, complianceRoles }, perm);
}
