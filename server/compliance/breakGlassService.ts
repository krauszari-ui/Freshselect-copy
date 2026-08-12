/**
 * Break-glass emergency access on the existing `tempAccessGrants` table.
 *
 * A break-glass grant is a self-service, time-boxed, heavily-audited elevation
 * for genuine emergencies (e.g. urgent access outside normal scope). Activation
 * is never silent: it writes an enhanced audit event AND notifies the oversight
 * audience, and the UI shows a persistent banner while a grant is active. Grants
 * auto-expire; they can also be revoked early.
 */
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { tempAccessGrants } from "../../drizzle/schema";
import type { TempAccessGrant } from "../../drizzle/schema";
import { requireDb, withTransaction } from "./db";
import { recordAuditEvent } from "./audit";
import { createNotification, notifyOversight } from "./notificationService";
import { type Actor } from "./store";

/** Bounds on how long an emergency grant may last. */
export const BREAK_GLASS_MIN_MINUTES = 5;
export const BREAK_GLASS_MAX_MINUTES = 240; // 4 h
export const BREAK_GLASS_DEFAULT_MINUTES = 60;

/** Activate emergency access for the caller. Audited + oversight-notified. */
export async function activateBreakGlass(
  actor: Actor,
  input: { reason: string; scope: string; ttlMinutes?: number },
  now = Date.now(),
): Promise<TempAccessGrant> {
  if (actor.actorId == null) throw new Error("ACTOR_REQUIRED");
  const ttl = Math.min(Math.max(input.ttlMinutes ?? BREAK_GLASS_DEFAULT_MINUTES, BREAK_GLASS_MIN_MINUTES), BREAK_GLASS_MAX_MINUTES);
  const expiresAt = new Date(now + ttl * 60 * 1000);
  const grant = await withTransaction(async (tx) => {
    const inserted = await tx.insert(tempAccessGrants).values({
      userId: actor.actorId!,
      reason: input.reason,
      scope: input.scope.slice(0, 256),
      approvedBy: null, // self-service emergency — reviewed after the fact
      expiresAt,
      isBreakGlass: true,
    }).$returningId();
    const id = inserted[0].id;
    // Enhanced audit: capture the justification + scope + window on the chain.
    await recordAuditEvent(tx, {
      ...actor,
      action: "break_glass_activated",
      recordType: "tempAccessGrant",
      recordId: id,
      reason: input.reason,
      newValue: { scope: input.scope, ttlMinutes: ttl, expiresAt: expiresAt.toISOString() },
    });
    const [row] = await tx.select().from(tempAccessGrants).where(eq(tempAccessGrants.id, id));
    return row;
  });
  // Notify oversight + the actor (best-effort; never blocks activation).
  try {
    await notifyOversight({
      category: "break_glass", severity: "critical",
      title: "Break-glass access activated",
      body: `${actor.actorName ?? "A user"} activated emergency access: ${input.scope}. Reason: ${input.reason}`,
      relatedRecordType: "tempAccessGrant", relatedRecordId: grant.id,
    }, actor.actorId);
    await createNotification({
      userId: actor.actorId, category: "break_glass", severity: "warning",
      title: "Your break-glass access is active",
      body: `Scope: ${input.scope}. Expires ${expiresAt.toLocaleString()}. This access is being reviewed.`,
      relatedRecordType: "tempAccessGrant", relatedRecordId: grant.id,
    });
  } catch { /* notifications are advisory */ }
  return grant;
}

/** Active (unrevoked, unexpired) break-glass grants for a user. */
export async function activeBreakGlass(userId: number, now = Date.now()): Promise<TempAccessGrant[]> {
  const db = await requireDb();
  return db.select().from(tempAccessGrants).where(and(
    eq(tempAccessGrants.userId, userId),
    eq(tempAccessGrants.isBreakGlass, true),
    isNull(tempAccessGrants.revokedAt),
    gt(tempAccessGrants.expiresAt, new Date(now)),
  )).orderBy(desc(tempAccessGrants.grantedAt));
}

export async function hasActiveBreakGlass(userId: number, now = Date.now()): Promise<boolean> {
  return (await activeBreakGlass(userId, now)).length > 0;
}

/** Revoke a break-glass grant early (owner or oversight). Audited. */
export async function revokeBreakGlass(actor: Actor, grantId: number): Promise<boolean> {
  return withTransaction(async (tx) => {
    const [row] = await tx.select().from(tempAccessGrants).where(eq(tempAccessGrants.id, grantId));
    if (!row || row.revokedAt || !row.isBreakGlass) return false;
    await tx.update(tempAccessGrants).set({ revokedAt: new Date() }).where(eq(tempAccessGrants.id, grantId));
    await recordAuditEvent(tx, {
      ...actor, action: "break_glass_revoked", recordType: "tempAccessGrant", recordId: grantId,
      newValue: { targetUserId: row.userId },
    });
    return true;
  });
}

/** Recent break-glass grants across all users — for the oversight review list. */
export async function listBreakGlass(limit = 100): Promise<TempAccessGrant[]> {
  const db = await requireDb();
  return db.select().from(tempAccessGrants).where(eq(tempAccessGrants.isBreakGlass, true))
    .orderBy(desc(tempAccessGrants.grantedAt)).limit(Math.min(limit, 500));
}
