/**
 * FreshSelect Meals — Safe-Mode Load Test Script
 *
 * GUARDRAILS:
 *  1. All test medicaidIds use the prefix ZZ (format ZZnnnnnA) — clearly fake, never real clients
 *  2. try/finally guarantees cleanup: DELETE WHERE medicaidId LIKE 'ZZ%' always runs
 *  3. Email suppression: _skipEmail: true is passed in all payloads (server checks this flag)
 *  4. Targets LOCAL dev server only (http://localhost:3000)
 *
 * Run with: node scripts/stress-test.mjs
 */

import mysql from "mysql2/promise";

const BASE_URL = "http://localhost:3000";
const TRPC_URL = `${BASE_URL}/api/trpc/submission.submit`;
const TEST_PREFIX = "ZZ"; // All test medicaidIds start with ZZ

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a valid tRPC batch request body for submission.submit */
function buildPayload(medicaidId, suffix = "") {
  return {
    "0": {
      json: {
        neighborhood: "Williamsburg",
        supermarket: "Foodoo Kosher",
        firstName: "LoadTest",
        lastName: `User${suffix}`,
        dateOfBirth: "1990-01-01",
        medicaidId,
        cellPhone: "7185550000",
        homePhone: "",
        email: "loadtest@example.invalid",
        streetAddress: "123 Test St",
        aptUnit: "",
        city: "Brooklyn",
        state: "NY",
        zipcode: "11206",
        healthCategories: ["Diabetes"],
        dueDate: "",
        miscarriageDate: "",
        infantName: "",
        infantDateOfBirth: "",
        infantMedicaidId: "",
        employed: "No",
        spouseEmployed: "No",
        hasWic: "No",
        hasSnap: "No",
        foodAllergies: "No",
        foodAllergiesDetails: "",
        dietaryRestrictions: "",
        newApplicant: "Yes",
        transferAgencyName: "",
        additionalMembersCount: "0",
        householdMembers: [],
        mealFocus: [],
        breakfastItems: "",
        lunchItems: "",
        dinnerItems: "",
        snackItems: "",
        needsRefrigerator: "No",
        needsMicrowave: "No",
        needsCookingUtensils: "No",
        hipaaConsent: true,
        guardianName: "LoadTest Guardian",
        signatureDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        screeningQuestions: {
          livingSituation: "Stable",
          utilityShutoff: "No",
          receivesSnap: "No",
          receivesWic: "No",
          receivesTanf: "No",
          enrolledHealthHome: "No",
          householdMembersCount: "1",
          householdMembersWithMedicaid: "1",
          needsWorkAssistance: "No",
          wantsSchoolHelp: "No",
          transportationBarrier: "No",
          hasChronicIllness: "Yes",
          otherHealthIssues: "None",
          medicationsRequireRefrigeration: "No",
          pregnantOrPostpartum: "No",
          breastmilkRefrigeration: "No",
        },
        uploadedDocuments: {},
        // Email suppression flag — server skips Resend calls when this is true
        _skipEmail: true,
        // Note: ref is omitted (optional field — passing null causes Zod validation failure)
      },
    },
  };
}

/** Fire a single submission request, return { status, body, ms } */
async function submit(medicaidId, suffix = "", extraHeaders = {}, ip = "127.0.0.1") {
  const start = Date.now();
  try {
    const res = await fetch(TRPC_URL + "?batch=1", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": ip,
        ...extraHeaders,
      },
      body: JSON.stringify(buildPayload(medicaidId, suffix)),
    });
    const ms = Date.now() - start;
    const body = await res.json();
    const result = body?.[0]?.result?.data?.json;
    // tRPC batch errors are at body[0].error.json or body[0].error
    const rawError = body?.[0]?.error;
    const errorMsg = rawError?.json?.message || rawError?.message || null;
    const error = rawError ? { message: errorMsg, json: rawError?.json, raw: rawError } : null;
    return { status: res.status, ms, result, error, raw: body };
  } catch (err) {
    return { status: 0, ms: Date.now() - start, error: { message: err.message } };
  }
}

