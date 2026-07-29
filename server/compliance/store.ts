/**
 * Compliance data operations.
 *
 * Every mutation that changes a material record runs inside a transaction and
 * records a tamper-evident audit event in the SAME transaction (via
 * `recordAuditEvent`). Reads never overwrite history — eligibility, referrals,
 * authorizations, and requirement versions are append-only / versioned.
 */
import { and, desc, eq } from "drizzle-orm";
import {
  submissions,
  eligibilityVerifications, type InsertEligibilityVerification, type EligibilityVerification,
  enrollmentEpisodes, type InsertEnrollmentEpisode, type EnrollmentEpisode,
  scnReferrals, type InsertScnReferral, type ScnReferral,
  serviceAuthorizations, type InsertServiceAuthorization, type ServiceAuthorization,
  requirementDefinitions, type RequirementDefinition,
  requirementVersions, type InsertRequirementVersion, type RequirementVersion,
  requirementApplicabilityRules, type RequirementApplicabilityRule,
  requirementAssignments, type RequirementAssignment,
  requirementExceptions, type RequirementException,
  complianceReadiness, type ComplianceReadiness,
} from "../../drizzle/schema";
import { recordAuditEvent, type AuditEventInput } from "./audit";
import { requireDb, withTransaction, type Tx } from "./db";
import { computeReadiness, type ReadinessInput } from "./readiness";
import { requirementApplies, selectEffectiveVersion, retroactiveApplicationAllowed, type EvaluationContext } from "./requirements";
import { canApproveException } from "./gates";
import { normalizeCin, type ReadinessStatus } from "@shared/compliance/constants";

export type Actor = Pick<AuditEventInput, "actorId" | "actorName" | "actorRole" | "orgId" | "sessionId" | "ip" | "userAgent" | "requestId" | "originalActorId">;

// ─── Eligibility (append-only) ───────────────────────────────────────────────
export async function createEligibilityVerification(
  actor: Actor,
  data: Omit<InsertEligibilityVerification, "id" | "createdAt" | "updatedAt" | "cinNormalized"> & { cin?: string | null },
): Promise<EligibilityVerification> {
  return withTransaction(async (tx) => {
    const row: InsertEligibilityVerification = {
      ...data,
      cinNormalized: data.cin ? normalizeCin(data.cin) : null,
      createdBy: actor.actorId ?? null,
    };
    const inserted = await tx.insert(eligibilityVerifications).values(row).$returningId();
    const id = inserted[0].id;
    await recordAuditEvent(tx, {
      ...actor,
      action: "eligibility_verification_created",
      recordType: "eligibilityVerification",
      recordId: id,
      clientId: data.submissionId,
      newValue: { status: data.status, medicaidStatus: data.medicaidStatus, mco: data.mco },
    });
    const [created] = await tx.select().from(eligibilityVerifications).where(eq(eligibilityVerifications.id, id));
    return created;
  });
}

export async function listEligibilityBySubmission(submissionId: number): Promise<EligibilityVerification[]> {
  const db = await requireDb();
  return db.select().from(eligibilityVerifications)
    .where(and(eq(eligibilityVerifications.submissionId, submissionId), eq(eligibilityVerifications.recordStatus, "active")))
    .orderBy(desc(eligibilityVerifications.createdAt));
}

// ─── Enrollment episodes ─────────────────────────────────────────────────────
export async function createEnrollmentEpisode(
  actor: Actor,
  data: Omit<InsertEnrollmentEpisode, "id" | "createdAt" | "updatedAt">,
): Promise<EnrollmentEpisode> {
  return withTransaction(async (tx) => {
    const inserted = await tx.insert(enrollmentEpisodes).values({ ...data, createdBy: actor.actorId ?? null }).$returningId();
    const id = inserted[0].id;
    await recordAuditEvent(tx, {
      ...actor, action: "enrollment_episode_created", recordType: "enrollmentEpisode", recordId: id, clientId: data.submissionId,
      newValue: { program: data.program, enrollmentStatus: data.enrollmentStatus },
    });
    const [created] = await tx.select().from(enrollmentEpisodes).where(eq(enrollmentEpisodes.id, id));
    return created;
  });
}

