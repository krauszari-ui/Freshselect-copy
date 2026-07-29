/**
 * Upload hardening — magic-byte validation, sanitization, size messaging.
 * Satisfies "Invalid file signatures" and "Malware quarantine" (default) tests.
 */
import { describe, it, expect } from "vitest";
import { sniffMagic, magicMatchesMime, sanitizeFilename, validateUpload, generateObjectKey } from "./upload";

const PDF = Buffer.from("%PDF-1.7\n...rest...");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);

describe("sniffMagic", () => {
  it("recognizes common types by content", () => {
    expect(sniffMagic(PDF)).toBe("pdf");
    expect(sniffMagic(PNG)).toBe("png");
    expect(sniffMagic(JPEG)).toBe("jpeg");
    expect(sniffMagic(ZIP)).toBe("zip");
  });
});

describe("magicMatchesMime", () => {
  it("accepts matching declared types", () => {
    expect(magicMatchesMime("pdf", "application/pdf")).toBe(true);
    expect(magicMatchesMime("zip", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe(true);
  });
  it("rejects a spoofed content type", () => {
    // A PNG uploaded but declared as PDF must be rejected.
    expect(magicMatchesMime("png", "application/pdf")).toBe(false);
  });
});

describe("sanitizeFilename", () => {
  it("strips path traversal and unsafe characters", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("my file (1).pdf")).toBe("my_file_1_.pdf");
    expect(sanitizeFilename("....hidden")).toBe("hidden");
  });
});

describe("generateObjectKey", () => {
  it("produces a server-side key namespaced by client, never user input", () => {
    const key = generateObjectKey({ submissionId: 42 }, "pdf");
    expect(key).toMatch(/^compliance\/client-42\/[0-9a-f-]{36}\.pdf$/);
  });
});

describe("validateUpload", () => {
  it("accepts a real PDF and quarantines it by default", () => {
    const r = validateUpload({ bytes: PDF, declaredMime: "application/pdf", filename: "scan.pdf", submissionId: 7 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.scanStatus).toBe("quarantined"); // fail-safe: never auto-passed
      expect(r.checksum).toHaveLength(64);
      expect(r.objectKey).toContain("client-7");
    }
  });

  it("rejects content/type mismatch (spoofed extension)", () => {
    const r = validateUpload({ bytes: PNG, declaredMime: "application/pdf", filename: "evil.pdf" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/does not match/i);
  });

  it("rejects disallowed types", () => {
    const r = validateUpload({ bytes: PDF, declaredMime: "application/x-msdownload", filename: "x.exe" });
    expect(r.ok).toBe(false);
  });

  it("gives a clear, correct file-size error message", () => {
    const big = Buffer.alloc(11 * 1024 * 1024, 1);
    const r = validateUpload({ bytes: big, declaredMime: "application/pdf", filename: "big.pdf", maxBytes: 10 * 1024 * 1024 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("File is too large. The maximum allowed size is 10 MB.");
  });

  it("rejects empty files", () => {
    const r = validateUpload({ bytes: Buffer.alloc(0), declaredMime: "application/pdf", filename: "empty.pdf" });
    expect(r.ok).toBe(false);
  });
});
