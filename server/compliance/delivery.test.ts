/** Encounter/delivery state machine — lock after invoice, amendment-only edits. */
import { describe, it, expect } from "vitest";
import {
  canTransition, validateTransition, isDirectlyEditable, requiresAmendmentToCorrect,
  transitionRequiresApproval, hasSufficientProofOfDelivery,
} from "./delivery";

describe("state machine transitions", () => {
  it("allows the documented forward path", () => {
    expect(canTransition("draft", "documented")).toBe(true);
    expect(canTransition("documented", "pending_review")).toBe(true);
    expect(canTransition("pending_review", "approved")).toBe(true);
    expect(canTransition("approved", "locked")).toBe(true);
    expect(canTransition("locked", "invoiced")).toBe(true);
    expect(canTransition("invoiced", "paid")).toBe(true);
  });

  it("rejects illegal jumps", () => {
    expect(canTransition("draft", "invoiced")).toBe(false);
    expect(canTransition("draft", "paid")).toBe(false);
    expect(canTransition("paid", "draft")).toBe(false);
    expect(canTransition("voided", "draft")).toBe(false);
  });

  it("once invoiced, the record is not directly editable; corrections need an amendment", () => {
    expect(isDirectlyEditable("invoiced")).toBe(false);
    expect(isDirectlyEditable("paid")).toBe(false);
    expect(requiresAmendmentToCorrect("invoiced")).toBe(true);
    expect(requiresAmendmentToCorrect("paid")).toBe(true);
    // Editable while still in documentation phases.
    expect(isDirectlyEditable("draft")).toBe(true);
    expect(isDirectlyEditable("documented")).toBe(true);
  });

  it("void and lock require an approval record", () => {
    expect(transitionRequiresApproval("approved", "locked")).toBe(true);
    expect(transitionRequiresApproval("locked", "voided")).toBe(true);
    expect(validateTransition("approved", "locked", false)).toMatchObject({ ok: false, reason: "approval_required" });
    expect(validateTransition("approved", "locked", true)).toEqual({ ok: true });
  });

  it("validateTransition rejects no-ops and illegal transitions", () => {
    expect(validateTransition("draft", "draft", false)).toMatchObject({ ok: false, reason: "no_op" });
    expect(validateTransition("draft", "paid", false)).toMatchObject({ ok: false });
  });
});

describe("proof of delivery", () => {
  it("requires the evidence matching the declared method", () => {
    expect(hasSufficientProofOfDelivery({ podMethod: "signature", signaturePresent: true })).toBe(true);
    expect(hasSufficientProofOfDelivery({ podMethod: "signature", signaturePresent: false })).toBe(false);
    expect(hasSufficientProofOfDelivery({ podMethod: "photo", photoPresent: true })).toBe(true);
    expect(hasSufficientProofOfDelivery({ podMethod: "gps", gpsPresent: true })).toBe(true);
    expect(hasSufficientProofOfDelivery({ podMethod: null })).toBe(false);
    expect(hasSufficientProofOfDelivery({})).toBe(false);
  });
});
