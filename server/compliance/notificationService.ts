/**
 * Compliance notifications — lightweight in-app messages for compliance events
 * (break-glass activation, new findings, escalations). Purely additive: creating
 * a notification never blocks the triggering workflow, and every write is
 * best-effort at the call site.
 */
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { complianceNotifications, users } from "../../drizzle/schema";
import type { ComplianceNotification } from "../../drizzle/schema";
import { requireDb, type Queryer } from "./db";

export type NotificationSeverity = "info" | "warning" | "critical";

export interface NotificationInput {
  userId: number;
  category: string;
  title: string;
  body?: string | null;
  severity?: NotificationSeverity;
  relatedRecordType?: string | null;
  relatedRecordId?: string | number | null;
}

/** Create a single notification. Pass a tx to enlist it in a surrounding write. */
export async function createNotification(input: NotificationInput, q?: Queryer): Promise<void> {
  const db = q ?? (await requireDb());
  await db.insert(complianceNotifications).values({
    userId: input.userId,
    category: input.category.slice(0, 64),
    severity: input.severity ?? "info",
    title: input.title.slice(0, 256),
    body: input.body ?? null,
    relatedRecordType: input.relatedRecordType ?? null,
    relatedRecordId: input.relatedRecordId != null ? String(input.relatedRecordId).slice(0, 64) : null,
  });
}

/** Resolve the oversight audience: active legacy admins / super-admins. */
export async function oversightRecipients(excludeUserId?: number): Promise<number[]> {
  const db = await requireDb();
  const rows = await db.select({ id: users.id }).from(users)
    .where(and(inArray(users.role, ["super_admin", "admin"]), eq(users.isActive, 1)));
  return rows.map((r) => r.id).filter((id) => id !== excludeUserId);
}

/** Fan a notification out to every oversight recipient (best-effort). */
export async function notifyOversight(input: Omit<NotificationInput, "userId">, excludeUserId?: number): Promise<number> {
  const recipients = await oversightRecipients(excludeUserId);
  for (const userId of recipients) {
    await createNotification({ ...input, userId });
  }
  return recipients.length;
}

export async function listNotifications(userId: number, opts: { unreadOnly?: boolean; limit?: number } = {}): Promise<ComplianceNotification[]> {
  const db = await requireDb();
  const where = opts.unreadOnly
    ? and(eq(complianceNotifications.userId, userId), isNull(complianceNotifications.readAt))
    : eq(complianceNotifications.userId, userId);
  return db.select().from(complianceNotifications).where(where)
    .orderBy(desc(complianceNotifications.createdAt)).limit(Math.min(opts.limit ?? 50, 200));
}

export async function unreadCount(userId: number): Promise<number> {
  const db = await requireDb();
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(complianceNotifications)
    .where(and(eq(complianceNotifications.userId, userId), isNull(complianceNotifications.readAt)));
  return Number(row?.n ?? 0);
}

/** Mark one notification read — scoped to its owner (IDOR-guarded). */
export async function markRead(userId: number, id: number): Promise<boolean> {
  const db = await requireDb();
  const [row] = await db.select().from(complianceNotifications).where(eq(complianceNotifications.id, id));
  if (!row || row.userId !== userId) return false;
  if (row.readAt) return true;
  await db.update(complianceNotifications).set({ readAt: new Date() }).where(eq(complianceNotifications.id, id));
  return true;
}

export async function markAllRead(userId: number): Promise<number> {
  const db = await requireDb();
  const rows = await db.select({ id: complianceNotifications.id }).from(complianceNotifications)
    .where(and(eq(complianceNotifications.userId, userId), isNull(complianceNotifications.readAt)));
  for (const r of rows) {
    await db.update(complianceNotifications).set({ readAt: new Date() }).where(eq(complianceNotifications.id, r.id));
  }
  return rows.length;
}
