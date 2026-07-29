/**
 * Server-side compliance gates.
 *
 * These encode the brief's blocking conditions for (a) marking a client ready
 * for service and (b) invoicing a service. They are PURE and enforced in
 * mutations — a disabled button on the client is never the control. When the
 * COMPLIANCE_GATES flag is off the same functions run in advisory mode (the
 * caller logs but does not block); when on, a failing gate throws.
 *
 * A gate may be overridden only by an approved Exception (separate approver,
 * written justification, expiry) — see `exceptionCovers`.
 */
import { separationOfDutiesOk } from "./rbac";

export interface GateBlocker {
  code: string;
  message: string;
}

export interface GateResult {
  allowed: boolean;
  blockers: GateBlocker[];
}

// ─── Service-readiness gate ──────────────────────────────────────────────────
export interface ServiceReadinessGateInput {
  eligibilityVerified: boolean;
  eligibilityExpired: boolean;
  managedCareRequired: boolean;
  managedCareEnrolled: boolean;
  referralStatus: "none" | "received" | "in_review" | "accepted" | "rejected" | "expired";
  authorizationActive: boolean;
  authorizationExpired: boolean;
  authorizedServiceMatchesProposed: boolean;
  nutritionDocumentationPresent: boolean;
  clinicalApprovalRequired: boolean;
  clinicalApprovalPresent: boolean;
  approverCredentialValid: boolean;
  consentPresent: boolean;
  prohibitedServiceOverlap: boolean;
  duplicateFundingResolved: boolean;
  requiredEvidencePresent: boolean;
}

export function evaluateServiceReadinessGate(input: ServiceReadinessGateInput): GateResult {
  const blockers: GateBlocker[] = [];
  const add = (cond: boolean, code: string, message: string) => { if (cond) blockers.push({ code, message }); };

  add(!input.eligibilityVerified, "eligibility_missing", "Eligibility is missing.");
  add(input.eligibilityVerified && input.eligibilityExpired, "eligibility_expired", "Eligibility has expired.");
  add(input.managedCareRequired && !input.managedCareEnrolled, "managed_care_missing", "Managed-care enrollment is required but missing.");
  add(input.referralStatus === "none", "referral_missing", "Referral is missing.");
  add(input.referralStatus === "rejected", "referral_rejected", "Referral was rejected.");
  add(input.referralStatus === "expired", "referral_expired", "Referral has expired.");
  add(!["accepted", "rejected", "expired", "none"].includes(input.referralStatus), "referral_not_accepted", "Referral is not yet accepted.");
  add(!input.authorizationActive, "authorization_missing", "Authorization is missing.");
  add(input.authorizationActive && input.authorizationExpired, "authorization_expired", "Authorization has expired.");
  add(input.authorizationActive && !input.authorizedServiceMatchesProposed, "authorization_mismatch", "Authorized service does not match the proposed service.");
  add(!input.nutritionDocumentationPresent, "nutrition_documentation_missing", "Mandatory nutrition documentation is missing.");
  add(input.clinicalApprovalRequired && !input.clinicalApprovalPresent, "clinical_approval_missing", "Required RDN/CDN approval is missing.");
  add(input.clinicalApprovalRequired && input.clinicalApprovalPresent && !input.approverCredentialValid, "approver_credential_expired", "Approver credential is expired.");
  add(!input.consentPresent, "consent_missing", "Required consent is missing.");
  add(input.prohibitedServiceOverlap, "service_overlap", "Prohibited service overlap detected.");
  add(!input.duplicateFundingResolved, "duplicate_funding", "Duplicate funding has not been resolved.");
  add(!input.requiredEvidencePresent, "evidence_missing", "Required evidence is missing.");

  return { allowed: blockers.length === 0, blockers };
}

// ─── Invoicing gate ──────────────────────────────────────────────────────────
export interface InvoicingGateInput {
  serviceWithinAuthorizationDates: boolean;
  unitsWithinAuthorization: boolean;
  proofOfDeliveryPresent: boolean;
  serviceDocumentationComplete: boolean;
  serviceApproved: boolean;
  duplicateServiceOrInvoice: boolean;
  requiredBillingInfoPresent: boolean;
  billingDeadlineExpired: boolean;
  approvedDeadlineException: boolean;
  underHold: boolean;
}

export function evaluateInvoicingGate(input: InvoicingGateInput): GateResult {
  const blockers: GateBlocker[] = [];
  const add = (cond: boolean, code: string, message: string) => { if (cond) blockers.push({ code, message }); };

  add(!input.serviceWithinAuthorizationDates, "service_outside_auth_dates", "Service is outside authorization dates.");
  add(!input.unitsWithinAuthorization, "units_exceed_authorization", "Units exceed authorization.");
  add(!input.proofOfDeliveryPresent, "pod_missing", "Proof of delivery is missing.");
  add(!input.serviceDocumentationComplete, "documentation_incomplete", "Service documentation is incomplete.");
  add(!input.serviceApproved, "service_not_approved", "Service has not received required approval.");
  add(input.duplicateServiceOrInvoice, "duplicate", "Duplicate service or invoice detected.");
  add(!input.requiredBillingInfoPresent, "billing_info_missing", "Required billing information is missing.");
  add(input.billingDeadlineExpired && !input.approvedDeadlineException, "billing_deadline_expired", "Billing deadline expired without an approved exception.");
  add(input.underHold, "under_hold", "Record is under a compliance or legal hold.");

  return { allowed: blockers.length === 0, blockers };
}

// ─── Exceptions (permitted, audited overrides) ───────────────────────────────
export interface ExceptionRecordLike {
  status: "requested" | "approved" | "rejected" | "expired";
  requestedBy: number;
  approvedBy: number | null;
  effectiveDate: Date | null;
  expirationDate: Date | null;
  /** The blocker code(s) this exception is authorized to cover. */
  coveredCodes?: string[] | null;
}

/**
 * Does an approved exception currently cover the given blocker code? Enforces
 * that the exception is approved, in its effective window, and — for separation
 * of duties — approved by someone other than the requester.
 */
export function exceptionCovers(exc: ExceptionRecordLike, blockerCode: string, now: Date = new Date()): boolean {
  if (exc.status !== "approved") return false;
  if (exc.approvedBy == null) return false;
  if (!separationOfDutiesOk(exc.requestedBy, exc.approvedBy)) return false;
  if (exc.effectiveDate && now < exc.effectiveDate) return false;
  if (exc.expirationDate && now > exc.expirationDate) return false;
  if (exc.coveredCodes && exc.coveredCodes.length > 0 && !exc.coveredCodes.includes(blockerCode)) return false;
  return true;
}

/** Remove blockers that are covered by an approved exception. */
export function applyExceptions(result: GateResult, exceptions: ExceptionRecordLike[], now: Date = new Date()): GateResult {
  const remaining = result.blockers.filter((b) => !exceptions.some((e) => exceptionCovers(e, b.code, now)));
  return { allowed: remaining.length === 0, blockers: remaining };
}

/**
 * Validate that a high-risk exception REQUEST can be approved by `approverId`.
 * Separation of duties: the requester cannot approve their own exception.
 */
export function canApproveException(requesterId: number, approverId: number): boolean {
  return separationOfDutiesOk(requesterId, approverId);
}
