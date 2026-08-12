/**
 * Audit-package generation — assembles a professional, self-contained PDF for an
 * audit plus a checksummed manifest proving exactly which records were included.
 *
 * The manifest (pure, testable) hashes each included record set and the final
 * PDF bytes with SHA-256, so a recipient can prove the package was not altered.
 * PDF rendering uses pdf-lib (already a dependency).
 */
import { createHash } from "crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { and, eq } from "drizzle-orm";
import { requireDb } from "./db";
import {
  audits, auditScopes, auditPopulations, auditSamples, auditTests, auditFindings,
  managementResponses, correctiveActions, followUpTests, requirementVersions,
} from "../../drizzle/schema";
import { stableStringify } from "./audit";

export interface AuditPackageData {
  audit: typeof audits.$inferSelect;
  scopes: Array<typeof auditScopes.$inferSelect>;
  populations: Array<typeof auditPopulations.$inferSelect>;
  samples: Array<typeof auditSamples.$inferSelect>;
  tests: Array<typeof auditTests.$inferSelect>;
  findings: Array<typeof auditFindings.$inferSelect>;
  managementResponses: Array<typeof managementResponses.$inferSelect>;
  correctiveActions: Array<typeof correctiveActions.$inferSelect>;
  followUpTests: Array<typeof followUpTests.$inferSelect>;
  requirementVersions: Array<typeof requirementVersions.$inferSelect>;
}

export async function gatherAuditPackage(auditId: number): Promise<AuditPackageData> {
  const db = await requireDb();
  const [audit] = await db.select().from(audits).where(eq(audits.id, auditId));
  if (!audit) throw new Error("AUDIT_NOT_FOUND");
  const scopes = await db.select().from(auditScopes).where(eq(auditScopes.auditId, auditId));
  const populations = await db.select().from(auditPopulations).where(eq(auditPopulations.auditId, auditId));
  const samples = await db.select().from(auditSamples).where(eq(auditSamples.auditId, auditId));
  const tests = await db.select().from(auditTests).where(eq(auditTests.auditId, auditId));
  const findings = await db.select().from(auditFindings).where(eq(auditFindings.auditId, auditId));
  const findingIds = findings.map((f) => f.id);
  const mgmt = findingIds.length ? (await db.select().from(managementResponses)).filter((m) => findingIds.includes(m.findingId)) : [];
  const cas = findingIds.length ? (await db.select().from(correctiveActions)).filter((c) => findingIds.includes(c.findingId)) : [];
  const fus = findingIds.length ? (await db.select().from(followUpTests)).filter((f) => findingIds.includes(f.findingId)) : [];
  const reqVersionIds = Array.from(new Set(scopes.map((s) => s.requirementVersionId).filter((x): x is number => x != null)));
  const reqVersions = reqVersionIds.length ? (await db.select().from(requirementVersions)).filter((v) => reqVersionIds.includes(v.id)) : [];
  return { audit, scopes, populations, samples, tests, findings, managementResponses: mgmt, correctiveActions: cas, followUpTests: fus, requirementVersions: reqVersions };
}

// ─── Manifest (pure) ─────────────────────────────────────────────────────────
export interface PackageManifest {
  auditId: number;
  auditTitle: string;
  generatedAt: string;
  counts: Record<string, number>;
  /** SHA-256 over the stable JSON of each included record set. */
  recordChecksums: Record<string, string>;
  /** SHA-256 over the whole record payload (all sets together). */
  contentChecksum: string;
  /** SHA-256 over the rendered PDF bytes (set once the PDF exists). */
  pdfChecksum?: string;
}

function sha256Hex(s: string | Uint8Array): string {
  return createHash("sha256").update(s).digest("hex");
}

/** Build the manifest from the package data (deterministic; pdfChecksum added later). */
export function buildManifest(data: AuditPackageData, generatedAtIso: string): PackageManifest {
  const sets: Record<string, unknown[]> = {
    audit: [data.audit],
    scopes: data.scopes,
    populations: data.populations,
    samples: data.samples,
    tests: data.tests,
    findings: data.findings,
    managementResponses: data.managementResponses,
    correctiveActions: data.correctiveActions,
    followUpTests: data.followUpTests,
    requirementVersions: data.requirementVersions,
  };
  const counts: Record<string, number> = {};
  const recordChecksums: Record<string, string> = {};
  for (const [k, v] of Object.entries(sets)) {
    counts[k] = v.length;
    recordChecksums[k] = sha256Hex(stableStringify(v));
  }
  const contentChecksum = sha256Hex(stableStringify(sets));
  return {
    auditId: data.audit.id,
    auditTitle: data.audit.title,
    generatedAt: generatedAtIso,
    counts,
    recordChecksums,
    contentChecksum,
  };
}

