/**
 * db.execute() Regression Tests
 *
 * These tests guard against the Drizzle mysql2 execute() tuple bug:
 * db.execute(sql`...`) returns [rows, fields] — NOT a plain array.
 *
 * All three functions (getFilterCounts/_getFilterCountsRaw,
 * getAssessmentReport, getDuplicates) previously iterated over the raw
 * tuple, producing empty/garbage results.
 *
 * Test strategy:
 * 1. Integration tests against the real DB — assert correct output shape
 *    and non-empty/non-NaN values. These catch the tuple bug because the
 *    bug produces empty objects or NaN, not valid numbers.
 * 2. Unit test for the tuple extraction logic itself using a minimal
 *    inline implementation, independent of module internals.
 */

import { describe, it, expect, vi } from "vitest";
import * as dbModule from "./db";

// ─── Unit test: tuple extraction logic ───────────────────────────────────────
// This tests the exact pattern used in _getFilterCountsRaw and getAssessmentReport
// to confirm that (result as any)[0] correctly extracts rows from a [rows, fields] tuple.

describe("Drizzle execute() tuple extraction — unit logic", () => {
  it("extracts rows from [rows, fields] tuple correctly", () => {
    const rows = [
      { dim: "referral", category: "stage", cnt: "42" },
      { dim: "Williamsburg", category: "neighborhood", cnt: "18" },
    ];
    const fields = [{ name: "dim" }, { name: "category" }, { name: "cnt" }];

    // Simulate what db.execute() returns
    const drizzleResult: any = [rows, fields];

    // This is the exact extraction pattern used in db.ts
    const extracted = (Array.isArray((drizzleResult as any)[0])
      ? (drizzleResult as any)[0]
      : drizzleResult) as any[];

    expect(extracted).toHaveLength(2);
    expect(extracted[0].dim).toBe("referral");
    expect(extracted[0].category).toBe("stage");
    expect(Number(extracted[0].cnt)).toBe(42);
    expect(extracted[1].dim).toBe("Williamsburg");
  });

  it("does NOT treat fields metadata as a data row", () => {
    const rows = [{ dim: "referral", category: "stage", cnt: "42" }];
    const fields = [{ name: "dim" }, { name: "category" }, { name: "cnt" }];
    const drizzleResult: any = [rows, fields];

    const extracted = (Array.isArray((drizzleResult as any)[0])
      ? (drizzleResult as any)[0]
      : drizzleResult) as any[];

    // Should only have 1 row, not 2 (rows + fields)
    expect(extracted).toHaveLength(1);
    // The extracted item should be a data row, not a fields descriptor
    expect(extracted[0]).toHaveProperty("dim");
    expect(extracted[0]).toHaveProperty("cnt");
    expect(extracted[0]).not.toHaveProperty("name"); // fields have {name: ...}
  });

  it("handles empty rows array without returning fields as rows", () => {
    const rows: any[] = [];
    const fields = [{ name: "dim" }, { name: "category" }, { name: "cnt" }];
    const drizzleResult: any = [rows, fields];

    const extracted = (Array.isArray((drizzleResult as any)[0])
      ? (drizzleResult as any)[0]
      : drizzleResult) as any[];

    expect(extracted).toHaveLength(0);
    expect(extracted).toEqual([]);
  });
});

// ─── Integration: _getFilterCountsRaw against real DB ────────────────────────

describe("_getFilterCountsRaw — integration against real DB", () => {
  it("returns an object with all expected category keys", async () => {
    const result = await dbModule._getFilterCountsRaw();

    expect(result).toHaveProperty("stage");
    expect(result).toHaveProperty("neighborhood");
    expect(result).toHaveProperty("vendor");
    expect(result).toHaveProperty("language");
    expect(result).toHaveProperty("borough");
    expect(result).toHaveProperty("applicantType");
    expect(result).toHaveProperty("zipcode");
  });

  it("returns numeric (not NaN) counts for all entries — catches the tuple bug", async () => {
    const result = await dbModule._getFilterCountsRaw();

    for (const [category, counts] of Object.entries(result)) {
      for (const [key, value] of Object.entries(counts)) {
        expect(typeof value).toBe("number");
        expect(isNaN(value as number)).toBe(false);
        expect(value as number).toBeGreaterThan(0);
        // If the tuple bug were present, value would be NaN or 0
        // because row.cnt would be undefined
        expect(value).not.toBeUndefined();
        void category; void key; // suppress unused warnings
      }
    }
  });

  it("stage counts are positive integers — not undefined/NaN from tuple bug", async () => {
    const result = await dbModule._getFilterCountsRaw();

    // At minimum, the 'referral' stage should have > 0 clients
    const stageValues = Object.values(result.stage);
    expect(stageValues.length).toBeGreaterThan(0);
    for (const v of stageValues) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
  });

  it("does not return undefined keys (fields metadata not treated as rows)", async () => {
    const result = await dbModule._getFilterCountsRaw();

    for (const category of Object.values(result)) {
      expect(Object.keys(category)).not.toContain("undefined");
      expect(Object.keys(category)).not.toContain("null");
    }
  });
});

