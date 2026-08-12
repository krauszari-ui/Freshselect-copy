/**
 * Session-management sub-router. Self-service operations (list, revoke own,
 * revoke-others, reauth) require COMPLIANCE_VIEW and are scoped to the caller;
 * forcing another user's logout requires COMPLIANCE_MANAGE.
 */
import { z } from "zod";
import bcrypt from "bcryptjs";
import { TRPCError } from "@trpc/server";
import { router } from "../_core/trpc";
import { PERMISSIONS } from "@shared/compliance/constants";
import { permProcedure, actorFromCtx } from "./procedures";
import * as sessions from "./sessionService";
import { evaluateMfaLogin } from "./mfaService";

export const sessionsRouter = router({
  /** The caller's own devices/sessions, newest first, with the current one flagged. */
  list: permProcedure(PERMISSIONS.COMPLIANCE_VIEW).query(async ({ ctx }) => {
    const current = actorFromCtx(ctx).sessionId;
    const rows = await sessions.listSessions(ctx.user.id);
    return rows.map((s) => ({
      id: s.id,
      sessionId: s.sessionId,
      ip: s.ip,
      userAgent: s.userAgent,
      mfaVerified: s.mfaVerified,
      createdAt: s.createdAt,
      lastSeenAt: s.lastSeenAt,
      expiresAt: s.expiresAt,
      revokedAt: s.revokedAt,
      active: s.active,
      current: !!current && s.sessionId === current,
    }));
  }),

  /** Revoke one of the caller's own sessions (IDOR-guarded to the caller). */
  revoke: permProcedure(PERMISSIONS.COMPLIANCE_VIEW).input(z.object({ sessionId: z.string().max(64) }))
    .mutation(async ({ input, ctx }) => {
      const target = await sessions.getSession(input.sessionId);
      if (!target || target.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      }
      const revoked = await sessions.revokeSession(actorFromCtx(ctx), input.sessionId, "user_revoked");
      return { revoked };
    }),

  /** "Log out everywhere else" — revoke all the caller's sessions but this one. */
  revokeOthers: permProcedure(PERMISSIONS.COMPLIANCE_VIEW).mutation(async ({ ctx }) => {
    const current = actorFromCtx(ctx).sessionId ?? undefined;
    const count = await sessions.revokeAllUserSessions(actorFromCtx(ctx), ctx.user.id, "user_revoked_others", current);
    return { count };
  }),

  /** Admin forced logout of another user (e.g. off-boarding, suspected compromise). */
  revokeForUser: permProcedure(PERMISSIONS.COMPLIANCE_MANAGE).input(z.object({ userId: z.number().int().positive(), reason: z.string().max(128).optional() }))
    .mutation(async ({ input, ctx }) => {
      const count = await sessions.revokeAllUserSessions(actorFromCtx(ctx), input.userId, input.reason ?? "admin_forced_logout");
      return { count };
    }),

  /**
   * Re-authenticate for a sensitive action: verify the caller's password (and
   * MFA, if enforced) and stamp the current session so a follow-up mutation can
   * require a recent reauth.
   */
  reauth: permProcedure(PERMISSIONS.COMPLIANCE_VIEW).input(z.object({ password: z.string().min(1), mfaToken: z.string().max(64).optional() }))
    .mutation(async ({ input, ctx }) => {
      const sessionId = actorFromCtx(ctx).sessionId;
      if (!sessionId) throw new TRPCError({ code: "BAD_REQUEST", message: "No active session" });
      if (!ctx.user.passwordHash || !(await bcrypt.compare(input.password, ctx.user.passwordHash))) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Incorrect password" });
      }
      const mfa = await evaluateMfaLogin(ctx.user, input.mfaToken);
      if (mfa === "required") throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication code required" });
      if (mfa === "invalid") throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid authentication code" });
      await sessions.stampReauth(sessionId);
      return { ok: true };
    }),
});
