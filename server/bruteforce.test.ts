/**
 * Brute-force rate limiter test
 *
 * Verifies that the admin login endpoint returns HTTP 429 after 10 failed
 * attempts from the same IP within a 15-minute window.
 *
 * Strategy: spin up a real Express app with the loginLimiter middleware
 * mounted on a test route, then fire 11 requests from the same IP and
 * assert the 11th gets a 429.
 */
import { describe, it, expect, afterAll } from "vitest";
import express from "express";
import { createServer } from "http";
import { loginLimiter } from "./_core/security";

function buildTestApp() {
  const app = express();
  // Trust proxy so express-rate-limit can read X-Forwarded-For
  app.set("trust proxy", 1);

  // Mount the same limiter used on the real admin login route
  app.post("/test-login", loginLimiter, (_req, res) => {
    res.status(200).json({ ok: true });
  });

  return app;
}

async function postLogin(port: number, ip: string): Promise<{ status: number }> {
  const res = await fetch(`http://127.0.0.1:${port}/test-login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Simulate a specific IP via the forwarded header (trust proxy = 1)
      "X-Forwarded-For": ip,
    },
    body: JSON.stringify({ email: "test@example.com", password: "wrong" }),
  });
  return { status: res.status };
}

describe("Login brute-force rate limiter", () => {
  it("allows the first 10 attempts and blocks the 11th from the same IP", async () => {
    const app = buildTestApp();
    const server = createServer(app);

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as { port: number };

    const testIp = "203.0.113.42"; // TEST-NET-3 — safe for unit tests

    try {
      // Attempts 1–10 should all succeed (200)
      for (let i = 1; i <= 10; i++) {
        const { status } = await postLogin(port, testIp);
        expect(status, `Attempt ${i} should be allowed (200)`).toBe(200);
      }

      // Attempt 11 should be blocked (429)
      const { status: blocked } = await postLogin(port, testIp);
      expect(blocked, "11th attempt should be rate-limited (429)").toBe(429);

      // A different IP should still be allowed
      const { status: otherIp } = await postLogin(port, "198.51.100.99");
      expect(otherIp, "Different IP should still be allowed (200)").toBe(200);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
