/**
 * Nutrition assessments, plans, and clinical (RDN/CDN) approvals.
 *
 * Two invariants:
 *  1. A later assessment SUPERSEDES an earlier one — it must never destroy it
 *     (append-only history), so `supersede` returns state transitions, not deletes.
 *  2. A clinical approval is only valid if the approver's credential was valid AT
 *     THE TIME of approval and has not since expired for the service date.
 */
export interface CredentialSnapshot {
  credentialType: string; // e.g. "RDN", "CDN"
  licenseNumber?: string | null;
  validFrom: Date | null;
  validUntil: Date | null;
}

/** Is the approver's credential valid for the given date? */
export function isCredentialValidOn(cred: CredentialSnapshot, date: Date): boolean {
  if (cred.validFrom && date < cred.validFrom) return false;
  if (cred.validUntil && date > cred.validUntil) return false;
  return true;
}

export interface ClinicalApprovalCheck {
  approvalDate: Date;
  credential: CredentialSnapshot;
  serviceDate: Date;
}

/**
 * A clinical approval counts toward the readiness gate only if the credential was
 * valid on BOTH the approval date and the service date. An expired approver
 * credential invalidates the approval (matches the gate `approver_credential_expired`).
 */
export function clinicalApprovalValid(check: ClinicalApprovalCheck): boolean {
  return isCredentialValidOn(check.credential, check.approvalDate) && isCredentialValidOn(check.credential, check.serviceDate);
}

export const NUTRITION_PLAN_STATES = ["draft", "active", "superseded"] as const;
export type NutritionPlanState = (typeof NUTRITION_PLAN_STATES)[number];

export interface SupersedeResult {
  priorPlanNewState: NutritionPlanState;
  newPlanState: NutritionPlanState;
}

/**
 * Superseding a plan marks the prior plan `superseded` (retained, not deleted)
 * and the new plan `active`. Returns the intended states for the caller to apply
 * transactionally.
 */
export function supersedePlan(): SupersedeResult {
  return { priorPlanNewState: "superseded", newPlanState: "active" };
}
