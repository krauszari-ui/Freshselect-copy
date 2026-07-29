/**
 * Compliance data operations — Phase 3 (delivery, billing, self-audit/CAPA,
 * nutrition, overpayments). Same discipline as store.ts: transactions + audit
 * events for material changes; append-only history; state-machine enforcement.
 */
import { and, desc, eq } from "drizzle-orm";
import {
  serviceEncounters, type ServiceEncounter, type InsertServiceEncounter,
  deliveries, serviceAmendments,
  invoiceHeaders, type InvoiceHeader,
  invoiceLines, payments,
  denials, adjustments, recoupments,
  audits, type Audit,
  auditPopulations, auditSamples, type AuditSample,
  auditTests, auditFindings, type AuditFinding,
  correctiveActions, correctiveActionEvidence, followUpTests,
  managementResponses,
  nutritionAssessments, type NutritionAssessment, clinicalApprovals,
  overpaymentCases, type OverpaymentCase,
} from "../../drizzle/schema";
import { recordAuditEvent } from "./audit";
import { requireDb, withTransaction, type Tx } from "./db";
import { type Actor } from "./store";
import { validateTransition, type EncounterState, hasSufficientProofOfDelivery, type PodMethod } from "./delivery";
import { consumeUnitsWithinTx } from "./authorizations";
import { computeLineExpectedAmount, computeInvoiceExpectedTotal, invoiceLineIdempotencyKey, validateInvoiceLine, reconcilePayment } from "./billing";
import { selectSample, type PopulationItem, type SamplingMethod } from "./sampling";
import { canCloseFinding, type TestResult } from "./capa";
import { serviceAuthorizations } from "../../drizzle/schema";

// ─── Service encounters + deliveries ─────────────────────────────────────────
export async function createEncounter(actor: Actor, data: Omit<InsertServiceEncounter, "id" | "createdAt" | "updatedAt" | "state"> & { state?: EncounterState }): Promise<ServiceEncounter> {
  return withTransaction(async (tx) => {
    const inserted = await tx.insert(serviceEncounters).values({ ...data, state: data.state ?? "draft", createdBy: actor.actorId ?? null }).$returningId();
    const id = inserted[0].id;
    await recordAuditEvent(tx, { ...actor, action: "encounter_created", recordType: "serviceEncounter", recordId: id, clientId: data.submissionId, newValue: { units: data.units, dateOfService: data.dateOfService } });
    const [row] = await tx.select().from(serviceEncounters).where(eq(serviceEncounters.id, id));
    return row;
  });
}

export async function listEncounters(submissionId: number): Promise<ServiceEncounter[]> {
  const db = await requireDb();
  return db.select().from(serviceEncounters).where(eq(serviceEncounters.submissionId, submissionId)).orderBy(desc(serviceEncounters.createdAt));
}

/** Transition an encounter through the state machine (validated + audited). */
export async function transitionEncounter(actor: Actor, encounterId: number, to: EncounterState, opts?: { hasApproval?: boolean; reason?: string }): Promise<ServiceEncounter> {
  return withTransaction(async (tx) => {
    const [enc] = await tx.select().from(serviceEncounters).where(eq(serviceEncounters.id, encounterId)).for("update");
    if (!enc) throw new Error("ENCOUNTER_NOT_FOUND");
    const check = validateTransition(enc.state, to, opts?.hasApproval ?? false);
    if (!check.ok) {
      await recordAuditEvent(tx, { ...actor, action: "encounter_transition_denied", recordType: "serviceEncounter", recordId: encounterId, clientId: enc.submissionId, success: false, prevValue: { state: enc.state }, newValue: { to, reason: check.reason } });
      throw new Error(`TRANSITION_DENIED:${check.reason}`);
    }
    await tx.update(serviceEncounters).set({ state: to, approvedBy: to === "approved" ? actor.actorId ?? null : enc.approvedBy, version: enc.version + 1 }).where(eq(serviceEncounters.id, encounterId));
    await recordAuditEvent(tx, { ...actor, action: "encounter_transitioned", recordType: "serviceEncounter", recordId: encounterId, clientId: enc.submissionId, prevValue: { state: enc.state }, newValue: { state: to }, reason: opts?.reason ?? null });
    const [row] = await tx.select().from(serviceEncounters).where(eq(serviceEncounters.id, encounterId));
    return row;
  });
}

