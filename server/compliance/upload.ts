/**
 * Hardened upload validation for compliance documents.
 *
 * Fixes several pre-existing weaknesses:
 *  - Content type was trusted from the client-declared MIME only → we sniff the
 *    file's MAGIC BYTES and reject mismatches.
 *  - Object keys were derived from user input → we generate server-side keys.
 *  - No checksum / size guard message → we compute a SHA-256 and validate size
 *    with a clear message.
 *  - Files were implicitly trusted → uploads are quarantined until scanned.
 */
import { createHash, randomUUID } from "crypto";
import type { ScanStatus } from "@shared/compliance/constants";

/** Allowed document types and their canonical extension. */
const ALLOWED = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/plain": "txt",
} as const;
export type AllowedMime = keyof typeof ALLOWED;

export const DEFAULT_MAX_BYTES = 25 * 1024 * 1024; // 25 MB

/**
 * Detect a file's type from its leading bytes. Returns a coarse family:
 * "pdf" | "png" | "jpeg" | "gif" | "webp" | "zip" (docx/xlsx are zip) | "text" | null.
 */
export function sniffMagic(bytes: Buffer): string | null {
  if (bytes.length < 4) return bytes.length > 0 ? "text" : null;
  const hex = bytes.subarray(0, 12);
  // %PDF
  if (hex[0] === 0x25 && hex[1] === 0x50 && hex[2] === 0x44 && hex[3] === 0x46) return "pdf";
  // PNG \x89PNG
  if (hex[0] === 0x89 && hex[1] === 0x50 && hex[2] === 0x4e && hex[3] === 0x47) return "png";
  // JPEG FF D8 FF
  if (hex[0] === 0xff && hex[1] === 0xd8 && hex[2] === 0xff) return "jpeg";
  // GIF87a / GIF89a
  if (hex[0] === 0x47 && hex[1] === 0x49 && hex[2] === 0x46 && hex[3] === 0x38) return "gif";
  // RIFF....WEBP
  if (hex[0] === 0x52 && hex[1] === 0x49 && hex[2] === 0x46 && hex[3] === 0x46 && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  // ZIP (PK\x03\x04) — covers docx/xlsx (OOXML)
  if (hex[0] === 0x50 && hex[1] === 0x4b && (hex[2] === 0x03 || hex[2] === 0x05 || hex[2] === 0x07)) return "zip";
  // OLE2 (legacy .doc): D0 CF 11 E0
  if (hex[0] === 0xd0 && hex[1] === 0xcf && hex[2] === 0x11 && hex[3] === 0xe0) return "ole2";
  // Heuristic: printable ASCII/UTF-8 → treat as text
  if (isProbablyText(bytes)) return "text";
  return null;
}

function isProbablyText(bytes: Buffer): boolean {
  const sample = bytes.subarray(0, Math.min(bytes.length, 512));
  for (let i = 0; i < sample.length; i++) {
    const b = sample[i];
    if (b === 0) return false; // NUL byte → binary
    if (b < 0x09) return false;
  }
  return true;
}

/** Does the sniffed magic family agree with the declared MIME type? */
export function magicMatchesMime(magic: string | null, declaredMime: string): boolean {
  if (!magic) return false;
  switch (declaredMime) {
    case "application/pdf": return magic === "pdf";
    case "image/png": return magic === "png";
    case "image/jpeg": return magic === "jpeg";
    case "image/gif": return magic === "gif";
    case "image/webp": return magic === "webp";
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return magic === "zip";
    case "application/msword": return magic === "ole2" || magic === "zip";
    case "text/plain": return magic === "text";
    default: return false;
  }
}

/** Strip any path components and unsafe characters from a client filename. */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, "_").replace(/_{2,}/g, "_").slice(0, 200);
  return cleaned.replace(/^\.+/, "") || "file";
}

export function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Server-generated storage key — never derived from user input. */
export function generateObjectKey(scope: { submissionId?: number | null; draftKey?: string | null }, ext: string): string {
  const bucketPart = scope.submissionId != null ? `client-${scope.submissionId}` : `draft-${(scope.draftKey ?? "unknown").replace(/[^A-Za-z0-9_-]/g, "")}`;
  const safeExt = ext.replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
  return `compliance/${bucketPart}/${randomUUID()}.${safeExt}`;
}

export interface UploadValidationInput {
  bytes: Buffer;
  declaredMime: string;
  filename: string;
  maxBytes?: number;
  submissionId?: number | null;
  draftKey?: string | null;
}

export type UploadValidation =
  | {
      ok: true;
      detectedMagic: string;
      objectKey: string;
      safeFilename: string;
      checksum: string;
      size: number;
      /** Uploads are ALWAYS quarantined on arrival — scanner clears them later. */
      scanStatus: ScanStatus;
    }
  | { ok: false; reason: string };

/** Full server-side validation gate for an incoming upload. */
export function validateUpload(input: UploadValidationInput): UploadValidation {
  const maxBytes = input.maxBytes ?? DEFAULT_MAX_BYTES;
  const size = input.bytes.length;

  if (size === 0) return { ok: false, reason: "The uploaded file is empty." };
  if (size > maxBytes) {
    const mb = (maxBytes / (1024 * 1024)).toFixed(0);
    return { ok: false, reason: `File is too large. The maximum allowed size is ${mb} MB.` };
  }
  if (!(input.declaredMime in ALLOWED)) {
    return { ok: false, reason: `File type "${input.declaredMime}" is not permitted.` };
  }
  const magic = sniffMagic(input.bytes);
  if (!magicMatchesMime(magic, input.declaredMime)) {
    return { ok: false, reason: "The file content does not match its declared type and was rejected." };
  }
  const ext = ALLOWED[input.declaredMime as AllowedMime];
  return {
    ok: true,
    detectedMagic: magic as string,
    objectKey: generateObjectKey({ submissionId: input.submissionId, draftKey: input.draftKey }, ext),
    safeFilename: sanitizeFilename(input.filename),
    checksum: sha256(input.bytes),
    size,
    scanStatus: "quarantined",
  };
}
