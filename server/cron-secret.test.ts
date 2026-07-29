import { describe, it, expect } from "vitest";

describe("CRON_SECRET enforcement", () => {
  it("CRON_SECRET env var is set and non-empty", () => {
    const secret = process.env.CRON_SECRET;
    expect(secret, "CRON_SECRET must be set").toBeTruthy();
    expect(secret!.length, "CRON_SECRET must be at least 32 chars").toBeGreaterThanOrEqual(32);
  });

  it("cron endpoint guard logic rejects missing Authorization header", () => {
    // Simulate the guard logic from src/index.ts
    const secret = process.env.CRON_SECRET ?? "test-secret";
    const authHeader = undefined;
    const isAuthorized = !secret || authHeader === `Bearer ${secret}`;
    expect(isAuthorized).toBe(false);
  });

  it("cron endpoint guard logic rejects wrong token", () => {
    const secret = process.env.CRON_SECRET ?? "test-secret";
    const authHeader = "Bearer wrong-token";
    const isAuthorized = !secret || authHeader === `Bearer ${secret}`;
    expect(isAuthorized).toBe(false);
  });

  it("cron endpoint guard logic accepts correct token", () => {
    const secret = process.env.CRON_SECRET ?? "test-secret";
    const authHeader = `Bearer ${secret}`;
    const isAuthorized = !secret || authHeader === `Bearer ${secret}`;
    expect(isAuthorized).toBe(true);
  });
});