/** Direct DB cleanup — deletes all rows with medicaidId LIKE 'ZZ%' */
async function cleanupTestData(conn) {
  const [result] = await conn.execute("DELETE FROM submissions WHERE medicaidId LIKE 'ZZ%'");
  return result.affectedRows;
}

/** Generate a test medicaidId: ZZnnnnnA (e.g. ZZ00001A) */
function testId(n) {
  return `ZZ${String(n).padStart(5, "0")}A`;
}

// ── Main ─────────────────────────────────────────────────────────────────────

const conn = await mysql.createConnection(process.env.DATABASE_URL);
console.log("✓ DB connection established\n");
console.log("=".repeat(60));
console.log("  FreshSelect Meals — Safe-Mode Load Test");
console.log("=".repeat(60));
console.log(`  Target: ${TRPC_URL}`);
console.log(`  Test ID prefix: ${TEST_PREFIX}nnnnnA (e.g. ZZ00001A)`);
console.log(`  Email suppression: _skipEmail: true in all payloads`);
console.log(`  Cleanup: DELETE WHERE medicaidId LIKE 'ZZ%' in finally block`);
console.log("=".repeat(60) + "\n");

// Pre-flight: ensure no leftover test data from a previous run
const preClean = await cleanupTestData(conn);
if (preClean > 0) console.log(`⚠  Pre-flight cleanup removed ${preClean} leftover test row(s)\n`);

const results = {};

