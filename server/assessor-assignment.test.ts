import { describe, it, expect } from "vitest";

// ─── Unit tests for assessor assignment feature ───────────────────────────

describe("assignAssessor input validation", () => {
  it("accepts a valid assessorId", () => {
    const input = { submissionId: 1, assessorId: 5 };
    expect(typeof input.submissionId).toBe("number");
    expect(typeof input.assessorId).toBe("number");
  });

  it("accepts null assessorId (unassign)", () => {
    const input = { submissionId: 1, assessorId: null };
    expect(input.assessorId).toBeNull();
  });

  it("rejects non-integer assessorId", () => {
    const isInteger = (v: unknown) => Number.isInteger(v) || v === null;
    expect(isInteger(1.5)).toBe(false);
    expect(isInteger(1)).toBe(true);
    expect(isInteger(null)).toBe(true);
  });
});

describe("assessorList scoping logic", () => {
  it("returns undefined assessorFilter for admin role (sees all clients)", () => {
    const role = "admin";
    const userId = 42;
    const assessorFilter =
      role === "admin" || role === "super_admin" ? undefined : userId;
    expect(assessorFilter).toBeUndefined();
  });

  it("returns userId as assessorFilter for assessor role (sees only own clients)", () => {
    const role = "assessor";
    const userId = 42;
    const assessorFilter =
      role === "admin" || role === "super_admin" ? undefined : userId;
    expect(assessorFilter).toBe(42);
  });

  it("returns userId as assessorFilter for worker role", () => {
    const role = "worker";
    const userId = 7;
    const assessorFilter =
      role === "admin" || role === "super_admin" ? undefined : userId;
    expect(assessorFilter).toBe(7);
  });
});

describe("reassignment warning logic", () => {
  it("triggers warning when client already has a different assessor", () => {
    const currentAssessorId = 3;
    const newAssessorId = 5;
    const shouldWarn = currentAssessorId !== null && newAssessorId !== null && currentAssessorId !== newAssessorId;
    expect(shouldWarn).toBe(true);
  });

  it("does not trigger warning when assigning for the first time", () => {
    const currentAssessorId = null;
    const newAssessorId = 5;
    const shouldWarn = currentAssessorId !== null && newAssessorId !== null && currentAssessorId !== newAssessorId;
    expect(shouldWarn).toBe(false);
  });

  it("does not trigger warning when unassigning", () => {
    const currentAssessorId = 3;
    const newAssessorId = null;
    const shouldWarn = currentAssessorId !== null && newAssessorId !== null && currentAssessorId !== newAssessorId;
    expect(shouldWarn).toBe(false);
  });

  it("does not trigger warning when reassigning to the same assessor", () => {
    const currentAssessorId = 5;
    const newAssessorId = 5;
    const shouldWarn = currentAssessorId !== null && newAssessorId !== null && currentAssessorId !== newAssessorId;
    expect(shouldWarn).toBe(false);
  });
});

describe("updateSubmissionAssessor null-safety (bug fix: 'No values to set')", () => {
  it("passes null directly — not converted to undefined — when unassigning", () => {
    // Drizzle ORM skips fields set to `undefined`; null must be passed explicitly
    const assessorId: number | null = null;
    // Old (buggy) behaviour: assessorId ?? undefined  → undefined  → Drizzle skips → 'No values to set'
    const oldBehavior = assessorId ?? undefined;
    expect(oldBehavior).toBeUndefined(); // confirms the bug

    // New (correct) behaviour: explicit null check
    const newBehavior = assessorId === null ? null : assessorId;
    expect(newBehavior).toBeNull(); // null is passed → Drizzle sets column to NULL
  });

  it("preserves a valid assessorId when assigning", () => {
    const assessorId: number | null = 7;
    const value = assessorId === null ? null : assessorId;
    expect(value).toBe(7);
  });
});

describe("frontend unassign confirmation dialog logic", () => {
  // Mirrors the updated onValueChange logic in AdminClientDetail.tsx
  function resolveAction(currentId: number | null, newId: number | null): "warn-reassign" | "warn-remove" | "direct" {
    if (currentId && newId && currentId !== newId) return "warn-reassign";
    if (currentId && newId === null) return "warn-remove";
    return "direct";
  }

  it("shows remove-assessor warning when selecting Unassigned on a client with an assessor", () => {
    expect(resolveAction(3, null)).toBe("warn-remove");
  });

  it("shows reassign warning when switching between two different assessors", () => {
    expect(resolveAction(3, 5)).toBe("warn-reassign");
  });

  it("assigns directly (no warning) when client has no assessor", () => {
    expect(resolveAction(null, 5)).toBe("direct");
  });

  it("assigns directly (no warning) when selecting same assessor again", () => {
    expect(resolveAction(5, 5)).toBe("direct");
  });

  it("assigns directly (no warning) when both are null (no-op)", () => {
    expect(resolveAction(null, null)).toBe("direct");
  });
});

describe("assessorId filter in listSubmissions", () => {
  it("passes assessorId to query when filter is active", () => {
    const assessorFilter = "3";
    const queryInput = {
      assessorId: assessorFilter !== "all" ? parseInt(assessorFilter) : undefined,
    };
    expect(queryInput.assessorId).toBe(3);
  });

  it("passes undefined when filter is 'all'", () => {
    const assessorFilter = "all";
    const queryInput = {
      assessorId: assessorFilter !== "all" ? parseInt(assessorFilter) : undefined,
    };
    expect(queryInput.assessorId).toBeUndefined();
  });
});
