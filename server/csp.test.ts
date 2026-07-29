/**
 * Content Security Policy (CSP) header test
 *
 * Parses vercel.json and validates that:
 * 1. A CSP header is present on the catch-all route.
 * 2. Every required directive is present and contains the correct sources.
 * 3. Dangerous sources ('unsafe-eval', 'unsafe-hashes') are NOT present.
 * 4. The HTTP→HTTPS redirect rule is present and correct.
 *
 * This test is intentionally static — it reads the config file directly so
 * it catches any accidental edits to vercel.json before deployment.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const vercelJsonPath = resolve(__dirname, "../vercel.json");
const vercelConfig = JSON.parse(readFileSync(vercelJsonPath, "utf-8"));

function getCspValue(): string {
  const catchAll = (vercelConfig.headers ?? []).find(
    (h: { source: string }) => h.source === "/(.*)"
  );
  expect(catchAll, "vercel.json must have a /(.*) headers rule").toBeTruthy();
  const cspHeader = catchAll.headers.find(
    (h: { key: string }) => h.key === "Content-Security-Policy"
  );
  expect(cspHeader, "CSP header must be present").toBeTruthy();
  return cspHeader.value as string;
}

function parseDirectives(csp: string): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const part of csp.split(";").map((s) => s.trim()).filter(Boolean)) {
    const [directive, ...values] = part.split(/\s+/);
    result[directive] = values;
  }
  return result;
}

describe("vercel.json CSP header", () => {
  it("has a Content-Security-Policy header on the catch-all route", () => {
    const csp = getCspValue();
    expect(csp).toBeTruthy();
    expect(csp.length).toBeGreaterThan(20);
  });

  it("script-src is restricted to self only (no unsafe-eval)", () => {
    const directives = parseDirectives(getCspValue());
    expect(directives["script-src"]).toContain("'self'");
    expect(directives["script-src"]).not.toContain("'unsafe-eval'");
    expect(directives["script-src"]).not.toContain("'unsafe-hashes'");
  });

  it("style-src allows self, unsafe-inline (Tailwind), and Google Fonts", () => {
    const directives = parseDirectives(getCspValue());
    expect(directives["style-src"]).toContain("'self'");
    expect(directives["style-src"]).toContain("'unsafe-inline'");
    expect(directives["style-src"]).toContain("https://fonts.googleapis.com");
  });

  it("font-src allows Google Fonts CDN", () => {
    const directives = parseDirectives(getCspValue());
    expect(directives["font-src"]).toContain("https://fonts.gstatic.com");
  });

  it("img-src allows self, data:, blob:, and https: (for CDN images)", () => {
    const directives = parseDirectives(getCspValue());
    expect(directives["img-src"]).toContain("'self'");
    expect(directives["img-src"]).toContain("data:");
    expect(directives["img-src"]).toContain("blob:");
    expect(directives["img-src"]).toContain("https:");
  });

  it("connect-src allows self and Manus Forge API (Maps proxy)", () => {
    const directives = parseDirectives(getCspValue());
    expect(directives["connect-src"]).toContain("'self'");
    expect(directives["connect-src"]).toContain("https://forge.manus.ai");
  });

  it("frame-src and object-src are locked to none", () => {
    const directives = parseDirectives(getCspValue());
    expect(directives["frame-src"]).toContain("'none'");
    expect(directives["object-src"]).toContain("'none'");
  });

  it("has HTTP→HTTPS redirect rule in vercel.json", () => {
    const redirects = vercelConfig.redirects ?? [];
    const httpsRedirect = redirects.find(
      (r: { has?: Array<{ type: string; key: string; value: string }> }) =>
        r.has?.some(
          (h) =>
            h.type === "header" &&
            h.key === "x-forwarded-proto" &&
            h.value === "http"
        )
    );
    expect(httpsRedirect, "HTTP→HTTPS redirect rule must exist").toBeTruthy();
    expect(httpsRedirect.permanent).toBe(true);
  });
});
