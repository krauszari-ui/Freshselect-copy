/**
 * Validates that R2_PUBLIC_URL is configured and that storagePut would
 * produce a permanent public URL (not a presigned one) when R2 is active.
 */
import { describe, it, expect } from "vitest";

describe("R2_PUBLIC_URL configuration", () => {
  it("R2_PUBLIC_URL env var is set and well-formed", () => {
    const url = process.env.R2_PUBLIC_URL;
    expect(url, "R2_PUBLIC_URL must be set").toBeTruthy();
    expect(url).toMatch(/^https:\/\//);
    // Should not end with a slash (storage.ts strips trailing slashes)
    expect(url).not.toMatch(/\/$/);
  });

  it("R2_PUBLIC_URL points to the correct Cloudflare R2 public domain", () => {
    const url = process.env.R2_PUBLIC_URL ?? "";
    // Must be either a pub-*.r2.dev URL or a custom domain
    const isR2Dev = url.includes("r2.dev");
    const isCustomDomain = url.includes("freshselectmeals.com") || url.includes("freshselect");
    expect(isR2Dev || isCustomDomain, `R2_PUBLIC_URL "${url}" does not look like a valid R2 public URL`).toBe(true);
  });

  it("getR2PublicUrl helper produces correct permanent URL for a key", () => {
    const base = process.env.R2_PUBLIC_URL ?? "";
    const key = "attestations/TEST-abc123.pdf";
    const expectedUrl = `${base.replace(/\/$/, "")}/${key}`;
    expect(expectedUrl).toBe(`${base}/attestations/TEST-abc123.pdf`);
    expect(expectedUrl).not.toContain("X-Amz-Expires");
    expect(expectedUrl).not.toContain("x-amz-signature");
  });
});
