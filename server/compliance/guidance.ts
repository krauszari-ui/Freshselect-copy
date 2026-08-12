/**
 * Guidance & clarification — pure workflow logic.
 *
 * The clarification workflow drives an unclear requirement from a precise
 * question to an approved, trained-on internal interpretation. Attorney-client
 * privileged / work-product records are filtered so only holders of the
 * PRIVILEGED_VIEW permission can see them.
 */
export const CLARIFICATION_STATES = [
  "submitted",
  "facts_recorded",
  "legal_requested",
  "sent_to_agency",
  "answered",
  "interpreted",
  "closed",
] as const;
export type ClarificationState = (typeof CLARIFICATION_STATES)[number];

// Forward transitions. `legal_requested` is optional — facts_recorded may go
// straight to sent_to_agency. An answer may be interpreted directly.
const TRANSITIONS: Record<ClarificationState, ClarificationState[]> = {
  submitted: ["facts_recorded", "closed"],
  facts_recorded: ["legal_requested", "sent_to_agency", "interpreted", "closed"],
  legal_requested: ["sent_to_agency", "interpreted", "closed"],
  sent_to_agency: ["answered", "closed"],
  answered: ["interpreted", "closed"],
  interpreted: ["closed"],
  closed: [],
};

export function canTransitionClarification(from: ClarificationState, to: ClarificationState): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

/**
 * Filter a list of records that may be privileged. Records with `privileged`
 * true are only returned when the viewer holds PRIVILEGED_VIEW. Non-privileged
 * records are always returned.
 */
export function filterPrivileged<T extends { privileged?: boolean | null }>(rows: T[], canViewPrivileged: boolean): T[] {
  if (canViewPrivileged) return rows;
  return rows.filter((r) => r.privileged !== true);
}

/** Is a single privileged record viewable by this subject? */
export function canViewRecord(record: { privileged?: boolean | null }, canViewPrivileged: boolean): boolean {
  return record.privileged !== true || canViewPrivileged;
}