export async function listEnrollmentBySubmission(submissionId: number): Promise<EnrollmentEpisode[]> {
  const db = await requireDb();
  return db.select().from(enrollmentEpisodes).where(eq(enrollmentEpisodes.submissionId, submissionId)).orderBy(desc(enrollmentEpisodes.createdAt));
}

// ─── SCN referrals ───────────────────────────────────────────────────────────
export async function createReferral(
  actor: Actor,
  data: Omit<InsertScnReferral, "id" | "createdAt" | "updatedAt">,
): Promise<ScnReferral> {
  return withTransaction(async (tx) => {
    const inserted = await tx.insert(scnReferrals).values({ ...data, createdBy: actor.actorId ?? null }).$returningId();
    const id = inserted[0].id;
    await recordAuditEvent(tx, {
      ...actor, action: "referral_created", recordType: "scnReferral", recordId: id, clientId: data.submissionId,
      newValue: { referralStatus: data.referralStatus, referringEntity: data.referringEntity },
    });
    const [created] = await tx.select().from(scnReferrals).where(eq(scnReferrals.id, id));
    return created;
  });
}

export async function updateReferralStatus(
  actor: Actor,
  referralId: number,
  status: ScnReferral["referralStatus"],
  reason?: string,
): Promise<ScnReferral> {
  return withTransaction(async (tx) => {
    const [prev] = await tx.select().from(scnReferrals).where(eq(scnReferrals.id, referralId)).for("update");
    if (!prev) throw new Error("REFERRAL_NOT_FOUND");
    await tx.update(scnReferrals)
      .set({ referralStatus: status, rejectionReason: status === "rejected" ? reason ?? null : prev.rejectionReason, acceptanceDate: status === "accepted" ? new Date() : prev.acceptanceDate, version: prev.version + 1 })
      .where(eq(scnReferrals.id, referralId));
    await recordAuditEvent(tx, {
      ...actor, action: "referral_status_changed", recordType: "scnReferral", recordId: referralId, clientId: prev.submissionId,
      prevValue: { referralStatus: prev.referralStatus }, newValue: { referralStatus: status }, reason: reason ?? null,
    });
    const [updated] = await tx.select().from(scnReferrals).where(eq(scnReferrals.id, referralId));
    return updated;
  });
}

export async function listReferralsBySubmission(submissionId: number): Promise<ScnReferral[]> {
  const db = await requireDb();
  return db.select().from(scnReferrals).where(eq(scnReferrals.submissionId, submissionId)).orderBy(desc(scnReferrals.createdAt));
}

// ─── Service authorizations ──────────────────────────────────────────────────
export async function createAuthorization(
  actor: Actor,
  data: Omit<InsertServiceAuthorization, "id" | "createdAt" | "updatedAt" | "remainingUnits"> & { remainingUnits?: number },
): Promise<ServiceAuthorization> {
  return withTransaction(async (tx) => {
    const remaining = data.remainingUnits ?? data.authorizedUnits ?? 0;
    const inserted = await tx.insert(serviceAuthorizations).values({ ...data, remainingUnits: remaining, createdBy: actor.actorId ?? null }).$returningId();
    const id = inserted[0].id;
    await recordAuditEvent(tx, {
      ...actor, action: "authorization_created", recordType: "serviceAuthorization", recordId: id, clientId: data.submissionId,
      newValue: { authorizedUnits: data.authorizedUnits, remainingUnits: remaining, rate: data.rate, status: data.status },
    });
    const [created] = await tx.select().from(serviceAuthorizations).where(eq(serviceAuthorizations.id, id));
    return created;
  });
}

export async function listAuthorizationsBySubmission(submissionId: number): Promise<ServiceAuthorization[]> {
  const db = await requireDb();
  return db.select().from(serviceAuthorizations).where(eq(serviceAuthorizations.submissionId, submissionId)).orderBy(desc(serviceAuthorizations.createdAt));
}

