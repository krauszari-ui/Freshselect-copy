import { describe, expect, it } from "vitest";

describe("Resend API Key", () => {
  it("should have a valid Resend API key configured", () => {
    const apiKey = process.env.RESEND_API_KEY;
    expect(apiKey, "RESEND_API_KEY must be set").toBeTruthy();
    expect(apiKey!.startsWith("re_"), "RESEND_API_KEY must start with re_").toBe(true);
    expect(apiKey!.length, "RESEND_API_KEY must be at least 20 chars").toBeGreaterThan(20);
  });
});
