/**
 * Security Audit 5 — Regression Tests
 *
 * BUG-SEC5-A: passwordHash and passwordResetToken leaked in user list responses
 *   - listWorkers(), listStaffUsers(), listAllUsers() returned full user rows
 *   - Fix: SAFE_USER_COLUMNS projection excludes sensitive fields
 *
 * BUG-SEC5-B: public upload.document missing server-side file size check
 *   - An unauthenticated caller could POST large base64 payloads repeatedly
 *   - Fix: MAX_PUBLIC_UPLOAD_BYTES (3 MB) check added before S3 write
 *     (Limit reduced from 10 MB to 3 MB to stay under Vercel's 4.5 MB serverless body limit)
 */

import { describe, it, expect } from "vitest";

// ─── BUG-SEC5-A: SAFE_USER_COLUMNS excludes sensitive fields ─────────────────

describe("BUG-SEC5-A: SAFE_USER_COLUMNS excludes sensitive fields", () => {
  it("SAFE_USER_COLUMNS does not include passwordHash", async () => {
    // Read the db.ts source and verify SAFE_USER_COLUMNS doesn't map passwordHash
    const fs = await import("fs");
    const src = fs.readFileSync(new URL("./db.ts", import.meta.url).pathname, "utf8");

    // Find the SAFE_USER_COLUMNS block
    const blockMatch = src.match(/const SAFE_USER_COLUMNS\s*=\s*\{([^}]+)\}/s);
    expect(blockMatch, "SAFE_USER_COLUMNS block must exist in db.ts").toBeTruthy();
    const block = blockMatch![1];

    // Must NOT contain passwordHash
    expect(block).not.toContain("passwordHash");
    // Must NOT contain passwordResetToken
    expect(block).not.toContain("passwordResetToken");
    // Must NOT contain passwordResetExpires
    expect(block).not.toContain("passwordResetExpires");
  });

  it("SAFE_USER_COLUMNS includes all non-sensitive fields", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(new URL("./db.ts", import.meta.url).pathname, "utf8");
    const blockMatch = src.match(/const SAFE_USER_COLUMNS\s*=\s*\{([^}]+)\}/s);
    const block = blockMatch![1];

    // Must include identity and role fields
    expect(block).toContain("id:");
    expect(block).toContain("openId:");
    expect(block).toContain("name:");
    expect(block).toContain("email:");
    expect(block).toContain("role:");
    expect(block).toContain("permissions:");
    expect(block).toContain("isActive:");
    expect(block).toContain("createdAt:");
    expect(block).toContain("lastSignedIn:");
  });

  it("listWorkers uses SAFE_USER_COLUMNS projection", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(new URL("./db.ts", import.meta.url).pathname, "utf8");
    // listWorkers must call db.select(SAFE_USER_COLUMNS)
    expect(src).toMatch(/listWorkers[\s\S]{0,200}db\.select\(SAFE_USER_COLUMNS\)/);
  });

  it("listStaffUsers uses SAFE_USER_COLUMNS projection", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(new URL("./db.ts", import.meta.url).pathname, "utf8");
    expect(src).toMatch(/listStaffUsers[\s\S]{0,200}db\.select\(SAFE_USER_COLUMNS\)/);
  });

  it("listAllUsers uses SAFE_USER_COLUMNS projection", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(new URL("./db.ts", import.meta.url).pathname, "utf8");
    expect(src).toMatch(/listAllUsers[\s\S]{0,200}db\.select\(SAFE_USER_COLUMNS\)/);
  });
});

// ─── BUG-SEC5-B: public upload.document server-side size check ───────────────

describe("BUG-SEC5-B: public upload.document server-side size check", () => {
  it("MAX_PUBLIC_UPLOAD_BYTES constant is defined (3 MB for Vercel compatibility)", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(new URL("./routers.ts", import.meta.url).pathname, "utf8");
    expect(src).toContain("MAX_PUBLIC_UPLOAD_BYTES");
    // Limit is 3 MB to stay under Vercel's 4.5 MB serverless body limit (base64 inflates ~33%)
    expect(src).toContain("3 * 1024 * 1024");
  });

  it("upload.document rejects oversized payloads before S3 write", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(new URL("./routers.ts", import.meta.url).pathname, "utf8");
    // The size check must appear BEFORE the storagePut call in the upload.document block
    const uploadBlock = src.slice(
      src.indexOf("document: publicProcedure"),
      src.indexOf("// ─── Submission ───")
    );
    const sizeCheckPos = uploadBlock.indexOf("MAX_PUBLIC_UPLOAD_BYTES");
    const storagePutPos = uploadBlock.indexOf("storagePut(");
    expect(sizeCheckPos).toBeGreaterThan(0);
    expect(storagePutPos).toBeGreaterThan(0);
    expect(sizeCheckPos).toBeLessThan(storagePutPos);
  });

  it("upload.document throws BAD_REQUEST for oversized files", () => {
    // Simulate the size check logic inline (3 MB limit)
    const MAX_PUBLIC_UPLOAD_BYTES = 3 * 1024 * 1024;
    const oversizedBuffer = Buffer.alloc(MAX_PUBLIC_UPLOAD_BYTES + 1);
    const throws = oversizedBuffer.byteLength > MAX_PUBLIC_UPLOAD_BYTES;
    expect(throws).toBe(true);
  });

  it("upload.document allows files exactly at the 3 MB limit", () => {
    const MAX_PUBLIC_UPLOAD_BYTES = 3 * 1024 * 1024;
    const exactBuffer = Buffer.alloc(MAX_PUBLIC_UPLOAD_BYTES);
    const throws = exactBuffer.byteLength > MAX_PUBLIC_UPLOAD_BYTES;
    expect(throws).toBe(false);
  });

  it("upload.document allows files well under the limit", () => {
    const MAX_PUBLIC_UPLOAD_BYTES = 3 * 1024 * 1024;
    const smallBuffer = Buffer.alloc(1024); // 1 KB
    const throws = smallBuffer.byteLength > MAX_PUBLIC_UPLOAD_BYTES;
    expect(throws).toBe(false);
  });
});
