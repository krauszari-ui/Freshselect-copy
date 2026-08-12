/**
 * Reports sub-router. Each report is gated by its own permission (from the
 * catalog); exports additionally require EXPORT and are recorded as an audit
 * event (exported files are restricted records).
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { PERMISSIONS, type Permission } from "@shared/compliance/constants";
import { isComplianceModuleEnabled } from "./flags";
import { actorFromCtx, callerHasPermission } from "./procedures";
import { REPORT_DEFINITIONS, reportDefinition, toCsv } from "./reports";
import { runReport } from "./reportQueries";
import { recordAuditEventStandalone } from "./audit";

/** Base procedure: requires the compliance module (permission is per-report). */
const reportProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!isComplianceModuleEnabled()) throw new TRPCError({ code: "FORBIDDEN", message: "Compliance module is not enabled." });
  return next();
});

async function assertReportPermission(user: Parameters<typeof callerHasPermission>[0], key: string): Promise<Permission> {
  const def = reportDefinition(key);
  if (!def) throw new TRPCError({ code: "NOT_FOUND", message: "Unknown report" });
  const has = await callerHasPermission(user, def.permission as Permission);
  if (!has) throw new TRPCError({ code: "FORBIDDEN", message: `Missing permission: ${def.permission}` });
  return def.permission as Permission;
}

export const reportsRouter = router({
  /** Catalog — the caller sees only reports it is permitted to run. */
  list: reportProcedure.query(async ({ ctx }) => {
    const out: typeof REPORT_DEFINITIONS = [];
    for (const def of REPORT_DEFINITIONS) {
      if (await callerHasPermission(ctx.user, def.permission as Permission)) out.push(def);
    }
    return out;
  }),

  run: reportProcedure.input(z.object({ key: z.string().max(64) })).query(async ({ input, ctx }) => {
    await assertReportPermission(ctx.user, input.key);
    return runReport(input.key);
  }),

  exportCsv: reportProcedure.input(z.object({ key: z.string().max(64) })).mutation(async ({ input, ctx }) => {
    await assertReportPermission(ctx.user, input.key);
    // Exporting is a privileged action — require EXPORT and log it as a restricted read.
    if (!(await callerHasPermission(ctx.user, PERMISSIONS.EXPORT))) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Missing permission: export:run" });
    }
    const data = await runReport(input.key);
    const csv = toCsv(data);
    const actor = actorFromCtx(ctx);
    await recordAuditEventStandalone({
      ...actor, action: "report_exported", recordType: "report", recordId: input.key,
      newValue: { report: input.key, rows: data.rows.length, format: "csv" },
    });
    return { filename: `${input.key}-${new Date().toISOString().slice(0, 10)}.csv`, csv, rows: data.rows.length };
  }),
});
