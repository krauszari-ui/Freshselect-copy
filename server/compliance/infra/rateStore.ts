/**
 * Rate-limit store abstraction.
 *
 * The legacy app uses `express-rate-limit` with its default in-process memory
 * store — which does NOT work correctly across multiple serverless instances
 * (each instance has its own counters). This module defines a shared-store
 * interface with an in-memory default (safe for single-instance/dev) and a
 * documented Redis adapter shape for production. No Redis dependency is added
 * here; the adapter is injected so the deployment can wire `ioredis` without a
 * code change to this file.
 */
export interface RateStore {
  /** Increment the counter for `key`, returning the new count within the window. */
  increment(key: string, windowMs: number): Promise<number>;
  reset(key: string): Promise<void>;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/** In-memory store — correct only for a single instance. Fallback / dev use. */
export class MemoryRateStore implements RateStore {
  private buckets = new Map<string, Bucket>();

  async increment(key: string, windowMs: number): Promise<number> {
    const now = Date.now();
    const existing = this.buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return 1;
    }
    existing.count += 1;
    return existing.count;
  }

  async reset(key: string): Promise<void> {
    this.buckets.delete(key);
  }
}

/**
 * Minimal Redis client shape needed for a distributed rate store. `ioredis`
 * satisfies this without modification. Kept as an interface so the production
 * dependency is injected at the edge, not imported here.
 */
export interface RedisLike {
  incr(key: string): Promise<number>;
  pexpire(key: string, ms: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

export class RedisRateStore implements RateStore {
  constructor(private redis: RedisLike) {}

  async increment(key: string, windowMs: number): Promise<number> {
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.pexpire(key, windowMs);
    return count;
  }

  async reset(key: string): Promise<void> {
    await this.redis.del(key);
  }
}

let injectedRedis: RedisLike | null = null;
/** Wire a Redis client at boot for production distributed limiting. */
export function setRateStoreRedis(client: RedisLike | null): void {
  injectedRedis = client;
}

let singleton: RateStore | null = null;
/** Returns the Redis-backed store if one was injected, else the memory fallback. */
export function getRateStore(): RateStore {
  if (injectedRedis) return new RedisRateStore(injectedRedis);
  if (!singleton) singleton = new MemoryRateStore();
  return singleton;
}

/** Pure decision helper (testable): is this count over the limit? */
export function isOverLimit(count: number, max: number): boolean {
  return count > max;
}
