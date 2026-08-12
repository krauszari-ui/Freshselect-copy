/**
 * Weekly proof-of-delivery views for the audit folder + reports.
 *
 * Reads the vendor-submitted `vendorPods` and presents them grouped by ISO week
 * so staff can see, per client, which weeks have proof and which are missing.
 * "Missing" is only asserted for a client who is currently active (receiving
 * meals) — we never invent a delivery obligation for an inactive client.
 */
import { and, desc, eq, gte } from "drizzle-orm";
import { vendorPods, submissions, organizations } from "../../drizzle/schema";
import { requireDb } from "./db";
import { isoWeekStart, isoWeekLabel } from "@shared/compliance/week";

const ACTIVE_STAGE = "level_2_active";

export interface WeeklyPodEntry {
  weekOf: string;      // YYYY-MM-DD (Monday, UTC)
  weekLabel: string;   // e.g. 2026-W33
  podUrl: string | null;
  status: string | null;
  vendorName: string | null;
  podMethod: string | null;
  missing: boolean;
}

/** The last `weeks` ISO-week Mondays (UTC), most-recent first. */
function recentWeeks(weeks: number, now: Date): Date[] {
  const thisMonday = isoWeekStart(now);
  const out: Date[] = [];
  for (let i = 0; i < weeks; i++) {
    const d = new Date(thisMonday);
    d.setUTCDate(d.getUTCDate() - i * 7);
    out.push(d);
  }
  return out;
}

/**
 * Per-client weekly PoD view: every recent week (flagged missing when the client
 * is active and has no proof), unioned with any older weeks that DO have proof so
 * historical evidence still shows.
 */
export async function listWeeklyPodForClient(submissionId: number, weeks = 8, now = new Date()): Promise<WeeklyPodEntry[]> {
  const db = await requireDb();
  const [sub] = await db.select({ stage: submissions.stage }).from(submissions).where(eq(submissions.id, submissionId));
  const isActive = sub?.stage === ACTIVE_STAGE;

  const pods = await db.select({
    weekOf: vendorPods.weekOf, podUrl: vendorPods.podUrl, status: vendorPods.status,
    podMethod: vendorPods.podMethod, vendorName: organizations.name,
  }).from(vendorPods)
    .leftJoin(organizations, eq(vendorPods.vendorOrgId, organizations.id))
    .where(eq(vendorPods.submissionId, submissionId))
    .orderBy(desc(vendorPods.weekOf));

  const podByWeek = new Map<string, typeof pods[number]>();
  for (const p of pods) podByWeek.set(isoWeekStart(p.weekOf).toISOString().slice(0, 10), p);

  const weekKeys = new Set<string>();
  for (const w of recentWeeks(weeks, now)) weekKeys.add(w.toISOString().slice(0, 10));
  for (const k of Array.from(podByWeek.keys())) weekKeys.add(k); // include historical proof weeks

  const sorted = Array.from(weekKeys).sort().reverse();
  return sorted.map((weekOf) => {
    const p = podByWeek.get(weekOf);
    return {
      weekOf,
      weekLabel: isoWeekLabel(new Date(weekOf + "T00:00:00Z")),
      podUrl: p?.podUrl ?? null,
      status: p?.status ?? null,
      vendorName: p?.vendorName ?? null,
      podMethod: p?.podMethod ?? null,
      missing: !p && isActive,
    };
  });
}

/** All PoD records (a log) — for the weekly_pod report. */
export async function allWeeklyPods(limit = 1000): Promise<Array<{ submissionId: number; client: string; weekOf: Date; vendor: string | null; status: string; podUrl: string | null }>> {
  const db = await requireDb();
  const rows = await db.select({
    submissionId: vendorPods.submissionId, weekOf: vendorPods.weekOf, status: vendorPods.status, podUrl: vendorPods.podUrl,
    firstName: submissions.firstName, lastName: submissions.lastName, vendor: organizations.name,
  }).from(vendorPods)
    .leftJoin(submissions, eq(vendorPods.submissionId, submissions.id))
    .leftJoin(organizations, eq(vendorPods.vendorOrgId, organizations.id))
    .orderBy(desc(vendorPods.weekOf)).limit(Math.min(limit, 5000));
  return rows.map((r) => ({
    submissionId: r.submissionId,
    client: `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || `Client #${r.submissionId}`,
    weekOf: r.weekOf, vendor: r.vendor, status: r.status, podUrl: r.podUrl,
  }));
}

/** Active clients × recent weeks that have NO proof — the missing_pod report. */
export async function missingPodRows(weeks = 4, now = new Date()): Promise<Array<{ submissionId: number; client: string; weekOf: string; vendor: string | null }>> {
  const db = await requireDb();
  const weekMondays = recentWeeks(weeks, now);
  const earliest = weekMondays[weekMondays.length - 1];
  const active = await db.select({ id: submissions.id, firstName: submissions.firstName, lastName: submissions.lastName, vendorOrgId: submissions.assignedVendorOrgId })
    .from(submissions).where(eq(submissions.stage, ACTIVE_STAGE));
  if (active.length === 0) return [];

  // One query for all recent PoDs, indexed by client+week.
  const pods = await db.select({ submissionId: vendorPods.submissionId, weekOf: vendorPods.weekOf })
    .from(vendorPods).where(gte(vendorPods.weekOf, earliest));
  const have = new Set(pods.map((p) => `${p.submissionId}|${isoWeekStart(p.weekOf).toISOString().slice(0, 10)}`));

  // Vendor names for display.
  const vendorRows = await db.select({ id: organizations.id, name: organizations.name }).from(organizations);
  const vendorName = new Map(vendorRows.map((v) => [v.id, v.name]));

  const out: Array<{ submissionId: number; client: string; weekOf: string; vendor: string | null }> = [];
  for (const c of active) {
    const name = `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || `Client #${c.id}`;
    for (const w of weekMondays) {
      const key = `${c.id}|${w.toISOString().slice(0, 10)}`;
      if (!have.has(key)) out.push({ submissionId: c.id, client: name, weekOf: w.toISOString().slice(0, 10), vendor: c.vendorOrgId ? (vendorName.get(c.vendorOrgId) ?? null) : null });
    }
  }
  return out;
}
