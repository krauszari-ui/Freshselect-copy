/**
 * Shared compliance constants — imported by BOTH the server and the client so
 * enums, statuses, and permission keys never drift between the two.
 *
 * Everything here is additive to the existing FreshSelect Meals application and
 * lives under the `compliance` feature module. The canonical client identifier
 * remains `submissions.id`; nothing here renames or replaces it.
 */

// ─── Feature flags (names only; evaluation lives in server/compliance/flags.ts) ──
export const COMPLIANCE_FLAGS = {
  /** Master switch for the whole compliance module (nav, routes, procedures). */
  MODULE: "COMPLIANCE_MODULE",
  /** Enforce server-side readiness/invoicing gates (vs. advisory-only). */
  GATES: "COMPLIANCE_GATES",
  /** Require MFA for privileged roles. */
  MFA: "COMPLIANCE_MFA",
} as const;
export type ComplianceFlag = (typeof COMPLIANCE_FLAGS)[keyof typeof COMPLIANCE_FLAGS];

// ─── Record lifecycle status (soft-delete instead of hard delete) ────────────
export const RECORD_STATUSES = ["active", "archived", "voided", "superseded"] as const;
export type RecordStatus = (typeof RECORD_STATUSES)[number];

// ─── Client compliance-readiness statuses (derived, never hand-set to Ready) ──
export const READINESS_STATUSES = [
  "intake_pending",
  "eligibility_pending",
  "referral_pending",
  "authorization_pending",
  "clinical_review_pending",
  "evidence_missing",
  "compliance_review_pending",
  "ready_for_service",
  "service_hold",
  "billing_hold",
  "under_audit",
  "inactive",
] as const;
export type ReadinessStatus = (typeof READINESS_STATUSES)[number];

/** Human-readable labels — status is NEVER conveyed by color alone (WCAG 1.4.1). */
export const READINESS_LABELS: Record<ReadinessStatus, string> = {
  intake_pending: "Intake Pending",
  eligibility_pending: "Eligibility Pending",
  referral_pending: "Referral Pending",
  authorization_pending: "Authorization Pending",
  clinical_review_pending: "Clinical Review Pending",
  evidence_missing: "Evidence Missing",
  compliance_review_pending: "Compliance Review Pending",
  ready_for_service: "Ready for Service",
  service_hold: "Service Hold",
  billing_hold: "Billing Hold",
  under_audit: "Under Audit",
  inactive: "Inactive",
};

// ─── Eligibility ─────────────────────────────────────────────────────────────
export const ELIGIBILITY_STATUSES = ["verified", "pending", "expired", "not_eligible", "superseded"] as const;
export type EligibilityStatus = (typeof ELIGIBILITY_STATUSES)[number];

export const MEDICAID_STATUSES = ["active", "inactive", "pending", "unknown"] as const;
export type MedicaidStatus = (typeof MEDICAID_STATUSES)[number];

// ─── Referrals ───────────────────────────────────────────────────────────────
export const REFERRAL_STATUSES = ["received", "in_review", "accepted", "rejected", "expired", "withdrawn"] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];

// ─── Authorizations ──────────────────────────────────────────────────────────
export const AUTHORIZATION_STATUSES = ["draft", "active", "exhausted", "expired", "suspended", "voided"] as const;
export type AuthorizationStatus = (typeof AUTHORIZATION_STATUSES)[number];

export const UNIT_TYPES = ["meal", "box", "delivery", "day", "week", "unit"] as const;
export type UnitType = (typeof UNIT_TYPES)[number];

// ─── Enrollment episodes ─────────────────────────────────────────────────────
export const ENROLLMENT_STATUSES = ["active", "terminated", "pending", "suspended"] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

// ─── Requirements engine ─────────────────────────────────────────────────────
export const REQUIREMENT_RISK_LEVELS = ["low", "medium", "high", "critical"] as const;
export type RequirementRiskLevel = (typeof REQUIREMENT_RISK_LEVELS)[number];

export const REQUIREMENT_APPROVAL_STATUSES = ["draft", "internal_review", "attorney_review", "approved", "retired"] as const;
export type RequirementApprovalStatus = (typeof REQUIREMENT_APPROVAL_STATUSES)[number];

