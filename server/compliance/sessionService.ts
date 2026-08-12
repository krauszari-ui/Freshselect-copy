/**
 * Session-management service — server-side session records that make a login
 * revocable and time-bounded. Built on the `userSessions` table.
 *
 * Safety: enforcement is a NO-OP unless COMPLIANCE_SESSIONS is on. Even when on,
 * the request-time check FAILS OPEN on any infrastructure error (missing table,
 * DB blip) — a monitoring gap must never lock every admin out of the app. The
 * strong guarantees (revocation, idle/absolute timeout, forced logout) apply
 * whenever the record layer is reachable.
 */
import { and, desc, eq, isNull } from "drizzle-orm";
import { userSessions } from "../../drizzle/schema";
import type { UserSession } from "../../drizzle/schema";
import { requireDb, withTransaction, type Queryer } from "./db";
import { recordAuditEvent } from "./audit";
import { type Actor } from "./store";

/** Idle window — a session unused for this long is dead. */
export const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 min
/** Absolute lifetime — a session older than this is dead regardless of activity. */
export const SESSION_ABSOLUTE_TIMEOUT_MS = 8 * 60 * 60 * 1000; // 8 h (matches the JWT cookie)
/** How recently the user must have re-authenticated for a sensitive action. */
export const SESSION_REAUTH_WINDOW_MS = 5 * 60 * 1000; // 5 min

export type SessionCheck =
  | { ok: true; session: UserSession }
  | { ok: false; reason: "not_found" | "revoked" | "expired" | "idle" };

/** Record a new session at login. */
export async function recordSession(input: {
  sessionId: string;
  userId: number;
  openId?: string | null;
  role?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  mfaVerified?: boolean;
  now?: number;
}): Promise<void> {
  const db = await requireDb();
  const now = input.now ?? Date.now();
  await db.insert(userSessions).values({
    sessionId: input.sessionId,
    userId: input.userId,
    openId: input.openId ?? null,
    role: input.role ?? null,
    ip: input.ip ?? null,
    userAgent: (input.userAgent ?? "").slice(0, 512) || null,
    mfaVerified: input.mfaVerified ?? false,
    lastSeenAt: new Date(now),
    expiresAt: new Date(now + SESSION_ABSOLUTE_TIMEOUT_MS),
  });
}

/** Read a session by its opaque id. */
export async function getSession(sessionId: string, q?: Queryer): Promise<UserSession | null> {
  const db = q ?? (await requireDb());
  const [row] = await db.select().from(userSessions).where(eq(userSessions.sessionId, sessionId));
  return row ?? null;
}

/**
 * The request-time gate. Returns ok=false with a reason when the session is
 * revoked / past its absolute expiry / idle too long. On ok, bumps lastSeenAt.
 * Pure decision given `now`; the caller decides how to react (deny the request).
 */
export async function enforceSession(sessionId: string, now = Date.now()): Promise<SessionCheck> {
  const db = await requireDb();
  const session = await getSession(sessionId, db);
  if (!session) return { ok: false, reason: "not_found" };
  if (session.revokedAt) return { ok: false, reason: "revoked" };
  if (session.expiresAt.getTime() <= now) return { ok: false, reason: "expired" };
  if (session.lastSeenAt.getTime() + SESSION_IDLE_TIMEOUT_MS <= now) return { ok: false, reason: "idle" };
  // Sliding activity window — record that the session is still in use.
  await db.update(userSessions).set({ lastSeenAt: new Date(now) }).where(eq(userSessions.id, session.id));
  return { ok: true, session };
}

/** List a user's sessions (active first, newest first) for the device list. */
export async function listSessions(userId: number, now = Date.now()): Promise<Array<UserSession & { active: boolean }>> {
  const db = await requireDb();
  const rows = await db.select().from(userSessions).where(eq(userSessions.userId, userId)).orderBy(desc(userSessions.createdAt));
  return rows.map((r) => ({
    ...r,
    active: !r.revokedAt && r.expiresAt.getTime() > now && r.lastSeenAt.getTime() + SESSION_IDLE_TIMEOUT_MS > now,
  }));
}

/** Revoke a single session. */
export async function revokeSession(actor: Actor, sessionId: string, reason = "user_revoked"): Promise<boolean> {
  return withTransaction(async (tx) => {
    const [row] = await tx.select().from(userSessions).where(eq(userSessions.sessionId, sessionId));
    if (!row || row.revokedAt) return false;
    await tx.update(userSessions)
      .set({ revokedAt: new Date(), revokedBy: actor.actorId ?? null, revokeReason: reason.slice(0, 128) })
      .where(eq(userSessions.id, row.id));
    await recordAuditEvent(tx, { ...actor, action: "session_revoked", recordType: "userSession", recordId: row.id, newValue: { reason, targetUserId: row.userId } });
    return true;
  });
}

/**
 * Revoke ALL of a user's active sessions — the forced-logout primitive used when
 * a role, password, or MFA enrollment changes. Optionally spare one session
 * (e.g. the one that just performed the change). Returns the count revoked.
 */
export async function revokeAllUserSessions(actor: Actor, userId: number, reason: string, exceptSessionId?: string): Promise<number> {
  return withTransaction(async (tx) => {
    const rows = await tx.select().from(userSessions).where(and(eq(userSessions.userId, userId), isNull(userSessions.revokedAt)));
    let count = 0;
    for (const row of rows) {
      if (exceptSessionId && row.sessionId === exceptSessionId) continue;
      await tx.update(userSessions)
        .set({ revokedAt: new Date(), revokedBy: actor.actorId ?? null, revokeReason: reason.slice(0, 128) })
        .where(eq(userSessions.id, row.id));
      count++;
    }
    if (count > 0) {
      await recordAuditEvent(tx, { ...actor, action: "sessions_revoked_all", recordType: "user", recordId: userId, newValue: { reason, count } });
    }
    return count;
  });
}

/** Stamp a successful re-authentication on the current session. */
export async function stampReauth(sessionId: string, now = Date.now()): Promise<void> {
  const db = await requireDb();
  await db.update(userSessions).set({ reauthAt: new Date(now) }).where(eq(userSessions.sessionId, sessionId));
}

/** Has this session re-authenticated within the window? (for sensitive actions) */
export async function hasRecentReauth(sessionId: string, maxAgeMs = SESSION_REAUTH_WINDOW_MS, now = Date.now()): Promise<boolean> {
  const session = await getSession(sessionId);
  if (!session || !session.reauthAt) return false;
  return session.reauthAt.getTime() + maxAgeMs > now;
}
