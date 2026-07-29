/**
 * Requirements engine — config-driven evaluation.
 *
 * Legal/program conclusions are NOT hard-coded in React components or scattered
 * conditionals. Instead they live as versioned `requirementVersions` rows with
 * declarative `requirementApplicabilityRules`. Evaluation always selects the
 * version whose effective window contains the applicable SERVICE date, and never
 * applies a newer requirement retroactively unless it was explicitly approved
 * for retroactive use with a recorded legal basis.
 */
import type { RequirementVersion, RequirementApplicabilityRule } from "../../drizzle/schema";

/** The facts about a service used to decide which requirements apply. */
export interface EvaluationContext {
  serviceDate: Date;
  serviceCategory?: string | null;
  program?: string | null;
  population?: string | null;
  scn?: string | null;
  mco?: string | null;
  [key: string]: string | Date | null | undefined;
}

/**
 * Select the requirement version in effect on `serviceDate` from a list of
 * versions belonging to the SAME definition. Chooses the version with the latest
 * `effectiveDate` that is <= serviceDate and whose `endDate` (if set) is >
 * serviceDate. Retired/draft versions are excluded.
 */
export function selectEffectiveVersion(
  versions: RequirementVersion[],
  serviceDate: Date,
): RequirementVersion | null {
  let best: RequirementVersion | null = null;
  for (const v of versions) {
    if (v.approvalStatus !== "approved") continue;
    const eff = v.effectiveDate ? new Date(v.effectiveDate) : null;
    const end = v.endDate ? new Date(v.endDate) : null;
    // A version is in force if effectiveDate <= serviceDate < endDate.
    if (eff && eff > serviceDate) continue;
    if (end && end <= serviceDate) continue;
    if (!best) {
      best = v;
      continue;
    }
    const bestEff = best.effectiveDate ? new Date(best.effectiveDate).getTime() : -Infinity;
    const curEff = eff ? eff.getTime() : -Infinity;
    if (curEff > bestEff || (curEff === bestEff && v.version > best.version)) best = v;
  }
  return best;
}

/** Evaluate a single applicability rule against the context. */
export function evaluateRule(rule: RequirementApplicabilityRule, ctx: EvaluationContext): boolean {
  const raw = ctx[rule.attribute];
  const actual = raw instanceof Date ? raw.toISOString() : raw ?? null;
  switch (rule.operator) {
    case "exists":
      return actual != null && actual !== "";
    case "eq":
      return actual != null && String(actual).toLowerCase() === String(rule.value ?? "").toLowerCase();
    case "neq":
      return String(actual ?? "").toLowerCase() !== String(rule.value ?? "").toLowerCase();
    case "in": {
      const options = String(rule.value ?? "").split(",").map((s) => s.trim().toLowerCase());
      return actual != null && options.includes(String(actual).toLowerCase());
    }
    default:
      return false;
  }
}

/**
 * A requirement version applies when ALL of its rules match (logical AND). A
 * version with no rules applies universally (subject to effective-date checks).
 */
export function requirementApplies(
  rules: RequirementApplicabilityRule[],
  ctx: EvaluationContext,
): boolean {
  return rules.every((r) => evaluateRule(r, ctx));
}

/**
 * Guard against retroactive application: if a version's effectiveDate is AFTER
 * the service date, it may only be applied when explicitly approved for
 * retroactive use with a recorded legal basis.
 */
export function retroactiveApplicationAllowed(version: RequirementVersion, serviceDate: Date): boolean {
  const eff = version.effectiveDate ? new Date(version.effectiveDate) : null;
  if (!eff || eff <= serviceDate) return true; // not retroactive
  return version.retroactiveApproved === true && !!version.retroactiveLegalBasis;
}

export interface DueDateInput {
  rule?: string | null;
  anchor: Date;
}

/**
 * Compute a requirement's due date from a simple rule string like "days:30" or
 * "weeks:2". Unknown/empty rules return null (no due date).
 */
export function computeDueDate({ rule, anchor }: DueDateInput): Date | null {
  if (!rule) return null;
  const match = /^(days|weeks|months):(\d+)$/.exec(rule.trim());
  if (!match) return null;
  const n = parseInt(match[2], 10);
  const d = new Date(anchor);
  if (match[1] === "days") d.setDate(d.getDate() + n);
  else if (match[1] === "weeks") d.setDate(d.getDate() + n * 7);
  else d.setMonth(d.getMonth() + n);
  return d;
}
