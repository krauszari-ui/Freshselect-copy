# FreshSelect Meals — Compliance & Audit System: Implementation Plan

**Status:** Phase 0–2 foundation implemented (behind feature flags); Phases 3–4 designed.
**Scope of this document:** the complete design for the compliance/audit module, what has
been built in this release, and the roadmap + guides for the remainder.

> **Non-guarantee notice.** This system helps track compliance requirements, evidence, and
> self-audits. It does **not** guarantee compliance or reimbursement, and it does **not**
> determine whether a legal repayment or self-disclosure obligation exists. Qualified
> compliance and legal personnel must review those matters. The engineering goal is a secure,
> fail-safe, observable, evidence-preserving system that minimizes preventable error — not a
> claim of correctness or "100% compliance."

---

## 1. How to read this document

- **§2 Findings** — what the two-pass review of the existing app surfaced.
- **§3 Architecture** — where the module lives and the one-client-record principle.
- **§4 Schema** — the new tables (source of truth: `drizzle/schema.ts`).
- **§5 Migration strategy** — additive / expand-and-contract; rollback.
- **§6 Security model** — RBAC, audit integrity, file access, MFA, gates.
- **§7 Phased plan** — what is built now vs. designed for later.
- **§8 Acceptance tests** — how each completion criterion is verified.
- **§9–13 Guides** — administrator, compliance user, auditor, backup/restore, deployment.
- **§14 Known limitations** — explicit, non-negotiable honesty about what is not done.

---

## 2. Two-pass review findings

### Baseline (recorded before any change)
Measured in this sandbox (no `DATABASE_URL`, `RESEND_*`, `R2_*`, or `CRON_SECRET`):
`pnpm check` → **pass**; `pnpm test` → **286 passed / 22 failed (308)**. All 22 failures are
environment-dependent integration tests (`db.execute.test.ts` needs a live DB; `email`/`resend`
need Resend; `r2-public-url` needs R2; `cron-secret` needs the env var; one `security-audit5`
source-regex). None are logic failures. After this work: **366 passed / 22 failed (388)** — the
80 new tests pass and **no existing test regressed**.

### Pass one — architecture (entities & workflows mapped)
Users, submissions (the client record), tasks, case notes, documents, services, referral links,
referrer messages, client emails, stage history, notifications, email blasts, client/org
messages, organizations. Stack confirmed: React 19 + Vite + Express + tRPC + Drizzle
(MySQL/TiDB) + Tailwind + React Query + Zod + R2/Forge storage.

### Pass two — risk & data integrity (confirmed in code)
| # | Finding | Evidence | Addressed by |
|---|---------|----------|--------------|
| 1 | **No DB transactions anywhere** | `grep transaction server/db.ts` → 0 | `withTransaction` + all compliance mutations |
| 2 | **Audit logger swallows failures** | `logAudit` empty `catch {}` (`db.ts`) | transactional `recordAuditEvent`, hash chain |
| 3 | **Audit rows lack integrity/context** | `auditLogs` has no role/org/IP/prev-new/hash | `auditEvents` table |
| 4 | **Unauthenticated file proxy** | `/manus-storage/:key` no auth check | proxy now requires authn + role |
| 5 | **Expiring URL stored as authoritative location** | `documents.url` = 7-day presigned | `complianceDocuments.objectKey` + on-demand signing |
| 6 | **No foreign keys** | schema has bare `int` columns | FKs on all new tables |
| 7 | **RBAC = role enum + JSON** | `users.role`, `users.permissions` | normalized RBAC tables + `requirePermission` |
| 8 | **In-memory rate limiting** | `express-rate-limit` default store | `RateStore` abstraction (Redis adapter + fallback) |
| 9 | **Detached background work** | `setTimeout(0)` in `routers.ts` | DB-backed `jobs` queue |
| 10 | **No MFA / malware scan / doc versioning** | absent | TOTP MFA, quarantine scanner iface, versioned docs |
| 11 | **Hard deletes** | `deleteSubmission`, `deleteDocument`, etc. | soft-delete columns + no hard-delete in new module |
| 12 | **Compliance-sensitive data only in `formData` JSON** | `submissions.formData` | normalized eligibility/referral/auth tables |

---

## 3. Architecture

