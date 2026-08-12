/**
 * End-to-end compliance flow test — runs against a REAL database.
 *
 * Unlike the unit tests (pure logic), this boots the actual tRPC `appRouter` and
 * calls the real `compliance.*` procedures via `createCaller`, so it exercises the
 * full stack: feature-flag gate → permission gate → per-client access scoping →
 * transactional store logic → live MySQL/MariaDB → tamper-evident audit chain.
 *
 * Requires DATABASE_URL (see SETUP.md / .env) and COMPLIANCE_MODULE enabled.
 * Run:  COMPLIANCE_MODULE=1 npx tsx scripts/e2e-compliance.mts
 * (wired as `pnpm test:e2e`).
 *
 * Exits 0 only if every assertion passes; non-zero on the first failure.
 */
import "dotenv/config";
process.env.COMPLIANCE_MODULE = process.env.COMPLIANCE_MODULE ?? "1";

import { eq, and } from "drizzle-orm";
import { appRouter } from "../server/routers";
import { getDb, getUserByEmail, createStaffUser } from "../server/db";
import {
  submissions, serviceAuthorizations, complianceReadiness, auditFindings,
  documents, complianceDocuments, organizations, users as usersTable, vendorPods,
} from "../drizzle/schema";
import { isoWeekStart } from "../shared/compliance/week";
import { loadAuditChain, verifyAuditChain } from "../server/compliance/audit";
import { totp } from "../server/compliance/infra/mfa";
import {
  recordSession, enforceSession, hasRecentReauth,
  SESSION_IDLE_TIMEOUT_MS, SESSION_ABSOLUTE_TIMEOUT_MS,
} from "../server/compliance/sessionService";
import { randomUUID } from "node:crypto";
import { enqueueJob } from "../server/compliance/infra/jobQueue";
import { drainQueue } from "../server/compliance/worker";
import { generateClientFolderZip } from "../server/compliance/clientFolder";
import { unzipSync, strFromU8 } from "fflate";
import type { User } from "../drizzle/schema";

// ─── Tiny assert harness ─────────────────────────────────────────────────────
let passed = 0;
function ok(cond: boolean, label: string): void {
  if (!cond) { console.error(`  ✗ FAIL: ${label}`); throw new Error(`Assertion failed: ${label}`); }
  passed++;
  console.log(`  ✓ ${label}`);
}
function eqAssert<T>(actual: T, expected: T, label: string): void {
  ok(actual === expected, `${label} (expected ${String(expected)}, got ${String(actual)})`);
}
/**
 * Normalize a JSON column value to an array. MySQL 8 / TiDB (the production
 * target) return JSON columns already parsed; MariaDB (the local test engine)
 * returns them as strings. This keeps the harness engine-agnostic.
 */
function asArr(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
  return [];
}

// Build a tRPC context for a given user (fakes req/res the compliance procs read).
function ctxFor(user: User, sessionId?: string) {
  return {
    user,
    req: { headers: { cookie: sessionId ? `admin_session_id=${sessionId}` : "", "user-agent": "e2e" }, ip: "127.0.0.1", socket: { remoteAddress: "127.0.0.1" } },
    res: { cookie() {}, clearCookie() {} },
  } as unknown as Parameters<typeof appRouter.createCaller>[0];
}

