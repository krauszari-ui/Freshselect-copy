import { describe, it, expect } from "vitest";
import { isoWeekStart, isoWeekLabel, weekOfIso } from "@shared/compliance/week";

describe("ISO week helpers", () => {
  it("returns the Monday of the week for any day", () => {
    // 2026-08-12 is a Wednesday → Monday is 2026-08-10.
    expect(weekOfIso(new Date("2026-08-12T15:00:00Z"))).toBe("2026-08-10");
    // A Monday maps to itself.
    expect(weekOfIso(new Date("2026-08-10T00:00:00Z"))).toBe("2026-08-10");
    // A Sunday maps back to the previous Monday.
    expect(weekOfIso(new Date("2026-08-16T23:59:59Z"))).toBe("2026-08-10");
  });

  it("is idempotent (weekOf of a weekOf is itself)", () => {
    const w = isoWeekStart(new Date("2026-08-12T15:00:00Z"));
    expect(isoWeekStart(w).getTime()).toBe(w.getTime());
    expect(w.getUTCHours()).toBe(0);
    expect(w.getUTCDay()).toBe(1); // Monday
  });

  it("produces stable ISO week labels", () => {
    expect(isoWeekLabel(new Date("2026-01-01T12:00:00Z"))).toBe("2026-W01");
    expect(isoWeekLabel(new Date("2026-08-12T12:00:00Z"))).toBe("2026-W33");
  });
});