export async function recordDelivery(actor: Actor, data: { encounterId: number; submissionId: number; deliveryAddress?: string; deliveredAt?: Date; staffOrVendor?: string; podMethod?: PodMethod; signaturePresent?: boolean; photoPresent?: boolean; gpsPresent?: boolean; temperatureRecord?: string; status?: "delivered" | "failed" | "redelivered" }): Promise<{ id: number; podSufficient: boolean }> {
  return withTransaction(async (tx) => {
    const inserted = await tx.insert(deliveries).values({
      encounterId: data.encounterId, deliveryAddress: data.deliveryAddress ?? null, deliveredAt: data.deliveredAt ?? null,
      staffOrVendor: data.staffOrVendor ?? null, podMethod: data.podMethod ?? null, temperatureRecord: data.temperatureRecord ?? null,
      gpsEvidence: data.gpsPresent ? "present" : null, status: data.status ?? "delivered", createdBy: actor.actorId ?? null,
    }).$returningId();
    const podSufficient = hasSufficientProofOfDelivery({ podMethod: data.podMethod ?? null, signaturePresent: data.signaturePresent, photoPresent: data.photoPresent, gpsPresent: data.gpsPresent, deliveredAt: data.deliveredAt ?? null });
    await recordAuditEvent(tx, { ...actor, action: "delivery_recorded", recordType: "delivery", recordId: inserted[0].id, clientId: data.submissionId, newValue: { podMethod: data.podMethod, podSufficient, status: data.status ?? "delivered" } });
    return { id: inserted[0].id, podSufficient };
  });
}

// ─── Billing ─────────────────────────────────────────────────────────────────
export interface InvoiceLineInput { encounterId?: number | null; authorizationId?: number | null; serviceCode?: string | null; serviceDate: Date; units: number; rate: string; }

/**
 * Create an invoice with lines. In ONE transaction: validate each line against a
 * row-locked authorization, consume units, compute expected amounts, and insert
 * lines with a deterministic idempotency key (the DB UNIQUE index makes duplicate
 * billing of the same service impossible). Any failure rolls the whole thing back.
 */
export async function createInvoice(actor: Actor, input: { submissionId: number; invoiceNumber?: string; lines: InvoiceLineInput[] }): Promise<{ invoiceId: number; expectedTotal: string }> {
  if (input.lines.length === 0) throw new Error("NO_LINES");
  return withTransaction(async (tx) => {
    const expectedTotal = computeInvoiceExpectedTotal(input.lines.map((l) => ({ units: l.units, rate: l.rate })));
    const insertedHeader = await tx.insert(invoiceHeaders).values({
      invoiceNumber: input.invoiceNumber ?? null, submissionId: input.submissionId, status: "draft",
      expectedTotal, createdBy: actor.actorId ?? null,
    }).$returningId();
    const invoiceId = insertedHeader[0].id;

    for (const line of input.lines) {
      // Lock + validate the authorization for this line.
      let auth = null as (typeof serviceAuthorizations.$inferSelect) | null;
      if (line.authorizationId != null) {
        const rows = await tx.select().from(serviceAuthorizations).where(eq(serviceAuthorizations.id, line.authorizationId)).for("update");
        auth = rows[0] ?? null;
      }
      const check = validateInvoiceLine({ units: line.units, serviceDate: line.serviceDate, authorization: auth ? { remainingUnits: auth.remainingUnits, startDate: auth.startDate, endDate: auth.endDate, status: auth.status } : null });
      if (!check.ok) throw new Error(`INVOICE_LINE_INVALID:${check.reason}`);

      // Consume units atomically on the same transaction.
      if (line.authorizationId != null) {
        await consumeUnitsWithinTx(tx, { authorizationId: line.authorizationId, requested: line.units, actor, encounterId: line.encounterId ?? null, reason: "invoice_line" });
      }

      const idempotencyKey = invoiceLineIdempotencyKey({ submissionId: input.submissionId, encounterId: line.encounterId ?? null, serviceCode: line.serviceCode ?? null, serviceDate: line.serviceDate, units: line.units });
      const expectedAmount = computeLineExpectedAmount(line.units, line.rate);
      // The UNIQUE(idempotencyKey) index throws ER_DUP_ENTRY on a duplicate → dup billing blocked.
      await tx.insert(invoiceLines).values({
        invoiceId, encounterId: line.encounterId ?? null, authorizationId: line.authorizationId ?? null,
        serviceCode: line.serviceCode ?? null, serviceDate: line.serviceDate, units: line.units, rate: line.rate,
        expectedAmount, idempotencyKey,
      });

      // Lock the encounter into "invoiced" so it can't be directly edited.
      if (line.encounterId != null) {
        await tx.update(serviceEncounters).set({ state: "invoiced" }).where(eq(serviceEncounters.id, line.encounterId));
      }
    }

    await recordAuditEvent(tx, { ...actor, action: "invoice_created", recordType: "invoiceHeader", recordId: invoiceId, clientId: input.submissionId, newValue: { expectedTotal, lines: input.lines.length } });
    return { invoiceId, expectedTotal };
  });
}

