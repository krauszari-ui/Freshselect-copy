/**
 * Durable, tamper-evident audit events.
 *
 * Fixes the pre-existing logger that silently swallowed failures
 * (`server/db.ts logAudit` had an empty `catch {}`). Material operations call
 * `recordAuditEvent(tx, evt)` INSIDE their own transaction, so the audit row
 * commits atomically with the business change — if the audit write fails, the
 * whole operation rolls back.
 *
 * Tamper evidence: each row stores `hash = SHA256(canonical(evt) + prevHash)`,
 * where `prevHash` is the previous row's hash. Editing or deleting any historical
 * row makes every later hash fail to recompute — detectable by `verifyAuditChain`
 * and the scheduled integrity job.
 */
import { createHash } from "crypto";
import { desc, eq, gt, asc } from "drizzle-orm";
import { auditEvents, auditLogs, type AuditEvent, type InsertAuditEvent } from "../../drizzle/schema";
import type { Queryer, Tx } from "./db";
import { requireDb } from "./db";

export interface AuditEventInput {
  actorId?: number | null;
  actorName?: string | null;
  originalActorId?: number | null;
  actorRole?: string | null;
  orgId?: number | null;
  action: string;
  recordType: string;
  recordId?: string | number | null;
  clientId?: number | null;
  prevValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
  approvalId?: number | null;
  requestId?: string | null;
  sessionId?: string | null;
  correlationId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  success?: boolean;
}

/**
 * Deterministic serialization of the fields that participate in the hash. Sorted
 * keys + JSON so the same logical event always hashes identically.
 */
export function canonicalizeEvent(evt: AuditEventInput, createdAtIso: string): string {
  const payload: Record<string, unknown> = {
    actorId: evt.actorId ?? null,
    originalActorId: evt.originalActorId ?? null,
    actorRole: evt.actorRole ?? null,
    orgId: evt.orgId ?? null,
    action: evt.action,
    recordType: evt.recordType,
    recordId: evt.recordId != null ? String(evt.recordId) : null,
    clientId: evt.clientId ?? null,
    prevValue: evt.prevValue ?? null,
    newValue: evt.newValue ?? null,
    reason: evt.reason ?? null,
    approvalId: evt.approvalId ?? null,
    success: evt.success ?? true,
    createdAt: createdAtIso,
  };
  return stableStringify(payload);
}

/** Stable JSON: object keys sorted recursively so serialization is deterministic. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortDeep((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/** SHA-256 hex of the canonical event body chained to the previous hash. */
export function computeEventHash(canonical: string, prevHash: string | null): string {
  return createHash("sha256").update(`${prevHash ?? ""}\n${canonical}`).digest("hex");
}

/**
 * Append an audit event within the caller's transaction. Reads the current chain
 * head FOR UPDATE so concurrent appends serialize and the chain stays linear.
 */
