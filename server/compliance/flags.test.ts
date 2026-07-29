/**
 * Feature flags default OFF and gate the module correctly.
 */
import { describe, it, expect, afterEach } from "vitest";
import { isComplianceModuleEnabled, areGatesEnforced, isMfaRequired, complianceFlagSnapshot } from "./flags";

const KEYS = ["COMPLIANCE_MODULE", "COMPLIANCE_GATES", "COMPLIANCE_MFA"];
afterEach(() => { for (const k of KEYS) delete process.env[k]; });

describe("compliance feature flags", () => {
  it("default OFF — deploying the code changes nothing until opted in", () => {
    expect(isComplianceModuleEnabled()).toBe(false);
    expect(areGatesEnforced()).toBe(false);
    expect(isMfaRequired()).toBe(false);
  });

  it("MODULE flag enables the module", () => {
    process.env.COMPLIANCE_MODULE = "1";
    expect(isComplianceModuleEnabled()).toBe(true);
  });

  it("gates/mfa require the module to also be on", () => {
    process.env.COMPLIANCE_GATES = "true";
    process.env.COMPLIANCE_MFA = "true";
    expect(areGatesEnforced()).toBe(false); // module still off
    process.env.COMPLIANCE_MODULE = "yes";
    expect(areGatesEnforced()).toBe(true);
    expect(isMfaRequired()).toBe(true);
  });

  it("snapshot reflects current env", () => {
    process.env.COMPLIANCE_MODULE = "on";
    expect(complianceFlagSnapshot()).toEqual({ module: true, gates: false, mfa: false });
  });
});
