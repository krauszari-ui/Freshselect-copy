/**
 * Infra: MFA/TOTP, job-queue backoff, rate-store, malware scanner default.
 */
import { describe, it, expect } from "vitest";
import { generateTotpSecret, totp, verifyTotp, base32Encode, base32Decode, generateRecoveryCodes, hashRecoveryCode } from "./infra/mfa";
import { backoffDelayMs } from "./infra/jobQueue";
import { MemoryRateStore, isOverLimit } from "./infra/rateStore";
import { QuarantineScanner, getMalwareScanner } from "./infra/malwareScanner";

describe("TOTP (RFC 6238)", () => {
  it("round-trips base32", () => {
    const buf = Buffer.from("hello world", "utf8");
    expect(base32Decode(base32Encode(buf)).toString("utf8")).toBe("hello world");
  });

  it("a freshly generated token verifies at the same instant", () => {
    const secret = generateTotpSecret();
    const now = 1_760_000_000_000;
    const token = totp(secret, now);
    expect(verifyTotp(secret, token, now)).toBe(true);
  });

  it("rejects a wrong token", () => {
    const secret = generateTotpSecret();
    const now = 1_760_000_000_000;
    const token = totp(secret, now);
    const wrong = token === "000000" ? "111111" : "000000";
    expect(verifyTotp(secret, wrong, now)).toBe(false);
  });

  it("rejects a token from far outside the drift window", () => {
    const secret = generateTotpSecret();
    const now = 1_760_000_000_000;
    const token = totp(secret, now);
    expect(verifyTotp(secret, token, now + 5 * 60 * 1000)).toBe(false); // 5 min later
  });

  it("recovery codes: only hashes are stored, and they match", () => {
    const { plaintext, hashes } = generateRecoveryCodes(5);
    expect(plaintext).toHaveLength(5);
    expect(hashes).toHaveLength(5);
    expect(hashRecoveryCode(plaintext[0])).toBe(hashes[0]);
    expect(hashes[0]).not.toBe(plaintext[0]);
  });
});

describe("job-queue backoff", () => {
  it("grows exponentially and caps", () => {
    expect(backoffDelayMs(1)).toBe(2000);
    expect(backoffDelayMs(2)).toBe(4000);
    expect(backoffDelayMs(3)).toBe(8000);
    expect(backoffDelayMs(50)).toBe(3_600_000); // capped
  });
});

describe("rate store", () => {
  it("counts within a window and detects over-limit", async () => {
    const store = new MemoryRateStore();
    let count = 0;
    for (let i = 0; i < 6; i++) count = await store.increment("ip:1.2.3.4", 60_000);
    expect(count).toBe(6);
    expect(isOverLimit(count, 5)).toBe(true);
    expect(isOverLimit(4, 5)).toBe(false);
  });
});

describe("malware scanner default is fail-safe", () => {
  it("never auto-passes without a configured backend", async () => {
    const scanner = getMalwareScanner();
    expect(scanner).toBeInstanceOf(QuarantineScanner);
    const result = await scanner.scan({ bytes: Buffer.from("x"), filename: "x.pdf" });
    expect(result.status).toBe("quarantined");
    expect(result.status).not.toBe("passed");
  });
});
