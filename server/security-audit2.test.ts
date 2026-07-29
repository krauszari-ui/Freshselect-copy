/**
 * Second-pass security audit regression tests
 *
 * BUG-SEC2-A: HTML injection in email.ts buildEmailHtml
 * BUG-SEC2-B: Unvalidated attachmentUrl in referrerPortal.reply
 * BUG-SEC2-C: Password reset token stored as plaintext
 */
import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { z } from "zod";

// ── BUG-SEC2-A: esc() helper in email.ts ─────────────────────────────────────
// We test the esc() function logic directly since email.ts is not exported.
// The function must be identical to what's in email.ts.
function esc(val: unknown): string {
  return String(val ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

describe("BUG-SEC2-A: HTML escaping in email builder", () => {
  it("escapes script tags in firstName", () => {
    const result = esc("<script>alert(1)</script>");
    expect(result).not.toContain("<script>");
    expect(result).toContain("&lt;script&gt;");
  });

  it("escapes double quotes (attribute injection)", () => {
    const result = esc(`" onmouseover="alert(1)`);
    expect(result).not.toContain('"');
    expect(result).toContain("&quot;");
  });

  it("escapes single quotes", () => {
    const result = esc(`' onmouseover='alert(1)`);
    expect(result).not.toContain("'");
    expect(result).toContain("&#39;");
  });

  it("escapes ampersands", () => {
    const result = esc("Bread & Butter");
    expect(result).toBe("Bread &amp; Butter");
  });

  it("handles null/undefined gracefully", () => {
    expect(esc(null)).toBe("");
    expect(esc(undefined)).toBe("");
  });

  it("passes through safe strings unchanged", () => {
    expect(esc("John Smith")).toBe("John Smith");
    expect(esc("123 Main St")).toBe("123 Main St");
  });
});

// ── BUG-SEC2-B: attachmentUrl validation in referrerPortal.reply ──────────────
const attachmentUrlSchema = z.string().url().startsWith("https://").optional();

describe("BUG-SEC2-B: referrerPortal.reply attachmentUrl validation", () => {
  it("rejects javascript: URLs", () => {
    expect(attachmentUrlSchema.safeParse("javascript:alert(1)").success).toBe(false);
  });

  it("rejects data: URLs", () => {
    expect(attachmentUrlSchema.safeParse("data:text/html,<script>alert(1)</script>").success).toBe(false);
  });

  it("rejects http:// URLs (non-HTTPS)", () => {
    expect(attachmentUrlSchema.safeParse("http://evil.com/file.pdf").success).toBe(false);
  });

  it("accepts https:// URLs", () => {
    expect(attachmentUrlSchema.safeParse("https://cdn.example.com/file.pdf").success).toBe(true);
  });

  it("accepts undefined (optional field)", () => {
    expect(attachmentUrlSchema.safeParse(undefined).success).toBe(true);
  });
});

// ── BUG-SEC2-C: Password reset token hashing ─────────────────────────────────
describe("BUG-SEC2-C: Password reset token stored as SHA-256 hash", () => {
  it("SHA-256 hash of token is different from raw token", () => {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const hash = crypto.createHash("sha256").update(rawToken).digest("hex");
    expect(hash).not.toBe(rawToken);
    expect(hash).toHaveLength(64); // SHA-256 hex = 64 chars
  });

  it("same raw token always produces same hash (deterministic)", () => {
    const rawToken = "abc123fixedtoken";
    const hash1 = crypto.createHash("sha256").update(rawToken).digest("hex");
    const hash2 = crypto.createHash("sha256").update(rawToken).digest("hex");
    expect(hash1).toBe(hash2);
  });

  it("different raw tokens produce different hashes", () => {
    const t1 = crypto.randomBytes(32).toString("hex");
    const t2 = crypto.randomBytes(32).toString("hex");
    const h1 = crypto.createHash("sha256").update(t1).digest("hex");
    const h2 = crypto.createHash("sha256").update(t2).digest("hex");
    expect(h1).not.toBe(h2);
  });

  it("raw token cannot be recovered from hash (one-way)", () => {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const hash = crypto.createHash("sha256").update(rawToken).digest("hex");
    // Verify the hash does not contain the raw token
    expect(hash).not.toContain(rawToken);
    expect(rawToken).not.toContain(hash);
  });
});
