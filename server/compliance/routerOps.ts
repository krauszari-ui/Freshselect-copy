/**
 * Phase 3 compliance sub-routers: service delivery/encounters, billing,
 * self-audit/CAPA, nutrition, and overpayments. Each procedure is permission-
 * gated and (where a client is involved) access-scoped, mirroring router.ts.
 */
import { z } from "zod";
import { router } from "../_core/trpc";
import { PERMISSIONS } from "@shared/compliance/constants";
import { permProcedure, actorFromCtx, assertClientAccess, submissionIdInput } from "./procedures";
import * as ops from "./store2";
import { OVERPAYMENT_DISCLAIMER } from "./capa";

const encounterStateEnum = z.enum(["draft", "documented", "pending_review", "approved", "locked", "invoiced", "paid", "corrected_by_amendment", "voided"]);
const testResultEnum = z.enum(["pass", "fail", "observation", "not_applicable", "insufficient_evidence", "pending_clarification"]);
const money = z.string().regex(/^\d+(\.\d{1,2})?$/, "must be a decimal amount like 12.34");

export const encountersRouter = router({
  list: permProcedure(PERMISSIONS.SERVICE_VIEW).input(submissionIdInput).query(async ({ input, ctx }) => {
    await assertClientAccess(ctx.user, input.submissionId);
    return ops.listEncounters(input.submissionId);
  }),
  create: permProcedure(PERMISSIONS.SERVICE_MANAGE).input(z.object({
    submissionId: z.number().int().positive(),
    authorizationId: z.number().int().positive().optional(),
    referralId: z.number().int().positive().optional(),
    serviceCategory: z.string().max(128).optional(),
    dateOfService: z.coerce.date().optional(),
    units: z.number().int().nonnegative().default(0),
    unitType: z.enum(["meal", "box", "delivery", "day", "week", "unit"]).default("unit"),
    itemDescription: z.string().max(2000).optional(),
  })).mutation(async ({ input, ctx }) => {
    await assertClientAccess(ctx.user, input.submissionId);
    return ops.createEncounter(actorFromCtx(ctx), input);
  }),
  transition: permProcedure(PERMISSIONS.SERVICE_MANAGE).input(z.object({
    encounterId: z.number().int().positive(),
    submissionId: z.number().int().positive(),
    to: encounterStateEnum,
    hasApproval: z.boolean().optional(),
    reason: z.string().max(2000).optional(),
  })).mutation(async ({ input, ctx }) => {
    await assertClientAccess(ctx.user, input.submissionId);
    return ops.transitionEncounter(actorFromCtx(ctx), input.encounterId, input.submissionId, input.to, { hasApproval: input.hasApproval, reason: input.reason });
  }),
  recordDelivery: permProcedure(PERMISSIONS.SERVICE_MANAGE).input(z.object({
    encounterId: z.number().int().positive(),
    submissionId: z.number().int().positive(),
    deliveryAddress: z.string().max(512).optional(),
    deliveredAt: z.coerce.date().optional(),
    staffOrVendor: z.string().max(256).optional(),
    podMethod: z.enum(["signature", "photo", "gps", "recipient_confirmation", "staff_attestation"]).optional(),
    signaturePresent: z.boolean().optional(),
    photoPresent: z.boolean().optional(),
    gpsPresent: z.boolean().optional(),
    temperatureRecord: z.string().max(64).optional(),
    status: z.enum(["delivered", "failed", "redelivered"]).optional(),
  })).mutation(async ({ input, ctx }) => {
    await assertClientAccess(ctx.user, input.submissionId);
    return ops.recordDelivery(actorFromCtx(ctx), input);
  }),
});

