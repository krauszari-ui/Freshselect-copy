/**
 * Readiness computation — derived status + blocking reasons.
 * "Ready for Service" is only ever reached when every gate passes.
 */
import { describe, it, expect } from "vitest";
import { computeReadiness, type ReadinessInput } from "./readiness";

const ready: ReadinessInput = {
  intakeComplete: true,
  eligibilityVerified: true,
  eligibilityExpired: false,
  referralStatus: "accepted",
  authorizationActive: true,
  authorizationExpired: false,
  evidenceComplete: true,
  unmetBlockingRequirements: 0,
};

describe("computeReadiness", () => {
  it("reaches ready_for_service only when everything passes", () => {
    const r = computeReadiness(ready);
    expect(r.status).toBe("ready_for_service");
    expect(r.ready).toBe(true);
    expect(r.blockingReasons).toHaveLength(0);
  });

  it("cannot be ready with incomplete intake", () => {
    const r = computeReadiness({ ...ready, intakeComplete: false });
    expect(r.status).toBe("intake_pending");
    expect(r.ready).toBe(false);
  });

  it("eligibility gate: unverified or expired", () => {
    expect(computeReadiness({ ...ready, eligibilityVerified: false }).status).toBe("eligibility_pending");
    expect(computeReadiness({ ...ready, eligibilityExpired: true }).status).toBe("eligibility_pending");
  });

  it("managed-care required but not enrolled blocks at eligibility", () => {
    const r = computeReadiness({ ...ready, managedCareRequired: true, managedCareEnrolled: false });
    expect(r.status).toBe("eligibility_pending");
    expect(r.blockingReasons.join(" ")).toMatch(/managed-care/i);
  });

  it("referral gate: rejected/expired/missing all block", () => {
    expect(computeReadiness({ ...ready, referralStatus: "rejected" }).status).toBe("referral_pending");
    expect(computeReadiness({ ...ready, referralStatus: "expired" }).status).toBe("referral_pending");
    expect(computeReadiness({ ...ready, referralStatus: "none" }).status).toBe("referral_pending");
  });

  it("authorization gate", () => {
    expect(computeReadiness({ ...ready, authorizationActive: false }).status).toBe("authorization_pending");
    expect(computeReadiness({ ...ready, authorizationExpired: true }).status).toBe("authorization_pending");
  });

  it("clinical approval gate when required", () => {
    const r = computeReadiness({ ...ready, clinicalApprovalRequired: true, clinicalApprovalPresent: false });
    expect(r.status).toBe("clinical_review_pending");
  });

  it("evidence / unmet blocking requirements", () => {
    expect(computeReadiness({ ...ready, evidenceComplete: false }).status).toBe("evidence_missing");
    expect(computeReadiness({ ...ready, unmetBlockingRequirements: 2 }).status).toBe("evidence_missing");
  });

  it("holds take precedence over everything", () => {
    expect(computeReadiness({ ...ready, underAudit: true }).status).toBe("under_audit");
    expect(computeReadiness({ ...ready, serviceHold: true }).status).toBe("service_hold");
    expect(computeReadiness({ ...ready, billingHold: true }).status).toBe("billing_hold");
    expect(computeReadiness({ ...ready, inactive: true }).status).toBe("inactive");
  });

  it("accumulates all failing reasons even when only one is the headline", () => {
    const r = computeReadiness({ ...ready, eligibilityVerified: false, authorizationActive: false });
    expect(r.blockingReasons.length).toBeGreaterThanOrEqual(2);
  });
});
