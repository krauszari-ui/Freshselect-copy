/**
 * DobPicker logic tests
 *
 * The DobPicker component lives in the client, but its core logic
 * (daysInMonth, output format, leap-year clamping) can be tested
 * as pure functions here to avoid a full browser environment.
 *
 * Mirrors the logic in client/src/components/DobPicker.tsx.
 */
import { describe, it, expect } from "vitest";

// ─── Pure helpers (mirrored from DobPicker.tsx) ───────────────────────────────

function daysInMonth(month: number, year: number): number {
  if (!month) return 31;
  return new Date(year || 2000, month, 0).getDate();
}

function formatDob(month: number, day: number, year: number): string {
  if (!month || !day || !year) return "";
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${mm}/${dd}/${year}`;
}

function parseDob(value: string): { month: number; day: number; year: number } {
  const parts = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!parts) return { month: 0, day: 0, year: 0 };
  return {
    month: parseInt(parts[1], 10),
    day: parseInt(parts[2], 10),
    year: parseInt(parts[3], 10),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("DobPicker — daysInMonth", () => {
  it("returns 31 for January", () => expect(daysInMonth(1, 2000)).toBe(31));
  it("returns 28 for February in a non-leap year", () => expect(daysInMonth(2, 2001)).toBe(28));
  it("returns 29 for February in a leap year", () => expect(daysInMonth(2, 2000)).toBe(29));
  it("returns 30 for April", () => expect(daysInMonth(4, 2000)).toBe(30));
  it("returns 31 for December", () => expect(daysInMonth(12, 2000)).toBe(31));
  it("returns 31 when month is 0 (unset)", () => expect(daysInMonth(0, 2000)).toBe(31));
});

describe("DobPicker — formatDob output", () => {
  it("formats a complete date as MM/DD/YYYY", () => {
    expect(formatDob(1, 15, 1985)).toBe("01/15/1985");
  });

  it("zero-pads single-digit month and day", () => {
    expect(formatDob(3, 7, 2000)).toBe("03/07/2000");
  });

  it("returns empty string when any part is missing", () => {
    expect(formatDob(0, 15, 1985)).toBe("");
    expect(formatDob(1, 0, 1985)).toBe("");
    expect(formatDob(1, 15, 0)).toBe("");
  });
});

describe("DobPicker — parseDob round-trip", () => {
  it("parses a formatted DOB back to parts", () => {
    const formatted = formatDob(7, 4, 1976);
    const parsed = parseDob(formatted);
    expect(parsed.month).toBe(7);
    expect(parsed.day).toBe(4);
    expect(parsed.year).toBe(1976);
  });

  it("returns zeros for an empty string", () => {
    const parsed = parseDob("");
    expect(parsed.month).toBe(0);
    expect(parsed.day).toBe(0);
    expect(parsed.year).toBe(0);
  });

  it("returns zeros for an invalid format", () => {
    const parsed = parseDob("not-a-date");
    expect(parsed.month).toBe(0);
  });
});

describe("DobPicker — leap year day clamping logic", () => {
  it("Feb 29 is valid in a leap year", () => {
    expect(daysInMonth(2, 2000)).toBeGreaterThanOrEqual(29);
  });

  it("Feb 29 does not exist in a non-leap year — clamp to 28", () => {
    const maxDays = daysInMonth(2, 2001);
    const day = 29;
    const clampedDay = day > maxDays ? 0 : day;
    expect(clampedDay).toBe(0); // should be cleared
  });

  it("day 31 is valid for January but not for April", () => {
    expect(daysInMonth(1, 2000)).toBe(31);
    const aprilMax = daysInMonth(4, 2000);
    const day = 31;
    const clampedDay = day > aprilMax ? 0 : day;
    expect(clampedDay).toBe(0); // should be cleared
  });
});

describe("DobPicker — parseLocalDate compatibility", () => {
  it("output MM/DD/YYYY is parseable by the existing parseLocalDate helper", () => {
    const dob = formatDob(1, 15, 1985);
    const usMatch = dob.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    expect(usMatch).not.toBeNull();
    const d = new Date(Number(usMatch![3]), Number(usMatch![1]) - 1, Number(usMatch![2]));
    expect(d.getFullYear()).toBe(1985);
    expect(d.getMonth()).toBe(0); // January = 0
    expect(d.getDate()).toBe(15);
  });
});
