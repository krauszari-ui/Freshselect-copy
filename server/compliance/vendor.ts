/**
 * Vendor proof-of-delivery service — the read/write logic behind the external
 * vendor portal. A delivery-vendor org's members see the week's ACTIVE clients
 * (minimal info only — never medical/eligibility data) and attach a PoD link or
 * file per client per ISO week. Everything is scoped to the caller's vendor org.
 */
import { and, eq, isNull, or } from "drizzle-orm";
import type { User } from "../../drizzle/schema";
import { submissions, vendorPods, organizations } from "../../drizzle/schema";
import type { Organization } from "../../drizzle/schema";
import { requireDb, withTransaction } from "./db";
import { recordAuditEvent } from "./audit";
import { type Actor } from "./store";
import { isoWeekStart } from "@shared/compliance/week";

/** The stage that means "approved and actively receiving meals". */
const ACTIVE_STAGE = "level_2_active" as const;

/** Resolve + validate the caller's vendor org. Returns null if not a vendor. */
export async function getVendorOrg(user: Pick<User, "orgId">): Promise<Organization | null> {
  if (user.orgId == null) return null;
  const db = await requireDb();
  const [org] = await db.select().from(organizations).where(eq(organizations.id, user.orgId));
  if (!org || org.isActive !== 1 || org.kind !== "delivery_vendor") return null;
  return org;
}

export interface VendorWeeklyClient {
  submissionId: number;
  name: string;
  referenceNumber: string | null;
  borough: string | null;
  neighborhood: string | null;
  zipcode: string | null;
  /** The vendor's existing PoD for this week, if any. */
  pod: { id: number; podUrl: string | null; status: string; note: string | null; podMethod: string | null } | null;
}

/**
 * The active clients this vendor should deliver to for `weekOf`: clients at the
 * active stage that are either unassigned or assigned to THIS vendor, with the
 * vendor's existing PoD for that week attached. Deliberately minimal fields.
 */
export async function listWeeklyClientsForVendor(vendorOrgId: number, weekOf: Date): Promise<VendorWeeklyClient[]> {
  const db = await requireDb();
  const monday = isoWeekStart(weekOf);
  const rows = await db.select({
    id: submissions.id, firstName: submissions.firstName, lastName: submissions.lastName,
    referenceNumber: submissions.referenceNumber, borough: submissions.borough,
    neighborhood: submissions.neighborhood, zipcode: submissions.zipcode,
  }).from(submissions).where(and(
    eq(submissions.stage, ACTIVE_STAGE),
    or(isNull(submissions.assignedVendorOrgId), eq(submissions.assignedVendorOrgId, vendorOrgId)),
  ));

  // Fetch this vendor's PoDs for the week in one query, then join in memory.
  const pods = await db.select().from(vendorPods).where(and(eq(vendorPods.vendorOrgId, vendorOrgId), eq(vendorPods.weekOf, monday)));
  const podBySub = new Map(pods.map((p) => [p.submissionId, p]));

  return rows.map((r) => {
    const p = podBySub.get(r.id);
    return {
      submissionId: r.id,
      name: `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || `Client #${r.id}`,
      referenceNumber: r.referenceNumber ?? null,
      borough: r.borough ?? null, neighborhood: r.neighborhood ?? null, zipcode: r.zipcode ?? null,
      pod: p ? { id: p.id, podUrl: p.podUrl, status: p.status, note: p.note, podMethod: p.podMethod } : null,
    };
  });
}

/** Is this client visible to (deliverable by) this vendor? */
async function clientVisibleToVendor(vendorOrgId: number, submissionId: number): Promise<boolean> {
  const db = await requireDb();
  const [row] = await db.select({ stage: submissions.stage, assigned: submissions.assignedVendorOrgId })
    .from(submissions).where(eq(submissions.id, submissionId));
  if (!row || row.stage !== ACTIVE_STAGE) return false;
  return row.assigned == null || row.assigned === vendorOrgId;
}

export interface SubmitPodInput {
  vendorOrgId: number;
  submissionId: number;
  weekOf: Date;
  podUrl?: string | null;
  podMethod?: "signature" | "photo" | "gps" | "recipient_confirmation" | "staff_attestation" | null;
  note?: string | null;
  documentId?: number | null;
}

/** Upsert the vendor's PoD for a client + week. Idempotent per (client,vendor,week). */
export async function submitVendorPod(actor: Actor, input: SubmitPodInput): Promise<{ id: number; created: boolean }> {
  if (!(await clientVisibleToVendor(input.vendorOrgId, input.submissionId))) {
    throw new Error("CLIENT_NOT_DELIVERABLE"); // not active, or assigned to another vendor
  }
  if (!input.podUrl && input.documentId == null) throw new Error("POD_EVIDENCE_REQUIRED");
  const monday = isoWeekStart(input.weekOf);
  return withTransaction(async (tx) => {
    const [existing] = await tx.select().from(vendorPods).where(and(
      eq(vendorPods.submissionId, input.submissionId), eq(vendorPods.vendorOrgId, input.vendorOrgId), eq(vendorPods.weekOf, monday),
    ));
    if (existing) {
      await tx.update(vendorPods).set({
        podUrl: input.podUrl ?? null, documentId: input.documentId ?? null,
        podMethod: input.podMethod ?? null, note: input.note ?? null, status: "submitted",
        uploadedBy: actor.actorId ?? null,
      }).where(eq(vendorPods.id, existing.id));
      await recordAuditEvent(tx, { ...actor, action: "vendor_pod_updated", recordType: "vendorPod", recordId: existing.id, clientId: input.submissionId, newValue: { weekOf: monday.toISOString(), hasUrl: !!input.podUrl } });
      return { id: existing.id, created: false };
    }
    const inserted = await tx.insert(vendorPods).values({
      submissionId: input.submissionId, vendorOrgId: input.vendorOrgId, weekOf: monday,
      podUrl: input.podUrl ?? null, documentId: input.documentId ?? null, podMethod: input.podMethod ?? null,
      note: input.note ?? null, status: "submitted", uploadedBy: actor.actorId ?? null,
    }).$returningId();
    const id = inserted[0].id;
    await recordAuditEvent(tx, { ...actor, action: "vendor_pod_submitted", recordType: "vendorPod", recordId: id, clientId: input.submissionId, newValue: { weekOf: monday.toISOString(), hasUrl: !!input.podUrl } });
    return { id, created: true };
  });
}
