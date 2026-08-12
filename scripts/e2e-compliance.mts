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

import { eq } from "drizzle-orm";
import { appRouter } from "../server/routers";
import { getDb, getUserByEmail, createStaffUser } from "../server/db";
import {
  submissions, serviceAuthorizations, complianceReadiness, auditFindings,
} from "../drizzle/schema";
import { loadAuditChain, verifyAuditChain } from "../server/compliance/audit";
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
function ctxFor(user: User) {
  return {
    user,
    req: { headers: { cookie: "", "user-agent": "e2e" }, ip: "127.0.0.1", socket: { remoteAddress: "127.0.0.1" } },
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

  const caller = appRouter.createCaller(ctxFor(admin as User));
  const approverCaller = appRouter.createCaller(ctxFor(approver as User));

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