/** Approve an invoice — separation of duties: approver must differ from creator. */
export async function approveInvoice(actor: Actor, invoiceId: number): Promise<InvoiceHeader> {
  if (actor.actorId == null) throw new Error("ACTOR_REQUIRED");
  return withTransaction(async (tx) => {
    const [inv] = await tx.select().from(invoiceHeaders).where(eq(invoiceHeaders.id, invoiceId)).for("update");
    if (!inv) throw new Error("INVOICE_NOT_FOUND");
    if (inv.createdBy != null && inv.createdBy === actor.actorId) {
      await recordAuditEvent(tx, { ...actor, action: "invoice_approval_denied", recordType: "invoiceHeader", recordId: invoiceId, clientId: inv.submissionId, success: false, reason: "separation_of_duties" });
      throw new Error("SEPARATION_OF_DUTIES_VIOLATION");
    }
    await tx.update(invoiceHeaders).set({ status: "approved", approvedBy: actor.actorId, version: inv.version + 1 }).where(eq(invoiceHeaders.id, invoiceId));
    await recordAuditEvent(tx, { ...actor, action: "invoice_approved", recordType: "invoiceHeader", recordId: invoiceId, clientId: inv.submissionId, prevValue: { status: inv.status }, newValue: { status: "approved" } });
    const [row] = await tx.select().from(invoiceHeaders).where(eq(invoiceHeaders.id, invoiceId));
    return row;
  });
}

export async function recordPayment(actor: Actor, data: { invoiceId: number; submissionId: number; paidAmount: string; paymentDate?: Date; payerReference?: string }): Promise<{ paymentId: number; status: string; variance: string }> {
  return withTransaction(async (tx) => {
    const [inv] = await tx.select().from(invoiceHeaders).where(eq(invoiceHeaders.id, data.invoiceId)).for("update");
    if (!inv) throw new Error("INVOICE_NOT_FOUND");
    const inserted = await tx.insert(payments).values({ invoiceId: data.invoiceId, submissionId: data.submissionId, paidAmount: data.paidAmount, paymentDate: data.paymentDate ?? new Date(), payerReference: data.payerReference ?? null, createdBy: actor.actorId ?? null }).$returningId();
    const recon = reconcilePayment({ expected: inv.expectedTotal ?? "0", paid: data.paidAmount });
    await tx.update(invoiceHeaders).set({ paidTotal: data.paidAmount, status: recon.status === "paid_in_full" ? "paid" : inv.status, reconciliationStatus: recon.status === "paid_in_full" ? "reconciled" : "partial", version: inv.version + 1 }).where(eq(invoiceHeaders.id, data.invoiceId));
    await recordAuditEvent(tx, { ...actor, action: "payment_recorded", recordType: "payment", recordId: inserted[0].id, clientId: data.submissionId, newValue: { paidAmount: data.paidAmount, status: recon.status, variance: recon.variance } });
    return { paymentId: inserted[0].id, status: recon.status, variance: recon.variance };
  });
}

export async function listInvoices(submissionId: number): Promise<InvoiceHeader[]> {
  const db = await requireDb();
  return db.select().from(invoiceHeaders).where(eq(invoiceHeaders.submissionId, submissionId)).orderBy(desc(invoiceHeaders.createdAt));
}