// ─── Requirements engine ─────────────────────────────────────────────────────
export async function listRequirementDefinitionsWithVersions(): Promise<Array<{ definition: RequirementDefinition; versions: RequirementVersion[] }>> {
  const db = await requireDb();
  const defs = await db.select().from(requirementDefinitions).orderBy(desc(requirementDefinitions.id));
  const out: Array<{ definition: RequirementDefinition; versions: RequirementVersion[] }> = [];
  for (const def of defs) {
    const versions = await db.select().from(requirementVersions).where(eq(requirementVersions.definitionId, def.id)).orderBy(desc(requirementVersions.version));
    out.push({ definition: def, versions });
  }
  return out;
}

/**
 * Assign every applicable, effective requirement to a client for a service date.
 * Uses the config-driven engine: for each definition, pick the version in force
 * on the service date, check applicability rules, and (unless already assigned)
 * create a pending assignment. Never applies a retroactive version without
 * approval.
 */
export async function assignApplicableRequirements(
  actor: Actor,
  submissionId: number,
  ctx: EvaluationContext,
): Promise<{ assigned: number; skippedRetroactive: number }> {
  const db = await requireDb();
  const defs = await db.select().from(requirementDefinitions).where(eq(requirementDefinitions.isActive, true));
  let assigned = 0;
  let skippedRetroactive = 0;

  for (const def of defs) {
    const versions = await db.select().from(requirementVersions).where(eq(requirementVersions.definitionId, def.id));
    const version = selectEffectiveVersion(versions, ctx.serviceDate);
    if (!version) continue;
    if (!retroactiveApplicationAllowed(version, ctx.serviceDate)) { skippedRetroactive++; continue; }
    const rules = await db.select().from(requirementApplicabilityRules).where(eq(requirementApplicabilityRules.requirementVersionId, version.id));
    if (!requirementApplies(rules, ctx)) continue;

    await withTransaction(async (tx) => {
      const existing = await tx.select().from(requirementAssignments)
        .where(and(eq(requirementAssignments.submissionId, submissionId), eq(requirementAssignments.requirementVersionId, version.id)));
      if (existing.length > 0) return;
      const inserted = await tx.insert(requirementAssignments).values({
        submissionId, requirementVersionId: version.id, serviceDate: ctx.serviceDate,
        status: "pending", blocking: version.blocking, createdBy: actor.actorId ?? null,
      }).$returningId();
      assigned++;
      await recordAuditEvent(tx, {
        ...actor, action: "requirement_assigned", recordType: "requirementAssignment", recordId: inserted[0].id, clientId: submissionId,
        newValue: { requirementVersionId: version.id, blocking: version.blocking, title: version.title },
      });
    });
  }
  return { assigned, skippedRetroactive };
}

export async function listAssignmentsBySubmission(submissionId: number): Promise<Array<RequirementAssignment & { title: string | null; blockingVersion: boolean }>> {
  const db = await requireDb();
  const rows = await db.select().from(requirementAssignments)
    .where(and(eq(requirementAssignments.submissionId, submissionId), eq(requirementAssignments.recordStatus, "active")))
    .orderBy(desc(requirementAssignments.createdAt));
  const out: Array<RequirementAssignment & { title: string | null; blockingVersion: boolean }> = [];
  for (const r of rows) {
    const [v] = await db.select().from(requirementVersions).where(eq(requirementVersions.id, r.requirementVersionId));
    out.push({ ...r, title: v?.title ?? null, blockingVersion: v?.blocking ?? r.blocking });
  }
  return out;
}

export async function setAssignmentStatus(
  actor: Actor,
  assignmentId: number,
  status: RequirementAssignment["status"],
): Promise<RequirementAssignment> {
  return withTransaction(async (tx) => {
    const [prev] = await tx.select().from(requirementAssignments).where(eq(requirementAssignments.id, assignmentId)).for("update");
    if (!prev) throw new Error("ASSIGNMENT_NOT_FOUND");
    await tx.update(requirementAssignments)
      .set({ status, satisfiedAt: status === "satisfied" ? new Date() : prev.satisfiedAt, version: prev.version + 1 })
      .where(eq(requirementAssignments.id, assignmentId));
    await recordAuditEvent(tx, {
      ...actor, action: "requirement_assignment_status_changed", recordType: "requirementAssignment", recordId: assignmentId, clientId: prev.submissionId,
      prevValue: { status: prev.status }, newValue: { status },
    });
    const [updated] = await tx.select().from(requirementAssignments).where(eq(requirementAssignments.id, assignmentId));
    return updated;
  });
}

