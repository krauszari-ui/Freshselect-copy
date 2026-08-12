/**
 * Report queries against the live compliance tables. Each returns a
 * { columns, rows } ReportResult. Kept read-only; the router gates each by
 * permission and audits exports.
 */
import { and, desc, eq, gte, lte, ne, sql } from "drizzle-orm";
import { requireDb } from "./db";
import type { ReportResult } from "./reports";
import {
  submissions, complianceReadiness, requirementAssignments, requirementVersions,
  eligibilityVerifications, serviceAuthorizations, invoiceHeaders, denials, recoupments,
  auditFindings, correctiveActions, clinicalApprovals, guidanceDocuments, requirementExceptions,
  documentAccessLog, audits,
} from "../../drizzle/schema";

function result(columns: string[], rows: Array<Record<string, unknown>>): ReportResult {
  return { columns, rows, generatedAt: new Date().toISOString() };
}
function clientName(s: { firstName?: string | null; lastName?: string | null } | null | undefined): string {
  if (!s) return "";
  return [s.firstName, s.lastName].filter(Boolean).join(" ");
}
function inDays(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

type Runner = () => Promise<ReportResult>;

export async function runReport(key: string): Promise<ReportResult> {
  const db = await requireDb();
  const runners: Record<string, Runner> = {
    client_readiness: async () => {
      const rows = await db.select({ id: complianceReadiness.submissionId, status: complianceReadiness.status, computedAt: complianceReadiness.computedAt, firstName: submissions.firstName, lastName: submissions.lastName })
        .from(complianceReadiness).leftJoin(submissions, eq(complianceReadiness.submissionId, submissions.id)).orderBy(desc(complianceReadiness.updatedAt));
      return result(["clientId", "client", "status", "computedAt"], rows.map((r) => ({ clientId: r.id, client: clientName(r), status: r.status, computedAt: r.computedAt })));
    },
    missing_requirements: async () => {
      const rows = await db.select({ submissionId: requirementAssignments.submissionId, status: requirementAssignments.status, dueDate: requirementAssignments.dueDate, title: requirementVersions.title, firstName: submissions.firstName, lastName: submissions.lastName })
        .from(requirementAssignments)
        .leftJoin(requirementVersions, eq(requirementAssignments.requirementVersionId, requirementVersions.id))
        .leftJoin(submissions, eq(requirementAssignments.submissionId, submissions.id))
        .where(and(eq(requirementAssignments.blocking, true), eq(requirementAssignments.recordStatus, "active"), ne(requirementAssignments.status, "satisfied"), ne(requirementAssignments.status, "waived"), ne(requirementAssignments.status, "not_applicable")));
      return result(["clientId", "client", "requirement", "status", "dueDate"], rows.map((r) => ({ clientId: r.submissionId, client: clientName(r), requirement: r.title, status: r.status, dueDate: r.dueDate })));
    },
    expiring_eligibility: async () => {
      const rows = await db.select({ submissionId: eligibilityVerifications.submissionId, mco: eligibilityVerifications.mco, effectiveEndDate: eligibilityVerifications.effectiveEndDate, firstName: submissions.firstName, lastName: submissions.lastName })
        .from(eligibilityVerifications).leftJoin(submissions, eq(eligibilityVerifications.submissionId, submissions.id))
        .where(and(eq(eligibilityVerifications.status, "verified"), lte(eligibilityVerifications.effectiveEndDate, inDays(30))));
      return result(["clientId", "client", "mco", "effectiveEndDate"], rows.map((r) => ({ clientId: r.submissionId, client: clientName(r), mco: r.mco, effectiveEndDate: r.effectiveEndDate })));
    },
    expiring_authorizations: async () => {
      const rows = await db.select({ submissionId: serviceAuthorizations.submissionId, authorizationNumber: serviceAuthorizations.authorizationNumber, endDate: serviceAuthorizations.endDate, remainingUnits: serviceAuthorizations.remainingUnits, firstName: submissions.firstName, lastName: submissions.lastName })
        .from(serviceAuthorizations).leftJoin(submissions, eq(serviceAuthorizations.submissionId, submissions.id))
        .where(and(eq(serviceAuthorizations.status, "active"), lte(serviceAuthorizations.endDate, inDays(30))));
      return result(["clientId", "client", "authorizationNumber", "endDate", "remainingUnits"], rows.map((r) => ({ clientId: r.submissionId, client: clientName(r), authorizationNumber: r.authorizationNumber, endDate: r.endDate, remainingUnits: r.remainingUnits })));
    },
    authorization_utilization: async () => {
      const rows = await db.select().from(serviceAuthorizations).orderBy(desc(serviceAuthorizations.createdAt));
      return result(["clientId", "authorizationNumber", "authorizedUnits", "remainingUnits", "consumedUnits", "utilizationPct"], rows.map((r) => {
        const consumed = r.authorizedUnits - r.remainingUnits;
        const pct = r.authorizedUnits > 0 ? Math.round((consumed / r.authorizedUnits) * 100) : 0;
        return { clientId: r.submissionId, authorizationNumber: r.authorizationNumber, authorizedUnits: r.authorizedUnits, remainingUnits: r.remainingUnits, consumedUnits: consumed, utilizationPct: pct };
      }));
    },
    unpaid_invoices: async () => {
      const rows = await db.select().from(invoiceHeaders).where(ne(invoiceHeaders.status, "paid")).orderBy(desc(invoiceHeaders.createdAt));
      return result(["clientId", "invoiceNumber", "status", "expectedTotal", "paidTotal", "reconciliationStatus"], rows.map((r) => ({ clientId: r.submissionId, invoiceNumber: r.invoiceNumber, status: r.status, expectedTotal: r.expectedTotal, paidTotal: r.paidTotal, reconciliationStatus: r.reconciliationStatus })));
    },
    late_invoices: async () => {
      const rows = await db.select().from(invoiceHeaders).where(and(ne(invoiceHeaders.status, "paid"), lte(invoiceHeaders.timelinessDeadline, new Date())));
      return result(["clientId", "invoiceNumber", "status", "timelinessDeadline", "expectedTotal"], rows.map((r) => ({ clientId: r.submissionId, invoiceNumber: r.invoiceNumber, status: r.status, timelinessDeadline: r.timelinessDeadline, expectedTotal: r.expectedTotal })));
    },
    denials: async () => {
      const rows = await db.select().from(denials).orderBy(desc(denials.createdAt));
      return result(["invoiceId", "denialCode", "denialReason", "appealStatus", "createdAt"], rows.map((r) => ({ invoiceId: r.invoiceId, denialCode: r.denialCode, denialReason: r.denialReason, appealStatus: r.appealStatus, createdAt: r.createdAt })));
    },
    recoupments: async () => {
      const rows = await db.select().from(recoupments).orderBy(desc(recoupments.createdAt));
      return result(["invoiceId", "amount", "reason", "recoupedAt"], rows.map((r) => ({ invoiceId: r.invoiceId, amount: r.amount, reason: r.reason, recoupedAt: r.recoupedAt })));
    },
    open_findings: async () => {
      const rows = await db.select().from(auditFindings).where(and(ne(auditFindings.state, "closed"), eq(auditFindings.recordStatus, "active"))).orderBy(desc(auditFindings.createdAt));
      return result(["findingId", "auditId", "risk", "state", "repeat", "financialExposure"], rows.map((r) => ({ findingId: r.id, auditId: r.auditId, risk: r.risk, state: r.state, repeat: r.repeatFinding, financialExposure: r.financialExposure })));
    },
    overdue_corrective_actions: async () => {
      const rows = await db.select().from(correctiveActions).where(and(eq(correctiveActions.completed, false), lte(correctiveActions.dueDate, new Date())));
      return result(["findingId", "correctiveActionId", "dueDate", "completed"], rows.map((r) => ({ findingId: r.findingId, correctiveActionId: r.id, dueDate: r.dueDate, completed: r.completed })));
    },
    repeat_findings: async () => {
      const rows = await db.select().from(auditFindings).where(eq(auditFindings.repeatFinding, true));
      return result(["findingId", "auditId", "risk", "state"], rows.map((r) => ({ findingId: r.id, auditId: r.auditId, risk: r.risk, state: r.state })));
    },
    financial_exposure: async () => {
      const rows = await db.select({ auditId: auditFindings.auditId, title: audits.title, exposure: sql<string>`COALESCE(SUM(${auditFindings.financialExposure}), 0)`, count: sql<number>`COUNT(*)` })
        .from(auditFindings).leftJoin(audits, eq(auditFindings.auditId, audits.id)).groupBy(auditFindings.auditId, audits.title);
      return result(["auditId", "audit", "findings", "totalExposure"], rows.map((r) => ({ auditId: r.auditId, audit: r.title, findings: Number(r.count), totalExposure: r.exposure })));
    },
    credential_expiration: async () => {
      const rows = await db.select().from(clinicalApprovals).where(lte(clinicalApprovals.credentialValidUntil, inDays(30)));
      return result(["clientId", "credentialType", "credentialNumber", "credentialValidUntil"], rows.map((r) => ({ clientId: r.submissionId, credentialType: r.credentialType, credentialNumber: r.credentialNumber, credentialValidUntil: r.credentialValidUntil })));
    },
    requirement_changes: async () => {
      const rows = await db.select().from(requirementVersions).orderBy(desc(requirementVersions.createdAt)).limit(200);
      return result(["versionId", "title", "version", "approvalStatus", "createdAt"], rows.map((r) => ({ versionId: r.id, title: r.title, version: r.version, approvalStatus: r.approvalStatus, createdAt: r.createdAt })));
    },
    guidance_changes: async () => {
      const rows = await db.select().from(guidanceDocuments).orderBy(desc(guidanceDocuments.createdAt)).limit(200);
      return result(["guidanceId", "title", "sourceType", "privileged", "createdAt"], rows.map((r) => ({ guidanceId: r.id, title: r.title, sourceType: r.sourceType, privileged: r.privileged, createdAt: r.createdAt })));
    },
    manual_overrides: async () => {
      const rows = await db.select().from(requirementExceptions).where(eq(requirementExceptions.status, "approved")).orderBy(desc(requirementExceptions.createdAt));
      return result(["clientId", "exceptionType", "approvedBy", "expirationDate"], rows.map((r) => ({ clientId: r.submissionId, exceptionType: r.exceptionType, approvedBy: r.approvedBy, expirationDate: r.expirationDate })));
    },
    document_downloads: async () => {
      const rows = await db.select().from(documentAccessLog).orderBy(desc(documentAccessLog.createdAt)).limit(500);
      return result(["documentId", "userId", "action", "ip", "createdAt"], rows.map((r) => ({ documentId: r.documentId, userId: r.userId, action: r.action, ip: r.ip, createdAt: r.createdAt })));
    },
    formdata_reconciliation: async () => {
      const { listReconciliationMismatches } = await import("./normalize");
      const rows = await listReconciliationMismatches();
      return result(["clientId", "mismatchedFields", "reconciledAt"], rows.map((r) => ({ clientId: r.submissionId, mismatchedFields: r.mismatchFlags.join("; "), reconciledAt: r.reconciledAt })));
    },
    weekly_pod: async () => {
      const { allWeeklyPods } = await import("./pod");
      const rows = await allWeeklyPods();
      return result(["clientId", "client", "weekOf", "vendor", "status", "podUrl"], rows.map((r) => ({ clientId: r.submissionId, client: r.client, weekOf: r.weekOf, vendor: r.vendor, status: r.status, podUrl: r.podUrl })));
    },
    missing_pod: async () => {
      const { missingPodRows } = await import("./pod");
      const rows = await missingPodRows();
      return result(["clientId", "client", "weekOf", "vendor"], rows.map((r) => ({ clientId: r.submissionId, client: r.client, weekOf: r.weekOf, vendor: r.vendor })));
    },
  };
  const runner = runners[key];
  if (!runner) throw new Error(`UNKNOWN_REPORT:${key}`);
  return runner();
}
