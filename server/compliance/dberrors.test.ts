/**
 * Regression: duplicate-key detection must see through drizzle's error wrapper.
 * Drizzle raises a DrizzleQueryError whose driver error (ER_DUP_ENTRY / errno
 * 1062) lives on `.cause`, so a top-level `err.code` check silently misses it —
 * which previously broke idempotent inserts (training-ack, job enqueue).
 * (Caught by the live-DB E2E.)
 */
import { describe, it, expect } from "vitest";
import { isDuplicateKeyError } from "./db";

describe("isDuplicateKeyError", () => {
  it("detects a top-level ER_DUP_ENTRY", () => {
    expect(isDuplicateKeyError({ code: "ER_DUP_ENTRY" })).toBe(true);
  });
  it("detects errno 1062", () => {
    expect(isDuplicateKeyError({ errno: 1062 })).toBe(true);
  });
  it("unwraps drizzle's nested cause chain", () => {
    const wrapped = new Error("Failed query: insert into ...");
    (wrapped as unknown as { cause: unknown }).cause = { code: "ER_DUP_ENTRY", errno: 1062 };
    expect(isDuplicateKeyError(wrapped)).toBe(true);
  });
  it("unwraps a doubly-nested cause", () => {
    const inner = { code: "ER_DUP_ENTRY" };
    const mid = { message: "driver", cause: inner };
    const outer = { message: "drizzle", cause: mid };
    expect(isDuplicateKeyError(outer)).toBe(true);
  });
  it("returns false for unrelated errors and nullish input", () => {
    expect(isDuplicateKeyError({ code: "ER_NO_SUCH_TABLE" })).toBe(false);
    expect(isDuplicateKeyError(new Error("boom"))).toBe(false);
    expect(isDuplicateKeyError(null)).toBe(false);
    expect(isDuplicateKeyError(undefined)).toBe(false);
  });
});
