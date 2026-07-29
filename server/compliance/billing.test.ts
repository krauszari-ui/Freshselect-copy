/** Billing — expected amounts, duplicate prevention, reconciliation, payments. */
import { describe, it, expect } from "vitest";
import {
  computeLineExpectedAmount, computeInvoiceExpectedTotal, invoiceLineIdempotencyKey,
  findDuplicateLines, validateInvoiceLine, reconcile, reconcilePayment,
  isWithinTimelyFiling, classifyBilledAmount, type ReconciliationChain,
} from "./billing";

describe("expected amounts", () => {
  it("computes line and invoice totals exactly", () => {
    expect(computeLineExpectedAmount(30, "12.50")).toBe("375.00");
    expect(computeInvoiceExpectedTotal([{ units: 30, rate: "12.50" }, { units: 2, rate: "5.00" }])).toBe("385.00");
  });
});

describe("duplicate / idempotency", () => {
  it("same encounter → same idempotency key (duplicate invoice blocked)", () => {
    const a = invoiceLineIdempotencyKey({ submissionId: 1, encounterId: 99, serviceDate: new Date("2026-06-01"), units: 1 });
    const b = invoiceLineIdempotencyKey({ submissionId: 1, encounterId: 99, serviceDate: new Date("2026-07-01"), units: 5 });
    expect(a).toBe(b); // encounter-scoped: re-billing the same encounter collides
  });

  it("different service lines → different keys", () => {
    const a = invoiceLineIdempotencyKey({ submissionId: 1, serviceCode: "S1", serviceDate: "2026-06-01", units: 1 });
    const b = invoiceLineIdempotencyKey({ submissionId: 1, serviceCode: "S1", serviceDate: "2026-06-02", units: 1 });
    expect(a).not.toBe(b);
  });

  it("findDuplicateLines flags collisions within a batch", () => {
    const k = "abc";
    expect(findDuplicateLines([{ idempotencyKey: k }, { idempotencyKey: k }, { idempotencyKey: "x" }])).toHaveLength(1);
  });
});

describe("invoice line validation", () => {
  const auth = { remainingUnits: 10, startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"), status: "active" };
  it("accepts a valid line", () => {
    expect(validateInvoiceLine({ units: 5, serviceDate: new Date("2026-06-01"), authorization: auth })).toEqual({ ok: true });
  });
  it("rejects units over remaining", () => {
    expect(validateInvoiceLine({ units: 11, serviceDate: new Date("2026-06-01"), authorization: auth })).toMatchObject({ ok: false, reason: "units_exceed_authorization" });
  });
  it("rejects service outside authorization dates", () => {
    expect(validateInvoiceLine({ units: 1, serviceDate: new Date("2025-06-01"), authorization: auth })).toMatchObject({ ok: false, reason: "service_before_authorization" });
    expect(validateInvoiceLine({ units: 1, serviceDate: new Date("2027-06-01"), authorization: auth })).toMatchObject({ ok: false, reason: "service_after_authorization" });
  });
  it("rejects when no/inactive authorization", () => {
    expect(validateInvoiceLine({ units: 1, serviceDate: new Date("2026-06-01"), authorization: null })).toMatchObject({ ok: false, reason: "no_authorization" });
    expect(validateInvoiceLine({ units: 1, serviceDate: new Date("2026-06-01"), authorization: { ...auth, status: "expired" } })).toMatchObject({ ok: false, reason: "authorization_expired" });
  });
});

describe("reconciliation chain", () => {
  const full: ReconciliationChain = {
    hasReferral: true, referralAccepted: true,
    hasEligibility: true, eligibilityValidForServiceDate: true,
    hasAuthorization: true, serviceWithinAuthorization: true,
    hasServiceEncounter: true, hasProofOfDelivery: true,
    hasInvoice: true, invoiceApproved: true, hasPayment: true,
  };
  it("complete when the whole chain is intact", () => {
    expect(reconcile(full)).toEqual({ complete: true, brokenLinks: [] });
  });
  it("reports each broken link", () => {
    expect(reconcile({ ...full, hasProofOfDelivery: false }).brokenLinks).toContain("proof_of_delivery_missing");
    expect(reconcile({ ...full, referralAccepted: false }).brokenLinks).toContain("referral_not_accepted");
    expect(reconcile({ ...full, hasPayment: false }).complete).toBe(false);
  });
});

describe("payment reconciliation", () => {
  it("classifies paid in full / partial / overpaid / unpaid", () => {
    expect(reconcilePayment({ expected: "100.00", paid: "100.00" }).status).toBe("paid_in_full");
    expect(reconcilePayment({ expected: "100.00", paid: "60.00" })).toEqual({ status: "partial", variance: "40.00" });
    expect(reconcilePayment({ expected: "100.00", paid: "120.00" }).status).toBe("overpaid");
    expect(reconcilePayment({ expected: "100.00", paid: "0.00" }).status).toBe("unpaid");
  });
  it("accounts for adjustments and recoupments", () => {
    // net = 90 + 10 - 5 = 95 → partial, variance 5.00
    expect(reconcilePayment({ expected: "100.00", paid: "90.00", adjustments: "10.00", recoupments: "5.00" })).toEqual({ status: "partial", variance: "5.00" });
  });
});

describe("timely filing & billed-amount classification", () => {
  it("flags submissions past the deadline", () => {
    expect(isWithinTimelyFiling(new Date("2026-01-01"), new Date("2026-03-01"), 90)).toBe(true);
    expect(isWithinTimelyFiling(new Date("2026-01-01"), new Date("2026-05-01"), 90)).toBe(false);
  });
  it("classifies under/over billing", () => {
    expect(classifyBilledAmount("100.00", "100.00")).toBe("match");
    expect(classifyBilledAmount("100.00", "80.00")).toBe("under");
    expect(classifyBilledAmount("100.00", "120.00")).toBe("over");
  });
});
