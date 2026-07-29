/**
 * Billing correctness: expected amounts, duplicate/idempotency prevention, and
 * the reconciliation chain referral → eligibility → authorization → service →
 * evidence → invoice → payment.
 *
 * Money is handled in integer cents (see money.ts). Duplicate invoicing is
 * prevented by a deterministic idempotency key enforced by a UNIQUE constraint
 * at the database level; this module computes that key and validates lines.
 */
import { createHash } from "crypto";
import { multiplyUnits, toCents, fromCents, sumMoney, compareMoney } from "./money";

// ─── Expected amount ─────────────────────────────────────────────────────────
export function computeLineExpectedAmount(units: number, rate: string | number | null | undefined): string {
  return multiplyUnits(units, rate);
}

export function computeInvoiceExpectedTotal(lines: Array<{ units: number; rate: string | number | null | undefined }>): string {
  return sumMoney(lines.map((l) => computeLineExpectedAmount(l.units, l.rate)));
}

// ─── Duplicate / idempotency ─────────────────────────────────────────────────
/**
 * Deterministic idempotency key for an invoice line. Billing the SAME service
 * encounter (or the same client+serviceCode+date+units) twice produces the same
 * key, which the DB's UNIQUE index rejects → no duplicate invoice line.
 */
export function invoiceLineIdempotencyKey(input: {
  submissionId: number;
  encounterId?: number | null;
  serviceCode?: string | null;
  serviceDate: Date | string;
  units: number;
}): string {
  const date = typeof input.serviceDate === "string" ? input.serviceDate : input.serviceDate.toISOString().slice(0, 10);
  const basis = input.encounterId != null
    ? `enc:${input.encounterId}`
    : `svc:${input.submissionId}:${input.serviceCode ?? ""}:${date}:${input.units}`;
  return createHash("sha256").update(basis).digest("hex").slice(0, 32);
}

/** Detect duplicates within a batch of proposed lines by idempotency key. */
export function findDuplicateLines<T extends { idempotencyKey: string }>(lines: T[]): T[] {
  const seen = new Set<string>();
  const dupes: T[] = [];
  for (const l of lines) {
    if (seen.has(l.idempotencyKey)) dupes.push(l);
    else seen.add(l.idempotencyKey);
  }
  return dupes;
}

// ─── Line validation (units within authorization, within dates) ──────────────
export interface LineValidationInput {
  units: number;
  serviceDate: Date;
  authorization: {
    remainingUnits: number;
    startDate: Date | null;
    endDate: Date | null;
    status: string;
  } | null;
}

export type LineValidation = { ok: true } | { ok: false; reason: string };

export function validateInvoiceLine(input: LineValidationInput): LineValidation {
  const a = input.authorization;
  if (!a) return { ok: false, reason: "no_authorization" };
  if (a.status !== "active") return { ok: false, reason: `authorization_${a.status}` };
  if (!Number.isInteger(input.units) || input.units <= 0) return { ok: false, reason: "invalid_units" };
  if (input.units > a.remainingUnits) return { ok: false, reason: "units_exceed_authorization" };
  if (a.startDate && input.serviceDate < a.startDate) return { ok: false, reason: "service_before_authorization" };
  if (a.endDate && input.serviceDate > a.endDate) return { ok: false, reason: "service_after_authorization" };
  return { ok: true };
}

// ─── Reconciliation chain ────────────────────────────────────────────────────
export interface ReconciliationChain {
  hasReferral: boolean;
  referralAccepted: boolean;
  hasEligibility: boolean;
  eligibilityValidForServiceDate: boolean;
  hasAuthorization: boolean;
  serviceWithinAuthorization: boolean;
  hasServiceEncounter: boolean;
  hasProofOfDelivery: boolean;
  hasInvoice: boolean;
  invoiceApproved: boolean;
  hasPayment: boolean;
}

export interface ReconciliationResult {
  complete: boolean;
  brokenLinks: string[];
}

/**
 * Validate the full billing lineage. A link is "broken" when a prerequisite is
 * missing/invalid. The chain must be intact end-to-end to consider a claim
 * reconciled.
 */
export function reconcile(chain: ReconciliationChain): ReconciliationResult {
  const broken: string[] = [];
  const add = (bad: boolean, link: string) => { if (bad) broken.push(link); };
  add(!chain.hasReferral, "referral_missing");
  add(chain.hasReferral && !chain.referralAccepted, "referral_not_accepted");
  add(!chain.hasEligibility, "eligibility_missing");
  add(chain.hasEligibility && !chain.eligibilityValidForServiceDate, "eligibility_not_valid_for_service_date");
  add(!chain.hasAuthorization, "authorization_missing");
  add(chain.hasAuthorization && !chain.serviceWithinAuthorization, "service_outside_authorization");
  add(!chain.hasServiceEncounter, "service_encounter_missing");
  add(!chain.hasProofOfDelivery, "proof_of_delivery_missing");
  add(!chain.hasInvoice, "invoice_missing");
  add(chain.hasInvoice && !chain.invoiceApproved, "invoice_not_approved");
  add(!chain.hasPayment, "payment_missing");
  return { complete: broken.length === 0, brokenLinks: broken };
}

// ─── Payment reconciliation math ─────────────────────────────────────────────
export interface PaymentReconInput {
  expected: string;
  paid: string;
  adjustments?: string;
  recoupments?: string;
}

export type PaymentStatus = "paid_in_full" | "partial" | "overpaid" | "unpaid";

export interface PaymentReconResult {
  status: PaymentStatus;
  /** expected - (paid + adjustments - recoupments) */
  variance: string;
}

/**
 * Reconcile a payment against the expected amount. Net received =
 * paid + adjustments - recoupments. Variance = expected - net.
 */
export function reconcilePayment(input: PaymentReconInput): PaymentReconResult {
  const net = toCents(input.paid) + toCents(input.adjustments ?? "0") - toCents(input.recoupments ?? "0");
  const expected = toCents(input.expected);
  const variance = fromCents(expected - net);
  let status: PaymentStatus;
  if (net <= 0) status = "unpaid";
  else if (net < expected) status = "partial";
  else if (net > expected) status = "overpaid";
  else status = "paid_in_full";
  return { status, variance };
}

/** Is a submission within the timely-filing deadline? (pure date math) */
export function isWithinTimelyFiling(serviceDate: Date, submissionDate: Date, deadlineDays: number): boolean {
  const deadline = new Date(serviceDate);
  deadline.setDate(deadline.getDate() + deadlineDays);
  return submissionDate <= deadline;
}

/** Convenience: compare submitted vs expected to flag under/over billing. */
export function classifyBilledAmount(expected: string, submitted: string): "match" | "under" | "over" {
  const c = compareMoney(submitted, expected);
  return c === 0 ? "match" : c < 0 ? "under" : "over";
}