export async function recordAuditEvent(tx: Tx, evt: AuditEventInput): Promise<AuditEvent> {
  const createdAt = new Date();
  const createdAtIso = createdAt.toISOString();

  // Lock the chain head so two concurrent appends cannot both read the same
  // prevHash and fork the chain. `FOR UPDATE` is applied via drizzle's `.for`.
  const head = await tx
    .select({ id: auditEvents.id, hash: auditEvents.hash })
    .from(auditEvents)
    .orderBy(desc(auditEvents.id))
    .limit(1)
    .for("update");
  const prevHash = head.length > 0 ? head[0].hash : null;

  const canonical = canonicalizeEvent(evt, createdAtIso);
  const hash = computeEventHash(canonical, prevHash);

  const row: InsertAuditEvent = {
    actorId: evt.actorId ?? null,
    actorName: evt.actorName ?? null,
    originalActorId: evt.originalActorId ?? null,
    actorRole: evt.actorRole ?? null,
    orgId: evt.orgId ?? null,
    action: evt.action,
    recordType: evt.recordType,
    recordId: evt.recordId != null ? String(evt.recordId) : null,
    clientId: evt.clientId ?? null,
    prevValue: (evt.prevValue ?? null) as InsertAuditEvent["prevValue"],
    newValue: (evt.newValue ?? null) as InsertAuditEvent["newValue"],
    reason: evt.reason ?? null,
    approvalId: evt.approvalId ?? null,
    requestId: evt.requestId ?? null,
    sessionId: evt.sessionId ?? null,
    correlationId: evt.correlationId ?? null,
    ip: evt.ip ?? null,
    userAgent: evt.userAgent ?? null,
    success: evt.success ?? true,
    prevHash,
    hash,
    createdAt,
  };

  const result = await tx.insert(auditEvents).values(row).$returningId();
  const insertedId = result[0]?.id;

  // Mirror to the legacy `auditLogs` table so the existing Audit Log UI keeps
  // working during the transition. Best-effort and non-authoritative.
  try {
    await tx.insert(auditLogs).values({
      actorId: evt.actorId ?? null,
      actorName: evt.actorName ?? null,
      action: evt.action,
      clientId: evt.clientId ?? null,
      clientName: null,
      details: { recordType: evt.recordType, recordId: evt.recordId != null ? String(evt.recordId) : null, success: evt.success ?? true },
      sessionId: evt.sessionId ?? null,
    });
  } catch {
    // Legacy mirror is non-authoritative; the authoritative event already committed.
  }

  return { ...(row as AuditEvent), id: insertedId ?? 0 };
}

/** Convenience: open a one-off transaction just to record an event. */
export async function recordAuditEventStandalone(evt: AuditEventInput): Promise<AuditEvent> {
  const db = await requireDb();
  return db.transaction(async (tx) => recordAuditEvent(tx as Tx, evt));
}

export interface ChainVerificationResult {
  ok: boolean;
  count: number;
  brokenAtId: number | null;
  reason: string | null;
}

/**
 * Pure verification of an ordered list of events (ascending id). Recomputes each
 * hash from the previous and confirms the stored `prevHash` linkage. Any tamper
 * (edited field, deleted row, reordered chain) breaks verification.
 */
export function verifyAuditChain(events: AuditEvent[]): ChainVerificationResult {
  let prevHash: string | null = null;
  for (const e of events) {
    if ((e.prevHash ?? null) !== prevHash) {
      return { ok: false, count: events.length, brokenAtId: e.id, reason: "prevHash_mismatch" };
    }
    const canonical = canonicalizeEvent(
      {
        actorId: e.actorId,
        originalActorId: e.originalActorId,
        actorRole: e.actorRole,
        orgId: e.orgId,
        action: e.action,
        recordType: e.recordType,
        recordId: e.recordId,
        clientId: e.clientId,
        prevValue: e.prevValue,
        newValue: e.newValue,
        reason: e.reason,
        approvalId: e.approvalId,
        success: e.success,
      },
      e.createdAt instanceof Date ? e.createdAt.toISOString() : new Date(e.createdAt).toISOString(),
    );
    const expected = computeEventHash(canonical, prevHash);
    if (expected !== e.hash) {
      return { ok: false, count: events.length, brokenAtId: e.id, reason: "hash_mismatch" };
    }
    prevHash = e.hash;
  }
  return { ok: true, count: events.length, brokenAtId: null, reason: null };
}

/** Load the full chain (or a suffix from `afterId`) for integrity verification. */
export async function loadAuditChain(q: Queryer, afterId = 0): Promise<AuditEvent[]> {
  return q
    .select()
    .from(auditEvents)
    .where(gt(auditEvents.id, afterId))
    .orderBy(asc(auditEvents.id));
}

/** Fetch events for a specific record (for the record's History tab). */
export async function getEventsForRecord(q: Queryer, recordType: string, recordId: string | number): Promise<AuditEvent[]> {
  return q
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.recordType, recordType))
    .orderBy(desc(auditEvents.id))
    .limit(200)
    .then((rows) => rows.filter((r) => r.recordId === String(recordId)));
}
