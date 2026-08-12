/**
 * formData normalization + reconciliation.
 *
 * Legacy submissions carry key identity fields in BOTH structured columns and an
 * untyped `formData` JSON blob. This module derives one canonical projection per
 * submission (the `submissionNormalized` table) so compliance queries don't parse
 * JSON per row, and flags any field where the structured column DISAGREES with
 * what `formData` says — the signal the reconciliation report surfaces.
 *
 * The extractor is a PURE function (unit-tested); the backfill is additive and
 * idempotent (upsert keyed by submissionId, `sourceHash` skips unchanged rows).
 * The submissions table is the source of truth and is never modified.
 */
import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { submissions, submissionNormalized } from "../../drizzle/schema";
import { normalizeCin } from "@shared/compliance/constants";
import { requireDb } from "./db";

/** The canonical fields we project + reconcile. */
export interface NormalizedFields {
  medicaidIdNormalized: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phoneNormalized: string | null;
  zipcode: string | null;
  mismatchFlags: string[];
  sourceHash: string;
}

export interface NormalizationInput {
  medicaidId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  cellPhone?: string | null;
  zipcode?: string | null;
  formData?: unknown;
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}
function normText(v: string | null): string { return (v ?? "").trim().toLowerCase().replace(/\s+/g, " "); }
function normPhone(v: string | null): string { return (v ?? "").replace(/\D/g, ""); }
function normEmail(v: string | null): string { return (v ?? "").trim().toLowerCase(); }
function normZip(v: string | null): string { return (v ?? "").replace(/\D/g, "").slice(0, 5); }

/** Read the first present alias key from a formData object. */
function pick(fd: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    if (fd[k] != null && String(fd[k]).trim() !== "") return str(fd[k]);
  }
  return null;
}

function asObject(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  if (typeof v === "string") { try { const p = JSON.parse(v); return p && typeof p === "object" ? p : {}; } catch { return {}; } }
  return {};
}

/**
 * Derive canonical fields + mismatch flags. Canonical value prefers the
 * structured column and falls back to formData; a flag is raised only when BOTH
 * sources are present and their normalized forms differ.
 */
export function extractNormalizedFields(input: NormalizationInput): NormalizedFields {
  const fd = asObject(input.formData);

  const colMed = str(input.medicaidId);
  const fdMed = pick(fd, ["medicaidId", "medicaid_id", "cin", "CIN"]);
  const colFirst = str(input.firstName);
  const fdFirst = pick(fd, ["firstName", "first_name", "fname"]);
  const colLast = str(input.lastName);
  const fdLast = pick(fd, ["lastName", "last_name", "lname"]);
  const colEmail = str(input.email);
  const fdEmail = pick(fd, ["email", "emailAddress", "email_address"]);
  const colPhone = str(input.cellPhone);
  const fdPhone = pick(fd, ["cellPhone", "cell_phone", "phone", "phoneNumber", "mobile"]);
  const colZip = str(input.zipcode);
  const fdZip = pick(fd, ["zipcode", "zip", "zipCode", "postalCode"]);

  const mismatchFlags: string[] = [];
  const flagIf = (field: string, col: string | null, fdv: string | null, norm: (s: string | null) => string) => {
    if (col != null && fdv != null && norm(col) !== norm(fdv)) mismatchFlags.push(field);
  };
  flagIf("medicaidId", colMed, fdMed, (s) => normalizeCin(s));
  flagIf("firstName", colFirst, fdFirst, normText);
  flagIf("lastName", colLast, fdLast, normText);
  flagIf("email", colEmail, fdEmail, normEmail);
  flagIf("phone", colPhone, fdPhone, normPhone);
  flagIf("zipcode", colZip, fdZip, normZip);

  const medRaw = colMed ?? fdMed;
  const fields = {
    medicaidIdNormalized: medRaw ? normalizeCin(medRaw) || null : null,
    firstName: colFirst ?? fdFirst,
    lastName: colLast ?? fdLast,
    email: (colEmail ?? fdEmail) ? normEmail(colEmail ?? fdEmail) : null,
    phoneNormalized: (colPhone ?? fdPhone) ? normPhone(colPhone ?? fdPhone) || null : null,
    zipcode: (colZip ?? fdZip) ? normZip(colZip ?? fdZip) || null : null,
    mismatchFlags,
  };
  const sourceHash = createHash("sha256").update(JSON.stringify({ ...fields, mismatchFlags: [...mismatchFlags].sort() })).digest("hex");
  return { ...fields, sourceHash };
}

