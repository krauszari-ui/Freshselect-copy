/**
 * ISO-week helpers shared by the vendor portal (client) and the PoD store
 * (server), so "which week does this proof cover" is computed identically on
 * both sides. A week is identified by its Monday at 00:00:00 UTC.
 */

/** Monday (00:00:00 UTC) of the ISO week containing `date`. */
export function isoWeekStart(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // getUTCDay: 0=Sun..6=Sat. Shift so Monday is the start of the week.
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1 - day); // days back to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

/** ISO week label, e.g. "2026-W33". */
export function isoWeekLabel(date: Date): string {
  const monday = isoWeekStart(date);
  // ISO week number: Thursday of this week determines the year + week.
  const thursday = new Date(monday);
  thursday.setUTCDate(monday.getUTCDate() + 3);
  const year = thursday.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  const firstMonday = isoWeekStart(firstThursday);
  const week = 1 + Math.round((monday.getTime() - firstMonday.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** The `weekOf` (Monday UTC) for the current week — the default a portal opens on. */
export function currentWeekStart(now: Date): Date {
  return isoWeekStart(now);
}

/** Format a `weekOf` Monday as an ISO date string (YYYY-MM-DD). */
export function weekOfIso(date: Date): string {
  return isoWeekStart(date).toISOString().slice(0, 10);
}