// ─── Integration: getFilterCounts (cached) ───────────────────────────────────

describe("getFilterCounts — integration against real DB", () => {
  it("returns the same shape as _getFilterCountsRaw", async () => {
    dbModule._resetFilterCountsCache();
    const result = await dbModule.getFilterCounts();

    expect(result).toHaveProperty("stage");
    expect(result).toHaveProperty("vendor");
    expect(result).toHaveProperty("zipcode");

    const stageValues = Object.values(result.stage);
    expect(stageValues.length).toBeGreaterThan(0);
    for (const v of stageValues) {
      expect(typeof v).toBe("number");
      expect(isNaN(v)).toBe(false);
    }
  });

  it("returns cached result on second call (same object reference)", async () => {
    dbModule._resetFilterCountsCache();
    const first  = await dbModule.getFilterCounts();
    const second = await dbModule.getFilterCounts();
    expect(first).toBe(second);
  });
});

// ─── Integration: getAssessmentReport against real DB ────────────────────────

describe("getAssessmentReport — integration against real DB", () => {
  it("returns an object with grandTotal, grandCompleted, grandPending", async () => {
    const result = await dbModule.getAssessmentReport();

    expect(result).toHaveProperty("grandTotal");
    expect(result).toHaveProperty("grandCompleted");
    expect(result).toHaveProperty("grandPending");
    expect(result).toHaveProperty("byStage");
    expect(result).toHaveProperty("byVendor");
    expect(result).toHaveProperty("byNeighborhood");
  });

  it("grandTotal is a positive integer — catches the tuple bug (was 0 or NaN before fix)", async () => {
    const result = await dbModule.getAssessmentReport();

    expect(typeof result.grandTotal).toBe("number");
    expect(isNaN(result.grandTotal)).toBe(false);
    expect(result.grandTotal).toBeGreaterThan(0);
    // Before the fix, grandTotal was 0 because rows were never iterated
  });

  it("grandTotal equals sum of all byStage totals", async () => {
    const result = await dbModule.getAssessmentReport();

    const stageSum = Object.values(result.byStage).reduce((acc, s) => acc + s.total, 0);
    expect(result.grandTotal).toBe(stageSum);
  });

  it("grandCompleted + grandPending equals grandTotal", async () => {
    const result = await dbModule.getAssessmentReport();
    expect(result.grandCompleted + result.grandPending).toBe(result.grandTotal);
  });

  it("byStage entries have valid numeric total/completed/pending", async () => {
    const result = await dbModule.getAssessmentReport();

    for (const [stage, data] of Object.entries(result.byStage)) {
      expect(typeof data.total).toBe("number");
      expect(typeof data.completed).toBe("number");
      expect(typeof data.pending).toBe("number");
      expect(data.total).toBeGreaterThanOrEqual(0);
      expect(data.completed + data.pending).toBe(data.total);
      void stage;
    }
  });
});

// ─── Integration: getDuplicates against real DB ───────────────────────────────

describe("getDuplicates — integration against real DB", () => {
  it("returns an array (not throws) when called", async () => {
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller({
      user: { id: 1, openId: "admin", email: "admin@test.com", name: "Admin", loginMethod: "local", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
      req: { protocol: "https", headers: {} } as any,
      res: { clearCookie: vi.fn() } as any,
    });

    const result = await caller.admin.getDuplicates();
    expect(Array.isArray(result)).toBe(true);
  });

  it("each group has matchKey, matchType, count, and records array", async () => {
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller({
      user: { id: 1, openId: "admin", email: "admin@test.com", name: "Admin", loginMethod: "local", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
      req: { protocol: "https", headers: {} } as any,
      res: { clearCookie: vi.fn() } as any,
    });

    const result = await caller.admin.getDuplicates();

    for (const group of result) {
      expect(group).toHaveProperty("matchKey");
      expect(group).toHaveProperty("matchType");
      expect(group).toHaveProperty("count");
      expect(group).toHaveProperty("records");
      expect(Array.isArray(group.records)).toBe(true);
      expect(group.count).toBeGreaterThanOrEqual(2);
      // count must match records length — catches the tuple bug
      // (before fix, records was populated but count was NaN/0)
      expect(group.records.length).toBe(group.count);
    }
  });
});
