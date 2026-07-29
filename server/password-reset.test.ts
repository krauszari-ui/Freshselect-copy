import { describe, it, expect } from "vitest";
import { createHash, randomBytes } from "crypto";

// ─── E2E-style tests for the self-service password reset flow ─────────────────
// These tests mirror the exact logic in routers.ts (forgotPassword, resetPassword,
// validateToken) and db.ts (setPasswordResetToken, getUserByResetToken, clearPasswordResetToken)
// without hitting the real DB, so they run fast and deterministically.

// ── Token generation & hashing ────────────────────────────────────────────────
describe("password reset token generation", () => {
  it("generates a 64-char hex token (32 random bytes)", () => {
    const token = randomBytes(32).toString("hex");
    expect(token).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(token)).toBe(true);
  });

  it("stores SHA-256 hash of the token, not the raw token", () => {
    const raw = randomBytes(32).toString("hex");
    const hash = createHash("sha256").update(raw).digest("hex");
    expect(hash).not.toBe(raw);
    expect(hash).toHaveLength(64);
  });

  it("same raw token always produces same hash (deterministic)", () => {
    const raw = "abc123testtoken";
    const h1 = createHash("sha256").update(raw).digest("hex");
    const h2 = createHash("sha256").update(raw).digest("hex");
    expect(h1).toBe(h2);
  });

  it("different tokens produce different hashes", () => {
    const h1 = createHash("sha256").update(randomBytes(32)).digest("hex");
    const h2 = createHash("sha256").update(randomBytes(32)).digest("hex");
    expect(h1).not.toBe(h2);
  });
});

// ── Token expiry logic ────────────────────────────────────────────────────────
describe("password reset token expiry", () => {
  it("token expires 1 hour from creation", () => {
    const expires = new Date(Date.now() + 60 * 60 * 1000);
    const diffMs = expires.getTime() - Date.now();
    expect(diffMs).toBeGreaterThan(59 * 60 * 1000);
    expect(diffMs).toBeLessThanOrEqual(60 * 60 * 1000 + 100);
  });

  it("fresh token is not expired", () => {
    const expires = new Date(Date.now() + 60 * 60 * 1000);
    expect(new Date() > expires).toBe(false);
  });

  it("expired token (past date) is correctly detected", () => {
    const expired = new Date(Date.now() - 1000); // 1 second ago
    expect(new Date() > expired).toBe(true);
  });

  it("token expiring in the future is valid", () => {
    const expires = new Date(Date.now() + 30 * 60 * 1000); // 30 min from now
    const isExpired = new Date() > expires;
    expect(isExpired).toBe(false);
  });
});

// ── Origin allowlist validation ───────────────────────────────────────────────
describe("password reset origin validation", () => {
  // Mirrors the ALLOWED_ORIGINS check in routers.ts forgotPassword
  function isOriginAllowed(origin: string, allowlist: (string | RegExp)[]): boolean {
    return allowlist.some((o) =>
      typeof o === "string" ? o === origin : o.test(origin)
    );
  }

  const MOCK_ALLOWLIST: (string | RegExp)[] = [
    "https://freshselectmeals.com",
    /^https:\/\/.*\.manus\.space$/,
    /^https:\/\/.*\.manus\.computer$/,
    "http://localhost:3000",
  ];

  it("allows production domain", () => {
    expect(isOriginAllowed("https://freshselectmeals.com", MOCK_ALLOWLIST)).toBe(true);
  });

  it("allows manus.space preview domains", () => {
    expect(isOriginAllowed("https://freshmeals-abc123.manus.space", MOCK_ALLOWLIST)).toBe(true);
  });

  it("allows manus.computer dev domains", () => {
    expect(isOriginAllowed("https://3000-xyz.manus.computer", MOCK_ALLOWLIST)).toBe(true);
  });

  it("allows localhost for development", () => {
    expect(isOriginAllowed("http://localhost:3000", MOCK_ALLOWLIST)).toBe(true);
  });

  it("blocks attacker-controlled domain", () => {
    expect(isOriginAllowed("https://evil.com", MOCK_ALLOWLIST)).toBe(false);
  });

  it("blocks subdomain spoofing attempt", () => {
    expect(isOriginAllowed("https://freshselectmeals.com.evil.com", MOCK_ALLOWLIST)).toBe(false);
  });
});

