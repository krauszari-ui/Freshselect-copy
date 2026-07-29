/**
 * Durable, DB-backed background-job queue.
 *
 * Replaces detached `setTimeout(0)` work (which is lost on process exit / cold
 * start) with rows in the `jobs` table. Supports idempotency, retries with
 * exponential backoff, a dead-letter state, and manual retry. A worker loop or
 * cron invocation drains the queue via `claimNextJob` + `completeJob`/`failJob`.
 */
import { and, eq, lte, sql } from "drizzle-orm";
import { jobs, type Job } from "../../../drizzle/schema";
import { requireDb, type Queryer } from "../db";

export type JobType =
  | "email"
  | "pdf_generation"
  | "file_scan"
  | "requirement_assignment"
  | "readiness_recalc"
  | "deadline_reminder"
  | "audit_package"
  | "daily_reconciliation"
  | "audit_integrity_verification"
  | "backup_verification";

export interface EnqueueOptions {
  jobType: JobType;
  payload?: Record<string, unknown>;
  /** Idempotency key — a duplicate enqueue with the same key is ignored. */
  idempotencyKey?: string;
  maxAttempts?: number;
  runAfter?: Date;
}

/** Exponential backoff with a cap (pure, testable). */
export function backoffDelayMs(attempt: number, baseMs = 2000, capMs = 3_600_000): number {
  const delay = baseMs * 2 ** Math.max(0, attempt - 1);
  return Math.min(delay, capMs);
}

/** Enqueue a job. Idempotent when `idempotencyKey` is provided. */
export async function enqueueJob(opts: EnqueueOptions): Promise<{ enqueued: boolean }> {
  const db = await requireDb();
  try {
    await db.insert(jobs).values({
      jobType: opts.jobType,
      idempotencyKey: opts.idempotencyKey ?? null,
      payload: (opts.payload ?? null) as Job["payload"],
      status: "queued",
      attempts: 0,
      maxAttempts: opts.maxAttempts ?? 5,
      runAfter: opts.runAfter ?? new Date(),
    });
    return { enqueued: true };
  } catch (err) {
    // Unique-constraint violation on idempotencyKey = already enqueued.
    if (opts.idempotencyKey && isDuplicateKeyError(err)) return { enqueued: false };
    throw err;
  }
}

function isDuplicateKeyError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === "ER_DUP_ENTRY" || code === "ER_DUP_KEY";
}

/**
 * Atomically claim the next runnable job. Uses a transaction + row lock so two
 * workers never claim the same job.
 */
export async function claimNextJob(q: Queryer, now = new Date()): Promise<Job | null> {
  const rows = await q
    .select()
    .from(jobs)
    .where(and(eq(jobs.status, "queued"), lte(jobs.runAfter, now)))
    .orderBy(jobs.runAfter)
    .limit(1)
    .for("update", { skipLocked: true });
  const job = rows[0];
  if (!job) return null;
  await q
    .update(jobs)
    .set({ status: "running", attempts: job.attempts + 1 })
    .where(eq(jobs.id, job.id));
  return { ...job, status: "running", attempts: job.attempts + 1 };
}

export async function completeJob(jobId: number): Promise<void> {
  const db = await requireDb();
  await db.update(jobs).set({ status: "succeeded", completedAt: new Date() }).where(eq(jobs.id, jobId));
}

/**
 * Mark a failed attempt. Re-queues with backoff until `maxAttempts` is reached,
 * then moves the job to `dead_letter` for manual inspection/retry.
 */
export async function failJob(job: Job, error: string): Promise<void> {
  const db = await requireDb();
  if (job.attempts >= job.maxAttempts) {
    await db.update(jobs).set({ status: "dead_letter", lastError: error }).where(eq(jobs.id, job.id));
    return;
  }
  const runAfter = new Date(Date.now() + backoffDelayMs(job.attempts));
  await db.update(jobs).set({ status: "queued", lastError: error, runAfter }).where(eq(jobs.id, job.id));
}

/** Manually re-queue a dead-lettered job. */
export async function retryDeadLetter(jobId: number): Promise<void> {
  const db = await requireDb();
  await db
    .update(jobs)
    .set({ status: "queued", runAfter: new Date(), lastError: null })
    .where(and(eq(jobs.id, jobId), eq(jobs.status, "dead_letter")));
}

export async function countJobsByStatus(): Promise<Record<string, number>> {
  const db = await requireDb();
  const rows = await db
    .select({ status: jobs.status, n: sql<number>`count(*)` })
    .from(jobs)
    .groupBy(jobs.status);
  const out: Record<string, number> = {};
  for (const r of rows) out[r.status] = Number(r.n);
  return out;
}
