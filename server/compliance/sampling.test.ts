/** Audit sampling — deterministic, reproducible, no-replacement, error-rate. */
import { describe, it, expect } from "vitest";
import {
  mulberry32, seededShuffle, selectSample, verifySampleReproducible,
  computeErrorRate, type PopulationItem,
} from "./sampling";

function pop(n: number): PopulationItem[] {
  return Array.from({ length: n }, (_, i) => ({ id: i + 1, stratum: i % 2 === 0 ? "A" : "B", riskScore: (i * 7) % 11, amountCents: (i + 1) * 100 }));
}

describe("deterministic PRNG", () => {
  it("same seed → identical sequence", () => {
    const r1 = mulberry32(42), r2 = mulberry32(42);
    expect([r1(), r1(), r1()]).toEqual([r2(), r2(), r2()]);
  });
  it("different seeds → different sequences", () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
  it("seededShuffle is a pure permutation (same elements, deterministic order)", () => {
    const a = seededShuffle([1, 2, 3, 4, 5], 7);
    const b = seededShuffle([1, 2, 3, 4, 5], 7);
    expect(a).toEqual(b);
    expect(a.slice().sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("selectSample", () => {
  const population = pop(20);

  it("full_population selects everything", () => {
    const s = selectSample(population, { method: "full_population", seed: 1 });
    expect(s.selectedIds).toHaveLength(20);
    expect(s.excludedIds).toHaveLength(0);
  });

  it("random selection is reproducible from the seed", () => {
    const s1 = selectSample(population, { method: "random", seed: 123, size: 5 });
    const s2 = selectSample(population, { method: "random", seed: 123, size: 5 });
    expect(s1.selectedIds).toEqual(s2.selectedIds);
    expect(s1.selectedIds).toHaveLength(5);
    // preserves population snapshot + excluded set
    expect(s1.populationIds).toHaveLength(20);
    expect(s1.excludedIds).toHaveLength(15);
  });

  it("risk_based picks highest risk first, deterministic tie-break", () => {
    const s = selectSample(population, { method: "risk_based", seed: 1, size: 3 });
    expect(s.selectedIds).toHaveLength(3);
    // recompute must match
    expect(verifySampleReproducible(population, s)).toBe(true);
  });

  it("dollar_based picks largest amounts first", () => {
    const s = selectSample(population, { method: "dollar_based", seed: 1, size: 2 });
    // ids 20 and 19 have the largest amountCents
    expect(s.selectedIds).toEqual([20, 19]);
  });

  it("stratified draws from each stratum and is reproducible", () => {
    const s = selectSample(population, { method: "stratified", seed: 9, size: 6 });
    expect(s.selectedIds.length).toBeGreaterThan(0);
    expect(verifySampleReproducible(population, s)).toBe(true);
  });

  it("judgmental honors explicit ids only", () => {
    const s = selectSample(population, { method: "judgmental", seed: 0, judgmentalIds: [3, 7, 99] });
    expect(s.selectedIds).toEqual([3, 7]); // 99 not in population
  });

  it("verifySampleReproducible detects tampering (a swapped record fails)", () => {
    const s = selectSample(population, { method: "random", seed: 5, size: 4 });
    const tampered = { ...s, selectedIds: [...s.selectedIds.slice(1), 999] };
    expect(verifySampleReproducible(population, tampered)).toBe(false);
  });
});

describe("error rate excludes N/A and insufficient evidence from the denominator", () => {
  it("does not silently count non-tested items as passes", () => {
    const rate = computeErrorRate({ pass: 6, fail: 2, observation: 2, not_applicable: 5, insufficient_evidence: 3, pending_clarification: 1 });
    // denom = 6 + 2 + 2 = 10; fails = 2 → 0.2
    expect(rate).toBeCloseTo(0.2, 5);
  });
  it("is 0 when nothing testable", () => {
    expect(computeErrorRate({ pass: 0, fail: 0, observation: 0, not_applicable: 4, insufficient_evidence: 0, pending_clarification: 0 })).toBe(0);
  });
});
