/**
 * Reports — pure helpers (CSV serialization + the report registry metadata).
 *
 * The actual queries live in reportQueries.ts; this file has the parts that are
 * driver-independent and unit-testable. Report output is a simple
 * { columns, rows } shape so the same result feeds the UI table, a CSV download,
 * and (later) XLSX/PDF exporters.
 */
export interface ReportResult {
  columns: string[];
  rows: Array<Record<string, unknown>>;
  generatedAt: string;
}

/** Escape a single CSV field per RFC 4180 (quote if it contains ," \n or \r). */
export function csvField(value: unknown): string {
  if (value == null) return "";
  const s = value instanceof Date ? value.toISOString() : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Serialize a report result to CSV text (header row + data rows). */
export function toCsv(result: Pick<ReportResult, "columns" | "rows">): string {
  const header = result.columns.map(csvField).join(",");
  const lines = result.rows.map((r) => result.columns.map((c) => csvField(r[c])).join(","));
  return [header, ...lines].join("\r\n");
}

export interface ReportDefinition {
  key: string;
  title: string;
  description: string;
  /** Permission key required to run/export this report. */
  permission: string;
}

/**
 * The report catalog. Keys map to query functions in reportQueries.ts. Grouped
 * so the UI can present them; permissions gate access on the server.
 */
export const REPORT_DEFINITIONS: ReportDefinition[] = [
  { key: "client_readiness", title: "Client Readiness", description: "Every client's derived compliance-readiness status.", permission: "readiness:view" },
  { key: "missing_requirements", title: "Missing Requirements", description: "Unmet blocking requirement assignments by client.", permission: "requirement:view" },
  { key: "expiring_eligibility", title: "Expiring Eligibility", description: "Verified eligibility ending within 30 days.", permission: "eligibility:view" },
  { key: "expiring_authorizations", title: "Expiring Authorizations", description: "Active authorizations ending within 30 days.", permission: "authorization:view" },
  { key: "authorization_utilization", title: "Authorization Utilization", description: "Authorized vs. remaining units per authorization.", permission: "authorization:view" },
  { key: "unpaid_invoices", title: "Unpaid Invoices", description: "Invoices not yet paid in full.", permission: "billing:view" },
  { key: "late_invoices", title: "Late Invoices", description: "Unpaid invoices past their timeliness deadline.", permission: "billing:view" },
  { key: "denials", title: "Denials", description: "Denied invoices with codes and reasons.", permission: "billing:view" },
  { key: "recoupments", title: "Recoupments", description: "Recorded recoupments.", permission: "billing:view" },
  { key: "open_findings", title: "Open Findings", description: "Audit findings not yet closed.", permission: "audit:view" },
  { key: "overdue_corrective_actions", title: "Overdue Corrective Actions", description: "Corrective actions past due and incomplete.", permission: "audit:view" },
  { key: "repeat_findings", title: "Repeat Findings", description: "Findings flagged as repeat.", permission: "audit:view" },
  { key: "financial_exposure", title: "Financial Exposure", description: "Total finding exposure per audit.", permission: "audit:view" },
  { key: "credential_expiration", title: "Credential Expiration", description: "RDN/CDN approvals whose credential expires within 30 days.", permission: "nutrition:view" },
  { key: "requirement_changes", title: "Requirement Changes", description: "Recently created/updated requirement versions.", permission: "requirement:view" },
  { key: "guidance_changes", title: "Guidance Changes", description: "Recently added guidance documents.", permission: "guidance:view" },
  { key: "manual_overrides", title: "Manual Overrides", description: "Approved requirement exceptions (gate overrides).", permission: "exception:approve" },
  { key: "document_downloads", title: "Document Downloads", description: "Restricted document access/reveal log.", permission: "audit:view" },
];

export const REPORT_KEYS = REPORT_DEFINITIONS.map((r) => r.key);
export type ReportKey = (typeof REPORT_KEYS)[number];

export function reportDefinition(key: string): ReportDefinition | undefined {
  return REPORT_DEFINITIONS.find((r) => r.key === key);
}
