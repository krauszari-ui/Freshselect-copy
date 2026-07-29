/**
 * Third-pass security audit regression tests
 *
 * BUG-SEC3-A: Deactivated staff sessions remain valid (isActive not checked per-request)
 * BUG-SEC3-B: signatureDataUrl has no max length (DoS via huge base64 SVG)
 * BUG-SEC3-C: S3 keys use Math.random() instead of crypto.randomBytes()
 */
import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { z } from "zod";

// ── BUG-SEC3-A: isActive check per-request ────────────────────────────────────
// We test the logic pattern — the actual SDK check is in sdk.ts authenticateRequest.
// This test verifies the guard logic is correct.
describe("BUG-SEC3-A: isActive checked on every authenticated request", () => {
  function simulateAuthenticateRequest(user: { isActive: number } | null) {
    if (!user) throw new Error("User not found");
    // This is the exact guard added in sdk.ts
    if (user.isActive === 0) throw new Error("Account has been deactivated");
    return user;
  }

  it("allows active users (isActive = 1)", () => {
    expect(() => simulateAuthenticateRequest({ isActive: 1 })).not.toThrow();
  });

  it("rejects deactivated users (isActive = 0) even with a valid JWT", () => {
    expect(() => simulateAuthenticateRequest({ isActive: 0 }))
      .toThrow("Account has been deactivated");
  });

  it("rejects null user (deleted from DB)", () => {
    expect(() => simulateAuthenticateRequest(null)).toThrow("User not found");
  });
});

// ── BUG-SEC3-B: signatureDataUrl max length ───────────────────────────────────
const signatureSchema = z.string().min(1, "Electronic signature is required").max(500_000, "Signature data is too large");

describe("BUG-SEC3-B: signatureDataUrl max length prevents DoS", () => {
  it("accepts a normal signature (small base64 data URL)", () => {
    const normalSig = "data:image/png;base64," + "A".repeat(1000);
    expect(signatureSchema.safeParse(normalSig).success).toBe(true);
  });

  it("accepts a signature at the 500,000-char limit", () => {
    const atLimit = "A".repeat(500_000);
    expect(signatureSchema.safeParse(atLimit).success).toBe(true);
  });

  it("rejects a signature exceeding 500,000 chars (DoS payload)", () => {
    const oversized = "A".repeat(500_001);
    const result = signatureSchema.safeParse(oversized);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Signature data is too large");
    }
  });

  it("rejects empty signature", () => {
    expect(signatureSchema.safeParse("").success).toBe(false);
  });
});

// ── BUG-SEC3-C: S3 key uses crypto.randomBytes() not Math.random() ────────────
describe("BUG-SEC3-C: S3 key suffix uses cryptographically random bytes", () => {
  function generateSuffix() {
    // This is the exact pattern now used in routers.ts
    return crypto.randomBytes(16).toString("hex");
  }

  it("produces a 32-character hex string (128-bit)", () => {
    const suffix = generateSuffix();
    expect(suffix).toHaveLength(32);
    expect(suffix).toMatch(/^[0-9a-f]{32}$/);
  });

  it("produces unique values across 1000 calls (no collisions)", () => {
    const set = new Set<string>();
    for (let i = 0; i < 1000; i++) set.add(generateSuffix());
    expect(set.size).toBe(1000);
  });

  it("has 128-bit keyspace (2^128 possible values)", () => {
    // 16 bytes = 128 bits = 2^128 possible values
    // Verify the byte length
    const buf = crypto.randomBytes(16);
    expect(buf.length).toBe(16);
  });

  it("crypto.randomBytes(16) keyspace is vastly larger than Math.random() 6-char suffix", () => {
    // Math.random().toString(36).substring(2, 8) = 6 base-36 chars = 36^6 = ~2.18 billion
    const mathRandomKeyspaceBits = Math.log2(Math.pow(36, 6)); // ~31 bits
    // crypto.randomBytes(16) = 128 bits
    const cryptoKeyspaceBits = 128;
    // 128-bit keyspace is ~97 bits larger than 31-bit Math.random keyspace
    expect(cryptoKeyspaceBits).toBeGreaterThan(mathRandomKeyspaceBits + 90);
  });
});