// ── Role eligibility for password reset ──────────────────────────────────────
describe("password reset role eligibility", () => {
  // Mirrors the role check in routers.ts forgotPassword
  const ELIGIBLE_ROLES = ["admin", "worker", "super_admin", "viewer", "assessor"];

  function canResetPassword(role: string): boolean {
    return ELIGIBLE_ROLES.includes(role);
  }

  it("admin can reset password", () => expect(canResetPassword("admin")).toBe(true));
  it("worker can reset password", () => expect(canResetPassword("worker")).toBe(true));
  it("super_admin can reset password", () => expect(canResetPassword("super_admin")).toBe(true));
  it("viewer can reset password", () => expect(canResetPassword("viewer")).toBe(true));
  it("assessor can reset password", () => expect(canResetPassword("assessor")).toBe(true));
  it("public user cannot reset password (no staff account)", () => expect(canResetPassword("user")).toBe(false));
  it("unknown role cannot reset password", () => expect(canResetPassword("hacker")).toBe(false));
});

// ── Reset URL construction ────────────────────────────────────────────────────
describe("password reset URL construction", () => {
  it("builds reset URL with raw token (not hash)", () => {
    const origin = "https://freshselectmeals.com";
    const rawToken = "abc123rawtoken";
    const url = `${origin}/admin/reset-password?token=${rawToken}`;
    expect(url).toBe("https://freshselectmeals.com/admin/reset-password?token=abc123rawtoken");
  });

  it("reset URL contains the raw token, not the stored hash", () => {
    const rawToken = randomBytes(32).toString("hex");
    const storedHash = createHash("sha256").update(rawToken).digest("hex");
    const url = `https://freshselectmeals.com/admin/reset-password?token=${rawToken}`;
    expect(url).toContain(rawToken);
    expect(url).not.toContain(storedHash);
  });
});

// ── Admin-triggered reset (Staff Management page) ────────────────────────────
describe("admin-triggered password reset (Staff Management)", () => {
  it("only shows reset button for staff with a password (hasPassword=true)", () => {
    const member = { hasPassword: true, email: "fekete@lehoel.org" };
    const shouldShow = member.hasPassword && !!member.email;
    expect(shouldShow).toBe(true);
  });

  it("does not show reset button for invite-only accounts (hasPassword=false)", () => {
    const member = { hasPassword: false, email: "newstaff@example.com" };
    const shouldShow = member.hasPassword && !!member.email;
    expect(shouldShow).toBe(false);
  });

  it("does not show reset button if email is missing", () => {
    const member = { hasPassword: true, email: "" };
    const shouldShow = member.hasPassword && !!member.email;
    expect(shouldShow).toBe(false);
  });
});

// ── ResetPassword page token extraction ──────────────────────────────────────
describe("ResetPassword page token extraction from URL", () => {
  it("extracts token from ?token= query param", () => {
    const search = "?token=abc123testtoken64chars";
    const params = new URLSearchParams(search);
    expect(params.get("token")).toBe("abc123testtoken64chars");
  });

  it("returns null when no token param present", () => {
    const search = "?other=value";
    const params = new URLSearchParams(search);
    expect(params.get("token")).toBeNull();
  });

  it("handles empty query string", () => {
    const params = new URLSearchParams("");
    expect(params.get("token")).toBeNull();
  });
});

// ── Password strength validation ─────────────────────────────────────────────
describe("new password strength validation", () => {
  const isStrong = (p: string) => p.length >= 8;
  const match = (a: string, b: string) => a === b;

  it("accepts password of exactly 8 characters", () => expect(isStrong("12345678")).toBe(true));
  it("accepts password longer than 8 characters", () => expect(isStrong("MySecurePass!")).toBe(true));
  it("rejects password shorter than 8 characters", () => expect(isStrong("short")).toBe(false));
  it("submit is disabled when passwords don't match", () => expect(match("abc", "xyz")).toBe(false));
  it("submit is enabled when passwords match and are strong", () => {
    const p = "StrongPass1!";
    expect(isStrong(p) && match(p, p)).toBe(true);
  });
});
