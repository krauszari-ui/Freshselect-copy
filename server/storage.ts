/**
 * File storage helpers — Cloudflare R2 (primary) with Manus Forge fallback.
 *
 * Cloudflare R2 is S3-compatible, has zero egress fees, and is fully
 * independent of any platform. Configure it by setting:
 *   R2_ACCOUNT_ID     — Cloudflare account ID
 *   R2_ACCESS_KEY_ID  — R2 API token Access Key ID
 *   R2_SECRET_ACCESS_KEY — R2 API token Secret Access Key
 *   R2_BUCKET_NAME    — bucket name (e.g. "freshselect-documents")
 *   R2_PUBLIC_URL     — public bucket URL (e.g. "https://docs.freshselectmeals.com")
 *                       Leave empty if the bucket is private (presigned URLs used)
 *
 * If R2 credentials are not set, falls back to Manus Forge storage
 * (BUILT_IN_FORGE_API_URL + BUILT_IN_FORGE_API_KEY) for local development.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// ─── R2 client ───────────────────────────────────────────────────────────────

function getR2Client(): S3Client | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) return null;

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function getR2BucketName(): string {
  return process.env.R2_BUCKET_NAME ?? "freshselect-documents";
}

function getR2PublicUrl(key: string): string | null {
  const base = process.env.R2_PUBLIC_URL;
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/${key}`;
}

// ─── Manus Forge fallback ────────────────────────────────────────────────────

function getForgeConfig(): { baseUrl: string; apiKey: string } | null {
  const apiUrl =
    process.env.BUILT_IN_FORGE_API_URL ||
    process.env.VITE_FRONTEND_FORGE_API_URL;
  const apiKey =
    process.env.BUILT_IN_FORGE_API_KEY ||
    process.env.VITE_FRONTEND_FORGE_API_KEY;
  if (!apiUrl || !apiKey) return null;
  const baseUrl = apiUrl.endsWith("/") ? apiUrl.slice(0, -1) : apiUrl;
  return { baseUrl, apiKey };
}

async function forgePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType: string
): Promise<{ key: string; url: string }> {
  const forge = getForgeConfig();
  if (!forge) {
    throw new Error(
      "No storage backend configured. Set R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY for Cloudflare R2, " +
        "or BUILT_IN_FORGE_API_URL / BUILT_IN_FORGE_API_KEY for Manus Forge (local dev)."
    );
  }

  const key = relKey.replace(/^\/+/, "");
  const buffer =
    typeof data === "string"
      ? Buffer.from(data)
      : data instanceof Buffer
      ? data
      : Buffer.from(data);

  const form = new FormData();
  form.append("file", new Blob([buffer], { type: contentType }), key.split("/").pop() || "file");
  form.append("path", key);

  const response = await fetch(`${forge.baseUrl}/v1/storage/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${forge.apiKey}` },
    body: form,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`Forge storage upload failed (${response.status}): ${message}`);
  }

  const result = (await response.json()) as { url: string };
  return { key, url: result.url };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Upload a file to storage.
 * Returns { key, url } where url is a public or presigned URL.
 */
export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const r2 = getR2Client();

  // ── R2 path ──────────────────────────────────────────────────────────────
  if (r2) {
    const key = relKey.replace(/^\/+/, "");
    const buffer =
      typeof data === "string"
        ? Buffer.from(data)
        : data instanceof Buffer
        ? data
        : Buffer.from(data);

    await r2.send(
      new PutObjectCommand({
        Bucket: getR2BucketName(),
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    );

    // Always generate a presigned GET URL valid for 7 days.
    // The bucket is private so public R2 URLs return 404.
    const url = await getSignedUrl(
      r2,
      new GetObjectCommand({ Bucket: getR2BucketName(), Key: key }),
      { expiresIn: 7 * 24 * 60 * 60 }
    );
    return { key, url };
  }

  // ── Manus Forge fallback (local dev / Manus deployment) ──────────────────
  return forgePut(relKey, data, contentType);
}

/**
 * Get a fresh pre-signed URL for a stored file.
 * Always generates a presigned URL (valid for 7 days) regardless of R2_PUBLIC_URL,
 * because the R2 bucket is private and direct public URLs return 404.
 */
export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const r2 = getR2Client();
  const key = relKey.replace(/^\/+/, "");

  if (r2) {
    // Always use pre-signed URLs — the bucket is private so public URLs return 404
    const url = await getSignedUrl(
      r2,
      new GetObjectCommand({ Bucket: getR2BucketName(), Key: key }),
      { expiresIn: 7 * 24 * 60 * 60 }
    );
    return { key, url };
  }

  // Forge fallback
  const forge = getForgeConfig();
  if (!forge) throw new Error("No storage backend configured.");
  throw new Error(`storageGet is not supported with Manus Forge backend. Key: ${key}`);
}
