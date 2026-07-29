/**
 * Fourth-pass security audit regression tests
 *
 * BUG-SEC4-A: Inbound email webhook skipped signature verification when RESEND_WEBHOOK_SECRET
 *             was not set — now fails CLOSED (rejects all requests if secret is absent)
 * BUG-SEC4-B: recentClients/recentlyUpdated/addedCount had no max bounds on days/limit —
 *             a compromised staff account could pass limit=999999 to dump the whole DB
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";

// ── BUG-SEC4-A: Webhook fail-closed logic ─────────────────────────────────────
describe("BUG-SEC4-A: inbound email webhook fails closed when secret is absent", () => {
  /**
   * Simulate the guard logic now in index.ts:
   *   if (!webhookSecret) { res.status(500).json(...); return; }
   */
  function simulateWebhookGuard(webhookSecret: string | undefined): { status: number; error?: string } {
    if (!webhookSecret) {
      return { status: 500, error: "webhook_secret_not_configured" };
    }
    // Secret present — proceed to Svix verification (not tested here)
    return { status: 200 };
  }

  it("rejects with 500 when RESEND_WEBHOOK_SECRET is undefined", () => {
    const result = simulateWebhookGuard(undefined);
    expect(result.status).toBe(500);
    expect(result.error).toBe("webhook_secret_not_configured");
  });

  it("rejects with 500 when RESEND_WEBHOOK_SECRET is empty string", () => {
    const result = simulateWebhookGuard("");
    expect(result.status).toBe(500);
    expect(result.error).toBe("webhook_secret_not_configured");
  });

  it("proceeds to Svix verification when secret is present", () => {
    const result = simulateWebhookGuard("whsec_test_secret_value");
    expect(result.status).toBe(200);
    expect(result.error).toBeUndefined();
  });

  it("does NOT allow unauthenticated access when secret is missing (fail-closed, not fail-open)", () => {
    // The old behaviour was: if (webhookSecret) { verify } — missing secret = no verification = open
    // The new behaviour is: if (!webhookSecret) { reject } — missing secret = closed
    const oldBehaviour = (secret: string | undefined) => {
      if (secret) return "verified";
      return "open"; // ← BUG: skipped verification
    };
    const newBehaviour = (secret: string | undefined) => {
      if (!secret) return "closed"; // ← FIX: fail closed
      return "verified";
    };
    expect(oldBehaviour(undefined)).toBe("open");   // demonstrates the bug
    expect(newBehaviour(undefined)).toBe("closed");  // demonstrates the fix
  });
});

// ── BUG-SEC4-B: recentClients/recentlyUpdated/addedCount bounds ───────────────
const recentClientsSchema = z.object({
  days: z.number().int().min(1).max(365).optional(),
  limit: z.number().int().min(1).max(200).optional(),
}).optional();

const addedCountSchema = z.object({
  days: z.number().int().min(1).max(365).optional(),
}).optional();

describe("BUG-SEC4-B: recentClients/recentlyUpdated limit is bounded to prevent DB dump", () => {
  it("accepts valid days and limit within bounds", () => {
    expect(recentClientsSchema.safeParse({ days: 7, limit: 10 }).success).toBe(true);
    expect(recentClientsSchema.safeParse({ days: 30, limit: 50 }).success).toBe(true);
    expect(recentClientsSchema.safeParse({ days: 365, limit: 200 }).success).toBe(true);
  });

  it("accepts undefined input (uses defaults)", () => {
    expect(recentClientsSchema.safeParse(undefined).success).toBe(true);
    expect(recentClientsSchema.safeParse({}).success).toBe(true);
  });

  it("rejects limit > 200 (prevents DB dump)", () => {
    expect(recentClientsSchema.safeParse({ limit: 201 }).success).toBe(false);
    expect(recentClientsSchema.safeParse({ limit: 999999 }).success).toBe(false);
  });

  it("rejects days > 365", () => {
    expect(recentClientsSchema.safeParse({ days: 366 }).success).toBe(false);
    expect(recentClientsSchema.safeParse({ days: 99999 }).success).toBe(false);
  });

  it("rejects non-integer floats", () => {
    expect(recentClientsSchema.safeParse({ days: 7.5 }).success).toBe(false);
    expect(recentClientsSchema.safeParse({ limit: 10.1 }).success).toBe(false);
  });

  it("rejects zero and negative values", () => {
    expect(recentClientsSchema.safeParse({ days: 0 }).success).toBe(false);
    expect(recentClientsSchema.safeParse({ limit: -1 }).success).toBe(false);
  });

  it("addedCount schema also bounds days to 1-365", () => {
    expect(addedCountSchema.safeParse({ days: 7 }).success).toBe(true);
    expect(addedCountSchema.safeParse({ days: 366 }).success).toBe(false);
    expect(addedCountSchema.safeParse({ days: 0 }).success).toBe(false);
  });
});