// ─── Exceptions (separation of duties enforced) ──────────────────────────────
export async function requestException(
  actor: Actor,
  data: { submissionId: number; assignmentId?: number | null; exceptionType: string; justification: string; supportingDocumentId?: number | null; effectiveDate?: Date | null; expirationDate?: Date | null },
): Promise<RequirementException> {
  if (actor.actorId == null) throw new Error("ACTOR_REQUIRED");
  return withTransaction(async (tx) => {
    const inserted = await tx.insert(requirementExceptions).values({
      submissionId: data.submissionId, assignmentId: data.assignmentId ?? null, exceptionType: data.exceptionType,
      justification: data.justification, supportingDocumentId: data.supportingDocumentId ?? null,
      requestedBy: actor.actorId as number, status: "requested",
      effectiveDate: data.effectiveDate ?? null, expirationDate: data.expirationDate ?? null,
    }).$returningId();
    const id = inserted[0].id;
    await recordAuditEvent(tx, {
      ...actor, action: "exception_requested", recordType: "requirementException", recordId: id, clientId: data.submissionId,
      newValue: { exceptionType: data.exceptionType }, reason: data.justification,
    });
    const [created] = await tx.select().from(requirementExceptions).where(eq(requirementExceptions.id, id));
    return created;
  });
}

export async function approveException(actor: Actor, exceptionId: number): Promise<RequirementException> {
  if (actor.actorId == null) throw new Error("ACTOR_REQUIRED");
  return withTransaction(async (tx) => {
    const [prev] = await tx.select().from(requirementExceptions).where(eq(requirementExceptions.id, exceptionId)).for("update");
    if (!prev) throw new Error("EXCEPTION_NOT_FOUND");
    // Separation of duties: the requester cannot approve their own exception.
    if (!canApproveException(prev.requestedBy, actor.actorId as number)) {
      await recordAuditEvent(tx, {
        ...actor, action: "exception_approval_denied", recordType: "requirementException", recordId: exceptionId, clientId: prev.submissionId,
        success: false, reason: "separation_of_duties",
      });
      throw new Error("SEPARATION_OF_DUTIES_VIOLATION");
    }
    await tx.update(requirementExceptions)
      .set({ status: "approved", approvedBy: actor.actorId as number, complianceApprovedBy: actor.actorId as number })
      .where(eq(requirementExceptions.id, exceptionId));
    await recordAuditEvent(tx, {
      ...actor, action: "exception_approved", recordType: "requirementException", recordId: exceptionId, clientId: prev.submissionId,
      prevValue: { status: prev.status }, newValue: { status: "approved" },
    });
    const [updated] = await tx.select().from(requirementExceptions).where(eq(requirementExceptions.id, exceptionId));
    return updated;
  });
}