async function main() {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE — set DATABASE_URL in .env");
  const run = Date.now();

  console.log("\n══ Phase 0: actors ══");
  const admin = await getUserByEmail("a.krausz@levelupresources.org");
  ok(!!admin, "seeded super_admin exists");
  // A SECOND privileged user to satisfy separation-of-duties on approvals.
  const approverEmail = `e2e-approver+${run}@example.com`;
  const approverId = await createStaffUser({ email: approverEmail, name: "E2E Approver", passwordHash: null, role: "admin", permissions: {} });
  const approver = await getUserByEmail(approverEmail);
  ok(!!approver && approver.id === approverId, "second privileged approver created");

  // A worker (holds GUIDANCE_VIEW but NOT PRIVILEGED_VIEW) — used to prove the
  // attorney-privilege filter actually hides privileged records server-side.
  const workerEmail = `e2e-worker+${run}@example.com`;
  const workerId = await createStaffUser({ email: workerEmail, name: "E2E Worker", passwordHash: null, role: "worker", permissions: {} });
  const worker = await getUserByEmail(workerEmail);
  ok(!!worker && worker.id === workerId, "worker (non-privileged) user created");

  const caller = appRouter.createCaller(ctxFor(admin as User));
  const approverCaller = appRouter.createCaller(ctxFor(approver as User));
  const workerCaller = appRouter.createCaller(ctxFor(worker as User));

  console.log("\n══ Phase 1: create a client (submission) ══");
  const insertedSub = await db.insert(submissions).values({
    referenceNumber: `E2E-${run}`.slice(0, 16),
    firstName: "Test", lastName: "Client",
    email: `client+${run}@example.com`, cellPhone: "5550000000",
    medicaidId: `E2E${run}`.slice(0, 32), supermarket: "Test Market",
    formData: { source: "e2e" }, hipaaConsentAt: new Date(),
  }).$returningId();
  const submissionId = insertedSub[0].id;
  ok(submissionId > 0, `submission created (id=${submissionId})`);

  console.log("\n══ Phase 2: eligibility ══");
  const elig = await caller.compliance.eligibility.create({ submissionId, medicaidStatus: "active", mco: "Test MCO", cin: "AB12345C", status: "verified" });
  ok(!!elig.id, "eligibility verification recorded");
  const eligList = await caller.compliance.eligibility.list({ submissionId });
  eqAssert(eligList.length, 1, "eligibility list has 1 row");

  console.log("\n══ Phase 3: SCN referral → accepted ══");
  const ref = await caller.compliance.referrals.create({ submissionId, referringEntity: "Test SCN", referralStatus: "received" });
  await caller.compliance.referrals.setStatus({ referralId: ref.id, submissionId, status: "accepted" });
  const refList = await caller.compliance.referrals.list({ submissionId });
  eqAssert(refList[0].referralStatus, "accepted", "referral accepted");

  console.log("\n══ Phase 3b: cross-client IDOR must be blocked ══");
  const otherSub = await db.insert(submissions).values({
    referenceNumber: `E2X-${run}`.slice(0, 16), firstName: "Other", lastName: "Client",
    email: `other+${run}@example.com`, cellPhone: "5550000001", medicaidId: `E2X${run}`.slice(0, 32),
    supermarket: "M", formData: {}, hipaaConsentAt: new Date(),
  }).$returningId();
  let idorBlocked = false;
  try {
    // Try to mutate THIS client's referral while claiming the OTHER client's id.
    await caller.compliance.referrals.setStatus({ referralId: ref.id, submissionId: otherSub[0].id, status: "rejected" });
  } catch { idorBlocked = true; }
  ok(idorBlocked, "cross-client referral mutation rejected (IDOR guard)");
  eqAssert((await caller.compliance.referrals.list({ submissionId }))[0].referralStatus, "accepted", "referral unchanged after blocked IDOR");

  console.log("\n══ Phase 4: authorization (10 units) ══");
  const auth = await caller.compliance.authorizations.create({
    submissionId, authorizationNumber: `AUTH-${run}`, authorizedUnits: 10, unitType: "meal",
    rate: "12.50", startDate: new Date(Date.now() - 86400000), endDate: new Date(Date.now() + 30 * 86400000), status: "active",
  });
  eqAssert(auth.remainingUnits, 10, "authorization starts with 10 remaining units");

  console.log("\n══ Phase 5: requirement (blocking) → assign → satisfy ══");
  await caller.compliance.requirements.createDefinition({
    key: `req_scn_${run}`, title: "SCN referral present", blocking: true,
    effectiveDate: new Date(Date.now() - 86400000), approvalStatus: "approved",
  });
  const assign = await caller.compliance.requirements.assign({ submissionId, serviceDate: new Date() });
  ok(assign.assigned >= 1, `assigned ${assign.assigned} requirement(s)`);
  const assignments = await caller.compliance.requirements.listAssignments({ submissionId });
  // Satisfy EVERY blocking assignment — readiness only clears when none remain unmet.
  for (const a of assignments) {
    await caller.compliance.requirements.setAssignmentStatus({ assignmentId: a.id, submissionId, status: "satisfied" });
  }
  ok((await caller.compliance.requirements.listAssignments({ submissionId })).every((a) => a.status === "satisfied"), `all ${assignments.length} requirement(s) satisfied`);

  console.log("\n══ Phase 6: nutrition + clinical approval ══");
  const na = await caller.compliance.nutrition.createAssessment({ submissionId, nutritionDiagnosis: "Test dx" });
  ok(!!na.id, "nutrition assessment created");
  const ca = await caller.compliance.nutrition.createClinicalApproval({ submissionId, credentialType: "RDN", serviceDate: new Date() });
  ok(ca > 0, "clinical approval recorded");

  console.log("\n══ Phase 7: readiness (derived) ══");
  const readiness = await caller.compliance.readiness.recompute({ submissionId });
  console.log("    readiness:", readiness.status, "| blockers:", readiness.blockingReasons.length);
  eqAssert(readiness.status, "ready_for_service", "client is READY (all gates satisfied)");
  const [rRow] = await db.select().from(complianceReadiness).where(eq(complianceReadiness.submissionId, submissionId));
  eqAssert(rRow.status, "ready_for_service", "readiness snapshot persisted");

  console.log("\n══ Phase 8: service encounter + delivery ══");
  const enc = await caller.compliance.encounters.create({ submissionId, authorizationId: auth.id, units: 2, unitType: "meal", dateOfService: new Date() });
  await caller.compliance.encounters.transition({ encounterId: enc.id, submissionId, to: "documented" });
  const del = await caller.compliance.encounters.recordDelivery({ encounterId: enc.id, submissionId, podMethod: "signature", signaturePresent: true });
  ok(del.podSufficient, "proof of delivery sufficient (signature present)");

  console.log("\n══ Phase 9: invoice (consumes units, blocks duplicates) ══");
  const inv = await caller.compliance.billing.createInvoice({
    submissionId, invoiceNumber: `INV-${run}`,
    lines: [{ encounterId: enc.id, authorizationId: auth.id, serviceCode: "S1", serviceDate: new Date(), units: 2, rate: "12.50" }],
  });
  eqAssert(inv.expectedTotal, "25.00", "invoice expected total = 2 × 12.50 = 25.00");
  const [authAfter] = await db.select().from(serviceAuthorizations).where(eq(serviceAuthorizations.id, auth.id));
  eqAssert(authAfter.remainingUnits, 8, "authorization units consumed (10 → 8)");

  // Duplicate billing of the SAME encounter must be rejected by the unique idempotency key.
  let dupBlocked = false;
  try {
    await caller.compliance.billing.createInvoice({ submissionId, lines: [{ encounterId: enc.id, authorizationId: auth.id, serviceCode: "S1", serviceDate: new Date(), units: 2, rate: "12.50" }] });
  } catch { dupBlocked = true; }
  ok(dupBlocked, "duplicate invoice for same encounter rejected (idempotency)");
  const [authAfterDup] = await db.select().from(serviceAuthorizations).where(eq(serviceAuthorizations.id, auth.id));
  eqAssert(authAfterDup.remainingUnits, 8, "units NOT double-consumed after blocked duplicate (rolled back)");

  console.log("\n══ Phase 10: approve (separation of duties) + pay + reconcile ══");
  let selfApproveBlocked = false;
  try { await caller.compliance.billing.approveInvoice({ invoiceId: inv.invoiceId, submissionId }); } catch { selfApproveBlocked = true; }
  ok(selfApproveBlocked, "creator cannot approve their own invoice (separation of duties)");
  const approved = await approverCaller.compliance.billing.approveInvoice({ invoiceId: inv.invoiceId, submissionId });
  eqAssert(approved.status, "approved", "invoice approved by a different user");
  const pay = await caller.compliance.billing.recordPayment({ invoiceId: inv.invoiceId, submissionId, paidAmount: "25.00" });
  eqAssert(pay.status, "paid_in_full", "payment reconciles to paid_in_full");

  console.log("\n══ Phase 11: self-audit — reproducible sampling ══");
  const audit = await caller.compliance.audits.create({ title: `E2E audit ${run}`, auditType: "billing_accuracy" });
  const population = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, riskScore: (i * 3) % 7, amountCents: (i + 1) * 100 }));
  const sample = await caller.compliance.audits.createSample({ auditId: audit.id, population, method: "random", seed: 4242, size: 5 });
  eqAssert(asArr(sample.selectedIds).length, 5, "sample selected 5 of 12 (seeded)");
  eqAssert(asArr(sample.excludedIds).length, 7, "sample excluded the other 7 (snapshot preserved)");
  await caller.compliance.audits.recordTest({ auditId: audit.id, sampleId: sample.id, sampleItemId: "1", result: "fail", financialExposure: "12.50" });

  console.log("\n══ Phase 12: finding → CAPA → close gate ══");
  const finding = await caller.compliance.audits.createFinding({ auditId: audit.id, submissionId, conditionFound: "Missing X", risk: "high" });
  // Closing before corrective action + evidence + follow-up must FAIL.
  let prematureCloseBlocked = false;
  try { await approverCaller.compliance.audits.closeFinding({ findingId: finding.id }); } catch { prematureCloseBlocked = true; }
  ok(prematureCloseBlocked, "finding cannot close without corrective action + evidence + follow-up");
  const caId = await caller.compliance.audits.addCorrectiveAction({ findingId: finding.id, correctiveAction: "Fix it", completed: true });
  await caller.compliance.audits.addCorrectiveActionEvidence({ correctiveActionId: caId, note: "evidence attached" });
  await caller.compliance.audits.addFollowUpTest({ findingId: finding.id, result: "pass" });
  // Owner cannot self-approve closure; a different compliance user can.
  const closed = await approverCaller.compliance.audits.closeFinding({ findingId: finding.id });
  eqAssert(closed.state, "closed", "finding closed after CAPA gate satisfied (by a different approver)");
  const [fRow] = await db.select().from(auditFindings).where(eq(auditFindings.id, finding.id));
  eqAssert(fRow.state, "closed", "finding closure persisted");

  console.log("\n══ Phase 12b: guidance & clarification (attorney-privilege gated) ══");
  const pubGuide = await caller.compliance.guidance.create({ title: `Public guidance ${run}`, sourceType: "nysdoh_ohip", privileged: false });
  const privGuide = await caller.compliance.guidance.create({ title: `Privileged memo ${run}`, sourceType: "attorney", privileged: true });
  ok(!!pubGuide.guidanceId && !!privGuide.guidanceId, "created public + privileged guidance");
  // Admin (has PRIVILEGED_VIEW) sees both; worker (no PRIVILEGED_VIEW) sees only public.
  const adminGuides = await caller.compliance.guidance.list();
  const workerGuides = await workerCaller.compliance.guidance.list();
  ok(adminGuides.some((g) => g.id === privGuide.guidanceId), "admin sees the privileged guidance");
  ok(!workerGuides.some((g) => g.id === privGuide.guidanceId), "worker CANNOT see privileged guidance (server-side filter)");
  ok(workerGuides.some((g) => g.id === pubGuide.guidanceId), "worker still sees public guidance");
  // Clarification workflow: submitted → facts_recorded → sent_to_agency → answered → interpreted.
  const clar = await caller.compliance.guidance.clarifications.create({ question: `Is X required for Y? (${run})`, facts: "Facts here", submissionId });
  await caller.compliance.guidance.clarifications.advance({ id: clar.id, to: "facts_recorded" });
  await caller.compliance.guidance.clarifications.advance({ id: clar.id, to: "sent_to_agency", sentToOrganization: "NYSDOH" });
  await caller.compliance.guidance.clarifications.recordResponse({ clarificationRequestId: clar.id, organization: "NYSDOH", responseType: "formal", summary: "Yes, required." });
  const answered = await caller.compliance.guidance.clarifications.advance({ id: clar.id, to: "answered" });
  eqAssert(answered.status, "answered", "clarification reached 'answered'");
  // An illegal jump must be rejected.
  let badJump = false;
  try { await caller.compliance.guidance.clarifications.advance({ id: clar.id, to: "closed" }); }
  catch { badJump = false; } // closed IS allowed from answered; use a real illegal one below
  try { await caller.compliance.guidance.clarifications.advance({ id: clar.id, to: "submitted" }); } catch { badJump = true; }
  ok(badJump, "illegal clarification transition rejected");
  // Internal decision — separation of duties (author ≠ approver).
  let selfDecisionBlocked = false;
  try { await caller.compliance.guidance.decisions.approve({ clarificationRequestId: clar.id, interpretation: "X is required.", authorId: admin!.id }); } catch { selfDecisionBlocked = true; }
  ok(selfDecisionBlocked, "author cannot approve their own internal interpretation (separation of duties)");
  const decisionId = await approverCaller.compliance.guidance.decisions.approve({ clarificationRequestId: clar.id, interpretation: "X is required.", authorId: admin!.id });
  ok(decisionId > 0, "internal decision approved by a different user");
  await approverCaller.compliance.guidance.decisions.recordImpact({ internalDecisionId: decisionId, affectedSubmissionId: submissionId });
  const ack1 = await workerCaller.compliance.guidance.decisions.acknowledgeTraining({ internalDecisionId: decisionId });
  const ack2 = await workerCaller.compliance.guidance.decisions.acknowledgeTraining({ internalDecisionId: decisionId });
  ok(ack1.acknowledged && !ack2.acknowledged, "training acknowledgment is idempotent (once per user)");

  console.log("\n══ Phase 12c: reports + audited CSV export ══");
  const catalog = await caller.compliance.reports.list();
  ok(catalog.length >= 15, `report catalog lists ${catalog.length} reports the caller may run`);
  const readinessReport = await caller.compliance.reports.run({ key: "client_readiness" });
  ok(readinessReport.rows.length >= 1, "client_readiness report returns at least this run's client");
  ok(readinessReport.rows.some((r) => r.status === "ready_for_service"), "report shows the ready client");
  const utilReport = await caller.compliance.reports.run({ key: "authorization_utilization" });
  ok(utilReport.rows.some((r) => Number(r.consumedUnits) === 2), "utilization report reflects 2 consumed units");
  // A worker lacks EXPORT → export must be forbidden, but running is allowed for permitted reports.
  let exportForbidden = false;
  try { await workerCaller.compliance.reports.exportCsv({ key: "client_readiness" }); } catch { exportForbidden = true; }
  ok(exportForbidden, "worker without EXPORT cannot export (server-enforced)");
  const exported = await caller.compliance.reports.exportCsv({ key: "client_readiness" });
  ok(exported.csv.startsWith("clientId,client,status,computedAt"), "CSV export has the expected header");
  ok(exported.filename.endsWith(".csv") && exported.rows >= 1, "CSV export names a file and reports row count");

  console.log("\n══ Phase 12d: audit-package generation (PDF + checksummed manifest) ══");
  const pkg = await caller.compliance.audits.generatePackage({ auditId: audit.id });
  ok(pkg.filename.endsWith(".pdf"), "audit package produced a .pdf filename");
  const pdfBuf = Buffer.from(pkg.pdfBase64, "base64");
  ok(pdfBuf.length > 500 && pdfBuf.subarray(0, 5).toString() === "%PDF-", "package is a real PDF (magic %PDF-)");
  ok(/^[0-9a-f]{64}$/.test(pkg.manifest.contentChecksum), "manifest has a content checksum");
  ok(/^[0-9a-f]{64}$/.test(pkg.manifest.pdfChecksum ?? ""), "manifest has a PDF checksum");
  ok(pkg.manifest.counts.findings >= 1, "manifest counts this run's finding");
  // A worker (no EXPORT) must be blocked from generating a package.
  let pkgForbidden = false;
  try { await workerCaller.compliance.audits.generatePackage({ auditId: audit.id }); } catch { pkgForbidden = true; }
  ok(pkgForbidden, "worker without EXPORT cannot generate an audit package (server-enforced)");

  console.log("\n══ Phase 12e: MFA enrollment + login-step enforcement ══");
  // Enroll the super_admin in TOTP, then prove the login gate enforces it only
  // when COMPLIANCE_MFA is on. The gate must be a strict no-op while off.
  const mfaStatusBefore = await caller.compliance.mfa.status();
  ok(!mfaStatusBefore.active, "admin has no active MFA before enrollment");
  const enroll = await caller.compliance.mfa.start();
  ok(/^[A-Z2-7]{16,}$/.test(enroll.secret) && enroll.otpauthUri.startsWith("otpauth://totp/"), "start() returns a base32 secret + otpauth URI");
  const midStatus = await caller.compliance.mfa.status();
  ok(midStatus.enrolled && !midStatus.active, "enrollment is pending (not active) until confirmed");
  const confirmRes = await caller.compliance.mfa.confirm({ token: totp(enroll.secret) });
  ok(Array.isArray(confirmRes.recoveryCodes) && confirmRes.recoveryCodes.length === 10, "confirm() activates MFA and returns 10 recovery codes");
  const afterConfirm = await caller.compliance.mfa.status();
  ok(afterConfirm.active, "MFA is active after confirmation");

  // With the flag OFF, login must succeed WITHOUT a code (no behavior change).
  delete process.env.COMPLIANCE_MFA;
  const loginFlagOff = await caller.auth.adminLogin({ email: "a.krausz@levelupresources.org", password: "hatzlacha" });
  ok(loginFlagOff.success === true, "flag OFF: password-only login still succeeds (MFA is a no-op)");

  // Turn enforcement ON.
  process.env.COMPLIANCE_MFA = "1";
  const loginNoToken = await caller.auth.adminLogin({ email: "a.krausz@levelupresources.org", password: "hatzlacha" });
  ok(loginNoToken.success === false && "mfaRequired" in loginNoToken && loginNoToken.mfaRequired === true, "flag ON: login without a code returns mfaRequired (no session issued)");

  let wrongCodeRejected = false;
  try { await caller.auth.adminLogin({ email: "a.krausz@levelupresources.org", password: "hatzlacha", mfaToken: "000000" }); }
  catch { wrongCodeRejected = true; }
  ok(wrongCodeRejected, "flag ON: an invalid code is rejected");

  const loginGood = await caller.auth.adminLogin({ email: "a.krausz@levelupresources.org", password: "hatzlacha", mfaToken: totp(enroll.secret) });
  ok(loginGood.success === true, "flag ON: a valid TOTP code completes login");

  // A single-use recovery code also satisfies the gate, then cannot be reused.
  const recovery = confirmRes.recoveryCodes[0];
  const loginRecovery = await caller.auth.adminLogin({ email: "a.krausz@levelupresources.org", password: "hatzlacha", mfaToken: recovery });
  ok(loginRecovery.success === true, "flag ON: a recovery code completes login");
  let reuseRejected = false;
  try { await caller.auth.adminLogin({ email: "a.krausz@levelupresources.org", password: "hatzlacha", mfaToken: recovery }); }
  catch { reuseRejected = true; }
  ok(reuseRejected, "flag ON: a spent recovery code cannot be reused");

  // Reset flow: user requests, a DIFFERENT admin approves, enrollment clears.
  await caller.compliance.mfa.requestReset();
  await approverCaller.compliance.mfa.approveReset({ userId: (admin as User).id });
  const afterReset = await caller.compliance.mfa.status();
  ok(!afterReset.active, "after an approved reset MFA is inactive (user must re-enroll)");
  // With MFA reset (no active enrollment), the gate can't enforce → login proceeds.
  const loginAfterReset = await caller.auth.adminLogin({ email: "a.krausz@levelupresources.org", password: "hatzlacha" });
  ok(loginAfterReset.success === true, "flag ON but no active enrollment: login proceeds (can't lock out an un-enrolled admin)");
  delete process.env.COMPLIANCE_MFA; // leave enforcement off for any later phases

  console.log("\n══ Phase 12f: session management (revocation, timeouts, reauth) ══");
  // Record two sessions for the worker and prove the enforcement decisions.
  const sidA = randomUUID();
  const sidB = randomUUID();
  await recordSession({ sessionId: sidA, userId: workerId, openId: (worker as User).openId, role: "worker", ip: "10.0.0.1", userAgent: "e2e-A" });
  await recordSession({ sessionId: sidB, userId: workerId, openId: (worker as User).openId, role: "worker", ip: "10.0.0.2", userAgent: "e2e-B" });
  const freshCheck = await enforceSession(sidA);
  ok(freshCheck.ok, "a fresh session passes enforcement");
  const nowT = Date.now();
  const idleCheck = await enforceSession(sidA, nowT + SESSION_IDLE_TIMEOUT_MS + 60_000);
  ok(!idleCheck.ok && idleCheck.reason === "idle", "a session idle past the window is rejected (idle)");
  const expiredCheck = await enforceSession(sidA, nowT + SESSION_ABSOLUTE_TIMEOUT_MS + 60_000);
  ok(!expiredCheck.ok && expiredCheck.reason === "expired", "a session past absolute expiry is rejected (expired)");

  // The worker can list and revoke their OWN session; cross-user revoke is blocked.
  const workerSessions = await workerCaller.compliance.sessions.list();
  ok(workerSessions.length >= 2 && workerSessions.every((s) => "sessionId" in s), "worker lists their own sessions");
  const revokeRes = await workerCaller.compliance.sessions.revoke({ sessionId: sidA });
  ok(revokeRes.revoked, "worker revokes one of their own sessions");
  const afterRevoke = await enforceSession(sidA);
  ok(!afterRevoke.ok && afterRevoke.reason === "revoked", "a revoked session is rejected (revoked)");
  let crossRevokeBlocked = false;
  try { await workerCaller.compliance.sessions.revoke({ sessionId: randomUUID() }); } catch { crossRevokeBlocked = true; }
  ok(crossRevokeBlocked, "revoking an unknown/foreign session is blocked (IDOR-guarded)");

  // Admin forced-logout of the worker terminates the remaining session.
  const forced = await caller.compliance.sessions.revokeForUser({ userId: workerId, reason: "e2e_offboard" });
  ok(forced.count >= 1, "admin forced-logout revokes the worker's remaining session(s)");
  const bCheck = await enforceSession(sidB);
  ok(!bCheck.ok && bCheck.reason === "revoked", "the forced-logout target session is now revoked");

  // Reauth for sensitive actions: stamps the current session; verifiable in-window.
  const sidReauth = randomUUID();
  await recordSession({ sessionId: sidReauth, userId: (admin as User).id, openId: (admin as User).openId, role: "super_admin", ip: "10.0.0.9", userAgent: "e2e-admin" });
  const adminReauthCaller = appRouter.createCaller(ctxFor(admin as User, sidReauth));
  ok(!(await hasRecentReauth(sidReauth)), "no recent reauth before the caller re-authenticates");
  const reauthRes = await adminReauthCaller.compliance.sessions.reauth({ password: "hatzlacha" });
  ok(reauthRes.ok === true, "reauth with the correct password succeeds");
  ok(await hasRecentReauth(sidReauth), "reauth is recorded within the reauth window");
  let badReauthRejected = false;
  try { await adminReauthCaller.compliance.sessions.reauth({ password: "wrong-password" }); } catch { badReauthRejected = true; }
  ok(badReauthRejected, "reauth with a wrong password is rejected");

  console.log("\n══ Phase 12g: break-glass access + notifications ══");
  // The worker activates emergency access; oversight (admins) get notified and
  // the actor gets an advisory notice. Everything is on the audit chain.
  const bgGrant = await workerCaller.compliance.breakGlass.activate({
    reason: "Urgent access needed to resolve a same-day billing discrepancy (e2e).",
    scope: `Client #${submissionId} billing`,
    ttlMinutes: 30,
  });
  ok(bgGrant.isBreakGlass && new Date(bgGrant.expiresAt).getTime() > Date.now(), "break-glass grant is active with a future expiry");
  const bgActive = await workerCaller.compliance.breakGlass.active();
  ok(bgActive.some((g) => g.id === bgGrant.id), "the actor sees their active break-glass grant (banner source)");

  // Oversight notification landed for the admin, tied to this grant.
  const adminNotes = await caller.compliance.notifications.list();
  ok(adminNotes.some((n) => n.category === "break_glass" && n.relatedRecordId === String(bgGrant.id)), "oversight (admin) was notified of the break-glass activation");
  const workerNotes = await workerCaller.compliance.notifications.list();
  ok(workerNotes.some((n) => n.category === "break_glass"), "the actor received an advisory break-glass notice");

  // Oversight can list all break-glass grants for after-the-fact review.
  const bgList = await caller.compliance.breakGlass.list();
  ok(bgList.some((g) => g.id === bgGrant.id), "oversight list includes the grant for review");
  // A non-oversight user cannot list all grants.
  let bgListForbidden = false;
  try { await workerCaller.compliance.breakGlass.list(); } catch { bgListForbidden = true; }
  ok(bgListForbidden, "a non-oversight user cannot list all break-glass grants");

  // Mark-read narrows the unread count.
  const beforeRead = await caller.compliance.notifications.unreadCount();
  const target = adminNotes.find((n) => n.category === "break_glass" && !n.readAt);
  if (target) await caller.compliance.notifications.markRead({ id: target.id });
  const afterRead = await caller.compliance.notifications.unreadCount();
  ok(afterRead < beforeRead, "marking a notification read decreases the unread count");

  // Cross-user IDOR: worker cannot mark the admin's notification read.
  let noteIdorBlocked = false;
  if (target) {
    const res = await workerCaller.compliance.notifications.markRead({ id: target.id });
    noteIdorBlocked = res.ok === false;
  }
  ok(noteIdorBlocked || !target, "a user cannot mark another user's notification read (IDOR-guarded)");

  // Revoke break-glass early; the actor's active set empties.
  const bgRevoke = await workerCaller.compliance.breakGlass.revoke({ grantId: bgGrant.id });
  ok(bgRevoke.revoked, "break-glass access can be revoked early");
  const bgAfter = await workerCaller.compliance.breakGlass.active();
  ok(!bgAfter.some((g) => g.id === bgGrant.id), "the revoked grant is no longer active");

  // High-risk finding escalation: the approver files a critical finding; the
  // admin (oversight, not the author) is notified.
  const critFinding = await approverCaller.compliance.audits.createFinding({ auditId: audit.id, conditionFound: "Critical control gap (e2e)", risk: "critical" });
  const adminNotes2 = await caller.compliance.notifications.list();
  ok(adminNotes2.some((n) => n.category === "finding" && n.relatedRecordId === String(critFinding.id)), "a critical finding escalates a notification to oversight");

  console.log("\n══ Phase 12h: durable job queue + worker ══");
  // Clear any backlog from earlier runs so this run's assertions are exact.
  await drainQueue(500);
  // Enqueue real jobs and drain them through the worker's handler registry.
  const idemKey = `readiness-${submissionId}-${run}`;
  const enq1 = await enqueueJob({ jobType: "readiness_recalc", payload: { submissionId }, idempotencyKey: idemKey });
  ok(enq1.enqueued, "a readiness_recalc job is enqueued");
  const enq2 = await enqueueJob({ jobType: "readiness_recalc", payload: { submissionId }, idempotencyKey: idemKey });
  ok(!enq2.enqueued, "a duplicate enqueue with the same idempotency key is ignored");
  // Also enqueue an audit-integrity verification job (chain is intact → succeeds).
  await enqueueJob({ jobType: "audit_integrity_verification", idempotencyKey: `integrity-${run}` });

  const drained = await drainQueue(50);
  ok(drained.processed >= 2 && drained.failed === 0, `worker drained ${drained.processed} job(s) with no failures`);
  ok(drained.succeeded >= 2, "the readiness + integrity jobs both succeeded");

  // Oversight can read queue stats and drive a drain; a worker cannot.
  const stats = await caller.compliance.jobs.stats();
  ok(typeof stats === "object" && (stats.succeeded ?? 0) >= 2, "job stats report succeeded jobs");
  const manualDrain = await caller.compliance.jobs.drain({ max: 10 });
  ok(manualDrain.processed === 0, "a second drain finds the queue already empty");
  let jobsForbidden = false;
  try { await workerCaller.compliance.jobs.stats(); } catch { jobsForbidden = true; }
  ok(jobsForbidden, "a non-oversight user cannot read the job queue stats");

  console.log("\n══ Phase 12i: formData normalization + reconciliation ══");
  // A submission whose structured lastName DISAGREES with its formData payload.
  const mmSub = await db.insert(submissions).values({
    referenceNumber: `E2EMM-${run}`.slice(0, 16),
    firstName: "Norm", lastName: "ColumnName",
    email: `norm+${run}@example.com`, cellPhone: "5551234567",
    medicaidId: `MM${run}`.slice(0, 32), supermarket: "Test Market",
    formData: { firstName: "Norm", lastName: "FormDataName", medicaidId: `MM${run}`.slice(0, 32) },
    hipaaConsentAt: new Date(),
  }).$returningId();
  const mmId = mmSub[0].id;

  const bf1 = await caller.compliance.normalization.backfill();
  ok(bf1.scanned >= 1 && bf1.upserted >= 1, `backfill projected ${bf1.upserted} submission(s)`);
  ok(bf1.mismatches >= 1, "backfill detected at least one column/formData mismatch");

  const recon = await caller.compliance.normalization.reconciliation();
  const mmRow = recon.find((r) => r.submissionId === mmId);
  ok(!!mmRow && mmRow.mismatchFlags.includes("lastName"), "reconciliation flags the lastName mismatch for this client");

  const nstats = await caller.compliance.normalization.stats();
  ok(nstats.normalized >= 1 && nstats.withMismatches >= 1 && nstats.totalSubmissions >= nstats.normalized, "normalization stats report coverage + mismatches");

  // Idempotency: a second backfill with nothing changed upserts nothing.
  const bf2 = await caller.compliance.normalization.backfill();
  ok(bf2.upserted === 0 && bf2.skipped === bf2.scanned, "backfill is idempotent (unchanged rows are skipped)");

  // The reconciliation report surfaces the same mismatch, permission-gated.
  const reconReport = await caller.compliance.reports.run({ key: "formdata_reconciliation" });
  ok(reconReport.rows.some((r) => r.clientId === mmId), "the formdata_reconciliation report lists the mismatched client");

  // A worker (COMPLIANCE_VIEW) can read stats but cannot run the backfill.
  const workerStats = await workerCaller.compliance.normalization.stats();
  ok(typeof workerStats.normalized === "number", "a viewer can read normalization stats");
  let backfillForbidden = false;
  try { await workerCaller.compliance.normalization.backfill(); } catch { backfillForbidden = true; }
  ok(backfillForbidden, "a viewer cannot run the backfill (COMPLIANCE_MANAGE required)");

  console.log("\n══ Phase 12j: client audit folder (unified documents) ══");
  // Seed one document from each real source for this client.
  await db.insert(documents).values({
    submissionId, name: "Consent form.pdf", category: "consent",
    url: "https://example.com/consent.pdf", fileKey: `documents/consent-${run}.pdf`, mimeType: "application/pdf",
  });
  // An intake-embedded file inside the submission's formData.
  await db.update(submissions).set({
    formData: { source: "e2e", uploadedDocuments: { medicaidCard: { url: "https://example.com/mc.jpg", key: `documents/mc-${run}.jpg` } } },
  }).where(eq(submissions.id, submissionId));
  // Compliance evidence: a standard doc, a quarantined doc (excluded), a privileged doc.
  await db.insert(complianceDocuments).values({ submissionId, objectKey: `compliance/std-${run}.pdf`, originalFilename: "Eligibility proof.pdf", scanStatus: "passed", confidentiality: "standard", recordStatus: "active" });
  await db.insert(complianceDocuments).values({ submissionId, objectKey: `compliance/quar-${run}.pdf`, originalFilename: "Unscanned.pdf", scanStatus: "quarantined", confidentiality: "standard", recordStatus: "active" });
  await db.insert(complianceDocuments).values({ submissionId, objectKey: `compliance/priv-${run}.pdf`, originalFilename: "Attorney memo.pdf", scanStatus: "passed", confidentiality: "attorney_client_privileged", recordStatus: "active" });

  const folder = await caller.compliance.folder.list({ submissionId });
  const names = folder.documents.map((d) => d.name);
  ok(folder.counts.total >= 4, `folder gathered ${folder.counts.total} documents from all sources`);
  ok(names.includes("Consent form.pdf"), "folder includes the legacy admin document");
  ok(folder.documents.some((d) => d.source === "application"), "folder includes the intake formData file");
  ok(names.includes("Eligibility proof.pdf"), "folder includes the standard compliance evidence");
  ok(names.includes("Attorney memo.pdf"), "admin (PRIVILEGED_VIEW) sees the privileged document");
  ok(!names.includes("Unscanned.pdf"), "a quarantined document is excluded from the folder");

  // A worker lacks PRIVILEGED_VIEW → the privileged doc is filtered server-side.
  const workerFolder = await workerCaller.compliance.folder.list({ submissionId });
  const workerNames = workerFolder.documents.map((d) => d.name);
  ok(workerNames.includes("Eligibility proof.pdf"), "worker sees standard documents");
  ok(!workerNames.includes("Attorney memo.pdf"), "worker (no PRIVILEGED_VIEW) cannot see the privileged document");

  // Documents are scoped to the client — another client's folder does not leak them.
  const otherFolder = await caller.compliance.folder.list({ submissionId: otherSub[0].id });
  ok(!otherFolder.documents.some((d) => d.name === "Consent form.pdf"), "documents are scoped to their own client (no cross-client leak)");

  console.log("\n══ Phase 12k: vendor portal + weekly proof-of-delivery ══");
  // Two delivery-vendor orgs.
  const vendorOrg = (await db.insert(organizations).values({ name: `E2E Vendor ${run}`, kind: "delivery_vendor" }).$returningId())[0].id;
  const otherVendorOrg = (await db.insert(organizations).values({ name: `E2E Vendor2 ${run}`, kind: "delivery_vendor" }).$returningId())[0].id;
  // A vendor user belonging to vendorOrg.
  const vendorEmail = `e2e-vendor+${run}@example.com`;
  const vendorUserId = await createStaffUser({ email: vendorEmail, name: "E2E Vendor User", passwordHash: null, role: "worker", permissions: {} });
  await db.update(usersTable).set({ orgId: vendorOrg }).where(eq(usersTable.id, vendorUserId));
  const vendorUser = await getUserByEmail(vendorEmail);
  ok(!!vendorUser && vendorUser.orgId === vendorOrg, "vendor user created and bound to the vendor org");

  // Three clients: active+unassigned, active+assigned-elsewhere, and inactive.
  const mkClient = async (suffix: string, stage: string, assigned: number | null) =>
    (await db.insert(submissions).values({
      referenceNumber: `V${suffix}-${run}`.slice(0, 16), firstName: "Active", lastName: suffix,
      email: `v${suffix}+${run}@example.com`, cellPhone: "5550000009", medicaidId: `V${suffix}${run}`.slice(0, 32),
      supermarket: "M", formData: {}, hipaaConsentAt: new Date(), stage: stage as "level_2_active", assignedVendorOrgId: assigned,
    }).$returningId())[0].id;
  const activeA = await mkClient("A", "level_2_active", null);
  const activeB = await mkClient("B", "level_2_active", otherVendorOrg);
  const inactiveC = await mkClient("C", "referral", null);

  const weekOf = isoWeekStart(new Date());
  const vendorCaller = appRouter.createCaller(ctxFor(vendorUser as User));

  // Flag OFF → the portal is closed.
  delete process.env.COMPLIANCE_VENDOR_PORTAL;
  let portalClosed = false;
  try { await vendorCaller.compliance.vendor.myVendor(); } catch { portalClosed = true; }
  ok(portalClosed, "flag OFF: the vendor portal is closed");

  // Flag ON.
  process.env.COMPLIANCE_VENDOR_PORTAL = "1";
  const myVendor = await vendorCaller.compliance.vendor.myVendor();
  ok(myVendor.id === vendorOrg, "vendor sees their own org");
  ok((await caller.auth.me())?.orgKind == null, "an internal admin has no vendor orgKind");
  ok((await vendorCaller.auth.me())?.orgKind === "delivery_vendor", "the vendor account reports orgKind=delivery_vendor (drives portal routing)");

  const week = await vendorCaller.compliance.vendor.weeklyClients({ weekOf });
  const weekIds = week.map((c) => c.submissionId);
  ok(weekIds.includes(activeA), "weekly list includes an active, unassigned client");
  ok(!weekIds.includes(activeB), "weekly list excludes a client assigned to another vendor");
  ok(!weekIds.includes(inactiveC), "weekly list excludes a non-active client");
  ok(week.find((c) => c.submissionId === activeA)?.pod == null, "no proof on file yet for the active client");
  // Minimal-info guarantee: no medicaid/eligibility fields leak into the vendor view.
  ok(!("medicaidId" in (week[0] ?? {})) && !("email" in (week[0] ?? {})), "vendor client rows carry no PHI beyond name + location");

  const sub1 = await vendorCaller.compliance.vendor.submitPod({ submissionId: activeA, weekOf, podUrl: "https://example.com/pod/a-week1.jpg", podMethod: "photo" });
  ok(sub1.created, "vendor submits a proof-of-delivery link for the week");
  const week2 = await vendorCaller.compliance.vendor.weeklyClients({ weekOf });
  ok(week2.find((c) => c.submissionId === activeA)?.pod?.podUrl?.includes("a-week1"), "the submitted PoD is now shown on the weekly list");

  const sub2 = await vendorCaller.compliance.vendor.submitPod({ submissionId: activeA, weekOf, podUrl: "https://example.com/pod/a-week1-v2.jpg" });
  ok(!sub2.created, "re-submitting the same client+week replaces (does not duplicate) the proof");
  const podCount = await db.select().from(vendorPods).where(and(eq(vendorPods.submissionId, activeA), eq(vendorPods.vendorOrgId, vendorOrg), eq(vendorPods.weekOf, weekOf)));
  ok(podCount.length === 1, "exactly one PoD row exists per client per vendor per week (idempotent)");

  let notDeliverable = false;
  try { await vendorCaller.compliance.vendor.submitPod({ submissionId: activeB, weekOf, podUrl: "https://example.com/pod/b.jpg" }); } catch { notDeliverable = true; }
  ok(notDeliverable, "a vendor cannot submit proof for a client on another vendor's list");
  delete process.env.COMPLIANCE_VENDOR_PORTAL;

  console.log("\n══ Phase 12l: weekly PoD in the folder + reports ══");
  const weekOfStr = weekOf.toISOString().slice(0, 10);
  // activeA has proof for the current week; earlier weeks should flag missing.
  const weeklyA = await caller.compliance.folder.weeklyPod({ submissionId: activeA });
  const thisWeekA = weeklyA.find((w) => w.weekOf === weekOfStr);
  ok(!!thisWeekA && !thisWeekA.missing && !!thisWeekA.podUrl, "current week shows the vendor's proof (not missing)");
  ok(weeklyA.some((w) => w.missing), "an earlier week with no proof is flagged missing for an active client");
  // Inactive client: weeks are shown but never flagged missing (no delivery obligation).
  const weeklyC = await caller.compliance.folder.weeklyPod({ submissionId: inactiveC });
  ok(weeklyC.every((w) => !w.missing), "a non-active client is never flagged as missing proof");

  // Reports.
  const podReport = await caller.compliance.reports.run({ key: "weekly_pod" });
  ok(podReport.rows.some((r) => r.clientId === activeA), "the weekly_pod report logs the submitted proof");
  const missingReport = await caller.compliance.reports.run({ key: "missing_pod" });
  ok(missingReport.rows.some((r) => r.clientId === activeB), "the missing_pod report lists an active client with no recent proof");
  ok(!missingReport.rows.some((r) => r.clientId === inactiveC), "the missing_pod report excludes non-active clients");

  console.log("\n══ Phase 12m: downloadable audit folder (PDF + ZIP) ══");
  // PDF dossier via tRPC (admin holds EXPORT).
  const folderPdf = await caller.compliance.folder.generatePdf({ submissionId });
  ok(folderPdf.filename.endsWith(".pdf"), "client folder PDF has a .pdf filename");
  const fpdf = Buffer.from(folderPdf.pdfBase64, "base64");
  ok(fpdf.length > 500 && fpdf.subarray(0, 5).toString() === "%PDF-", "client folder is a real PDF (magic %PDF-)");
  ok(/^[0-9a-f]{64}$/.test(folderPdf.manifest.contentChecksum) && /^[0-9a-f]{64}$/.test(folderPdf.manifest.pdfChecksum ?? ""), "PDF manifest carries content + pdf checksums");
  ok(folderPdf.manifest.counts.documents >= 4, "PDF manifest counts this client's documents");

  // A worker without EXPORT cannot generate the download.
  let pdfForbidden = false;
  try { await workerCaller.compliance.folder.generatePdf({ submissionId }); } catch { pdfForbidden = true; }
  ok(pdfForbidden, "a user without EXPORT cannot generate the folder download (server-enforced)");

  // ZIP of the actual files (files unfetchable without storage → listed as unavailable,
  // but the archive is still valid and contains the dossier + index + manifest).
  const zip = await generateClientFolderZip(submissionId, { includePrivileged: true });
  ok(zip.filename.endsWith(".zip"), "client folder ZIP has a .zip filename");
  const entries = unzipSync(zip.zipBytes);
  const entryNames = Object.keys(entries);
  ok(entryNames.includes("audit-folder.pdf"), "ZIP contains the PDF dossier");
  ok(entryNames.includes("index.csv") && entryNames.includes("manifest.json"), "ZIP contains an index and a manifest");
  ok(Buffer.from(entries["audit-folder.pdf"]).subarray(0, 5).toString() === "%PDF-", "the ZIP's embedded dossier is a real PDF");
  const manifestJson = JSON.parse(strFromU8(entries["manifest.json"]));
  ok(manifestJson.submissionId === submissionId && /^[0-9a-f]{64}$/.test(manifestJson.contentChecksum), "ZIP manifest.json is well-formed and checksummed");
  ok(strFromU8(entries["index.csv"]).startsWith("index,name,source"), "ZIP index.csv has the expected header");
  ok(zip.included + zip.unavailable >= 4, "ZIP index accounts for every document (included or unavailable)");

  console.log("\n══ Phase 13: audit-chain integrity ══");
  const chain = await loadAuditChain(db);
  const verify = verifyAuditChain(chain);
  ok(verify.ok, `audit hash chain intact across ${verify.count} events (no tampering)`);

  console.log(`\n════════════════════════════════════════`);
  console.log(`✅ E2E PASSED — ${passed} assertions, ${verify.count} audit events, run ${run}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("\n❌ E2E FAILED:", err?.message ?? err);
  console.error(err?.stack ?? "");
  process.exit(1);
});