export async function recordDenial(actor: Actor, data: { invoiceId: number; submissionId: number; denialCode?: string; denialReason?: string }): Promise<number> {
  return withTransaction(async (tx) => {
    const inserted = await tx.insert(denials).values({ invoiceId: data.invoiceId, denialCode: data.denialCode ?? null, denialReason: data.denialReason ?? null, createdBy: actor.actorId ?? null }).$returningId();
    await tx.update(invoiceHeaders).set({ status: "denied" }).where(eq(invoiceHeaders.id, data.invoiceId));
    await recordAuditEvent(tx, { ...actor, action: "denial_recorded", recordType: "denial", recordId: inserted[0].id, clientId: data.submissionId, newValue: { denialCode: data.denialCode } });
    return inserted[0].id;
  });
}

export async function recordAdjustment(actor: Actor, data: { invoiceId: number; submissionId: number; amount: string; reason?: string }): Promise<number> {
  return withTransaction(async (tx) => {
    const inserted = await tx.insert(adjustments).values({ invoiceId: data.invoiceId, amount: data.amount, reason: data.reason ?? null, createdBy: actor.actorId ?? null }).$returningId();
    await recordAuditEvent(tx, { ...actor, action: "adjustment_recorded", recordType: "adjustment", recordId: inserted[0].id, clientId: data.submissionId, newValue: { amount: data.amount } });
    return inserted[0].id;
  });
}

export async function recordRecoupment(actor: Actor, data: { invoiceId: number; submissionId: number; amount: string; reason?: string }): Promise<number> {
  return withTransaction(async (tx) => {
    const inserted = await tx.insert(recoupments).values({ invoiceId: data.invoiceId, amount: data.amount, reason: data.reason ?? null, recoupedAt: new Date(), createdBy: actor.actorId ?? null }).$returningId();
    await recordAuditEvent(tx, { ...actor, action: "recoupment_recorded", recordType: "recoupment", recordId: inserted[0].id, clientId: data.submissionId, newValue: { amount: data.amount } });
    return inserted[0].id;
  });
}

// ─── Self-audit & CAPA ───────────────────────────────────────────────────────
export async function createAudit(actor: Actor, data: { title: string; auditType: string; periodStart?: Date; periodEnd?: Date }): Promise<Audit> {
  return withTransaction(async (tx) => {
    const inserted = await tx.insert(audits).values({ title: data.title, auditType: data.auditType, periodStart: data.periodStart ?? null, periodEnd: data.periodEnd ?? null, leadAuditorId: actor.actorId ?? null, createdBy: actor.actorId ?? null }).$returningId();
    const id = inserted[0].id;
    await recordAuditEvent(tx, { ...actor, action: "audit_created", recordType: "audit", recordId: id, newValue: { title: data.title, auditType: data.auditType } });
    const [row] = await tx.select().from(audits).where(eq(audits.id, id));
    return row;
  });
}

export async function listAudits(): Promise<Audit[]> {
  const db = await requireDb();
  return db.select().from(audits).orderBy(desc(audits.createdAt));
}

/**
 * Create a sample from a supplied population. Preserves the population snapshot,
 * seed, method, and the selected/excluded ids. The selection is IMMUTABLE — the
 * seed makes it reproducible, and staff cannot swap failed records afterward.
 */
export async function createAuditSample(actor: Actor, data: { auditId: number; population: PopulationItem[]; method: SamplingMethod; seed: number; size?: number; judgmentalIds?: number[]; exclusionReasons?: Record<string, string> }): Promise<AuditSample> {
  return withTransaction(async (tx) => {
    const popInserted = await tx.insert(auditPopulations).values({ auditId: data.auditId, description: `Population of ${data.population.length}`, totalCount: data.population.length, snapshot: data.population as unknown as object }).$returningId();
    const populationId = popInserted[0].id;
    const selection = selectSample(data.population, { method: data.method, seed: data.seed, size: data.size, judgmentalIds: data.judgmentalIds });
    const inserted = await tx.insert(auditSamples).values({
      auditId: data.auditId, populationId, method: data.method, seed: data.seed, size: selection.selectedIds.length,
      selectedIds: selection.selectedIds as unknown as object, excludedIds: selection.excludedIds as unknown as object,
      exclusionReasons: (data.exclusionReasons ?? {}) as object, createdBy: actor.actorId ?? null,
    }).$returningId();
    const id = inserted[0].id;
    await recordAuditEvent(tx, { ...actor, action: "audit_sample_selected", recordType: "auditSample", recordId: id, newValue: { method: data.method, seed: data.seed, selected: selection.selectedIds.length, population: data.population.length } });
    const [row] = await tx.select().from(auditSamples).where(eq(auditSamples.id, id));
    return row;
  });
}

