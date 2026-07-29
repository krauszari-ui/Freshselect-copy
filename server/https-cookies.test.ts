/**
 * HTTPS-only cookie test
 *
 * Verifies that:
 * 1. When a request arrives with x-forwarded-proto: https (Vercel production),
 *    getSessionCookieOptions returns { secure: true }.
 * 2. When a request arrives over plain HTTP with no forwarded header (local dev),
 *    getSessionCookieOptions returns { secure: false }.
 *
 * This ensures the Secure flag is always active on the deployed Vercel instance
 * and never blocks local development.
 */
import { describe, it, expect } from "vitest";
import { getSessionCookieOptions } from "./_core/cookies";
import type { Request } from "express";

function makeReq(overrides: Partial<{
  protocol: string;
  headers: Record<string, string>;
}>): Request {
  return {
    protocol: overrides.protocol ?? "http",
    headers: overrides.headers ?? {},
    socket: { remoteAddress: "127.0.0.1" },
  } as unknown as Request;
}

describe("HTTPS-only cookie Secure flag", () => {
  it("sets secure: true when x-forwarded-proto is https (Vercel production)", () => {
    const req = makeReq({
      protocol: "http", // Express sees http because Vercel terminates TLS
      headers: { "x-forwarded-proto": "https" },
    });
    const opts = getSessionCookieOptions(req);
    expect(opts.secure).toBe(true);
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe("none");
  });

  it("sets secure: false when request is plain HTTP with no forwarded header (local dev)", () => {
    const req = makeReq({
      protocol: "http",
      headers: {},
    });
    const opts = getSessionCookieOptions(req);
    expect(opts.secure).toBe(false);
  });

  it("sets secure: true when protocol is https directly (no proxy)", () => {
    const req = makeReq({
      protocol: "https",
      headers: {},
    });
    const opts = getSessionCookieOptions(req);
    expect(opts.secure).toBe(true);
  });

  it("handles comma-separated x-forwarded-proto with https first", () => {
    // Some proxies send "https, http" — the first value is the client-facing protocol
    const req = makeReq({
      protocol: "http",
      headers: { "x-forwarded-proto": "https, http" },
    });
    const opts = getSessionCookieOptions(req);
    expect(opts.secure).toBe(true);
  });
});
