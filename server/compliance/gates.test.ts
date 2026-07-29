/**
 * Compliance gates + exception overrides + separation of duties.
 */
import { describe, it, expect } from "vitest";
import {
  evaluateServiceReadinessGate, evaluateInvoicingGate, applyExceptions,
  exceptionCovers, canApproveException, type ServiceReadinessGateInput,
  type InvoicingGateInput, type ExceptionRecordLike,
} from "./gates";

const passingReadiness: ServiceReadinessGateInput = {
  eligibilityVerified: true, eligibilityExpired: false,
  managedCareRequired: false, managedCareEnrolled: false,
  referralStatus: "accepted",
  authorizationActive: true, authorizationExpired: false, authorizedServiceMatchesProposed: true,
  nutritionDocumentationPresent: true,
  clinicalApprovalRequired: false, clinicalApprovalPresent: false, approverCredentialValid: true,
  consentPresent: true, prohibitedServiceOverlap: false, duplicateFundingResolved: true,
  requiredEvidencePresent: true,
};

const passingInvoicing: InvoicingGateInput = {
  serviceWithinAuthorizationDates: true, unitsWithinAuthorization: true,
  proofOfDeliveryPresent: true, serviceDocumentationComplete: true, serviceApproved: true,
  duplicateServiceOrInvoice: false, requiredBillingInfoPresent: true,
  billingDeadlineExpired: false, approvedDeadlineException: false, underHold: false,
};

describe("service readiness gate", () => {
  it("allows when everything passes", () => {
    expect(evaluateServiceReadinessGate(passingReadiness).allowed).toBe(true);
  });
  it("blocks on missing eligibility", () => {
    const r = evaluateServiceReadinessGate({ ...passingReadiness, eligibilityVerified: false });
    expect(r.allowed).toBe(false);
    expect(r.blockers.map((b) => b.code)).toContain("eligibility_missing");
  });
  it("blocks when authorized service does not match proposed", () => {
    const r = evaluateServiceReadinessGate({ ...passingReadiness, authorizedServiceMatchesProposed: false });
    expect(r.blockers.map((b) => b.code)).toContain("authorization_mismatch");
  });
  it("blocks on expired approver credential", () => {
    const r = evaluateServiceReadinessGate({ ...passingReadiness, clinicalApprovalRequired: true, clinicalApprovalPresent: true, approverCredentialValid: false });
    expect(r.blockers.map((b) => b.code)).toContain("approver_credential_expired");
  });
  it("blocks on duplicate funding not resolved", () => {
    const r = evaluateServiceReadinessGate({ ...passingReadiness, duplicateFundingResolved: false });
    expect(r.blockers.map((b) => b.code)).toContain("duplicate_funding");
  });
});

describe("invoicing gate", () => {
  it("allows when everything passes", () => {
    expect(evaluateInvoicingGate(passingInvoicing).allowed).toBe(true);
  });
  it("blocks when units exceed authorization", () => {
    const r = evaluateInvoicingGate({ ...passingInvoicing, unitsWithinAuthorization: false });
    expect(r.blockers.map((b) => b.code)).toContain("units_exceed_authorization");
  });
  it("blocks on missing proof of delivery", () => {
    expect(evaluateInvoicingGate({ ...passingInvoicing, proofOfDeliveryPresent: false }).blockers.map((b) => b.code)).toContain("pod_missing");
  });
  it("blocks past billing deadline unless an approved exception exists", () => {
    expect(evaluateInvoicingGate({ ...passingInvoicing, billingDeadlineExpired: true }).allowed).toBe(false);
    expect(evaluateInvoicingGate({ ...passingInvoicing, billingDeadlineExpired: true, approvedDeadlineException: true }).allowed).toBe(true);
  });
  it("blocks under legal/compliance hold", () => {
    expect(evaluateInvoicingGate({ ...passingInvoicing, underHold: true }).blockers.map((b) => b.code)).toContain("under_hold");
  });
});

describe("exceptions + separation of duties", () => {
  const now = new Date("2026-06-01");
  const approvedException = (over: Partial<ExceptionRecordLike>): ExceptionRecordLike => ({
    status: "approved", requestedBy: 1, approvedBy: 2,
    effectiveDate: new Date("2026-01-01"), expirationDate: new Date("2026-12-31"),
    coveredCodes: ["eligibility_missing"], ...over,
  });

  it("an approved, in-window exception with a different approver covers its code", () => {
    expect(exceptionCovers(approvedException({}), "eligibility_missing", now)).toBe(true);
  });
  it("does NOT cover a different code", () => {
    expect(exceptionCovers(approvedException({}), "authorization_missing", now)).toBe(false);
  });
  it("rejects self-approval (separation of duties)", () => {
    expect(exceptionCovers(approvedException({ requestedBy: 5, approvedBy: 5 }), "eligibility_missing", now)).toBe(false);
    expect(canApproveException(5, 5)).toBe(false);
    expect(canApproveException(5, 6)).toBe(true);
  });
  it("rejects an expired exception", () => {
    expect(exceptionCovers(approvedException({ expirationDate: new Date("2026-05-01") }), "eligibility_missing", now)).toBe(false);
  });
  it("applyExceptions removes only covered blockers", () => {
    const gate = evaluateServiceReadinessGate({ ...passingReadiness, eligibilityVerified: false, consentPresent: false });
    const after = applyExceptions(gate, [approvedException({})], now);
    const codes = after.blockers.map((b) => b.code);
    expect(codes).not.toContain("eligibility_missing"); // covered
    expect(codes).toContain("consent_missing"); // not covered → still blocks
    expect(after.allowed).toBe(false);
  });
});