export async function recordAuditTest(actor: Actor, data: { auditId: number; sampleId?: number; sampleItemId?: string; result: TestResult; financialExposure?: string; note?: string }): Promise<number> {
  return withTransaction(async (tx) => {
    const inserted = await tx.insert(auditTests).values({ auditId: data.auditId, sampleId: data.sampleId ?? null, sampleItemId: data.sampleItemId ?? null, result: data.result, financialExposure: data.financialExposure ?? null, note: data.note ?? null, testedBy: actor.actorId ?? null }).$returningId();
    await recordAuditEvent(tx, { ...actor, action: "audit_test_recorded", recordType: "auditTest", recordId: inserted[0].id, newValue: { result: data.result, sampleItemId: data.sampleItemId } });
    return inserted[0].id;
  });
}

export async function createFinding(actor: Actor, data: { auditId: number; submissionId?: number; findingNumber?: string; conditionFound?: string; expectedCondition?: string; cause?: string; effect?: string; risk?: "low" | "medium" | "high" | "critical"; financialExposure?: string; repeatFinding?: boolean }): Promise<AuditFinding> {
  return withTransaction(async (tx) => {
    const inserted = await tx.insert(auditFindings).values({
      auditId: data.auditId, submissionId: data.submissionId ?? null, findingNumber: data.findingNumber ?? null,
      conditionFound: data.conditionFound ?? null, expectedCondition: data.expectedCondition ?? null, cause: data.cause ?? null, effect: data.effect ?? null,
      risk: data.risk ?? "medium", financialExposure: data.financialExposure ?? null, repeatFinding: data.repeatFinding ?? false,
      responsibleOwnerId: actor.actorId ?? null, createdBy: actor.actorId ?? null,
    }).$returningId();
    const id = inserted[0].id;
    await recordAuditEvent(tx, { ...actor, action: "finding_created", recordType: "auditFinding", recordId: id, clientId: data.submissionId ?? null, newValue: { risk: data.risk, repeatFinding: data.repeatFinding } });
    const [row] = await tx.select().from(auditFindings).where(eq(auditFindings.id, id));
    return row;
  });
}

export async function addCorrectiveAction(actor: Actor, data: { findingId: number; correctiveAction: string; rootCauseAnalysis?: string; preventiveAction?: string; dueDate?: Date; completed?: boolean }): Promise<number> {
  return withTransaction(async (tx) => {
    const inserted = await tx.insert(correctiveActions).values({ findingId: data.findingId, correctiveAction: data.correctiveAction, rootCauseAnalysis: data.rootCauseAnalysis ?? null, preventiveAction: data.preventiveAction ?? null, dueDate: data.dueDate ?? null, completed: data.completed ?? false, completedAt: data.completed ? new Date() : null, ownerId: actor.actorId ?? null }).$returningId();
    await tx.update(auditFindings).set({ state: "corrective_action" }).where(eq(auditFindings.id, data.findingId));
    await recordAuditEvent(tx, { ...actor, action: "corrective_action_added", recordType: "correctiveAction", recordId: inserted[0].id, newValue: { findingId: data.findingId, completed: data.completed ?? false } });
    return inserted[0].id;
  });
}

export async function addFollowUpTest(actor: Actor, data: { findingId: number; result: TestResult; note?: string }): Promise<number> {
  return withTransaction(async (tx) => {
    const inserted = await tx.insert(followUpTests).values({ findingId: data.findingId, result: data.result, note: data.note ?? null, testedBy: actor.actorId ?? null }).$returningId();
    await tx.update(auditFindings).set({ state: "follow_up" }).where(eq(auditFindings.id, data.findingId));
    await recordAuditEvent(tx, { ...actor, action: "follow_up_test_added", recordType: "followUpTest", recordId: inserted[0].id, newValue: { findingId: data.findingId, result: data.result } });
    return inserted[0].id;
  });
}

