/**
 * Requirements engine — effective-date selection, applicability, retroactivity.
 */
import { describe, it, expect } from "vitest";
import {
  selectEffectiveVersion, requirementApplies, evaluateRule,
  retroactiveApplicationAllowed, computeDueDate,
} from "./requirements";
import type { RequirementVersion, RequirementApplicabilityRule } from "../../drizzle/schema";

function ver(p: Partial<RequirementVersion>): RequirementVersion {
  return {
    id: p.id ?? 1, definitionId: 1, version: p.version ?? 1, title: p.title ?? "R",
    plainDescription: null, sourceOrganization: null, sourceDocument: null, sourceUrl: null,
    section: null, page: null,
    effectiveDate: p.effectiveDate ?? null, endDate: p.endDate ?? null,
    serviceCategory: null, population: null, program: null, scn: null, mco: null,
    evidenceRequired: null, responsibleRole: null, reviewerRole: null,
    blocking: p.blocking ?? true, renewalFrequency: null, dueDateRule: null,
    riskLevel: "medium", auditTest: null, failureConsequence: null, internalInterpretation: null,
    attorneyReviewStatus: null, approvalStatus: p.approvalStatus ?? "approved", supersededById: null,
    retroactiveApproved: p.retroactiveApproved ?? false, retroactiveLegalBasis: p.retroactiveLegalBasis ?? null,
    retroactiveApprovedBy: null, createdBy: null,
    createdAt: new Date(), updatedAt: new Date(),
  };
}

function rule(p: Partial<RequirementApplicabilityRule>): RequirementApplicabilityRule {
  return { id: p.id ?? 1, requirementVersionId: 1, attribute: p.attribute ?? "program", operator: p.operator ?? "eq", value: p.value ?? null };
}

describe("selectEffectiveVersion", () => {
  const v1 = ver({ id: 1, version: 1, effectiveDate: new Date("2025-01-01"), endDate: new Date("2026-01-01") });
  const v2 = ver({ id: 2, version: 2, effectiveDate: new Date("2026-01-01"), endDate: null });

  it("selects the version in force on the service date", () => {
    expect(selectEffectiveVersion([v1, v2], new Date("2025-06-01"))?.id).toBe(1);
    expect(selectEffectiveVersion([v1, v2], new Date("2026-06-01"))?.id).toBe(2);
  });

  it("uses the boundary correctly (endDate is exclusive)", () => {
    // On 2026-01-01, v1 has ended (endDate exclusive) and v2 begins.
    expect(selectEffectiveVersion([v1, v2], new Date("2026-01-01"))?.id).toBe(2);
  });

  it("ignores non-approved (draft/retired) versions", () => {
    const draft = ver({ id: 3, version: 3, effectiveDate: new Date("2020-01-01"), approvalStatus: "draft" });
    expect(selectEffectiveVersion([draft], new Date("2026-06-01"))).toBeNull();
  });

  it("returns null when no version is effective", () => {
    expect(selectEffectiveVersion([v2], new Date("2020-01-01"))).toBeNull();
  });
});

describe("applicability rules", () => {
  it("eq / neq / in / exists operators", () => {
    const ctx = { serviceDate: new Date(), program: "SCN", mco: "" };
    expect(evaluateRule(rule({ attribute: "program", operator: "eq", value: "scn" }), ctx)).toBe(true);
    expect(evaluateRule(rule({ attribute: "program", operator: "neq", value: "other" }), ctx)).toBe(true);
    expect(evaluateRule(rule({ attribute: "program", operator: "in", value: "a,scn,b" }), ctx)).toBe(true);
    expect(evaluateRule(rule({ attribute: "mco", operator: "exists" }), ctx)).toBe(false);
    expect(evaluateRule(rule({ attribute: "program", operator: "exists" }), ctx)).toBe(true);
  });

  it("requires ALL rules to match (AND)", () => {
    const ctx = { serviceDate: new Date(), program: "SCN", population: "enhanced" };
    const rules = [rule({ attribute: "program", value: "SCN" }), rule({ attribute: "population", value: "enhanced" })];
    expect(requirementApplies(rules, ctx)).toBe(true);
    expect(requirementApplies([...rules, rule({ attribute: "program", value: "OTHER" })], ctx)).toBe(false);
  });

  it("a version with no rules applies universally", () => {
    expect(requirementApplies([], { serviceDate: new Date() })).toBe(true);
  });
});

describe("retroactive application", () => {
  const serviceDate = new Date("2025-06-01");
  it("blocks a version effective AFTER the service date without approval", () => {
    const v = ver({ effectiveDate: new Date("2026-01-01") });
    expect(retroactiveApplicationAllowed(v, serviceDate)).toBe(false);
  });
  it("allows retroactive application when approved with a legal basis", () => {
    const v = ver({ effectiveDate: new Date("2026-01-01"), retroactiveApproved: true, retroactiveLegalBasis: "OMIG guidance 2026-4" });
    expect(retroactiveApplicationAllowed(v, serviceDate)).toBe(true);
  });
  it("allows a version already effective on/before the service date", () => {
    const v = ver({ effectiveDate: new Date("2025-01-01") });
    expect(retroactiveApplicationAllowed(v, serviceDate)).toBe(true);
  });
});

describe("computeDueDate", () => {
  it("adds days/weeks/months from an anchor", () => {
    const anchor = new Date("2026-01-01T00:00:00Z");
    expect(computeDueDate({ rule: "days:30", anchor })?.toISOString().slice(0, 10)).toBe("2026-01-31");
    expect(computeDueDate({ rule: "weeks:2", anchor })?.toISOString().slice(0, 10)).toBe("2026-01-15");
  });
  it("returns null for empty/unknown rules", () => {
    expect(computeDueDate({ rule: null, anchor: new Date() })).toBeNull();
    expect(computeDueDate({ rule: "garbage", anchor: new Date() })).toBeNull();
  });
});
