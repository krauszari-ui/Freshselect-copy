/**
 * Compliance infrastructure bootstrap — called once at server start.
 *
 * Wires the optional production adapters, all fail-safe and default-off:
 *   - the Redis rate store (if REDIS_URL is set), and
 *   - the durable job worker loop (if COMPLIANCE_WORKER is truthy).
 * On a serverless host that can't run a persistent loop, leave COMPLIANCE_WORKER
 * off and drain the queue from the /api/scheduled/process-jobs cron endpoint.
 */
import { initRateStoreRedis } from "./infra/redisBoot";
import { isComplianceModuleEnabled } from "./flags";
import { startWorker } from "./worker";

function envFlag(name: string): boolean {
  const v = process.env[name];
  return v != null && ["1", "true", "yes", "on"].includes(v.trim().toLowerCase());
}

export async function initComplianceInfra(): Promise<void> {
  // Rate store: safe to attempt always; no-ops without REDIS_URL.
  try {
    const r = await initRateStoreRedis();
    if (r.reason) console.log(`[Compliance] ${r.reason}`);
  } catch (err) {
    console.warn("[Compliance] rate-store init failed (non-fatal):", String(err));
  }

  // Background worker: only when explicitly enabled AND the module is on.
  if (isComplianceModuleEnabled() && envFlag("COMPLIANCE_WORKER")) {
    try {
      const intervalMs = Number(process.env.COMPLIANCE_WORKER_INTERVAL_MS ?? 5000);
      startWorker({ intervalMs });
    } catch (err) {
      console.warn("[Compliance] worker start failed (non-fatal):", String(err));
    }
  }
}
