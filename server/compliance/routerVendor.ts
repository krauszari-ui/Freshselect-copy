/**
 * Vendor portal sub-router (mounted as `compliance.vendor`). Every procedure is
 * gated by `vendorProcedure`, which requires the COMPLIANCE_VENDOR_PORTAL flag,
 * an authenticated user whose org is an active `delivery_vendor`, and injects
 * that vendor org into ctx. Vendors can only ever see/write their own scope.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { isVendorPortalEnabled } from "./flags";
import { actorFromCtx } from "./procedures";
import { getVendorOrg, listWeeklyClientsForVendor, submitVendorPod } from "./vendor";
import { isoWeekStart } from "@shared/compliance/week";

const vendorProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (!isVendorPortalEnabled()) throw new TRPCError({ code: "FORBIDDEN", message: "Vendor portal is not enabled" });
  const vendorOrg = await getVendorOrg(ctx.user);
  if (!vendorOrg) throw new TRPCError({ code: "FORBIDDEN", message: "This account is not a delivery vendor" });
  return next({ ctx: { ...ctx, vendorOrg } });
});

const podMethodEnum = z.enum(["signature", "photo", "gps", "recipient_confirmation", "staff_attestation"]);

export const vendorRouter = router({
  /** The signed-in vendor's own org (name/id) — drives the portal header. */
  myVendor: vendorProcedure.query(({ ctx }) => ({ id: ctx.vendorOrg.id, name: ctx.vendorOrg.name })),

  /** Active clients for the given ISO week (defaults to the current week). */
  weeklyClients: vendorProcedure.input(z.object({ weekOf: z.coerce.date().optional() }).optional())
    .query(({ input, ctx }) => listWeeklyClientsForVendor(ctx.vendorOrg.id, input?.weekOf ?? new Date())),

  /** Attach (or replace) this vendor's proof-of-delivery for a client + week. */
  submitPod: vendorProcedure.input(z.object({
    submissionId: z.number().int().positive(),
    weekOf: z.coerce.date(),
    podUrl: z.string().url().max(1024).optional(),
    podMethod: podMethodEnum.optional(),
    note: z.string().max(2000).optional(),
  })).mutation(async ({ input, ctx }) => {
    if (!input.podUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "A proof-of-delivery link is required" });
    try {
      return await submitVendorPod(actorFromCtx(ctx), {
        vendorOrgId: ctx.vendorOrg.id, submissionId: input.submissionId, weekOf: isoWeekStart(input.weekOf),
        podUrl: input.podUrl, podMethod: input.podMethod ?? null, note: input.note ?? null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "CLIENT_NOT_DELIVERABLE") throw new TRPCError({ code: "FORBIDDEN", message: "That client is not on your active delivery list" });
      throw new TRPCError({ code: "BAD_REQUEST", message: msg });
    }
  }),
});
