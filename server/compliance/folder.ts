/**
 * Per-client "audit folder" — a single, unified view of EVERY document a client
 * has, gathered from the three places files actually live in this app:
 *
 *   1. the legacy `documents` table (admin uploads, consent PDFs, …),
 *   2. files embedded in the submission's `formData` JSON (uploaded at intake),
 *   3. the compliance `complianceDocuments` store (evidence uploaded going forward).
 *
 * The result is normalized to one shape so the UI can list, view, and download
 * them from one place, and so the downloadable audit-folder package (Phase C4)
 * can index them. Read-only and additive — it never moves or rewrites files.
 */
import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { documents, complianceDocuments } from "../../drizzle/schema";
import { getDocumentsBySubmission, getSubmissionById } from "../db";
import { requireDb } from "./db";

export type FolderSource = "admin_upload" | "application" | "compliance";

export interface FolderDocument {
  /** Stable, source-qualified id (e.g. "legacy-12", "app-medicaidCard", "compliance-3"). */
  id: string;
  source: FolderSource;
  name: string;
  category: string | null;
  mimeType: string | null;
  /** Storage object key — the preferred handle for minting a fresh signed URL. */
  fileKey: string | null;
  /** Fallback URL when only a URL was recorded (legacy embedded files). */
  url: string | null;
  checksum: string | null;
  confidentiality: string | null;
  uploadedAt: Date | null;
}

/** Humanize a formData document key ("medicaidCard" / "medicaid_card" → "Medicaid Card"). */
function humanizeKey(key: string): string {
  const spaced = key.replace(/[_-]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return spaced.replace(/\b\w/g, (c) => c.toUpperCase()).trim() || key;
}

/** Pull the {url,key}/URL-string map of files embedded in a submission's formData. */
function embeddedFilesFromFormData(formData: unknown): FolderDocument[] {
  let fd: Record<string, unknown> = {};
  if (formData && typeof formData === "object") fd = formData as Record<string, unknown>;
  else if (typeof formData === "string") { try { const p = JSON.parse(formData); if (p && typeof p === "object") fd = p; } catch { /* ignore */ } }

  const map = (fd.uploadedDocuments ?? fd.documents) as unknown;
  if (!map || typeof map !== "object") return [];
  const out: FolderDocument[] = [];
  for (const [docKey, docVal] of Object.entries(map as Record<string, unknown>)) {
    if (docVal == null || docVal === "") continue;
    // New format: { url, key }; old format: a bare URL string.
    let fileKey: string | null = null;
    let url: string | null = null;
    if (typeof docVal === "object" && docVal !== null) {
      const o = docVal as Record<string, unknown>;
      fileKey = typeof o.key === "string" ? o.key : null;
      url = typeof o.url === "string" ? o.url : null;
    } else if (typeof docVal === "string") {
      url = docVal;
    }
    if (!fileKey && !url) continue;
    out.push({
      id: `app-${docKey}`, source: "application", name: humanizeKey(docKey),
      category: "application", mimeType: null, fileKey, url, checksum: null,
      confidentiality: null, uploadedAt: null,
    });
  }
  return out;
}

/**
 * Gather every document for a client, newest-first-ish. `includePrivileged`
 * controls whether attorney-client / work-product compliance docs are returned
 * (the caller passes this after checking PRIVILEGED_VIEW).
 */
export async function gatherClientDocuments(submissionId: number, opts: { includePrivileged?: boolean } = {}): Promise<FolderDocument[]> {
  const db = await requireDb();

  // (1) Legacy admin/consent documents.
  const legacy = await getDocumentsBySubmission(submissionId);
  const legacyDocs: FolderDocument[] = legacy.map((d) => ({
    id: `legacy-${d.id}`, source: "admin_upload", name: d.name, category: d.category,
    mimeType: d.mimeType ?? null, fileKey: d.fileKey, url: d.url, checksum: null,
    confidentiality: null, uploadedAt: d.createdAt ?? null,
  }));

  // (2) Files embedded in the submission's formData (intake uploads).
  const submission = await getSubmissionById(submissionId);
  const embedded = submission ? embeddedFilesFromFormData(submission.formData) : [];

  // (3) Compliance evidence store (active, scan-cleared, privilege-filtered).
  const compRows = await db.select().from(complianceDocuments).where(and(
    eq(complianceDocuments.submissionId, submissionId),
    eq(complianceDocuments.recordStatus, "active"),
    ne(complianceDocuments.scanStatus, "quarantined"),
    ne(complianceDocuments.scanStatus, "failed"),
    isNull(complianceDocuments.deletedAt),
  )).orderBy(desc(complianceDocuments.createdAt));
  const compDocs: FolderDocument[] = compRows
    .filter((d) => opts.includePrivileged || d.confidentiality !== "attorney_client_privileged")
    .map((d) => ({
      id: `compliance-${d.id}`, source: "compliance", name: d.originalFilename,
      category: d.category ?? null, mimeType: d.mimeType ?? null, fileKey: d.objectKey,
      url: null, checksum: d.checksum ?? null, confidentiality: d.confidentiality,
      uploadedAt: d.createdAt ?? null,
    }));

  return [...legacyDocs, ...compDocs, ...embedded];
}

export interface ClientFolderSummary {
  submissionId: number;
  clientName: string;
  referenceNumber: string | null;
  documents: FolderDocument[];
  counts: { total: number; admin_upload: number; application: number; compliance: number };
}

/** Folder summary (header + documents) for the UI and the downloadable package. */
export async function getClientFolder(submissionId: number, opts: { includePrivileged?: boolean } = {}): Promise<ClientFolderSummary> {
  const submission = await getSubmissionById(submissionId);
  const docs = await gatherClientDocuments(submissionId, opts);
  const counts = {
    total: docs.length,
    admin_upload: docs.filter((d) => d.source === "admin_upload").length,
    application: docs.filter((d) => d.source === "application").length,
    compliance: docs.filter((d) => d.source === "compliance").length,
  };
  const clientName = submission ? `${submission.firstName ?? ""} ${submission.lastName ?? ""}`.trim() || `Client #${submissionId}` : `Client #${submissionId}`;
  return { submissionId, clientName, referenceNumber: submission?.referenceNumber ?? null, documents: docs, counts };
}