The module is a **new protected module inside the existing app** — one platform, one client
record. **`submissions.id` remains the canonical client identifier**; every new table
references it. No existing table is renamed or removed. All new code is gated by the
`COMPLIANCE_MODULE` feature flag (default **off**), so deploying it changes nothing until an
operator opts in.

```
Client (submissions.id)
  ├─ eligibilityVerifications (append-only)
  ├─ enrollmentEpisodes (multiple historical periods)
  ├─ scnReferrals
  ├─ serviceAuthorizations (DECIMAL money; transactional unit consumption)
  ├─ requirementAssignments ── requirementVersions ── requirementDefinitions
  │      └─ requirementExceptions (separation of duties)
  ├─ complianceDocuments (objectKey, checksum, scanStatus, versioned, retained)
  └─ complianceReadiness (derived snapshot)

Cross-cutting: auditEvents (hash chain) · RBAC (roles/permissions/scopes) ·
jobs (durable queue) · mfaEnrollments · uploadTokens
```

Data flow (readiness): facts (eligibility/referral/auth/requirements) → `gatherReadinessFacts`
→ pure `computeReadiness` → `complianceReadiness` snapshot + audit event. Staff can **never**
hand-set "Ready for Service"; it is derived.

Files: `server/compliance/*` (audit, rbac, gates, requirements, readiness, authorizations,
upload, store, router, flags, infra/*), `drizzle/schema.ts` (tables), `drizzle/manual/*.sql`
(migrations), `client/src/pages/compliance/*` (UI), `shared/compliance/constants.ts` (shared
enums/permissions).

---

## 4. Schema (new tables — source of truth `drizzle/schema.ts`)

**Integrity foundation:** `auditEvents`, `complianceRoles`, `compliancePermissions`,
`rolePermissions`, `userComplianceRoles`, `recordScopes`, `tempAccessGrants`, `mfaEnrollments`,
`mfaRecoveryCodes`, `jobs`, `uploadTokens`, `complianceDocuments`, `documentAccessLog`.

**Core compliance:** `eligibilityVerifications`, `enrollmentEpisodes`, `scnReferrals`,
`serviceAuthorizations`, `requirementDefinitions`, `requirementVersions`,
`requirementApplicabilityRules`, `requirementAssignments`, `requirementEvidence`,
`requirementReviews`, `requirementExceptions`, `requirementApprovals`, `complianceReadiness`.

Every table carries, where applicable: FKs (`.references()`), `version` (optimistic
concurrency), `recordStatus` (`active|archived|voided|superseded`) + `deletedAt/deletedBy`,
`createdBy/updatedBy`, `createdAt/updatedAt`, effective-date columns, and **DECIMAL** for money
(`serviceAuthorizations.rate`). Unique/idempotency constraints: `serviceAuthorizations`
authorization number, `requirementAssignments (submissionId, versionId, serviceDate)`,
`jobs.idempotencyKey`, `uploadTokens.tokenHash`.

**Designed but not yet in code** (Phase 3 modules — see §7): billing (`invoiceHeaders`,
`invoiceLines`, `invoiceSubmissions`, `payments`, `paymentAllocations`, `denials`,
`adjustments`, `recoupments`, `billingHolds`); service delivery (`servicePlans`,
`serviceEncounters`, `deliveries`, `deliveryAttempts`, `serviceAmendments`); nutrition
(`nutritionAssessments`, `nutritionPlans`, `nutritionPlanVersions`, `clinicalApprovals`);
self-audit (`audits`, `auditScopes`, `auditPopulations`, `auditSamples`, `auditTests`,
`auditWorkpapers`, `auditEvidence`, `auditFindings`, `managementResponses`,
`correctiveActions`, `correctiveActionEvidence`, `followUpTests`, `auditApprovals`);
overpayments; guidance library (`guidanceDocuments`, `guidanceVersions`,
`clarificationRequests`, `agencyResponses`, `legalReviews`, `internalDecisions`,
`policyChangeImpacts`, `trainingAcknowledgments`). Each follows the same column conventions.

---

## 5. Migration strategy

**Additive, expand-and-contract, no destructive migrations.** The authoritative additive SQL
is `drizzle/manual/0037_compliance_foundation.sql` (idempotent `CREATE TABLE IF NOT EXISTS`,
FKs, indexes). Rollback: `drizzle/manual/0037_compliance_foundation.down.sql` (drops only the
new tables). Because everything is flag-gated off by default, the safest production rollback is
to **disable the flags** — the tables can remain with zero effect.

- With a live DB, regenerate the official Drizzle migration + snapshot via
  `pnpm drizzle-kit generate` (schema.ts is the source of truth). The hand-authored SQL exists
  for environments where drizzle-kit cannot run and lives under `drizzle/manual/` so it never
  collides with generated files.
- **Expand phase:** create new tables (this migration). **Migrate phase (future):** backfill
  normalized data from `submissions.formData`; run reconciliation reports. **Contract phase
  (future):** retire obsolete direct-edit paths once parity is proven.
- The `submissions → clients/enrollmentEpisodes` split is explicitly deferred and must not
  block this release.

**Data-reconciliation approach (future backfill):** for each backfilled row, write a
reconciliation record comparing source (`formData`) vs. normalized values; a report lists
mismatches for manual review before any source field is deprecated. No source data is deleted.

---

## 6. Security model

### 6.1 RBAC (`server/compliance/rbac.ts`)
Normalized permissions (`<resource>:<action>`) derived from the legacy role enum plus optional
normalized compliance roles (`userComplianceRoles`). `requirePermission(perm)` middleware gates
every compliance procedure **on the server**; the UI never relies on a hidden button. Least
privilege: workers manage operations but cannot approve exceptions, approve requirements, or
reveal Medicaid IDs; viewers are read-only; public `user` has zero compliance permissions.
New roles (Compliance Officer, Clinical Reviewer, RDN/CDN, Internal Auditor, Read-only External
Auditor, Attorney, Document Administrator, …) map to permission sets in code and are grantable
via `userComplianceRoles`.

### 6.2 Audit integrity (`server/compliance/audit.ts`)
`auditEvents` is append-only with a **SHA-256 hash chain** (`hash = SHA256(prevHash + canonical
event)`). `recordAuditEvent(tx, evt)` runs **inside the caller's transaction** and locks the
chain head `FOR UPDATE` so concurrent appends serialize. Editing/deleting/reordering any
historical row breaks `verifyAuditChain` downstream (tested). Material actions that must be
logged: readiness recompute, eligibility/referral/authorization changes, unit
consume/deny, requirement assignment/status, exception request/approve (incl. denied
attempts). **Application code never updates or deletes `auditEvents`.** DB-level hardening
(GRANT without UPDATE/DELETE on `auditEvents`, periodic export to retention-locked storage,
scheduled `verifyIntegrity`) is documented for ops.

### 6.3 File access (`server/_core/storageProxy.ts`, `server/compliance/upload.ts`)
- `/manus-storage/:key` now **requires an authenticated staff session** (was fully public).
- `complianceDocuments` stores the **object key only**; signed URLs are minted on demand after
  permission + scope checks and each reveal is logged (`documentAccessLog`).
- Uploads: one-time tokens bound to a client/draft, **server-generated keys**, **magic-byte**
  validation (rejects content/type spoofing), filename sanitization, size validation with a
  correct message, SHA-256 checksum, and **quarantine-by-default** (`scanStatus`). The malware
  scanner is an interface; the default never auto-passes a file.

### 6.4 MFA (`server/compliance/infra/mfa.ts`)
Vendored RFC-6238 TOTP verify (no new dependency) with ±1-step drift, `otpauth://` enrollment
URI, and single-use recovery codes stored only as SHA-256 hashes. `mfaEnrollments` includes a
reset-approval workflow. When `COMPLIANCE_MFA` is on, MFA is required for privileged roles
(super_admin/admin + compliance/billing/clinical/auditor/attorney). Enrollment UI + login-step
enforcement are the remaining wiring (designed; see §7/§14).

### 6.5 Gates & exceptions (`server/compliance/gates.ts`)
Pure, server-enforced service-readiness and invoicing gates implement the brief's block lists.
A blocked action can be overridden **only** by an approved `requirementExceptions` record with
a written justification, a **different approver** (separation of duties, enforced), and an
effective window. `applyExceptions` removes only covered blockers; uncovered blockers still
block. When `COMPLIANCE_GATES` is off the gates run advisory-only.

### 6.6 Other controls
Break-glass (`tempAccessGrants`) and record scoping (`recordScopes`) tables exist with the
banner/notification workflow designed. Data minimization: `maskIdentifier` masks CIN/Medicaid
IDs in lists; full reveal is a distinct permission and is logged. Rate-limit store abstraction
supports a Redis adapter for multi-instance correctness.

---

## 7. Phased plan — built vs. designed

**Built this release (flag-gated, tested):**
- Phase 0: repo baseline, feature flags, this document.
- Phase 1: transactional hash-chained audit, RBAC scaffold + enforcement, hardened file proxy,
  upload hardening, fail-safe infra interfaces (MFA/TOTP, job queue, rate store, malware
  scanner), soft-delete columns on new tables.
- Phase 2 (core): eligibility, enrollment episodes, SCN referrals, authorizations with
  transactional non-negative unit consumption, requirements engine (effective-date selection,
  applicability, retroactivity guard), derived readiness, gates + exceptions, `compliance.*`
  tRPC router, UI (dashboard, requirements library, per-client panel + banner).

**Designed, not yet coded (follow-on, no rework required):**
- Phase 2 (remainder): nutrition documentation + clinical approvals; service delivery/encounters
  with the state machine (Draft→…→Locked→Invoiced→Paid, amendments after lock); billing +
  reconciliation (referral→eligibility→auth→service→evidence→invoice→payment) with idempotency.
- Phase 3: self-audit (scopes/populations/samples with preserved snapshots, seeds, and
  no-replacement of failed records; test results incl. Insufficient Evidence); CAPA (findings
  that cannot close without verification evidence + approval); overpayments (restricted, with
  legal/compliance review and the required disclaimer); guidance library + clarification
  workflow with attorney-privilege separation; reports; audit-package generation with manifest
  + checksums.
- Phase 4: `formData` normalization backfill + reconciliation; retire direct-edit workflows;
  performance + authorization penetration testing; disaster-recovery drill; production adapters
  for Redis/queue/AV; full MFA enrollment UI + login enforcement; session-management table.

---

## 8. Acceptance tests (completion criteria → evidence)

| Criterion | Where verified |
|-----------|----------------|
| Existing workflows still function | flags default off; existing suite unchanged (366/388, no regressions) |
| Existing + new tests pass | `pnpm test` — 80 new tests pass; 22 pre-existing env failures unchanged |
| TypeScript strict passes | `pnpm check` → exit 0 |
| Production build passes | `pnpm build` → vite + esbuild succeed |
| No compliance action bypasses server validation | `requirePermission` + `assertClientAccess` on every procedure (`router.ts`) |
| No high-risk record hard-deleted | new module has no hard-delete path; soft-delete columns |
| Approved/invoiced records not silently overwritten | amendments designed; `version` optimistic-concurrency columns present |
| Restricted access logged | `documentAccessLog`, audit events on reveals/changes |
| Cross-organization/-client IDOR | `assertClientAccess` + `rbac.test.ts` + designed org tests |
| Units cannot be overconsumed | `authorizations.test.ts` (pure) + row-lock transaction |
| Duplicate invoices cannot be created | idempotency keys + unique constraints (billing designed) |
| Audit samples immutable after selection | snapshot/seed design (self-audit, Phase 3) |
| Findings cannot close without verification | CAPA design (Phase 3) |
| Audit events tamper-evident | `audit.test.ts` — tamper/delete/re-sign all detected |
| Backup restoration tested | procedure documented (§12); drill is Phase 4 |
| Rollback plan exists | §5 + `drizzle/manual/*.down.sql` |
| Known limitations documented | §14 |

Test suites added: `audit`, `authorizations`, `requirements`, `readiness`, `gates`, `rbac`,
`upload`, `infra`, `flags` (`server/compliance/*.test.ts`), 80 tests total.

---

## 9. Administrator guide

1. **Enable the module:** set `COMPLIANCE_MODULE=1` on the server. Optionally
   `COMPLIANCE_GATES=1` (enforce gates) and `COMPLIANCE_MFA=1` (require MFA). All default off.
2. **Apply the schema:** run `drizzle/manual/0037_compliance_foundation.sql` against the
   database, or `pnpm drizzle-kit generate && pnpm drizzle-kit migrate` with `DATABASE_URL` set.
3. **Seed RBAC (optional):** insert rows into `complianceRoles` and grant via
   `userComplianceRoles` to give staff normalized compliance roles beyond their legacy role.
4. **Navigate:** a **Compliance** entry appears in the admin sidebar. Open a client to see the
   inline readiness banner and "Open record".
5. **Configure infra (production):** inject a Redis client (`setRateStoreRedis`), a malware
   scanner (`setMalwareScanner`), and run the job worker loop for durable jobs.

## 10. Compliance-user guide

- **Requirements library** (`/admin/compliance/requirements`): author versioned requirements
  with source, section, effective date, and blocking flag. The version effective on the service
  date is what gets evaluated; retroactive versions require a recorded legal basis + approval.
- **Per-client record**: record eligibility (append-only — never overwritten), referrals,
  authorizations; "Assign applicable" evaluates the engine for a service date; mark requirements
  satisfied as evidence is collected; **Recalculate** derives readiness. Readiness never reaches
  "Ready for Service" until all blocking gates pass.
- **Exceptions**: a blocked gate may be overridden only via an exception approved by someone
  other than the requester, with justification and an expiry. Every step is audited.

## 11. Auditor guide

- **Audit-log integrity**: the dashboard runs `verifyIntegrity` (hash-chain check). A break
  reports the first tampered event id and reason. Auditors (Read-only External Auditor role)
  get view + audit permissions and cannot mutate records.
- **Record history**: `compliance.audit.forRecord` returns the event trail for any record.
- **Sampling (Phase 3)**: populations are snapshotted at selection with the method + seed;
  failed sample records cannot be swapped out; excluded records retain exclusion reasons.

## 12. Backup & restore guide

- **Backup**: schedule logical backups of the MySQL/TiDB database (all tables) and the object
  store (R2 bucket). Store the `auditEvents` export in retention-locked/immutable storage
  separately so tamper evidence survives a primary-DB compromise.
- **Restore validation (procedure)**: (1) restore into a scratch database; (2) run `pnpm check`
  and the app's health endpoint; (3) run `verifyAuditChain` over restored `auditEvents` — a
  clean chain confirms audit integrity survived; (4) spot-check row counts vs. the backup
  manifest; (5) confirm object-store keys referenced by `complianceDocuments` resolve. A
  scripted `backup_verification` job type is reserved in the queue for automating this.
- The full disaster-recovery drill (timed restore + reconciliation) is a Phase 4 deliverable.

## 13. Deployment checklist

- [ ] `pnpm check`, `pnpm test`, `pnpm build` green in CI.
- [ ] Apply schema migration; verify all new tables + FKs exist.
- [ ] Confirm flags OFF for initial deploy; smoke-test existing app unchanged.
- [ ] Enable `COMPLIANCE_MODULE=1` in a limited environment; verify nav + dashboard + a client
      record.
- [ ] Inject Redis / malware scanner / start job worker before enabling `COMPLIANCE_GATES`.
- [ ] Configure `auditEvents` GRANTs (no UPDATE/DELETE for app user) and the integrity job.
- [ ] Verify backup + restore validation procedure once against staging.

---

## 14. Known limitations (explicit)

- **Not implemented in code this release (designed only):** billing/reconciliation runtime,
  service-delivery state machine, nutrition/clinical-approval runtime, self-audit/sampling/CAPA,
  overpayments, guidance library, reports, audit-package generation, full MFA enrollment UI +
  login-step enforcement, session-management table, `formData` normalization backfill, and the
  `submissions → clients/enrollmentEpisodes` split.
- **Infra is interface-first:** Redis, malware scanning, and the durable-job **worker loop** are
  abstractions with fail-safe defaults; production requires wiring the real adapters. Without a
  scanner, documents remain quarantined (safe) rather than downloadable.
- **Migrations were not executed here** (no database in the build environment). The additive SQL
  and Drizzle schema are consistent by construction but should be applied and verified against a
  real MySQL/TiDB instance; regenerate the official snapshot with `drizzle-kit generate`.
- **Legacy hard-delete paths still exist** on the original tables (`deleteSubmission`,
  `deleteDocument`, …). The new module never hard-deletes; converting the legacy paths to
  archival is a scoped follow-on (§7 Phase 4).
- **This software does not guarantee compliance or reimbursement** and makes no legal
  determinations. See the notice at the top of this document.
