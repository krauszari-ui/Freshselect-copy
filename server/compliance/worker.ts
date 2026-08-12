/**
 * Durable background-job worker.
 *
 * Drains the `jobs` table (see infra/jobQueue.ts) by claiming runnable jobs with
 * a row lock, dispatching each to a typed handler, and recording success/failure
 * with retry + dead-letter semantics. Two ways to run it:
 *   - a long-lived loop (`startWorker`) for a persistent Node server, and
 *   - `drainQueue()` for a serverless cron endpoint (process a batch per tick).
 *
 * Handlers are best-effort and isolated: a throwing handler fails only its own
 * job (retried with backoff), never the loop. Unknown/placeholder job types are
 * treated as no-ops so enqueuing a not-yet-implemented job can never wedge the
 * queue.
 */
import type { Job } from "../../drizzle/schema";
import { requireDb, withTransaction } from "./db";
import { claimNextJob, completeJob, failJob, type JobType } from "./infra/jobQueue";
import { loadAuditChain, verifyAuditChain } from "./audit";
import { recomputeReadiness } from "./store";
import { notifyOversight } from "./notificationService";
import type { Actor } from "./store";

/** The worker acts as the system principal (no human actor). */
const SYSTEM_ACTOR: Actor = {
  actorId: null, actorName: "system:worker", actorRole: "system",
  orgId: null, sessionId: null, ip: null, userAgent: null, originalActorId: null,
};

type Handler = (job: Job) => Promise<void>;

function payloadOf(job: Job): Record<string, unknown> {
  const p = job.payload as unknown;
  if (p && typeof p === "object") return p as Record<string, unknown>;
  if (typeof p === "string") { try { return JSON.parse(p); } catch { return {}; } }
  return {};
}

const noop: Handler = async () => { /* placeholder — inline paths handle these today */ };

const HANDLERS: Record<JobType, Handler> = {
  // Recompute a client's derived readiness (config/evidence changed elsewhere).
  readiness_recalc: async (job) => {
    const submissionId = Number(payloadOf(job).submissionId);
    if (!Number.isInteger(submissionId) || submissionId <= 0) return;
    await recomputeReadiness(SYSTEM_ACTOR, submissionId);
  },
  // Verify the tamper-evident audit chain; escalate to oversight if broken.
  audit_integrity_verification: async () => {
    const db = await requireDb();
    const chain = await loadAuditChain(db);
    const result = verifyAuditChain(chain);
    if (!result.ok) {
      await notifyOversight({
        category: "audit_integrity", severity: "critical",
        title: "Audit log integrity check FAILED",
        body: `Hash chain broke at event #${result.brokenAtId ?? "?"} (${result.reason ?? "unknown"}). Investigate immediately.`,
        relatedRecordType: "auditEvent", relatedRecordId: result.brokenAtId ?? null,
      });
    }
  },
  // The rest are enqueue-able but currently handled inline or are host concerns;
  // safe no-ops keep the queue healthy until a dedicated handler is wired.
  email: noop,
  pdf_generation: noop,
  file_scan: noop,
  requirement_assignment: noop,
  deadline_reminder: noop,
  audit_package: noop,
  daily_reconciliation: noop,
  backup_verification: noop,
};

/** Claim + run at most one job. Returns the outcome, or null if the queue is empty. */
export async function processOneJob(): Promise<{ id: number; jobType: string; ok: boolean } | null> {
  const job = await withTransaction((tx) => claimNextJob(tx));
  if (!job) return null;
  const handler = HANDLERS[job.jobType as JobType] ?? noop;
  try {
    await handler(job);
    await completeJob(job.id);
    return { id: job.id, jobType: job.jobType, ok: true };
  } catch (err) {
    await failJob(job, err instanceof Error ? err.message : String(err));
    return { id: job.id, jobType: job.jobType, ok: false };
  }
}

/** Process up to `max` runnable jobs (one batch). Ideal for a cron endpoint. */
export async function drainQueue(max = 25): Promise<{ processed: number; succeeded: number; failed: number }> {
  let processed = 0, succeeded = 0, failed = 0;
  for (let i = 0; i < max; i++) {
    const r = await processOneJob();
    if (!r) break;
    processed++;
    if (r.ok) succeeded++; else failed++;
  }
  return { processed, succeeded, failed };
}

let timer: ReturnType<typeof setInterval> | null = null;
let ticking = false;

/**
 * Start a long-lived polling worker (for a persistent Node server). Guarded so
 * ticks never overlap. No-op if already running. Returns a stop function.
 */
export function startWorker(opts: { intervalMs?: number; batch?: number } = {}): () => void {
  if (timer) return stopWorker;
  const intervalMs = Math.max(opts.intervalMs ?? 5000, 1000);
  const batch = opts.batch ?? 25;
  timer = setInterval(async () => {
    if (ticking) return;
    ticking = true;
    try {
      await drainQueue(batch);
    } catch (err) {
      console.warn("[Worker] tick failed:", String(err));
    } finally {
      ticking = false;
    }
  }, intervalMs);
  if (typeof timer.unref === "function") timer.unref(); // don't keep the process alive
  console.log(`[Worker] started (interval ${intervalMs}ms, batch ${batch})`);
  return stopWorker;
}

export function stopWorker(): void {
  if (timer) { clearInterval(timer); timer = null; }
}
