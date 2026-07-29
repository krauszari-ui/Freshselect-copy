/**
 * Findings & corrective actions (CAPA).
 *
 * Core invariant: a finding cannot be closed just because someone marks it done.
 * Closure requires (a) a completed corrective action, (b) verification evidence,
 * (c) a passed follow-up test, and (d) compliance approval by someone other than
 * the finding owner. Reopening is tracked.
 */
export const FINDING_STATES = ["open", "management_response", "corrective_action", "follow_up", "closed", "reopened"] as const;
export type FindingState = (typeof FINDING_STATES)[number];

export const TEST_RESULTS = ["pass", "fail", "observation", "not_applicable", "insufficient_evidence", "pending_clarification"] as const;
export type TestResult = (typeof TEST_RESULTS)[number];

export interface FindingClosureInput {
  correctiveActionCompleted: boolean;
  hasVerificationEvidence: boolean;
  followUpTestResult: TestResult | null;
  complianceApproved: boolean;
  ownerId: number;
  approverId: number | null;
}

export type ClosureDecision = { canClose: true } | { canClose: false; reasons: string[] };

/** Decide whether a finding may be closed. All gates must pass. */
export function canCloseFinding(input: FindingClosureInput): ClosureDecision {
  const reasons: string[] = [];
  if (!input.correctiveActionCompleted) reasons.push("corrective_action_incomplete");
  if (!input.hasVerificationEvidence) reasons.push("verification_evidence_missing");
  if (input.followUpTestResult !== "pass") reasons.push("follow_up_not_passed");
  if (!input.complianceApproved) reasons.push("compliance_approval_missing");
  if (input.approverId == null || input.approverId === input.ownerId) reasons.push("separation_of_duties");
  return reasons.length === 0 ? { canClose: true } : { canClose: false, reasons };
}

const FINDING_TRANSITIONS: Record<FindingState, FindingState[]> = {
  open: ["management_response", "reopened"],
  management_response: ["corrective_action"],
  corrective_action: ["follow_up"],
  follow_up: ["closed", "corrective_action"],
  closed: ["reopened"],
  reopened: ["management_response", "corrective_action"],
};

export function canTransitionFinding(from: FindingState, to: FindingState): boolean {
  return (FINDING_TRANSITIONS[from] ?? []).includes(to);
}

/** A finding is a repeat if a prior finding with the same requirement key exists. */
export function isRepeatFinding(currentRequirementKey: string, priorRequirementKeys: string[]): boolean {
  return priorRequirementKeys.includes(currentRequirementKey);
}

// ─── Overpayment support (advisory only — no legal conclusions) ──────────────
export interface OverpaymentEstimateInput {
  /** Confirmed-error line amounts in cents. */
  erroneousAmountsCents: number[];
}

/**
 * Sum confirmed error amounts. This is an arithmetic aid ONLY. The system does
 * not determine whether a legal repayment or self-disclosure obligation exists —
 * qualified compliance and legal personnel must review.
 */
export function estimatePreliminaryOverpaymentCents(input: OverpaymentEstimateInput): number {
  return input.erroneousAmountsCents.reduce((a, b) => a + b, 0);
}

export const OVERPAYMENT_DISCLAIMER =
  "This system does not determine whether a legal repayment or self-disclosure obligation exists. " +
  "Qualified compliance and legal personnel must review potential overpayments.";
