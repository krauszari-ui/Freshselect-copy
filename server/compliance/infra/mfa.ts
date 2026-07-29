/**
 * MFA — vendored TOTP (RFC 6238) so no new runtime dependency is required.
 *
 * This is the "interface + safe default" implementation: a working TOTP verifier
 * plus recovery-code hashing. A WebAuthn adapter can be added behind the same
 * `MfaVerifier` interface later. Secrets are base32; at rest they should be
 * encrypted (documented in the plan — the column exists in `mfaEnrollments`).
 */
import { createHmac, createHash, randomBytes, timingSafeEqual } from "crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Generate a random base32 TOTP secret. */
export function generateTotpSecret(bytes = 20): string {
  return base32Encode(randomBytes(bytes));
}

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (let i = 0; i < buf.length; i++) {
    const byte = buf[i];
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/g, "").toUpperCase().replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** HOTP (RFC 4226). */
export function hotp(secret: string, counter: number, digits = 6): string {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  // Write the 64-bit counter big-endian.
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (code % 10 ** digits).toString().padStart(digits, "0");
}

/** TOTP (RFC 6238). `now` is injectable for deterministic tests. */
export function totp(secret: string, now: number = Date.now(), step = 30, digits = 6): string {
  return hotp(secret, Math.floor(now / 1000 / step), digits);
}

/**
 * Verify a TOTP token allowing a ±`window` step drift (clock skew). Constant-time
 * compare on the candidate codes.
 */
export function verifyTotp(
  secret: string,
  token: string,
  now: number = Date.now(),
  window = 1,
  step = 30,
  digits = 6,
): boolean {
  if (!secret || !/^\d{6,8}$/.test(token)) return false;
  const counter = Math.floor(now / 1000 / step);
  for (let i = -window; i <= window; i++) {
    const candidate = hotp(secret, counter + i, digits);
    if (candidate.length === token.length && timingSafeEqual(Buffer.from(candidate), Buffer.from(token))) {
      return true;
    }
  }
  return false;
}

/** otpauth:// URI for QR enrollment. */
export function totpAuthUri(secret: string, account: string, issuer = "FreshSelect Meals"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: "6", period: "30" });
  return `otpauth://totp/${label}?${params.toString()}`;
}

export interface RecoveryCodeSet {
  /** Plaintext codes — shown to the user ONCE. */
  plaintext: string[];
  /** SHA-256 hashes — the only thing stored. */
  hashes: string[];
}

/** Generate N single-use recovery codes; only the hashes are persisted. */
export function generateRecoveryCodes(count = 10): RecoveryCodeSet {
  const plaintext: string[] = [];
  const hashes: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = `${randomBytes(4).toString("hex")}-${randomBytes(4).toString("hex")}`;
    plaintext.push(code);
    hashes.push(hashRecoveryCode(code));
  }
  return { plaintext, hashes };
}

export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(code.trim().toLowerCase()).digest("hex");
}

/** The provider interface — TOTP today, WebAuthn tomorrow, same shape. */
export interface MfaVerifier {
  verify(secret: string, token: string, now?: number): boolean;
}

export const totpVerifier: MfaVerifier = {
  verify: (secret, token, now) => verifyTotp(secret, token, now),
};
