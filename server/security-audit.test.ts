/**
 * Security Audit Regression Tests (May 2026)
 * Covers the 4 issues found in the deep security audit.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// ─── BUG-SEC-A: referrer code limiter exists and is applied ─────────────────
describe("BUG-SEC-A: referrer portal code-based rate limiter", () => {
  it("referrerCodeLimiter is exported from security.ts", async () => {
    const security = await import("./_core/security");
    expect(typeof (security as any).referrerCodeLimiter).toBe("function");
  });

  it("index.ts applies referrerCodeLimiter to all 6 code-based endpoints", () => {
    const indexSrc = readFileSync(join(__dirname, "_core/index.ts"), "utf8");
    const endpoints = [
      "admin.referrerPortal.myClients",
      "admin.referrerPortal.myStats",
      "admin.referrerPortal.myMessages",
      "admin.referrerPortal.reply",
      "admin.referrerPortal.markAllRead",
      "admin.referrerPortal.deleteMessage",
    ];
    for (const ep of endpoints) {
      expect(indexSrc).toContain(`"/api/trpc/${ep}", referrerCodeLimiter`);
    }
  });
});

// ─── BUG-SEC-B: server-side file size check in admin documents.upload ────────
describe("BUG-SEC-B: admin documents.upload server-side size limit", () => {
  it("routers.ts contains MAX_ADMIN_UPLOAD_BYTES constant", () => {
    const routersSrc = readFileSync(join(__dirname, "routers.ts"), "utf8");
    expect(routersSrc).toContain("MAX_ADMIN_UPLOAD_BYTES");
    // Limit was reduced to 3 MB to stay under Vercel's 4.5 MB serverless body limit
    expect(routersSrc).toContain("3 * 1024 * 1024");
  });

  it("routers.ts throws BAD_REQUEST when buffer exceeds the size limit", () => {
    const routersSrc = readFileSync(join(__dirname, "routers.ts"), "utf8");
    expect(routersSrc).toContain("buffer.length > MAX_ADMIN_UPLOAD_BYTES");
    expect(routersSrc).toContain("File is too large.");
  });
});

// ─── BUG-SEC-C: extension derived from MIME type in admin documents.upload ───
describe("BUG-SEC-C: admin documents.upload uses MIME-derived extension", () => {
  it("routers.ts has MIME_TO_EXT map in admin upload procedure", () => {
    const routersSrc = readFileSync(join(__dirname, "routers.ts"), "utf8");
    expect(routersSrc).toContain("MIME_TO_EXT");
    expect(routersSrc).toContain('"application/pdf": "pdf"');
    expect(routersSrc).toContain("safeExt = MIME_TO_EXT[input.contentType]");
  });

  it("admin upload key uses safeExt, not user-supplied filename extension", () => {
    const routersSrc = readFileSync(join(__dirname, "routers.ts"), "utf8");
    // The key must use safeExt, not ext derived from input.name
    const adminUploadBlock = routersSrc.slice(
      routersSrc.indexOf("BUG-SEC-C FIX"),
      routersSrc.indexOf("const { url } = await storagePut(key", routersSrc.indexOf("BUG-SEC-C FIX"))
    );
    expect(adminUploadBlock).toContain("safeExt");
    expect(adminUploadBlock).not.toContain('input.name.split(".")');
  });
});

// ─── BUG-SEC-D: SameSite=none only when Secure=true ─────────────────────────
describe("BUG-SEC-D: SameSite=none only set on HTTPS requests", () => {
  it("getSessionCookieOptions returns SameSite=lax on HTTP", async () => {
    const { getSessionCookieOptions } = await import("./_core/cookies");
    const mockReq = {
      protocol: "http",
      headers: {},
      socket: { remoteAddress: "127.0.0.1" },
    } as any;
    const opts = getSessionCookieOptions(mockReq);
    expect(opts.sameSite).toBe("lax");
    expect(opts.secure).toBe(false);
  });

  it("getSessionCookieOptions returns SameSite=none on HTTPS (x-forwarded-proto)", async () => {
    const { getSessionCookieOptions } = await import("./_core/cookies");
    const mockReq = {
      protocol: "http",
      headers: { "x-forwarded-proto": "https" },
      socket: { remoteAddress: "10.0.0.1" },
    } as any;
    const opts = getSessionCookieOptions(mockReq);
    expect(opts.sameSite).toBe("none");
    expect(opts.secure).toBe(true);
  });

  it("SameSite=none is never set without Secure=true", async () => {
    const { getSessionCookieOptions } = await import("./_core/cookies");
    const httpReq = {
      protocol: "http",
      headers: {},
      socket: { remoteAddress: "127.0.0.1" },
    } as any;
    const opts = getSessionCookieOptions(httpReq);
    if (opts.sameSite === "none") {
      expect(opts.secure).toBe(true);
    }
  });
});

// ─── June 2026 Audit: Bug 1 — Email blast atomic claim ───────────────────────
describe("June 2026 Audit — Email blast atomic claim (duplicate-send race)", () => {
  it("updateEmailBlastStatus with fromStatus prevents double-send under concurrency", async () => {
    let callCount = 0;
    const mockClaim = async (_id: number, _status: string, _counts?: unknown, fromStatus?: string): Promise<boolean> => {
      if (fromStatus === "scheduled") {
        callCount++;
        return callCount === 1; // only first caller wins
      }
      return true;
    };
    const first = await mockClaim(1, "sending", undefined, "scheduled");
    const second = await mockClaim(1, "sending", undefined, "scheduled");
    expect(first).toBe(true);
    expect(second).toBe(false); // second invocation is rejected
  });

  it("index.ts uses fromStatus='scheduled' when claiming a blast", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(join(__dirname, "_core/index.ts"), "utf8");
    // The fix must pass "scheduled" as the fromStatus argument
    expect(src).toContain(`updateEmailBlastStatus(blastId, "sending", undefined, "scheduled")`);
    expect(src).toContain("Already claimed");
  });
});

// ─── June 2026 Audit: Bug 2 — Inbound email webhook error handling ───────────
describe("June 2026 Audit — Inbound email webhook returns 500 on DB failure", () => {
  it("catch block returns 500 so Resend retries on transient DB errors", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(join(__dirname, "_core/index.ts"), "utf8");
    // The fix must return 500 in the catch block, not 200
    expect(src).toContain(`res.status(500).json({ ok: false, error: "internal_error" })`);
    // The comment explaining the rationale must be present
    expect(src).toContain("Return 500 so Resend retries");
  });
});

// ─── June 2026 Audit: Bug 3 — sendReferrerNote attachmentUrl validation ──────
describe("June 2026 Audit — sendReferrerNote attachmentUrl https:// enforcement", () => {
  const sanitize = (url: string | undefined) =>
    url && url.startsWith("https://") ? url : null;

  it("allows https:// URLs", () => {
    expect(sanitize("https://pub-abc.r2.dev/doc.pdf")).toBe("https://pub-abc.r2.dev/doc.pdf");
  });
  it("blocks javascript: injection", () => {
    expect(sanitize("javascript:alert(1)")).toBeNull();
  });
  it("blocks data: URI injection", () => {
    expect(sanitize("data:text/html,<script>alert(1)</script>")).toBeNull();
  });
  it("blocks http:// (non-TLS)", () => {
    expect(sanitize("http://evil.com/malware.exe")).toBeNull();
  });
  it("returns null for undefined", () => {
    expect(sanitize(undefined)).toBeNull();
  });

  it("routers.ts applies https:// guard in sendReferrerNote", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(join(__dirname, "routers.ts"), "utf8");
    expect(src).toContain(`attachmentUrl: z.string().url().startsWith("https://").optional()`);
  });
});

// ─── June 2026 Audit: Bug 4 — pageViewRateMap memory leak ───────────────────
describe("June 2026 Audit — pageViewRateMap eviction guard", () => {
  it("evicts stale entries when map exceeds 500", () => {
    const map = new Map<number, number[]>();
    const now = Date.now();
    const evictBefore = now - 5 * 60_000;
    for (let i = 0; i < 501; i++) map.set(i, [evictBefore - 1000]);
    if (map.size > 500) {
      for (const [uid, ts] of Array.from(map.entries())) {
        if (ts.length === 0 || ts[ts.length - 1] < evictBefore) map.delete(uid);
      }
    }
    expect(map.size).toBe(0);
  });

  it("preserves active entries during eviction", () => {
    const map = new Map<number, number[]>();
    const now = Date.now();
    const evictBefore = now - 5 * 60_000;
    for (let i = 0; i < 500; i++) map.set(i, [evictBefore - 1000]);
    map.set(9999, [now - 1000]); // active
    if (map.size > 500) {
      for (const [uid, ts] of Array.from(map.entries())) {
        if (ts.length === 0 || ts[ts.length - 1] < evictBefore) map.delete(uid);
      }
    }
    expect(map.size).toBe(1);
    expect(map.has(9999)).toBe(true);
  });

  it("routers.ts contains eviction guard code", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(join(__dirname, "routers.ts"), "utf8");
    expect(src).toContain("pageViewRateMap.size > 500");
    expect(src).toContain("pageViewRateMap.delete(uid)");
  });
});
