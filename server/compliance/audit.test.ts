/**
 * Audit hash-chain: compute, verify, and TAMPER DETECTION.
 * Satisfies "Audit events are tamper-evident" and "Audit-event tampering" tests.
 */
import { describe, it, expect } from "vitest";
import { canonicalizeEvent, computeEventHash, verifyAuditChain, stableStringify } from "./audit";
import type { AuditEvent } from "../../drizzle/schema";

function makeEvent(partial: Partial<AuditEvent>, prevHash: string | null): AuditEvent {
  const createdAt = new Date("2026-01-01T00:00:00.000Z");
  const base: AuditEvent = {
    id: partial.id ?? 1,
    actorId: partial.actorId ?? 10,
    actorName: partial.actorName ?? "Alice",
    originalActorId: partial.originalActorId ?? null,
    actorRole: partial.actorRole ?? "admin",
    orgId: partial.orgId ?? null,
    action: partial.action ?? "test_action",
    recordType: partial.recordType ?? "widget",
    recordId: partial.recordId ?? "1",
    clientId: partial.clientId ?? 5,
    prevValue: partial.prevValue ?? null,
    newValue: partial.newValue ?? { a: 1 },
    reason: partial.reason ?? null,
    approvalId: partial.approvalId ?? null,
    requestId: partial.requestId ?? null,
    sessionId: partial.sessionId ?? null,
    correlationId: partial.correlationId ?? null,
    ip: partial.ip ?? null,
    userAgent: partial.userAgent ?? null,
    success: partial.success ?? true,
    prevHash,
    hash: "",
    createdAt: partial.createdAt ?? createdAt,
  };
  const canonical = canonicalizeEvent(base, base.createdAt.toISOString());
  base.hash = computeEventHash(canonical, prevHash);
  return base;
}

function buildChain(n: number): AuditEvent[] {
  const events: AuditEvent[] = [];
  let prev: string | null = null;
  for (let i = 1; i <= n; i++) {
    const e = makeEvent({ id: i, action: `action_${i}`, newValue: { step: i } }, prev);
    events.push(e);
    prev = e.hash;
  }
  return events;
}

describe("audit hash chain", () => {
  it("stableStringify sorts keys deterministically", () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
  });

  it("verifies an intact chain", () => {
    const chain = buildChain(5);
    const result = verifyAuditChain(chain);
    expect(result.ok).toBe(true);
    expect(result.count).toBe(5);
    expect(result.brokenAtId).toBeNull();
  });

  it("detects a tampered field (hash mismatch)", () => {
    const chain = buildChain(5);
    // Tamper with the 3rd event's newValue WITHOUT recomputing its hash.
    chain[2] = { ...chain[2], newValue: { step: 999 } };
    const result = verifyAuditChain(chain);
    expect(result.ok).toBe(false);
    expect(result.brokenAtId).toBe(3);
    expect(result.reason).toBe("hash_mismatch");
  });

  it("detects a deleted row (prevHash linkage breaks)", () => {
    const chain = buildChain(5);
    chain.splice(2, 1); // remove the 3rd event
    const result = verifyAuditChain(chain);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("prevHash_mismatch");
  });

  it("detects re-signing a single row without re-chaining successors", () => {
    const chain = buildChain(4);
    // Attacker edits event 2 AND recomputes its own hash, but later rows still
    // point at the OLD hash → chain breaks at event 3.
    const tampered = makeEvent({ ...chain[1], newValue: { step: 42 } }, chain[1].prevHash);
    chain[1] = tampered;
    const result = verifyAuditChain(chain);
    expect(result.ok).toBe(false);
    expect(result.brokenAtId).toBe(3);
  });

  it("hash depends on prevHash (same payload, different chain position → different hash)", () => {
    const canonical = canonicalizeEvent({ action: "x", recordType: "y" }, "2026-01-01T00:00:00.000Z");
    expect(computeEventHash(canonical, null)).not.toBe(computeEventHash(canonical, "abc"));
  });

  it("attribution/forensic fields are tamper-evident (actorName, ip, sessionId)", () => {
    const chain = buildChain(4);
    // actorName is covered by the hash → editing it breaks verification.
    const nameTampered = chain.map((e, i) => (i === 1 ? { ...e, actorName: "Mallory" } : e));
    expect(verifyAuditChain(nameTampered).ok).toBe(false);
    // ip is covered too.
    const ipTampered = chain.map((e, i) => (i === 2 ? { ...e, ip: "10.0.0.9" } : e));
    expect(verifyAuditChain(ipTampered).ok).toBe(false);
    // sessionId is covered too.
    const sessionTampered = chain.map((e, i) => (i === 0 ? { ...e, sessionId: "forged" } : e));
    expect(verifyAuditChain(sessionTampered).ok).toBe(false);
  });
});
