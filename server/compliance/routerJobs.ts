/**
 * Job-queue observability + control (oversight only). Lets an operator see queue
 * depth by status and re-queue a dead-lettered job. Draining happens in the
 * worker loop / cron endpoint, not here.
 */
import { z } from "zod";
import { router } from "../_core/trpc";
import { PERMISSIONS } from "@shared/compliance/constants";
import { permProcedure } from "./procedures";
import { countJobsByStatus, retryDeadLetter } from "./infra/jobQueue";
import { drainQueue } from "./worker";

export const jobsRouter = router({
  stats: permProcedure(PERMISSIONS.COMPLIANCE_MANAGE).query(() => countJobsByStatus()),
  retry: permProcedure(PERMISSIONS.COMPLIANCE_MANAGE).input(z.object({ jobId: z.number().int().positive() }))
    .mutation(async ({ input }) => { await retryDeadLetter(input.jobId); return { ok: true }; }),
  /** Manually process a batch now (oversight) — same path the cron endpoint uses. */
  drain: permProcedure(PERMISSIONS.COMPLIANCE_MANAGE).input(z.object({ max: z.number().int().min(1).max(200).optional() }).optional())
    .mutation(({ input }) => drainQueue(input?.max ?? 25)),
});
