/**
 * Guidance & clarification library — data operations. Append-only history;
 * every material change records a tamper-evident audit event. Privilege
 * filtering is applied by the router using the viewer's PRIVILEGED_VIEW grant.
 */
import { and, desc, eq } from "drizzle-orm";
import {
  guidanceDocuments, guidanceVersions, type GuidanceDocument, type GuidanceVersion,
  clarificationRequests, type ClarificationRequest,
  agencyResponses, legalReviews, internalDecisions, policyChangeImpacts, trainingAcknowledgments,
} from "../../drizzle/schema";
import { recordAuditEvent } from "./audit";
import { requireDb, withTransaction, isDuplicateKeyError } from "./db";
import { type Actor } from "./store";
import { canTransitionClarification, type ClarificationState } from "./guidance";
import { TRPCError } from "@trpc/server";

// ─── Guidance documents + versions ───────────────────────────────────────────
export async function createGuidance(actor: Actor, data: { title: string; sourceOrganization?: string; sourceType?: GuidanceDocument["sourceType"]; privileged?: boolean; summary?: string; sourceUrl?: string; section?: string; effectiveDate?: Date }): Promise<{ guidanceId: number; versionId: number }> {
  return withTransaction(async (tx) => {
    const insDoc = await tx.insert(guidanceDocuments).values({ title: data.title, sourceOrganization: data.sourceOrganization ?? null, sourceType: data.sourceType ?? "other", privileged: data.privileged ?? false, createdBy: actor.actorId ?? null }).$returningId();
    const guidanceId = insDoc[0].id;
    const insVer = await tx.insert(guidanceVersions).values({ guidanceDocumentId: guidanceId, version: 1, summary: data.summary ?? null, sourceUrl: data.sourceUrl ?? null, section: data.section ?? null, effectiveDate: data.effectiveDate ?? null, createdBy: actor.actorId ?? null }).$returningId();
    await recordAuditEvent(tx, { ...actor, action: "guidance_created", recordType: "guidanceDocument", recordId: guidanceId, newValue: { title: data.title, sourceType: data.sourceType ?? "other", privileged: data.privileged ?? false } });
    return { guidanceId, versionId: insVer[0].id };
  });
}

export async function listGuidance(): Promise<Array<GuidanceDocument & { versions: GuidanceVersion[] }>> {
  const db = await requireDb();
  const docs = await db.select().from(guidanceDocuments).where(eq(guidanceDocuments.recordStatus, "active")).orderBy(desc(guidanceDocuments.createdAt));
  const out: Array<GuidanceDocument & { versions: GuidanceVersion[] }> = [];
  for (const d of docs) {
    const versions = await db.select().from(guidanceVersions).where(eq(guidanceVersions.guidanceDocumentId, d.id)).orderBy(desc(guidanceVersions.version));
    out.push({ ...d, versions });
  }
  return out;
}

// ─── Clarification workflow ──────────────────────────────────────────────────
export async function createClarification(actor: Actor, data: { question: string; facts?: string; submissionId?: number; requirementVersionId?: number; privileged?: boolean }): Promise<ClarificationRequest> {
  return withTransaction(async (tx) => {
    const ins = await tx.insert(clarificationRequests).values({ question: data.question, facts: data.facts ?? null, submissionId: data.submissionId ?? null, requirementVersionId: data.requirementVersionId ?? null, privileged: data.privileged ?? false, createdBy: actor.actorId ?? null }).$returningId();
    const id = ins[0].id;
    await recordAuditEvent(tx, { ...actor, action: "clarification_created", recordType: "clarificationRequest", recordId: id, clientId: data.submissionId ?? null, newValue: { question: data.question.slice(0, 200) } });
    const [row] = await tx.select().from(clarificationRequests).where(eq(clarificationRequests.id, id));
    return row;
  });
}

export async function advanceClarification(actor: Actor, id: number, to: ClarificationState, opts?: { sentToOrganization?: string; controllingGuidanceId?: number }): Promise<ClarificationRequest> {
  return withTransaction(async (tx) => {
    const [prev] = await tx.select().from(clarificationRequests).where(eq(clarificationRequests.id, id)).for("update");
    if (!prev) throw new TRPCError({ code: "NOT_FOUND", message: "Clarification not found" });
    if (!canTransitionClarification(prev.status as ClarificationState, to)) {
      await recordAuditEvent(tx, { ...actor, action: "clarification_transition_denied", recordType: "clarificationRequest", recordId: id, success: false, prevValue: { status: prev.status }, newValue: { to } });
      throw new Error(`CLARIFICATION_TRANSITION_DENIED:${prev.status}->${to}`);
    }
    await tx.update(clarificationRequests).set({ status: to, sentToOrganization: opts?.sentToOrganization ?? prev.sentToOrganization, controllingGuidanceId: opts?.controllingGuidanceId ?? prev.controllingGuidanceId }).where(eq(clarificationRequests.id, id));
    await recordAuditEvent(tx, { ...actor, action: "clarification_advanced", recordType: "clarificationRequest", recordId: id, clientId: prev.submissionId, prevValue: { status: prev.status }, newValue: { status: to } });
    const [row] = await tx.select().from(clarificationRequests).where(eq(clarificationRequests.id, id));
    return row;
  });
}

