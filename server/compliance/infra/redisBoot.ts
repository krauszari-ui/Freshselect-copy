/**
 * Production Redis wiring for the distributed rate store.
 *
 * If REDIS_URL is set, we dynamically import `ioredis` and inject a client into
 * the rate store so counters are shared across serverless instances. Everything
 * is fail-safe: no REDIS_URL, `ioredis` not installed, or a connection error all
 * leave the in-memory fallback in place (correct for a single instance / dev) —
 * a rate-limit backend must never crash the app at boot.
 */
import { setRateStoreRedis, type RedisLike } from "./rateStore";

let wired = false;

export async function initRateStoreRedis(): Promise<{ wired: boolean; reason?: string }> {
  if (wired) return { wired: true };
  const url = process.env.REDIS_URL;
  if (!url) return { wired: false, reason: "REDIS_URL not set — using in-memory rate store" };
  try {
    // Dynamic import so `ioredis` is an OPTIONAL dependency — absent in dev.
    const mod: any = await import("ioredis" as string).catch(() => null);
    const Redis = mod?.default ?? mod?.Redis ?? mod;
    if (!Redis) return { wired: false, reason: "ioredis not installed — using in-memory rate store" };
    const client = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: false });
    client.on?.("error", (err: unknown) => console.warn("[RateStore] Redis error:", String(err)));
    setRateStoreRedis(client as RedisLike);
    wired = true;
    console.log("[RateStore] Redis rate store wired");
    return { wired: true };
  } catch (err) {
    console.warn("[RateStore] Failed to wire Redis; falling back to memory:", String(err));
    return { wired: false, reason: String(err) };
  }
}