export interface BackfillResult { scanned: number; upserted: number; skipped: number; mismatches: number }

/**
 * Backfill / rebuild the normalized projection for a batch of submissions.
 * Idempotent: a row whose sourceHash is unchanged is skipped. Never throws on a
 * single bad row — it is counted and skipped.
 */
export async function backfillNormalization(opts: { limit?: number; afterId?: number } = {}): Promise<BackfillResult & { lastId: number | null }> {
  const db = await requireDb();
  const limit = Math.min(Math.max(opts.limit ?? 500, 1), 5000);
  const rows = await db.select({
    id: submissions.id, medicaidId: submissions.medicaidId, firstName: submissions.firstName,
    lastName: submissions.lastName, email: submissions.email, cellPhone: submissions.cellPhone,
    zipcode: submissions.zipcode, formData: submissions.formData,
  }).from(submissions).orderBy(submissions.id).limit(limit);

  let scanned = 0, upserted = 0, skipped = 0, mismatches = 0, lastId: number | null = null;
  for (const row of rows) {
    scanned++;
    lastId = row.id;
    try {
      const n = extractNormalizedFields(row);
      if (n.mismatchFlags.length) mismatches++;
      const [existing] = await db.select({ id: submissionNormalized.id, sourceHash: submissionNormalized.sourceHash })
        .from(submissionNormalized).where(eq(submissionNormalized.submissionId, row.id));
      if (existing && existing.sourceHash === n.sourceHash) { skipped++; continue; }
      const values = {
        medicaidIdNormalized: n.medicaidIdNormalized, firstName: n.firstName, lastName: n.lastName,
        email: n.email, phoneNormalized: n.phoneNormalized, zipcode: n.zipcode,
        mismatchFlags: n.mismatchFlags as unknown as null, sourceHash: n.sourceHash, reconciledAt: new Date(),
      };
      if (existing) {
        await db.update(submissionNormalized).set(values).where(eq(submissionNormalized.id, existing.id));
      } else {
        await db.insert(submissionNormalized).values({ submissionId: row.id, ...values });
      }
      upserted++;
    } catch (err) {
      console.warn(`[Normalize] skipped submission ${row.id}:`, String(err));
      skipped++;
    }
  }
  return { scanned, upserted, skipped, mismatches, lastId };
}

/** Stats for the normalization projection (coverage + mismatch count). */
export async function normalizationStats(): Promise<{ normalized: number; totalSubmissions: number; withMismatches: number }> {
  const db = await requireDb();
  const [subCount] = await db.select({ n: sql<number>`count(*)` }).from(submissions);
  const [normCount] = await db.select({ n: sql<number>`count(*)` }).from(submissionNormalized);
  const flagged = await db.select({ flags: submissionNormalized.mismatchFlags }).from(submissionNormalized);
  const withMismatches = flagged.filter((r) => parseFlags(r.flags).length > 0).length;
  return { normalized: Number(normCount?.n ?? 0), totalSubmissions: Number(subCount?.n ?? 0), withMismatches };
}

/** MariaDB returns JSON as string; MySQL parsed. Normalize to an array. */
function parseFlags(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[];
  if (typeof v === "string") { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
  return [];
}

/** Rows where a structured column disagrees with formData — the reconciliation list. */
export async function listReconciliationMismatches(limit = 500): Promise<Array<{ submissionId: number; mismatchFlags: string[]; reconciledAt: Date }>> {
  const db = await requireDb();
  const rows = await db.select({ submissionId: submissionNormalized.submissionId, flags: submissionNormalized.mismatchFlags, reconciledAt: submissionNormalized.reconciledAt })
    .from(submissionNormalized).limit(Math.min(limit, 2000));
  return rows.map((r) => ({ submissionId: r.submissionId, mismatchFlags: parseFlags(r.flags), reconciledAt: r.reconciledAt }))
    .filter((r) => r.mismatchFlags.length > 0);
}