export const billingRouter = router({
  list: permProcedure(PERMISSIONS.BILLING_VIEW).input(submissionIdInput).query(async ({ input, ctx }) => {
    await assertClientAccess(ctx.user, input.submissionId);
    return ops.listInvoices(input.submissionId);
  }),
  createInvoice: permProcedure(PERMISSIONS.BILLING_MANAGE).input(z.object({
    submissionId: z.number().int().positive(),
    invoiceNumber: z.string().max(128).optional(),
    lines: z.array(z.object({
      encounterId: z.number().int().positive().optional(),
      authorizationId: z.number().int().positive().optional(),
      serviceCode: z.string().max(64).optional(),
      serviceDate: z.coerce.date(),
      units: z.number().int().positive(),
      rate: money,
    })).min(1),
  })).mutation(async ({ input, ctx }) => {
    await assertClientAccess(ctx.user, input.submissionId);
    return ops.createInvoice(actorFromCtx(ctx), input);
  }),
  approveInvoice: permProcedure(PERMISSIONS.BILLING_APPROVE).input(z.object({
    invoiceId: z.number().int().positive(),
    submissionId: z.number().int().positive(),
  })).mutation(async ({ input, ctx }) => {
    await assertClientAccess(ctx.user, input.submissionId);
    return ops.approveInvoice(actorFromCtx(ctx), input.invoiceId, input.submissionId);
  }),
  recordPayment: permProcedure(PERMISSIONS.BILLING_MANAGE).input(z.object({
    invoiceId: z.number().int().positive(),
    submissionId: z.number().int().positive(),
    paidAmount: money,
    paymentDate: z.coerce.date().optional(),
    payerReference: z.string().max(128).optional(),
    idempotencyKey: z.string().max(128).optional(),
  })).mutation(async ({ input, ctx }) => {
    await assertClientAccess(ctx.user, input.submissionId);
    return ops.recordPayment(actorFromCtx(ctx), input);
  }),
  recordDenial: permProcedure(PERMISSIONS.BILLING_MANAGE).input(z.object({
    invoiceId: z.number().int().positive(), submissionId: z.number().int().positive(),
    denialCode: z.string().max(64).optional(), denialReason: z.string().max(2000).optional(),
  })).mutation(async ({ input, ctx }) => {
    await assertClientAccess(ctx.user, input.submissionId);
    return ops.recordDenial(actorFromCtx(ctx), input);
  }),
  recordAdjustment: permProcedure(PERMISSIONS.BILLING_MANAGE).input(z.object({
    invoiceId: z.number().int().positive(), submissionId: z.number().int().positive(), amount: money, reason: z.string().max(2000).optional(),
  })).mutation(async ({ input, ctx }) => {
    await assertClientAccess(ctx.user, input.submissionId);
    return ops.recordAdjustment(actorFromCtx(ctx), input);
  }),
  recordRecoupment: permProcedure(PERMISSIONS.BILLING_MANAGE).input(z.object({
    invoiceId: z.number().int().positive(), submissionId: z.number().int().positive(), amount: money, reason: z.string().max(2000).optional(),
  })).mutation(async ({ input, ctx }) => {
    await assertClientAccess(ctx.user, input.submissionId);
    return ops.recordRecoupment(actorFromCtx(ctx), input);
  }),
});

export const auditsRouter = router({
  list: permProcedure(PERMISSIONS.AUDIT_VIEW).query(() => ops.listAudits()),
  create: permProcedure(PERMISSIONS.AUDIT_MANAGE).input(z.object({
    title: z.string().min(2).max(256),
    auditType: z.string().min(2).max(64),
    periodStart: z.coerce.date().optional(),
    periodEnd: z.coerce.date().optional(),
  })).mutation(({ input, ctx }) => ops.createAudit(actorFromCtx(ctx), input)),
  createSample: permProcedure(PERMISSIONS.AUDIT_MANAGE).input(z.object({
    auditId: z.number().int().positive(),
    population: z.array(z.object({ id: z.number().int(), stratum: z.string().optional(), riskScore: z.number().optional(), amountCents: z.number().int().optional() })).min(1),
    method: z.enum(["full_population", "random", "stratified", "risk_based", "dollar_based", "judgmental"]),
    seed: z.number().int(),
    size: z.number().int().positive().optional(),
    judgmentalIds: z.array(z.number().int()).optional(),
  })).mutation(({ input, ctx }) => ops.createAuditSample(actorFromCtx(ctx), input)),
  recordTest: permProcedure(PERMISSIONS.AUDIT_MANAGE).input(z.object({
    auditId: z.number().int().positive(), sampleId: z.number().int().positive().optional(), sampleItemId: z.string().max(64).optional(),
    result: testResultEnum, financialExposure: money.optional(), note: z.string().max(2000).optional(),
  })).mutation(({ input, ctx }) => ops.recordAuditTest(actorFromCtx(ctx), input)),
  listFindings: permProcedure(PERMISSIONS.AUDIT_VIEW).input(z.object({ auditId: z.number().int().positive() })).query(({ input }) => ops.listFindings(input.auditId)),
  createFinding: permProcedure(PERMISSIONS.FINDING_MANAGE).input(z.object({
    auditId: z.number().int().positive(), submissionId: z.number().int().positive().optional(), findingNumber: z.string().max(64).optional(),
    conditionFound: z.string().max(4000).optional(), expectedCondition: z.string().max(4000).optional(), cause: z.string().max(4000).optional(), effect: z.string().max(4000).optional(),
    risk: z.enum(["low", "medium", "high", "critical"]).optional(), financialExposure: money.optional(), repeatFinding: z.boolean().optional(),
  })).mutation(({ input, ctx }) => ops.createFinding(actorFromCtx(ctx), input)),
  addManagementResponse: permProcedure(PERMISSIONS.FINDING_MANAGE).input(z.object({ findingId: z.number().int().positive(), response: z.string().min(2).max(4000) })).mutation(({ input, ctx }) => ops.addManagementResponse(actorFromCtx(ctx), input)),
  addCorrectiveAction: permProcedure(PERMISSIONS.FINDING_MANAGE).input(z.object({
    findingId: z.number().int().positive(), correctiveAction: z.string().min(2).max(4000), rootCauseAnalysis: z.string().max(4000).optional(), preventiveAction: z.string().max(4000).optional(), dueDate: z.coerce.date().optional(), completed: z.boolean().optional(),
  })).mutation(({ input, ctx }) => ops.addCorrectiveAction(actorFromCtx(ctx), input)),
  addCorrectiveActionEvidence: permProcedure(PERMISSIONS.FINDING_MANAGE).input(z.object({ correctiveActionId: z.number().int().positive(), documentId: z.number().int().positive().optional(), note: z.string().max(2000).optional() })).mutation(({ input, ctx }) => ops.addCorrectiveActionEvidence(actorFromCtx(ctx), input)),
  addFollowUpTest: permProcedure(PERMISSIONS.FINDING_MANAGE).input(z.object({ findingId: z.number().int().positive(), result: testResultEnum, note: z.string().max(2000).optional() })).mutation(({ input, ctx }) => ops.addFollowUpTest(actorFromCtx(ctx), input)),
  // Closing a finding requires the FINDING_CLOSE (compliance-approval) permission,
  // and the store enforces separation of duties + the full CAPA verification gate.
  closeFinding: permProcedure(PERMISSIONS.FINDING_CLOSE).input(z.object({ findingId: z.number().int().positive() })).mutation(({ input, ctx }) => ops.closeFinding(actorFromCtx(ctx), input.findingId)),
});