/** Assignment status for a requirement applied to a specific client/service. */
export const REQUIREMENT_ASSIGNMENT_STATUSES = ["pending", "in_progress", "satisfied", "failed", "waived", "not_applicable"] as const;
export type RequirementAssignmentStatus = (typeof REQUIREMENT_ASSIGNMENT_STATUSES)[number];

// ─── Document security ───────────────────────────────────────────────────────
export const SCAN_STATUSES = ["pending", "quarantined", "passed", "failed"] as const;
export type ScanStatus = (typeof SCAN_STATUSES)[number];

export const CONFIDENTIALITY_CLASSES = ["standard", "sensitive", "highly_sensitive", "attorney_client_privileged"] as const;
export type ConfidentialityClass = (typeof CONFIDENTIALITY_CLASSES)[number];

// ─── Durable job queue ───────────────────────────────────────────────────────
export const JOB_STATUSES = ["queued", "running", "succeeded", "failed", "dead_letter"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

// ─── Exceptions (permitted gate overrides) ───────────────────────────────────
export const EXCEPTION_STATUSES = ["requested", "approved", "rejected", "expired"] as const;
export type ExceptionStatus = (typeof EXCEPTION_STATUSES)[number];

// ─── Permissions (normalized RBAC) ───────────────────────────────────────────
/**
 * Permission keys are `<resource>:<action>`. Server middleware enforces these on
 * every compliance query/mutation; they are additive to the legacy role enum.
 */
export const PERMISSIONS = {
  COMPLIANCE_VIEW: "compliance:view",
  COMPLIANCE_MANAGE: "compliance:manage",
  ELIGIBILITY_VIEW: "eligibility:view",
  ELIGIBILITY_MANAGE: "eligibility:manage",
  REFERRAL_VIEW: "referral:view",
  REFERRAL_MANAGE: "referral:manage",
  AUTHORIZATION_VIEW: "authorization:view",
  AUTHORIZATION_MANAGE: "authorization:manage",
  REQUIREMENT_VIEW: "requirement:view",
  REQUIREMENT_MANAGE: "requirement:manage",
  REQUIREMENT_APPROVE: "requirement:approve",
  READINESS_VIEW: "readiness:view",
  EXCEPTION_REQUEST: "exception:request",
  EXCEPTION_APPROVE: "exception:approve",
  DOCUMENT_VIEW: "document:view",
  DOCUMENT_MANAGE: "document:manage",
  MEDICAID_ID_REVEAL: "medicaid_id:reveal",
  AUDIT_VIEW: "audit:view",
  EXPORT: "export:run",
} as const;
export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// ─── Normalized compliance roles (map onto legacy role enum for compatibility) ─
export const COMPLIANCE_ROLES = [
  "compliance_officer",
  "compliance_reviewer",
  "program_manager",
  "billing_specialist",
  "clinical_reviewer",
  "rdn_cdn",
  "internal_auditor",
  "readonly_external_auditor",
  "attorney",
  "document_administrator",
] as const;
export type ComplianceRole = (typeof COMPLIANCE_ROLES)[number];

/** Roles for which MFA is mandatory when COMPLIANCE_MFA is enabled. */
export const MFA_REQUIRED_LEGACY_ROLES = ["super_admin", "admin"] as const;
export const MFA_REQUIRED_COMPLIANCE_ROLES: ComplianceRole[] = [
  "compliance_officer",
  "compliance_reviewer",
  "billing_specialist",
  "clinical_reviewer",
  "rdn_cdn",
  "internal_auditor",
  "attorney",
];

/** Masking helper shared by client + server: show only the last 4 of an identifier. */
export function maskIdentifier(value: string | null | undefined): string {
  if (!value) return "—";
  const trimmed = value.trim();
  if (trimmed.length <= 4) return "•".repeat(trimmed.length);
  return `${"•".repeat(Math.max(0, trimmed.length - 4))}${trimmed.slice(-4)}`;
}

/** Normalize a Client Identification Number (CIN) / Medicaid ID for comparison. */
export function normalizeCin(value: string | null | undefined): string {
  return (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
