/**
 * MFA sub-router. Self-service enrollment/status/reset-request operate on the
 * calling user; approving a reset for another user requires COMPLIANCE_MANAGE.
 */
import { z } from "zod";
import { router } from "../_core/trpc";
import { PERMISSIONS } from "@shared/compliance/constants";
import { permProcedure, actorFromCtx } from "./procedures";
import * as mfa from "./mfaService";

export const mfaRouter = router({
  status: permProcedure(PERMISSIONS.COMPLIANCE_VIEW).query(({ ctx }) => mfa.mfaStatus(ctx.user)),

  start: permProcedure(PERMISSIONS.COMPLIANCE_VIEW).mutation(({ ctx }) =>
    mfa.startEnrollment(actorFromCtx(ctx), ctx.user)),

  confirm: permProcedure(PERMISSIONS.COMPLIANCE_VIEW).input(z.object({ token: z.string().regex(/^\d{6,8}$/) }))
    .mutation(({ input, ctx }) => mfa.confirmEnrollment(actorFromCtx(ctx), ctx.user.id, input.token)),

  requestReset: permProcedure(PERMISSIONS.COMPLIANCE_VIEW).mutation(({ ctx }) =>
    mfa.requestReset(actorFromCtx(ctx), ctx.user.id)),

  approveReset: permProcedure(PERMISSIONS.COMPLIANCE_MANAGE).input(z.object({ userId: z.number().int().positive() }))
    .mutation(({ input, ctx }) => mfa.approveReset(actorFromCtx(ctx), input.userId)),
});