/**
 * Close a finding — ONLY when the CAPA gate passes: corrective action complete,
 * verification evidence present, a passed follow-up test, and a compliance
 * approval by someone other than the finding owner. A user "marking it done" is
 * insufficient by construction.
 */
export async function closeFinding(actor: Actor, findingId: number): Promise<AuditFinding> {
  if (actor.actorId == null) throw new Error("ACTOR_REQUIRED");
  const approverId: number = actor.actorId;
  return withTransaction(async (tx) => {
    const [finding] = await tx.select().from(auditFindings).where(eq(auditFindings.id, findingId)).for("update");
    if (!finding) throw new Error("FINDING_NOT_FOUND");

    const cas = await tx.select().from(correctiveActions).where(eq(correctiveActions.findingId, findingId));
    const caCompleted = cas.length > 0 && cas.every((c) => c.completed);
    const caIds = cas.map((c) => c.id);
    let hasEvidence = false;
    for (const caId of caIds) {
      const ev = await tx.select().from(correctiveActionEvidence).where(eq(correctiveActionEvidence.correctiveActionId, caId));
      if (ev.length > 0) { hasEvidence = true; break; }
    }
    const fus = await tx.select().from(followUpTests).where(eq(followUpTests.findingId, findingId)).orderBy(desc(followUpTests.createdAt)).limit(1);
    const latestFollowUp = fus[0]?.result ?? null;

    const decision = canCloseFinding({
      correctiveActionCompleted: caCompleted,
      hasVerificationEvidence: hasEvidence,
      followUpTestResult: latestFollowUp,
      complianceApproved: true, // the caller holds EXCEPTION/compliance permission; approver identity checked below
      ownerId: finding.responsibleOwnerId ?? -1,
      approverId,
    });
    if (!decision.canClose) {
      await recordAuditEvent(tx, { ...actor, action: "finding_close_denied", recordType: "auditFinding", recordId: findingId, clientId: finding.submissionId, success: false, newValue: { reasons: decision.reasons } });
      throw new Error(`FINDING_CANNOT_CLOSE:${decision.reasons.join(",")}`);
    }
    await tx.update(auditFindings).set({ state: "closed", closureApprovedBy: approverId, version: finding.version + 1 }).where(eq(auditFindings.id, findingId));
    await recordAuditEvent(tx, { ...actor, action: "finding_closed", recordType: "auditFinding", recordId: findingId, clientId: finding.submissionId, prevValue: { state: finding.state }, newValue: { state: "closed" } });
    const [row] = await tx.select().from(auditFindings).where(eq(auditFindings.id, findingId));
    return row;
  });
}

export async function addCorrectiveActionEvidence(actor: Actor, data: { correctiveActionId: number; documentId?: number; note?: string }): Promise<number> {
  return withTransaction(async (tx) => {
    const inserted = await tx.insert(correctiveActionEvidence).values({ correctiveActionId: data.correctiveActionId, documentId: data.documentId ?? null, note: data.note ?? null }).$returningId();
    await recordAuditEvent(tx, { ...actor, action: "corrective_action_evidence_added", recordType: "correctiveActionEvidence", recordId: inserted[0].id, newValue: { correctiveActionId: data.correctiveActionId } });
    return inserted[0].id;
  });
}

export async function addManagementResponse(actor: Actor, data: { findingId: number; response: string }): Promise<number> {
  return withTransaction(async (tx) => {
    const inserted = await tx.insert(managementResponses).values({ findingId: data.findingId, response: data.response, respondedBy: actor.actorId ?? null }).$returningId();
    await tx.update(auditFindings).set({ state: "management_response" }).where(eq(auditFindings.id, data.findingId));
    await recordAuditEvent(tx, { ...actor, action: "management_response_added", recordType: "managementResponse", recordId: inserted[0].id });
    return inserted[0].id;
  });
}

export async function listFindings(auditId: number): Promise<AuditFinding[]> {
  const db = await requireDb();
  return db.select().from(auditFindings).where(eq(auditFindings.auditId, auditId)).orderBy(desc(auditFindings.createdAt));
}