export const nutritionRouter = router({
  listAssessments: permProcedure(PERMISSIONS.NUTRITION_VIEW).input(submissionIdInput).query(async ({ input, ctx }) => {
    await assertClientAccess(ctx.user, input.submissionId);
    return ops.listNutritionAssessments(input.submissionId);
  }),
  createAssessment: permProcedure(PERMISSIONS.NUTRITION_MANAGE).input(z.object({
    submissionId: z.number().int().positive(),
    assessmentDate: z.coerce.date().optional(),
    nutritionDiagnosis: z.string().max(2000).optional(),
    allergies: z.string().max(2000).optional(),
    dietaryRestrictions: z.string().max(2000).optional(),
    medicalRestrictions: z.string().max(2000).optional(),
  })).mutation(async ({ input, ctx }) => {
    await assertClientAccess(ctx.user, input.submissionId);
    return ops.createNutritionAssessment(actorFromCtx(ctx), input);
  }),
  createClinicalApproval: permProcedure(PERMISSIONS.CLINICAL_APPROVE).input(z.object({
    submissionId: z.number().int().positive(),
    assessmentId: z.number().int().positive().optional(),
    credentialType: z.string().min(2).max(32),
    credentialNumber: z.string().max(64).optional(),
    credentialValidFrom: z.coerce.date().optional(),
    credentialValidUntil: z.coerce.date().optional(),
    serviceDate: z.coerce.date().optional(),
    outcome: z.enum(["approved", "rejected"]).optional(),
  })).mutation(async ({ input, ctx }) => {
    await assertClientAccess(ctx.user, input.submissionId);
    return ops.createClinicalApproval(actorFromCtx(ctx), input);
  }),
});

export const overpaymentsRouter = router({
  disclaimer: permProcedure(PERMISSIONS.OVERPAYMENT_VIEW).query(() => ({ disclaimer: OVERPAYMENT_DISCLAIMER })),
  list: permProcedure(PERMISSIONS.OVERPAYMENT_VIEW).query(() => ops.listOverpaymentCases()),
  create: permProcedure(PERMISSIONS.OVERPAYMENT_MANAGE).input(z.object({
    discoverySource: z.string().max(256).optional(),
    periodStart: z.coerce.date().optional(),
    periodEnd: z.coerce.date().optional(),
    preliminaryAmount: money.optional(),
    rootCause: z.string().max(4000).optional(),
    calculationMethodology: z.string().max(4000).optional(),
  })).mutation(({ input, ctx }) => ops.createOverpaymentCase(actorFromCtx(ctx), input)),
});
