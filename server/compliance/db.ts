/**
 * Compliance data-access helpers.
 *
 * Intentionally separate from the large legacy `server/db.ts` so the compliance
 * module is self-contained and reviewable. Reuses the SAME connection pool via
 * `getDb()` — one database, one client record.
 */
import type { MySql2Database } from "drizzle-orm/mysql2";
import { getDb } from "../db";

export type Db = MySql2Database<Record<string, unknown>>;
/** A transaction handle has the same query surface as the base Db. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Anything we can run queries against — the pool or an open transaction. */
export type Queryer = Db | Tx;

/**
 * Detect a MySQL/MariaDB duplicate-key (ER_DUP_ENTRY / errno 1062) error.
 * Drizzle wraps driver errors in a DrizzleQueryError, so the real code lives on
 * `err.cause` (sometimes nested) — check the whole cause chain, not just the top.
 * Used by idempotent inserts (unique constraints) to no-op gracefully on a retry.
 */
export function isDuplicateKeyError(err: unknown): boolean {
  let e: unknown = err;
  for (let i = 0; i < 6 && e != null; i++) {
    const c = e as { code?: string; errno?: number; cause?: unknown };
    if (c.code === "ER_DUP_ENTRY" || c.code === "ER_DUP_KEY" || c.errno === 1062) return true;
    e = c.cause;
  }
  return false;
}

/** Resolve the shared DB or throw a typed error (so callers fail loudly). */
export async function requireDb(): Promise<Db> {
  const db = await getDb();
  if (!db) {
    throw new Error("DATABASE_UNAVAILABLE: compliance operations require a database connection");
  }
  return db;
}

/**
 * Run `fn` inside a database transaction. Unlike the legacy code (which uses no
 * transactions at all), every multi-table compliance mutation goes through this
 * so partial writes cannot occur and the audit event commits atomically with the
 * business change.
 */
export async function withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const db = await requireDb();
  return db.transaction(async (tx) => fn(tx));
}
