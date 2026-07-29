/**
 * Service-encounter / delivery state machine.
 *
 * Enforces the brief's lifecycle. The critical invariant: once an encounter is
 * INVOICED it can no longer be directly edited — a correction must create an
 * amendment that preserves the original values. Voiding requires approval.
 */
export const ENCOUNTER_STATES = [
  "draft",
  "documented",
  "pending_review",
  "approved",
  "locked",
  "invoiced",
  "paid",
  "corrected_by_amendment",
  "voided",
] as const;
export type EncounterState = (typeof ENCOUNTER_STATES)[number];

/** Allowed forward transitions. Anything not listed is rejected. */
const TRANSITIONS: Record<EncounterState, EncounterState[]> = {
  draft: ["documented", "voided"],
  documented: ["pending_review", "draft", "voided"],
  pending_review: ["approved", "documented", "voided"],
  approved: ["locked", "pending_review", "voided"],
  locked: ["invoiced", "voided"],
  invoiced: ["paid", "corrected_by_amendment"],
  paid: ["corrected_by_amendment"],
  corrected_by_amendment: [],
  voided: [],
};

/** Some transitions require an explicit approval (separation-of-duties style). */
const APPROVAL_REQUIRED: ReadonlySet<string> = new Set([
  "approved->locked",
  "draft->voided",
  "documented->voided",
  "pending_review->voided",
  "approved->voided",
  "locked->voided",
]);

export function canTransition(from: EncounterState, to: EncounterState): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function transitionRequiresApproval(from: EncounterState, to: EncounterState): boolean {
  return APPROVAL_REQUIRED.has(`${from}->${to}`);
}

/** After invoicing, the record is financially committed — no direct field edits. */
export function isDirectlyEditable(state: EncounterState): boolean {
  return state === "draft" || state === "documented" || state === "pending_review";
}

/** Whether a correction must go through an amendment (preserving originals). */
export function requiresAmendmentToCorrect(state: EncounterState): boolean {
  return state === "invoiced" || state === "paid" || state === "locked" || state === "approved";
}

export interface TransitionResult {
  ok: boolean;
  reason?: string;
  needsApproval?: boolean;
}

/**
 * Validate a proposed transition. `hasApproval` must be true when the transition
 * requires an approval record. Returns a structured result rather than throwing
 * so callers can surface a precise message.
 */
export function validateTransition(from: EncounterState, to: EncounterState, hasApproval: boolean): TransitionResult {
  if (from === to) return { ok: false, reason: "no_op" };
  if (!canTransition(from, to)) return { ok: false, reason: `illegal_transition:${from}->${to}` };
  if (transitionRequiresApproval(from, to) && !hasApproval) {
    return { ok: false, reason: "approval_required", needsApproval: true };
  }
  return { ok: true };
}

/** Proof-of-delivery methods considered acceptable evidence. */
export const POD_METHODS = ["signature", "photo", "gps", "recipient_confirmation", "staff_attestation"] as const;
export type PodMethod = (typeof POD_METHODS)[number];

export interface DeliveryEvidence {
  podMethod?: PodMethod | null;
  signaturePresent?: boolean;
  photoPresent?: boolean;
  gpsPresent?: boolean;
  deliveredAt?: Date | null;
}

/** Is proof-of-delivery sufficient to advance past documentation? */
export function hasSufficientProofOfDelivery(ev: DeliveryEvidence): boolean {
  if (!ev.podMethod) return false;
  switch (ev.podMethod) {
    case "signature": return ev.signaturePresent === true;
    case "photo": return ev.photoPresent === true;
    case "gps": return ev.gpsPresent === true;
    case "recipient_confirmation":
    case "staff_attestation": return ev.deliveredAt != null;
    default: return false;
  }
}