// ─── PDF rendering ───────────────────────────────────────────────────────────
export async function renderAuditPackagePdf(data: AuditPackageData, manifest: PackageManifest): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const A4: [number, number] = [595.28, 841.89];
  const margin = 50;
  const lineH = 14;

  let page = pdf.addPage(A4);
  let y = A4[1] - margin;

  const newPage = () => { page = pdf.addPage(A4); y = A4[1] - margin; };
  const ensure = (need = lineH) => { if (y - need < margin) newPage(); };
  const write = (text: string, opts?: { size?: number; bold?: boolean; color?: [number, number, number] }) => {
    const size = opts?.size ?? 10;
    const f = opts?.bold ? bold : font;
    const c = opts?.color ?? [0.1, 0.1, 0.1];
    // naive wrap at ~95 chars
    const maxChars = Math.floor((A4[0] - 2 * margin) / (size * 0.5));
    const words = String(text).split(/\s+/);
    let line = "";
    const flush = () => { ensure(size + 4); page.drawText(line, { x: margin, y, size, font: f, color: rgb(c[0], c[1], c[2]) }); y -= size + 4; line = ""; };
    for (const w of words) {
      if ((line + " " + w).trim().length > maxChars) flush();
      line = (line ? line + " " : "") + w;
    }
    if (line) flush();
  };
  const heading = (t: string) => { y -= 6; ensure(18); write(t, { size: 13, bold: true, color: [0.09, 0.4, 0.15] }); y -= 2; };
  const kv = (k: string, v: unknown) => write(`${k}: ${v ?? "—"}`);

  // ── Cover page ──
  y -= 120;
  write("Compliance Self-Audit Package", { size: 22, bold: true, color: [0.09, 0.4, 0.15] });
  y -= 10;
  write(data.audit.title, { size: 15, bold: true });
  y -= 6;
  write(`Audit type: ${data.audit.auditType}`, { size: 11 });
  write(`Audit period: ${fmt(data.audit.periodStart)} – ${fmt(data.audit.periodEnd)}`, { size: 11 });
  write(`Generated: ${manifest.generatedAt}`, { size: 11 });
  y -= 20;
  write("This package is generated by the FreshSelect Meals compliance module. It does not constitute a legal determination. Qualified compliance and legal personnel must review its contents.", { size: 9, color: [0.4, 0.4, 0.4] });

  // ── Table of contents ──
  newPage();
  heading("Table of Contents");
  ["1. Scope", "2. Applicable Requirement Versions", "3. Population", "4. Sampling Methodology & Sample List", "5. Test Results", "6. Findings", "7. Management Responses & Corrective Actions", "8. Financial Analysis", "9. Certification", "10. Export Manifest & Checksums"].forEach((t) => write(t));

  // 1. Scope
  heading("1. Scope");
  if (data.scopes.length === 0) write("No explicit scope records.");
  data.scopes.forEach((s) => write(`• ${s.description ?? "(scope)"}${s.requirementVersionId ? ` [req v#${s.requirementVersionId}]` : ""}`));

  // 2. Requirement versions
  heading("2. Applicable Requirement Versions");
  if (data.requirementVersions.length === 0) write("None recorded on scope.");
  data.requirementVersions.forEach((v) => write(`• ${v.title} (v${v.version}) — ${v.sourceOrganization ?? "—"}, effective ${fmt(v.effectiveDate)}`));

  // 3. Population
  heading("3. Population");
  data.populations.forEach((p) => kv(`Population #${p.id}`, `${p.totalCount} records${p.totalAmount ? `, total $${p.totalAmount}` : ""}`));
  if (data.populations.length === 0) write("No population recorded.");

  // 4. Sampling
  heading("4. Sampling Methodology & Sample List");
  data.samples.forEach((s) => {
    write(`Sample #${s.id} — method: ${s.method}, seed: ${s.seed ?? "n/a"}, size: ${s.size}`, { bold: true });
    write(`Selected: ${jsonArr(s.selectedIds)}`);
    write(`Excluded: ${jsonArr(s.excludedIds)}`);
  });
  if (data.samples.length === 0) write("No samples selected.");

  // 5. Test results
  heading("5. Test Results");
  const counts = tally(data.tests.map((t) => t.result));
  write(`Summary: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(", ") || "no tests"}`, { bold: true });
  data.tests.forEach((t) => write(`• item ${t.sampleItemId ?? "—"}: ${t.result}${t.financialExposure ? ` (exposure $${t.financialExposure})` : ""}${t.note ? ` — ${t.note}` : ""}`));

  // 6. Findings
  heading("6. Findings");
  data.findings.forEach((f) => {
    write(`Finding #${f.id} — risk: ${f.risk}, state: ${f.state}${f.repeatFinding ? ", REPEAT" : ""}`, { bold: true });
    if (f.conditionFound) write(`Condition: ${f.conditionFound}`);
    if (f.expectedCondition) write(`Expected: ${f.expectedCondition}`);
    if (f.financialExposure) write(`Exposure: $${f.financialExposure}`);
  });
  if (data.findings.length === 0) write("No findings.");

  // 7. Management responses & corrective actions
  heading("7. Management Responses & Corrective Actions");
  data.managementResponses.forEach((m) => write(`Finding #${m.findingId} response: ${m.response}`));
  data.correctiveActions.forEach((c) => write(`Finding #${c.findingId} CA: ${c.correctiveAction ?? "—"} (completed: ${c.completed ? "yes" : "no"})`));
  data.followUpTests.forEach((f) => write(`Finding #${f.findingId} follow-up: ${f.result}`));

  // 8. Financial analysis
  heading("8. Financial Analysis");
  const totalExposure = data.findings.reduce((acc, f) => acc + Math.round(Number(f.financialExposure ?? 0) * 100), 0);
  kv("Total finding exposure", `$${(totalExposure / 100).toFixed(2)}`);
  kv("Findings count", data.findings.length);
  kv("Error rate (fail / [pass+fail+observation])", errorRateStr(data.tests.map((t) => t.result)));

  // 9. Certification
  heading("9. Certification");
  write("I certify that this audit package was generated from the compliance system of record and reflects the records identified in the manifest. This package does not represent a guarantee of compliance or reimbursement.");
  y -= 10;
  write("Certified by: ____________________________    Date: ______________");

  // 10. Manifest
  heading("10. Export Manifest & Checksums");
  kv("Audit ID", manifest.auditId);
  kv("Generated", manifest.generatedAt);
  kv("Content checksum (SHA-256)", manifest.contentChecksum);
  write("Record set counts & checksums:", { bold: true });
  Object.keys(manifest.counts).forEach((k) => write(`• ${k}: ${manifest.counts[k]} — ${manifest.recordChecksums[k]}`));

  return pdf.save();
}

function fmt(d: Date | null | undefined): string { return d ? new Date(d).toISOString().slice(0, 10) : "—"; }
function jsonArr(v: unknown): string { if (Array.isArray(v)) return v.join(", "); if (typeof v === "string") { try { const p = JSON.parse(v); return Array.isArray(p) ? p.join(", ") : v; } catch { return v; } } return "—"; }
function tally(vals: string[]): Record<string, number> { const o: Record<string, number> = {}; for (const v of vals) o[v] = (o[v] ?? 0) + 1; return o; }
function errorRateStr(results: string[]): string {
  const c = tally(results);
  const denom = (c.pass ?? 0) + (c.fail ?? 0) + (c.observation ?? 0);
  if (denom === 0) return "n/a";
  return `${(((c.fail ?? 0) / denom) * 100).toFixed(1)}%`;
}

export interface GeneratedPackage {
  filename: string;
  pdfBase64: string;
  manifest: PackageManifest;
}

/** Full generation: gather → manifest → PDF → attach pdfChecksum. */
export async function generateAuditPackage(auditId: number): Promise<GeneratedPackage> {
  const data = await gatherAuditPackage(auditId);
  const generatedAtIso = new Date().toISOString();
  const manifest = buildManifest(data, generatedAtIso);
  const pdfBytes = await renderAuditPackagePdf(data, manifest);
  manifest.pdfChecksum = sha256Hex(pdfBytes);
  return {
    filename: `audit-${auditId}-package-${generatedAtIso.slice(0, 10)}.pdf`,
    pdfBase64: Buffer.from(pdfBytes).toString("base64"),
    manifest,
  };
}
