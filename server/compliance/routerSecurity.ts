/**
 * Security sub-routers: break-glass emergency access and in-app notifications.
 * Self-service operations are scoped to the caller; oversight (listing all
 * break-glass grants, revoking another user's grant) requires COMPLIANCE_MANAGE.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router } from "../_core/trpc";
import { PERMISSIONS } from "@shared/compliance/constants";
import { permProcedure, actorFromCtx, callerHasPermission } from "./procedures";
import * as bg from "./breakGlassService";
import * as notifications from "./notificationService";

export const breakGlassRouter = router({
  /** The caller's own active emergency grants (drives the persistent banner). */
  active: permProcedure(PERMISSIONS.COMPLIANCE_VIEW).query(({ ctx }) => bg.activeBreakGlass(ctx.user.id)),

  /** Activate emergency access — audited + oversight-notified. */
  activate: permProcedure(PERMISSIONS.COMPLIANCE_VIEW).input(z.object({
    reason: z.string().min(10).max(2000),
    scope: z.string().min(2).max(256),
    ttlMinutes: z.number().int().min(bg.BREAK_GLASS_MIN_MINUTES).max(bg.BREAK_GLASS_MAX_MINUTES).optional(),
  })).mutation(({ input, ctx }) => bg.activateBreakGlass(actorFromCtx(ctx), input)),

  /** Revoke a grant early — own grant, or any grant with oversight rights. */
  revoke: permProcedure(PERMISSIONS.COMPLIANCE_VIEW).input(z.object({ grantId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const mine = await bg.activeBreakGlass(ctx.user.id);
      const ownsIt = mine.some((g) => g.id === input.grantId);
      if (!ownsIt) {
        // Not the caller's grant → require oversight permission.
        if (!(await callerHasPermission(ctx.user, PERMISSIONS.COMPLIANCE_MANAGE))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Not permitted to revoke this grant" });
        }
      }
      const revoked = await bg.revokeBreakGlass(actorFromCtx(ctx), input.grantId);
      return { revoked };
    }),

  /** Oversight: recent break-glass grants across all users for after-the-fact review. */
  list: permProcedure(PERMISSIONS.COMPLIANCE_MANAGE).query(() => bg.listBreakGlass()),
});

export const notificationsRouter = router({
  list: permProcedure(PERMISSIONS.COMPLIANCE_VIEW).input(z.object({ unreadOnly: z.boolean().optional() }).optional())
    .query(({ input, ctx }) => notifications.listNotifications(ctx.user.id, { unreadOnly: input?.unreadOnly })),
  unreadCount: permProcedure(PERMISSIONS.COMPLIANCE_VIEW).query(({ ctx }) => notifications.unreadCount(ctx.user.id)),
  markRead: permProcedure(PERMISSIONS.COMPLIANCE_VIEW).input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input, ctx }) => notifications.markRead(ctx.user.id, input.id).then((ok) => ({ ok }))),
  markAllRead: permProcedure(PERMISSIONS.COMPLIANCE_VIEW).mutation(({ ctx }) => notifications.markAllRead(ctx.user.id).then((count) => ({ count }))),
});