export async function listClarifications(): Promise<ClarificationRequest[]> {
  const db = await requireDb();
  return db.select().from(clarificationRequests).where(eq(clarificationRequests.recordStatus, "active")).orderBy(desc(clarificationRequests.createdAt));
}

export async function recordAgencyResponse(actor: Actor, data: { clarificationRequestId: number; organization?: string; responseType?: "formal" | "informal"; documentId?: number; summary?: string }): Promise<number> {
  return withTransaction(async (tx) => {
    const ins = await tx.insert(agencyResponses).values({ clarificationRequestId: data.clarificationRequestId, organization: data.organization ?? null, responseType: data.responseType ?? "informal", documentId: data.documentId ?? null, summary: data.summary ?? null, receivedAt: new Date(), createdBy: actor.actorId ?? null }).$returningId();
    await recordAuditEvent(tx, { ...actor, action: "agency_response_recorded", recordType: "agencyResponse", recordId: ins[0].id, newValue: { responseType: data.responseType ?? "informal" } });
    return ins[0].id;
  });
}

export async function requestLegalReview(actor: Actor, data: { clarificationRequestId?: number; requirementVersionId?: number; summary?: string }): Promise<number> {
  return withTransaction(async (tx) => {
    const ins = await tx.insert(legalReviews).values({ clarificationRequestId: data.clarificationRequestId ?? null, requirementVersionId: data.requirementVersionId ?? null, attorneyId: actor.actorId ?? null, summary: data.summary ?? null, createdBy: actor.actorId ?? null }).$returningId();
    await recordAuditEvent(tx, { ...actor, action: "legal_review_requested", recordType: "legalReview", recordId: ins[0].id, newValue: { privileged: true } });
    return ins[0].id;
  });
}

/** Approve an internal interpretation; separation of duties: approver ≠ author. */
export async function approveInternalDecision(actor: Actor, data: { clarificationRequestId?: number; interpretation: string; basis?: string; authorId?: number }): Promise<number> {
  if (actor.actorId == null) throw new Error("ACTOR_REQUIRED");
  const approverId = actor.actorId;
  return withTransaction(async (tx) => {
    if (data.authorId != null && data.authorId === approverId) {
      await recordAuditEvent(tx, { ...actor, action: "internal_decision_denied", recordType: "internalDecision", recordId: data.clarificationRequestId ?? null, success: false, reason: "separation_of_duties" });
      throw new Error("SEPARATION_OF_DUTIES_VIOLATION");
    }
    const ins = await tx.insert(internalDecisions).values({ clarificationRequestId: data.clarificationRequestId ?? null, interpretation: data.interpretation, basis: data.basis ?? null, approvedBy: approverId, approvedAt: new Date(), createdBy: data.authorId ?? approverId }).$returningId();
    if (data.clarificationRequestId != null) {
      await tx.update(clarificationRequests).set({ status: "interpreted" }).where(eq(clarificationRequests.id, data.clarificationRequestId));
    }
    await recordAuditEvent(tx, { ...actor, action: "internal_decision_approved", recordType: "internalDecision", recordId: ins[0].id, newValue: { interpretation: data.interpretation.slice(0, 200) } });
    return ins[0].id;
  });
}

export async function recordPolicyImpact(actor: Actor, data: { internalDecisionId: number; requirementVersionId?: number; affectedSubmissionId?: number; affectedInvoiceId?: number; note?: string }): Promise<number> {
  return withTransaction(async (tx) => {
    const ins = await tx.insert(policyChangeImpacts).values({ internalDecisionId: data.internalDecisionId, requirementVersionId: data.requirementVersionId ?? null, affectedSubmissionId: data.affectedSubmissionId ?? null, affectedInvoiceId: data.affectedInvoiceId ?? null, note: data.note ?? null }).$returningId();
    await recordAuditEvent(tx, { ...actor, action: "policy_impact_recorded", recordType: "policyChangeImpact", recordId: ins[0].id, clientId: data.affectedSubmissionId ?? null });
    return ins[0].id;
  });
}

/** Record a staff member's training acknowledgment (idempotent per decision+user). */
export async function acknowledgeTraining(actor: Actor, data: { internalDecisionId?: number; guidanceDocumentId?: number }): Promise<{ acknowledged: boolean }> {
  if (actor.actorId == null) throw new Error("ACTOR_REQUIRED");
  const userId = actor.actorId;
  return withTransaction(async (tx) => {
    try {
      await tx.insert(trainingAcknowledgments).values({ internalDecisionId: data.internalDecisionId ?? null, guidanceDocumentId: data.guidanceDocumentId ?? null, userId });
    } catch (err) {
      if (isDuplicateKeyError(err)) return { acknowledged: false };
      throw err;
    }
    await recordAuditEvent(tx, { ...actor, action: "training_acknowledged", recordType: "trainingAcknowledgment", recordId: data.internalDecisionId ?? null });
    return { acknowledged: true };
  });
}

export async function listLegalReviews(): Promise<Array<typeof legalReviews.$inferSelect>> {
  const db = await requireDb();
  return db.select().from(legalReviews).orderBy(desc(legalReviews.createdAt));
}

export async function trainingCountForDecision(internalDecisionId: number): Promise<number> {
  const db = await requireDb();
  const rows = await db.select().from(trainingAcknowledgments).where(and(eq(trainingAcknowledgments.internalDecisionId, internalDecisionId)));
  return rows.length;
}
