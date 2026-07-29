/**
 * Authorization unit accounting — no over-consumption, no negative balance.
 * Satisfies "Authorization units cannot be overconsumed" and the concurrency
 * "consume the same authorization units" case (modeled at the pure-logic level).
 */
import { describe, it, expect } from "vitest";
import { consumeUnitsPure, isAuthorizationValidForDate } from "./authorizations";

describe("consumeUnitsPure", () => {
  it("consumes when enough units remain", () => {
    const r = consumeUnitsPure(10, 3);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.remaining).toBe(7); expect(r.exhausted).toBe(false); }
  });

  it("marks exhausted when consuming the last units", () => {
    const r = consumeUnitsPure(3, 3);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.remaining).toBe(0); expect(r.exhausted).toBe(true); }
  });

  it("rejects consuming more than remaining (never goes negative)", () => {
    const r = consumeUnitsPure(2, 5);
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.reason).toBe("insufficient_units"); expect(r.remaining).toBe(2); }
  });

  it("rejects zero / negative / non-integer quantities", () => {
    expect(consumeUnitsPure(10, 0).ok).toBe(false);
    expect(consumeUnitsPure(10, -1).ok).toBe(false);
    expect(consumeUnitsPure(10, 1.5).ok).toBe(false);
  });

  it("models serialized concurrent consumers: total consumed never exceeds balance", () => {
    // Two consumers each want 6 units from a balance of 10. Applied under a lock
    // (serialized), the second must fail — total consumed = 6, not 12.
    let remaining = 10;
    const first = consumeUnitsPure(remaining, 6);
    expect(first.ok).toBe(true);
    if (first.ok) remaining = first.remaining;
    const second = consumeUnitsPure(remaining, 6);
    expect(second.ok).toBe(false);
    expect(remaining).toBe(4); // untouched by the failed second consumer
  });
});

describe("isAuthorizationValidForDate", () => {
  const day = (s: string) => new Date(s);
  it("valid inside the window and active", () => {
    expect(isAuthorizationValidForDate({ status: "active", startDate: day("2026-01-01"), endDate: day("2026-12-31") }, day("2026-06-01"))).toBe(true);
  });
  it("invalid before start / after end", () => {
    expect(isAuthorizationValidForDate({ status: "active", startDate: day("2026-06-01"), endDate: day("2026-12-31") }, day("2026-01-01"))).toBe(false);
    expect(isAuthorizationValidForDate({ status: "active", startDate: day("2026-01-01"), endDate: day("2026-05-31") }, day("2026-06-01"))).toBe(false);
  });
  it("invalid when not active", () => {
    expect(isAuthorizationValidForDate({ status: "expired", startDate: null, endDate: null }, day("2026-06-01"))).toBe(false);
  });
});
