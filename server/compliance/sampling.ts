/**
 * Audit sampling — deterministic and reproducible.
 *
 * Every sample preserves the complete population snapshot, the selection method,
 * and the random seed, so a reviewer can re-derive the exact same sample later.
 * `Math.random()` is never used (it is also unavailable in this codebase's
 * workflow runtime); a seeded PRNG makes selection reproducible. Staff cannot
 * swap out a failed sample record — the selected ids are fixed at selection time
 * and `verifySampleReproducible` proves they were not altered.
 */
import { createHash } from "crypto";

export const SAMPLING_METHODS = [
  "full_population",
  "random",
  "stratified",
  "risk_based",
  "dollar_based",
  "judgmental",
] as const;
export type SamplingMethod = (typeof SAMPLING_METHODS)[number];

/** A population record: an id, an optional stratum, risk score, and dollar amount. */
export interface PopulationItem {
  id: number;
  stratum?: string | null;
  riskScore?: number | null;
  amountCents?: number | null;
}

export interface SampleSelection {
  method: SamplingMethod;
  seed: number;
  size: number;
  populationIds: number[];
  selectedIds: number[];
  excludedIds: number[];
}

/** Deterministic PRNG (mulberry32). Same seed → same sequence, forever. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic Fisher–Yates shuffle driven by a seeded PRNG (pure — copies). */
export function seededShuffle<T>(items: T[], seed: number): T[] {
  const arr = items.slice();
  const rand = mulberry32(seed);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export interface SelectSampleOptions {
  method: SamplingMethod;
  seed: number;
  size?: number;
  /** For judgmental sampling: explicit ids chosen by the auditor. */
  judgmentalIds?: number[];
}

/**
 * Select a sample from a population. Returns the full selection record including
 * the untouched population snapshot, the seed, and the excluded ids.
 */
export function selectSample(population: PopulationItem[], opts: SelectSampleOptions): SampleSelection {
  const populationIds = population.map((p) => p.id);
  const size = opts.size ?? populationIds.length;
  let selectedIds: number[];

  switch (opts.method) {
    case "full_population":
      selectedIds = populationIds.slice();
      break;
    case "random":
      selectedIds = seededShuffle(populationIds, opts.seed).slice(0, size);
      break;
    case "stratified": {
      // Group by stratum, then sample proportionally with at least 1 per stratum.
      const groups = new Map<string, number[]>();
      for (const p of population) {
        const key = p.stratum ?? "_none";
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(p.id);
      }
      const total = populationIds.length || 1;
      const entries = Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
      // Initial proportional quota per stratum: at least 1, never more than the stratum size.
      const quotas = entries.map(([, ids]) => Math.min(ids.length, Math.max(1, Math.round((ids.length / total) * size))));
      // Reduce over-allocation WITHOUT dropping any stratum below 1 (so the largest
      // stratum can never be silently excluded). When `size` < number of strata it
      // is impossible to honor both "exactly size" and "≥1 per stratum"; we favor
      // representation — the recorded sample size is selection.selectedIds.length.
      let sum = quotas.reduce((a, b) => a + b, 0);
      while (sum > size) {
        let idx = -1;
        let max = 1;
        for (let i = 0; i < quotas.length; i++) {
          if (quotas[i] > max) { max = quotas[i]; idx = i; }
        }
        if (idx === -1) break; // every stratum already at 1 — cannot reduce further
        quotas[idx] -= 1;
        sum -= 1;
      }
      selectedIds = [];
      entries.forEach(([key, ids], i) => {
        // Seed per-stratum deterministically so the whole selection is reproducible.
        const seedForStratum = (opts.seed + hashString(key)) >>> 0;
        selectedIds.push(...seededShuffle(ids, seedForStratum).slice(0, quotas[i]));
      });
      break;
    }
    case "risk_based": {
      // Highest risk first; ties broken deterministically by id.
      selectedIds = population
        .slice()
        .sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0) || a.id - b.id)
        .slice(0, size)
        .map((p) => p.id);
      break;
    }
    case "dollar_based": {
      // Simplified monetary-unit sampling: largest dollar amounts first.
      selectedIds = population
        .slice()
        .sort((a, b) => (b.amountCents ?? 0) - (a.amountCents ?? 0) || a.id - b.id)
        .slice(0, size)
        .map((p) => p.id);
      break;
    }
    case "judgmental": {
      const chosen = new Set(opts.judgmentalIds ?? []);
      selectedIds = populationIds.filter((id) => chosen.has(id));
      break;
    }
    default:
      selectedIds = [];
  }

  const selectedSet = new Set(selectedIds);
  const excludedIds = populationIds.filter((id) => !selectedSet.has(id));
  return { method: opts.method, seed: opts.seed, size, populationIds, selectedIds, excludedIds };
}

/**
 * Deterministic commitment to an exact selection: SHA-256 over the sorted ids.
 * Recorded in the append-only, hash-chained `auditEvents` at selection time so a
 * judgmental sample (whose ids are not seed-derivable) is still tamper-evident:
 * editing the stored `selectedIds` no longer matches the committed hash, and the
 * commitment itself cannot be edited without breaking the audit chain.
 */
export function sampleSelectionHash(selectedIds: number[]): string {
  const sorted = selectedIds.slice().sort((a, b) => a - b);
  return createHash("sha256").update(JSON.stringify(sorted)).digest("hex");
}

/**
 * Re-derive a sample from the preserved population + method + seed and confirm it
 * matches the recorded selection. Detects post-hoc tampering.
 *
 * For seed-derivable methods (full_population/random/stratified/risk_based/
 * dollar_based) the recomputation is independent of the recorded ids, so tamper
 * detection is intrinsic. For `judgmental` the ids are auditor-chosen and NOT
 * seed-derivable — a `committedHash` (from the sample's audit event) MUST be
 * supplied; otherwise judgmental verification cannot be authoritative and returns
 * false (fail-safe) rather than tautologically true.
 */
export function verifySampleReproducible(
  population: PopulationItem[],
  recorded: SampleSelection,
  committedHash?: string,
): boolean {
  if (recorded.method === "judgmental") {
    if (!committedHash) return false; // cannot self-verify auditor-chosen ids
    return sampleSelectionHash(recorded.selectedIds) === committedHash;
  }
  const redo = selectSample(population, { method: recorded.method, seed: recorded.seed, size: recorded.size });
  if (redo.selectedIds.length !== recorded.selectedIds.length) return false;
  const a = redo.selectedIds.slice().sort((x, y) => x - y);
  const b = recorded.selectedIds.slice().sort((x, y) => x - y);
  return a.every((v, i) => v === b[i]);
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

// ─── Error-rate & exposure (tracked separately) ──────────────────────────────
export interface TestOutcomeCounts {
  pass: number;
  fail: number;
  observation: number;
  not_applicable: number;
  insufficient_evidence: number;
  pending_clarification: number;
}

/**
 * Error rate = fails / (tested items that were applicable and had sufficient
 * evidence). N/A, insufficient-evidence, and pending items are excluded from the
 * denominator, never silently counted as passes.
 */
export function computeErrorRate(counts: TestOutcomeCounts): number {
  const denom = counts.pass + counts.fail + counts.observation;
  if (denom === 0) return 0;
  return counts.fail / denom;
}
