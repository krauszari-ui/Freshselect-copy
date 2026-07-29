/** CAPA — findings cannot close without verification; nutrition credential validity. */
import { describe, it, expect } from "vitest";
import { canCloseFinding, canTransitionFinding, isRepeatFinding, estimatePreliminaryOverpaymentCents, OVERPAYMENT_DISCLAIMER } from "./capa";
import { isCredentialValidOn, clinicalApprovalValid, supersedePlan } from "./nutrition";

describe("finding closure gate", () => {
  const complete = { correctiveActionCompleted: true, hasVerificationEvidence: true, followUpTestResult: "pass" as const, complianceApproved: true, ownerId: 1, approverId: 2 };

  it("closes only when every gate passes", () => {
    expect(canCloseFinding(complete)).toEqual({ canClose: true });
  });

  it("cannot close just because someone marks it done (missing verification)", () => {
    const r = canCloseFinding({ ...complete, hasVerificationEvidence: false });
    expect(r.canClose).toBe(false);
    if (!r.canClose) expect(r.reasons).toContain("verification_evidence_missing");
  });

  it("cannot close without a passed follow-up test", () => {
    const r = canCloseFinding({ ...complete, followUpTestResult: "fail" });
    expect(r.canClose).toBe(false);
    if (!r.canClose) expect(r.reasons).toContain("follow_up_not_passed");
  });

  it("enforces separation of duties (owner cannot self-approve closure)", () => {
    const r = canCloseFinding({ ...complete, approverId: 1 });
    expect(r.canClose).toBe(false);
    if (!r.canClose) expect(r.reasons).toContain("separation_of_duties");
  });

  it("state machine forbids illegal jumps and allows reopen", () => {
    expect(canTransitionFinding("open", "closed")).toBe(false);
    expect(canTransitionFinding("follow_up", "closed")).toBe(true);
    expect(canTransitionFinding("closed", "reopened")).toBe(true);
  });

  it("detects repeat findings", () => {
    expect(isRepeatFinding("scn_referral_present", ["eligibility_verified", "scn_referral_present"])).toBe(true);
    expect(isRepeatFinding("new_key", ["other"])).toBe(false);
  });
});

describe("overpayment aid is advisory only", () => {
  it("sums confirmed error amounts but makes no legal conclusion", () => {
    expect(estimatePreliminaryOverpaymentCents({ erroneousAmountsCents: [1000, 250, 5] })).toBe(1255);
    expect(OVERPAYMENT_DISCLAIMER).toMatch(/does not determine/i);
  });
});

describe("nutrition clinical approval validity", () => {
  const cred = { credentialType: "RDN", validFrom: new Date("2025-01-01"), validUntil: new Date("2026-12-31") };
  it("valid within the credential window", () => {
    expect(isCredentialValidOn(cred, new Date("2026-06-01"))).toBe(true);
  });
  it("invalid when expired", () => {
    expect(isCredentialValidOn(cred, new Date("2027-01-01"))).toBe(false);
  });
  it("approval requires validity on both approval and service dates", () => {
    expect(clinicalApprovalValid({ approvalDate: new Date("2026-06-01"), serviceDate: new Date("2026-07-01"), credential: cred })).toBe(true);
    // approval made after credential expired → invalid
    expect(clinicalApprovalValid({ approvalDate: new Date("2027-02-01"), serviceDate: new Date("2027-03-01"), credential: cred })).toBe(false);
  });
  it("superseding retains the prior plan (marks it superseded, not deleted)", () => {
    expect(supersedePlan()).toEqual({ priorPlanNewState: "superseded", newPlanState: "active" });
  });
});
