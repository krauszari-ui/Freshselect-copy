/**
 * Compliance-readiness computation.
 *
 * Readiness is DERIVED from underlying facts — staff can never hand-set a client
 * to "Ready for Service". The pure `computeReadiness` function returns both the
 * status and the ordered list of blocking reasons that produced it, so the UI
 * can show WHY a client is not ready (and never rely on color alone).
 */
import type { ReadinessStatus } from "@shared/compliance/constants";

export interface ReadinessInput {
  /** Client lifecycle. */
  inactive?: boolean;
  intakeComplete: boolean;
  /** Eligibility. */
  eligibilityVerified: boolean;
  eligibilityExpired?: boolean;
  managedCareRequired?: boolean;
  managedCareEnrolled?: boolean;
  /** Referral. */
  referralStatus?: "none" | "received" | "in_review" | "accepted" | "rejected" | "expired";
  /** Authorization. */
  authorizationActive: boolean;
  authorizationExpired?: boolean;
  /** Clinical / evidence / compliance review. */
  clinicalApprovalRequired?: boolean;
  clinicalApprovalPresent?: boolean;
  evidenceComplete: boolean;
  complianceReviewRequired?: boolean;
  complianceReviewPassed?: boolean;
  /** Holds (highest precedence). */
  underAudit?: boolean;
  serviceHold?: boolean;
  billingHold?: boolean;
  /** Count of unmet BLOCKING requirement assignments. */
  unmetBlockingRequirements?: number;
}

export interface ReadinessResult {
  status: ReadinessStatus;
  blockingReasons: string[];
  /** True only when status === "ready_for_service". */
  ready: boolean;
}

/**
 * Evaluate readiness. Precedence (first match wins for the headline status):
 *   inactive → holds (service/billing/audit) → intake → eligibility → managed
 *   care → referral → authorization → clinical → evidence → compliance review →
 *   unmet blocking requirements → ready.
 * All failing gates are also accumulated into `blockingReasons`.
 */
export function computeReadiness(input: ReadinessInput): ReadinessResult {
  const reasons: string[] = [];

  // Collect every failing gate (for the reasons list), then pick the headline.
  if (!input.intakeComplete) reasons.push("Intake is incomplete.");
  if (!input.eligibilityVerified) reasons.push("Medicaid eligibility has not been verified.");
  else if (input.eligibilityExpired) reasons.push("Eligibility verification has expired.");
  if (input.managedCareRequired && !input.managedCareEnrolled) reasons.push("Managed-care (MCO) enrollment is required but missing.");
  if (input.referralStatus === "none" || input.referralStatus === undefined) reasons.push("SCN referral is missing.");
  else if (input.referralStatus === "rejected") reasons.push("SCN referral was rejected.");
  else if (input.referralStatus === "expired") reasons.push("SCN referral has expired.");
  else if (input.referralStatus !== "accepted") reasons.push("SCN referral has not been accepted.");
  if (!input.authorizationActive) reasons.push("An active service authorization is missing.");
  else if (input.authorizationExpired) reasons.push("Service authorization has expired.");
  if (input.clinicalApprovalRequired && !input.clinicalApprovalPresent) reasons.push("Required RDN/CDN clinical approval is missing.");
  if (!input.evidenceComplete) reasons.push("Mandatory evidence is missing.");
  if (input.complianceReviewRequired && !input.complianceReviewPassed) reasons.push("Compliance review has not passed.");
  if ((input.unmetBlockingRequirements ?? 0) > 0) reasons.push(`${input.unmetBlockingRequirements} blocking requirement(s) are unmet.`);

  // Headline status by precedence.
  let status: ReadinessStatus;
  if (input.inactive) status = "inactive";
  else if (input.underAudit) status = "under_audit";
  else if (input.serviceHold) status = "service_hold";
  else if (input.billingHold) status = "billing_hold";
  else if (!input.intakeComplete) status = "intake_pending";
  else if (!input.eligibilityVerified || input.eligibilityExpired || (input.managedCareRequired && !input.managedCareEnrolled)) status = "eligibility_pending";
  else if (input.referralStatus !== "accepted") status = "referral_pending";
  else if (!input.authorizationActive || input.authorizationExpired) status = "authorization_pending";
  else if (input.clinicalApprovalRequired && !input.clinicalApprovalPresent) status = "clinical_review_pending";
  else if (!input.evidenceComplete || (input.unmetBlockingRequirements ?? 0) > 0) status = "evidence_missing";
  else if (input.complianceReviewRequired && !input.complianceReviewPassed) status = "compliance_review_pending";
  else status = "ready_for_service";

  return { status, blockingReasons: reasons, ready: status === "ready_for_service" };
}