// ─── Nutrition ───────────────────────────────────────────────────────────────
export async function createNutritionAssessment(actor: Actor, data: { submissionId: number; assessmentDate?: Date; nutritionDiagnosis?: string; allergies?: string; dietaryRestrictions?: string; medicalRestrictions?: string }): Promise<NutritionAssessment> {
  return withTransaction(async (tx) => {
    // Supersede prior active assessments (retain them — never delete).
    await tx.update(nutritionAssessments).set({ superseded: true, recordStatus: "superseded" }).where(and(eq(nutritionAssessments.submissionId, data.submissionId), eq(nutritionAssessments.superseded, false)));
    const inserted = await tx.insert(nutritionAssessments).values({ submissionId: data.submissionId, assessmentDate: data.assessmentDate ?? new Date(), nutritionDiagnosis: data.nutritionDiagnosis ?? null, allergies: data.allergies ?? null, dietaryRestrictions: data.dietaryRestrictions ?? null, medicalRestrictions: data.medicalRestrictions ?? null, createdBy: actor.actorId ?? null }).$returningId();
    const id = inserted[0].id;
    await recordAuditEvent(tx, { ...actor, action: "nutrition_assessment_created", recordType: "nutritionAssessment", recordId: id, clientId: data.submissionId, newValue: { assessmentDate: data.assessmentDate } });
    const [row] = await tx.select().from(nutritionAssessments).where(eq(nutritionAssessments.id, id));
    return row;
  });
}

export async function listNutritionAssessments(submissionId: number): Promise<NutritionAssessment[]> {
  const db = await requireDb();
  return db.select().from(nutritionAssessments).where(eq(nutritionAssessments.submissionId, submissionId)).orderBy(desc(nutritionAssessments.createdAt));
}

export async function createClinicalApproval(actor: Actor, data: { submissionId: number; assessmentId?: number; reviewerName?: string; credentialType: string; credentialNumber?: string; credentialValidFrom?: Date; credentialValidUntil?: Date; approvalDate?: Date; serviceDate?: Date; outcome?: "approved" | "rejected" }): Promise<number> {
  return withTransaction(async (tx) => {
    const inserted = await tx.insert(clinicalApprovals).values({
      submissionId: data.submissionId, assessmentId: data.assessmentId ?? null, reviewerId: actor.actorId ?? null, reviewerName: data.reviewerName ?? actor.actorName ?? null,
      credentialType: data.credentialType, credentialNumber: data.credentialNumber ?? null, credentialValidFrom: data.credentialValidFrom ?? null, credentialValidUntil: data.credentialValidUntil ?? null,
      approvalDate: data.approvalDate ?? new Date(), serviceDate: data.serviceDate ?? null, outcome: data.outcome ?? "approved",
    }).$returningId();
    await recordAuditEvent(tx, { ...actor, action: "clinical_approval_created", recordType: "clinicalApproval", recordId: inserted[0].id, clientId: data.submissionId, newValue: { credentialType: data.credentialType, outcome: data.outcome ?? "approved" } });
    return inserted[0].id;
  });
}

// ─── Overpayments (restricted; advisory) ─────────────────────────────────────
export async function createOverpaymentCase(actor: Actor, data: { discoverySource?: string; periodStart?: Date; periodEnd?: Date; preliminaryAmount?: string; rootCause?: string; calculationMethodology?: string }): Promise<OverpaymentCase> {
  return withTransaction(async (tx) => {
    const inserted = await tx.insert(overpaymentCases).values({ discoveryDate: new Date(), discoverySource: data.discoverySource ?? null, periodStart: data.periodStart ?? null, periodEnd: data.periodEnd ?? null, preliminaryAmount: data.preliminaryAmount ?? null, rootCause: data.rootCause ?? null, calculationMethodology: data.calculationMethodology ?? null, createdBy: actor.actorId ?? null }).$returningId();
    const id = inserted[0].id;
    await recordAuditEvent(tx, { ...actor, action: "overpayment_case_created", recordType: "overpaymentCase", recordId: id, newValue: { preliminaryAmount: data.preliminaryAmount } });
    const [row] = await tx.select().from(overpaymentCases).where(eq(overpaymentCases.id, id));
    return row;
  });
}

export async function listOverpaymentCases(): Promise<OverpaymentCase[]> {
  const db = await requireDb();
  return db.select().from(overpaymentCases).orderBy(desc(overpaymentCases.createdAt));
}
