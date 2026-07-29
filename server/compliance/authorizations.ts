/**
 * Service authorization unit accounting.
 *
 * Consuming authorized units is the highest-integrity money-adjacent operation
 * in the module: two concurrent deliveries must never both consume the last
 * unit, and remaining units must never go negative. The pure `consumeUnitsPure`
 * function encodes the arithmetic/guards (unit-tested), and `consumeUnits`
 * enforces it under a row lock inside a transaction, recording an audit event in
 * the same transaction.
 */
import { eq } from "drizzle-orm";
import { serviceAuthorizations, type ServiceAuthorization } from "../../drizzle/schema";
import { recordAuditEvent, type AuditEventInput } from "./audit";
import type { Tx } from "./db";
import { withTransaction } from "./db";

export type ConsumeResult =
  | { ok: true; remaining: number; exhausted: boolean }
  | { ok: false; reason: "invalid_quantity" | "insufficient_units"; remaining: number };

/**
 * Pure accounting: given current remaining units and a requested quantity,
 * return the new remaining or a typed failure. Never yields a negative balance.
 */
export function consumeUnitsPure(remaining: number, requested: number): ConsumeResult {
  if (!Number.isInteger(requested) || requested <= 0) {
    return { ok: false, reason: "invalid_quantity", remaining };
  }
  if (requested > remaining) {
    return { ok: false, reason: "insufficient_units", remaining };
  }
  const next = remaining - requested;
  return { ok: true, remaining: next, exhausted: next === 0 };
}

export interface ConsumeUnitsParams {
  authorizationId: number;
  requested: number;
  actor: Pick<AuditEventInput, "actorId" | "actorName" | "actorRole" | "sessionId" | "ip" | "requestId">;
  reason?: string;
  encounterId?: number | null;
}

/**
 * Transactionally consume units against an authorization. The row is locked
 * `FOR UPDATE` so concurrent consumers serialize; the pure guard prevents
 * over-consumption; the audit event commits atomically with the balance change.
 * Throws on failure so the surrounding transaction rolls back.
 */
export async function consumeUnits(params: ConsumeUnitsParams): Promise<ConsumeResult> {
  return withTransaction(async (tx: Tx) => {
    const rows = await tx
      .select()
      .from(serviceAuthorizations)
      .where(eq(serviceAuthorizations.id, params.authorizationId))
      .for("update");
    const auth = rows[0];
    if (!auth) throw new Error("AUTHORIZATION_NOT_FOUND");
    if (auth.status !== "active") throw new Error(`AUTHORIZATION_NOT_ACTIVE:${auth.status}`);

    const result = consumeUnitsPure(auth.remainingUnits, params.requested);
    if (!result.ok) {
      // Record the denied attempt (success=false) so over-consumption attempts are visible.
      await recordAuditEvent(tx, {
        ...params.actor,
        action: "authorization_units_consume_denied",
        recordType: "serviceAuthorization",
        recordId: auth.id,
        clientId: auth.submissionId,
        prevValue: { remainingUnits: auth.remainingUnits },
        newValue: { requested: params.requested, reason: result.reason },
        success: false,
        reason: params.reason ?? null,
      });
      throw new Error(`UNIT_CONSUMPTION_FAILED:${result.reason}`);
    }

    await tx
      .update(serviceAuthorizations)
      .set({
        remainingUnits: result.remaining,
        status: result.exhausted ? "exhausted" : auth.status,
        version: auth.version + 1,
      })
      .where(eq(serviceAuthorizations.id, auth.id));

    await recordAuditEvent(tx, {
      ...params.actor,
      action: "authorization_units_consumed",
      recordType: "serviceAuthorization",
      recordId: auth.id,
      clientId: auth.submissionId,
      prevValue: { remainingUnits: auth.remainingUnits },
      newValue: { remainingUnits: result.remaining, consumed: params.requested, encounterId: params.encounterId ?? null },
      reason: params.reason ?? null,
    });

    return result;
  });
}

/** Is the authorization valid for a given service date (dates + status)? */
export function isAuthorizationValidForDate(auth: Pick<ServiceAuthorization, "status" | "startDate" | "endDate">, serviceDate: Date): boolean {
  if (auth.status !== "active") return false;
  if (auth.startDate && serviceDate < auth.startDate) return false;
  if (auth.endDate && serviceDate > auth.endDate) return false;
  return true;
}
