/** Money arithmetic — integer cents, no floating-point error. */
import { describe, it, expect } from "vitest";
import { toCents, fromCents, multiplyUnits, addMoney, subtractMoney, sumMoney, compareMoney, isNonNegativeMoney } from "./money";

describe("money", () => {
  it("parses and formats decimal strings via integer cents", () => {
    expect(toCents("12.34")).toBe(1234);
    expect(toCents("0")).toBe(0);
    expect(toCents("1200.5")).toBe(120050);
    expect(fromCents(1234)).toBe("12.34");
    expect(fromCents(5)).toBe("0.05");
    expect(fromCents(120050)).toBe("1200.50");
  });

  it("avoids the classic float error (0.1 + 0.2)", () => {
    expect(addMoney("0.10", "0.20")).toBe("0.30");
    // Sanity: naive float would be 0.30000000000000004
    expect(Number(addMoney("0.10", "0.20"))).toBe(0.3);
  });

  it("multiplies units by rate exactly", () => {
    expect(multiplyUnits(30, "12.50")).toBe("375.00");
    expect(multiplyUnits(0, "12.50")).toBe("0.00");
    expect(multiplyUnits(7, "0.99")).toBe("6.93");
  });

  it("adds, subtracts, and sums", () => {
    expect(subtractMoney("100.00", "0.01")).toBe("99.99");
    expect(sumMoney(["1.11", "2.22", "3.33"])).toBe("6.66");
  });

  it("compares and validates sign", () => {
    expect(compareMoney("10.00", "9.99")).toBe(1);
    expect(compareMoney("10.00", "10.00")).toBe(0);
    expect(compareMoney("9.98", "9.99")).toBe(-1);
    expect(isNonNegativeMoney("0.00")).toBe(true);
    expect(isNonNegativeMoney("-1.00")).toBe(false);
  });

  it("rejects malformed money and non-integer cents", () => {
    expect(() => toCents("12.3.4")).toThrow(/INVALID_MONEY/);
    expect(() => toCents("abc")).toThrow(/INVALID_MONEY/);
    expect(() => fromCents(1.5)).toThrow(/NON_INTEGER_CENTS/);
    expect(() => multiplyUnits(-1, "1.00")).toThrow(/INVALID_UNITS/);
  });
});