try {
  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: Concurrency Blast — 100 simultaneous submissions
  // ──────────────────────────────────────────────────────────────────────────
  console.log("TEST 1: Concurrency Blast (100 simultaneous submissions)");
  console.log("-".repeat(60));

  // Each request uses a unique IP so the rate limiter (20/IP/15min) doesn't interfere
  const t1Start = Date.now();
  const t1Promises = Array.from({ length: 100 }, (_, i) =>
    submit(testId(i + 1), i + 1, {}, `10.1.${Math.floor(i/255)}.${i % 255 + 1}`)
  );
  const t1Responses = await Promise.all(t1Promises);
  const t1Duration = Date.now() - t1Start;

  const t1Success = t1Responses.filter((r) => r.status === 200 && r.result?.referenceNumber).length;
  const t1Errors = t1Responses.filter((r) => r.status !== 200 || !r.result?.referenceNumber);
  const t1ConnErrors = t1Errors.filter((r) => r.error?.message?.includes("connect") || r.error?.message?.includes("timeout") || r.status === 0);
  const t1Times = t1Responses.map((r) => r.ms);
  const t1Avg = Math.round(t1Times.reduce((a, b) => a + b, 0) / t1Times.length);
  const t1Max = Math.max(...t1Times);
  const t1Min = Math.min(...t1Times);

  results.test1 = { success: t1Success, errors: t1Errors.length, connErrors: t1ConnErrors.length, avgMs: t1Avg, maxMs: t1Max, minMs: t1Min, totalMs: t1Duration };

  console.log(`  ✓ Successful inserts:     ${t1Success} / 100`);
  console.log(`  ✗ Errors (non-success):   ${t1Errors.length}`);
  console.log(`  ✗ Connection/timeout err: ${t1ConnErrors.length}`);
  console.log(`  ⏱  Response times:        min=${t1Min}ms  avg=${t1Avg}ms  max=${t1Max}ms`);
  console.log(`  ⏱  Total wall-clock time: ${t1Duration}ms`);
  if (t1Errors.length > 0) {
    console.log("\n  Error breakdown:");
    const errGroups = {};
    t1Errors.forEach((r) => {
      const key = r.error?.message || r.error?.json?.message || `HTTP ${r.status}`;
      errGroups[key] = (errGroups[key] || 0) + 1;
    });
    Object.entries(errGroups).forEach(([k, v]) => console.log(`    ${v}x — ${k}`));
  }
  console.log();

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2: Duplicate Race Condition — 20 requests with the same medicaidId
  // ──────────────────────────────────────────────────────────────────────────
  console.log("TEST 2: Duplicate Race Condition (20 concurrent, same medicaidId)");
  console.log("-".repeat(60));

  const DUPE_ID = testId(999); // ZZ00999A — dedicated duplicate test ID

  // Use a dedicated IP range for the duplicate test so rate limiter doesn't interfere
  const t2Start = Date.now();
  const t2Promises = Array.from({ length: 20 }, (_, i) =>
    submit(DUPE_ID, `dupe-${i}`, {}, `10.2.0.${i + 1}`)
  );
  const t2Responses = await Promise.all(t2Promises);
  const t2Duration = Date.now() - t2Start;

  const t2Success = t2Responses.filter((r) => r.status === 200 && r.result?.referenceNumber).length;
  const t2Duplicate = t2Responses.filter((r) => {
    const msg = r.error?.json?.message || r.error?.message || "";
    return msg.startsWith("DUPLICATE:");
  }).length;
  const t2Other = t2Responses.filter((r) => {
    const msg = r.error?.json?.message || r.error?.message || "";
    return r.status !== 200 && !msg.startsWith("DUPLICATE:");
  }).length;

  results.test2 = { success: t2Success, duplicates: t2Duplicate, otherErrors: t2Other, totalMs: t2Duration };

  const t2Pass = t2Success === 1 && t2Duplicate === 19;
  console.log(`  ${t2Pass ? "✓ PASS" : "✗ FAIL"}`);
  console.log(`  Accepted (200 success):   ${t2Success}  (expected: 1)`);
  console.log(`  DUPLICATE: errors:        ${t2Duplicate}  (expected: 19)`);
  console.log(`  Other errors:             ${t2Other}  (expected: 0)`);
  console.log(`  ⏱  Total wall-clock time: ${t2Duration}ms`);
  if (!t2Pass) {
    console.log("\n  ⚠  UNEXPECTED RESULTS — raw error messages:");
    t2Responses.filter((r) => r.status !== 200).slice(0, 5).forEach((r, i) => {
      console.log(`    [${i}] status=${r.status} msg=${r.error?.json?.message || r.error?.message || JSON.stringify(r.raw)}`);
    });
  }
  console.log();

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3: Rate Limiter — 25 sequential requests from the same IP
  // ──────────────────────────────────────────────────────────────────────────
  console.log("TEST 3: Rate Limiter (25 sequential requests, same IP)");
  console.log("-".repeat(60));
  console.log("  (Sequential to ensure the limiter counts correctly)");

  // Use a timestamp-derived IP so each test run starts with a fresh rate limit window
  const t3Ip = `10.3.${Math.floor(Date.now() / 1000) % 255}.${Math.floor(Math.random() * 254) + 1}`;
  console.log(`  Using IP: ${t3Ip} (fresh per run to avoid window carryover)`);
  const t3Results = [];
  for (let i = 0; i < 25; i++) {
    // Use unique medicaidIds so only the rate limiter — not the UNIQUE index — blocks requests
    const r = await submit(testId(200 + i), `rl-${i}`, {}, t3Ip);
    t3Results.push({ n: i + 1, status: r.status, ms: r.ms, msg: r.error?.json?.message || r.error?.message || "ok" });
  }

  const t3Accepted = t3Results.filter((r) => r.status === 200).length;
  const t3RateLimited = t3Results.filter((r) => r.status === 429).length;
  const t3Other = t3Results.filter((r) => r.status !== 200 && r.status !== 429).length;
  const t3Pass = t3Accepted === 20 && t3RateLimited === 5;

  results.test3 = { accepted: t3Accepted, rateLimited: t3RateLimited, other: t3Other };

  console.log(`  ${t3Pass ? "✓ PASS" : "✗ FAIL"}`);
  console.log(`  Accepted (200):           ${t3Accepted}  (expected: 20)`);
  console.log(`  Rate limited (429):       ${t3RateLimited}  (expected: 5)`);
  console.log(`  Other errors:             ${t3Other}  (expected: 0)`);
  console.log("\n  Per-request breakdown:");
  t3Results.forEach((r) => {
    const icon = r.status === 200 ? "✓" : r.status === 429 ? "🚫" : "✗";
    console.log(`    [${String(r.n).padStart(2)}] ${icon} HTTP ${r.status}  ${r.ms}ms  ${r.msg !== "ok" ? r.msg.substring(0, 60) : ""}`);
  });
  console.log();

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4: Background Task Survival
  // ──────────────────────────────────────────────────────────────────────────
  console.log("TEST 4: Background Task Survival");
  console.log("-".repeat(60));
  console.log("  Submitting 5 requests and waiting 3s for background tasks to log...");

  // Submit 5 unique requests
  const t4Ids = [testId(500), testId(501), testId(502), testId(503), testId(504)];
  const t4Responses = await Promise.all(t4Ids.map((id, i) => submit(id, `bg-${i}`, {}, `10.4.0.${i + 1}`)));
  const t4Success = t4Responses.filter((r) => r.status === 200).length;

  // Wait 3 seconds for setTimeout(0) background tasks to fire and log
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Check server logs for background task evidence
  const { execSync } = await import("child_process");
  let bgLogs = "";
  try {
    bgLogs = execSync(
      `grep -E "\\[Email\\]|\\[PDF\\]|\\[Referral\\]|\\[Submission\\]" /home/ubuntu/freshselect-meals/.manus-logs/devserver.log 2>/dev/null | tail -30`,
      { encoding: "utf8" }
    );
  } catch (_) {
    bgLogs = "(could not read devserver.log)";
  }

  results.test4 = { submitted: t4Success, bgLogsFound: bgLogs.length > 0 };

  console.log(`  Submissions fired:        ${t4Success} / 5`);
  console.log(`  Background task logs:`);
  if (bgLogs.trim()) {
    bgLogs.trim().split("\n").slice(-15).forEach((line) => {
      // Strip the timestamp prefix for readability
      const clean = line.replace(/^\[.*?\]\s*/, "").substring(0, 120);
      console.log(`    ${clean}`);
    });
  } else {
    console.log("    (no background task log entries found)");
  }
  console.log();

} finally {
  // ──────────────────────────────────────────────────────────────────────────
  // GUARANTEED CLEANUP — always runs, even if the script crashes
  // ──────────────────────────────────────────────────────────────────────────
  console.log("=".repeat(60));
  console.log("CLEANUP (finally block)");
  console.log("-".repeat(60));
  try {
    const deleted = await cleanupTestData(conn);
    console.log(`  ✓ Deleted ${deleted} test row(s) from submissions (WHERE medicaidId LIKE 'ZZ%')`);
  } catch (err) {
    console.error(`  ✗ CLEANUP FAILED: ${err.message}`);
    console.error("  ⚠  MANUAL CLEANUP REQUIRED: DELETE FROM submissions WHERE medicaidId LIKE 'ZZ%'");
  }
  await conn.end();
  console.log("  ✓ DB connection closed\n");

  // ──────────────────────────────────────────────────────────────────────────
  // SUMMARY
  // ──────────────────────────────────────────────────────────────────────────
  console.log("=".repeat(60));
  console.log("FINAL SUMMARY");
  console.log("=".repeat(60));
  if (results.test1) {
    const t1Pass = results.test1.success === 100 && results.test1.connErrors === 0;
    console.log(`  Test 1 — Concurrency Blast:       ${t1Pass ? "✓ PASS" : "✗ FAIL"}  (${results.test1.success}/100 ok, ${results.test1.connErrors} conn errors, avg ${results.test1.avgMs}ms)`);
  }
  if (results.test2) {
    const t2Pass = results.test2.success === 1 && results.test2.duplicates === 19;
    console.log(`  Test 2 — Duplicate Race:          ${t2Pass ? "✓ PASS" : "✗ FAIL"}  (${results.test2.success} accepted, ${results.test2.duplicates} DUPLICATE errors)`);
  }
  if (results.test3) {
    const t3Pass = results.test3.accepted === 20 && results.test3.rateLimited === 5;
    console.log(`  Test 3 — Rate Limiter:            ${t3Pass ? "✓ PASS" : "✗ FAIL"}  (${results.test3.accepted} accepted, ${results.test3.rateLimited} rate-limited)`);
  }
  if (results.test4) {
    console.log(`  Test 4 — Background Tasks:        ${results.test4.bgLogsFound ? "✓ PASS" : "⚠  CHECK"} (${results.test4.submitted}/5 submitted, logs ${results.test4.bgLogsFound ? "found" : "not found"})`);
  }
  console.log("=".repeat(60));
}