// ─── Readiness (derived; recomputed & cached) ────────────────────────────────
export async function gatherReadinessFacts(submissionId: number): Promise<ReadinessInput> {
  const db = await requireDb();
  const [submission] = await db.select().from(submissions).where(eq(submissions.id, submissionId));
  const now = new Date();

  const elig = await db.select().from(eligibilityVerifications)
    .where(and(eq(eligibilityVerifications.submissionId, submissionId), eq(eligibilityVerifications.status, "verified"), eq(eligibilityVerifications.recordStatus, "active")))
    .orderBy(desc(eligibilityVerifications.createdAt)).limit(1);
  const latestElig = elig[0];
  const eligibilityVerified = !!latestElig;
  const eligibilityExpired = !!latestElig?.effectiveEndDate && new Date(latestElig.effectiveEndDate) < now;

  const refs = await db.select().from(scnReferrals).where(eq(scnReferrals.submissionId, submissionId)).orderBy(desc(scnReferrals.createdAt)).limit(1);
  const latestRef = refs[0];
  const referralStatus = (latestRef?.referralStatus ?? "none") as ReadinessInput["referralStatus"];

  const auths = await db.select().from(serviceAuthorizations)
    .where(and(eq(serviceAuthorizations.submissionId, submissionId), eq(serviceAuthorizations.status, "active")))
    .orderBy(desc(serviceAuthorizations.createdAt));
  const activeAuth = auths.find((a) => (!a.startDate || new Date(a.startDate) <= now) && (!a.endDate || new Date(a.endDate) >= now) && a.remainingUnits > 0);
  const authorizationActive = !!activeAuth;
  const authorizationExpired = auths.length > 0 && !activeAuth;

  const assignments = await db.select().from(requirementAssignments)
    .where(and(eq(requirementAssignments.submissionId, submissionId), eq(requirementAssignments.recordStatus, "active"), eq(requirementAssignments.blocking, true)));
  const unmetBlocking = assignments.filter((a) => a.status !== "satisfied" && a.status !== "waived" && a.status !== "not_applicable").length;

  return {
    inactive: submission?.notInterested ?? false,
    intakeComplete: !!submission,
    eligibilityVerified,
    eligibilityExpired,
    referralStatus,
    authorizationActive,
    authorizationExpired,
    evidenceComplete: unmetBlocking === 0,
    unmetBlockingRequirements: unmetBlocking,
  };
}

export async function recomputeReadiness(actor: Actor, submissionId: number): Promise<{ status: ReadinessStatus; blockingReasons: string[] }> {
  const facts = await gatherReadinessFacts(submissionId);
  const result = computeReadiness(facts);
  await withTransaction(async (tx: Tx) => {
    const [existing] = await tx.select().from(complianceReadiness).where(eq(complianceReadiness.submissionId, submissionId));
    if (existing) {
      await tx.update(complianceReadiness)
        .set({ status: result.status, blockingReasons: result.blockingReasons, computedAt: new Date() })
        .where(eq(complianceReadiness.submissionId, submissionId));
    } else {
      await tx.insert(complianceReadiness).values({ submissionId, status: result.status, blockingReasons: result.blockingReasons });
    }
    // Readiness recomputation is itself an audited event (records the derived status).
    await recordAuditEvent(tx, {
      ...actor, action: "readiness_recomputed", recordType: "complianceReadiness", recordId: submissionId, clientId: submissionId,
      newValue: { status: result.status, blockingReasons: result.blockingReasons },
    });
  });
  return { status: result.status, blockingReasons: result.blockingReasons };
}

export async function getReadiness(submissionId: number): Promise<ComplianceReadiness | null> {
  const db = await requireDb();
  const [row] = await db.select().from(complianceReadiness).where(eq(complianceReadiness.submissionId, submissionId));
  return row ?? null;
}

// ─── Requirement authoring (definitions + versions) ──────────────────────────
export async function createRequirementDefinitionWithVersion(
  actor: Actor,
  input: { key: string; category?: string | null; version: Omit<InsertRequirementVersion, "id" | "definitionId" | "createdAt" | "updatedAt"> },
): Promise<{ definitionId: number; versionId: number }> {
  return withTransaction(async (tx) => {
    const existing = await tx.select().from(requirementDefinitions).where(eq(requirementDefinitions.key, input.key));
    let definitionId: number;
    if (existing.length > 0) {
      definitionId = existing[0].id;
    } else {
      const insertedDef = await tx.insert(requirementDefinitions).values({ key: input.key, category: input.category ?? null, createdBy: actor.actorId ?? null }).$returningId();
      definitionId = insertedDef[0].id;
    }
    const insertedVer = await tx.insert(requirementVersions).values({ ...input.version, definitionId, createdBy: actor.actorId ?? null }).$returningId();
    const versionId = insertedVer[0].id;
    await recordAuditEvent(tx, {
      ...actor, action: "requirement_version_created", recordType: "requirementVersion", recordId: versionId,
      newValue: { key: input.key, title: input.version.title, version: input.version.version, blocking: input.version.blocking },
    });
    return { definitionId, versionId };
  });
}
