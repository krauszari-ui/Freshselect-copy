/**
 * Feature-flag evaluation for the compliance module.
 *
 * Flags are environment-driven and DEFAULT OFF so that deploying this code
 * changes nothing about the existing application until an operator explicitly
 * opts in. This supports the gradual, backward-compatible rollout required by
 * the deployment plan.
 *
 *   COMPLIANCE_MODULE=1   enable module (nav, routes, procedures)
 *   COMPLIANCE_GATES=1    enforce readiness/invoicing gates (else advisory-only)
 *   COMPLIANCE_MFA=1      require MFA for privileged roles
 */
import { COMPLIANCE_FLAGS, type ComplianceFlag } from "@shared/compliance/constants";

function readEnvFlag(name: string): boolean {
  const raw = process.env[name];
  if (raw == null) return false;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export function isFlagEnabled(flag: ComplianceFlag): boolean {
  return readEnvFlag(flag);
}

export function isComplianceModuleEnabled(): boolean {
  return isFlagEnabled(COMPLIANCE_FLAGS.MODULE);
}

export function areGatesEnforced(): boolean {
  // Gates only matter when the module itself is on.
  return isComplianceModuleEnabled() && isFlagEnabled(COMPLIANCE_FLAGS.GATES);
}

export function isMfaRequired(): boolean {
  return isComplianceModuleEnabled() && isFlagEnabled(COMPLIANCE_FLAGS.MFA);
}

export function areSessionsEnforced(): boolean {
  // Server-side session enforcement only matters when the module is on.
  return isComplianceModuleEnabled() && isFlagEnabled(COMPLIANCE_FLAGS.SESSIONS);
}

/** Snapshot of all flags — exposed to the client so the UI matches the server. */
export function complianceFlagSnapshot(): {
  module: boolean;
  gates: boolean;
  mfa: boolean;
  sessions: boolean;
} {
  return {
    module: isComplianceModuleEnabled(),
    gates: areGatesEnforced(),
    mfa: isMfaRequired(),
    sessions: areSessionsEnforced(),
  };
}
