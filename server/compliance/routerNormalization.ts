/**
 * formData normalization + reconciliation control (oversight). Running the
 * backfill mutates only the additive projection table, so it requires
 * COMPLIANCE_MANAGE; reading stats / the mismatch list requires COMPLIANCE_VIEW.
 */
import { z } from "zod";
import { router } from "../_core/trpc";
import { PERMISSIONS } from "@shared/compliance/constants";
import { permProcedure, actorFromCtx } from "./procedures";
import { recordAuditEvent } from "./audit";
import { withTransaction } from "./db";
import { backfillNormalization, normalizationStats, listReconciliationMismatches } from "./normalize";

export const normalizationRouter = router({
  stats: permProcedure(PERMISSIONS.COMPLIANCE_VIEW).query(() => normalizationStats()),

  reconciliation: permProcedure(PERMISSIONS.COMPLIANCE_VIEW).query(() => listReconciliationMismatches()),

  backfill: permProcedure(PERMISSIONS.COMPLIANCE_MANAGE).input(z.object({ limit: z.number().int().min(1).max(5000).optional() }).optional())
    .mutation(async ({ input, ctx }) => {
      const result = await backfillNormalization({ limit: input?.limit });
      // Record the maintenance action on the audit chain (a distinct write, not
      // enlisted in the backfill's own per-row writes).
      await withTransaction((tx) => recordAuditEvent(tx, {
        ...actorFromCtx(ctx), action: "normalization_backfill", recordType: "submissionNormalized", recordId: 0,
        newValue: { scanned: result.scanned, upserted: result.upserted, mismatches: result.mismatches },
      }));
      return result;
    }),
});
