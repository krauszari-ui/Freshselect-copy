/**
 * RBAC — permission derivation, least privilege, separation of duties.
 * Satisfies "Permission checks" and "Role escalation" security tests.
 */
import { describe, it, expect } from "vitest";
import { getEffectivePermissions, hasPermission, separationOfDutiesOk } from "./rbac";
import { PERMISSIONS } from "@shared/compliance/constants";

describe("permission derivation", () => {
  it("super_admin and admin get every permission", () => {
    expect(hasPermission({ role: "super_admin" }, PERMISSIONS.MEDICAID_ID_REVEAL)).toBe(true);
    expect(hasPermission({ role: "admin" }, PERMISSIONS.EXCEPTION_APPROVE)).toBe(true);
  });

  it("worker can manage operations but NOT approve exceptions or reveal Medicaid IDs", () => {
    const worker = { role: "worker" };
    expect(hasPermission(worker, PERMISSIONS.ELIGIBILITY_MANAGE)).toBe(true);
    expect(hasPermission(worker, PERMISSIONS.EXCEPTION_APPROVE)).toBe(false);
    expect(hasPermission(worker, PERMISSIONS.MEDICAID_ID_REVEAL)).toBe(false);
    expect(hasPermission(worker, PERMISSIONS.REQUIREMENT_APPROVE)).toBe(false);
  });

  it("viewer is read-only", () => {
    const viewer = { role: "viewer" };
    expect(hasPermission(viewer, PERMISSIONS.ELIGIBILITY_VIEW)).toBe(true);
    expect(hasPermission(viewer, PERMISSIONS.ELIGIBILITY_MANAGE)).toBe(false);
  });

  it("public 'user' role has no compliance permissions (no escalation)", () => {
    expect(getEffectivePermissions({ role: "user" }).size).toBe(0);
    expect(hasPermission({ role: "user" }, PERMISSIONS.COMPLIANCE_VIEW)).toBe(false);
  });

  it("normalized compliance roles ADD permissions on top of the legacy role", () => {
    // An assessor (legacy) who is also a clinical_reviewer gains approve rights.
    expect(hasPermission({ role: "assessor" }, PERMISSIONS.REQUIREMENT_APPROVE)).toBe(false);
    expect(hasPermission({ role: "assessor", complianceRoles: ["clinical_reviewer"] }, PERMISSIONS.REQUIREMENT_APPROVE)).toBe(true);
  });

  it("compliance_officer role grants exception approval; billing_specialist grants reveal", () => {
    expect(hasPermission({ role: "worker", complianceRoles: ["compliance_officer"] }, PERMISSIONS.EXCEPTION_APPROVE)).toBe(true);
    expect(hasPermission({ role: "worker", complianceRoles: ["billing_specialist"] }, PERMISSIONS.MEDICAID_ID_REVEAL)).toBe(true);
  });
});

describe("separation of duties", () => {
  it("same person cannot fill both roles", () => {
    expect(separationOfDutiesOk(1, 1)).toBe(false);
    expect(separationOfDutiesOk(1, 2)).toBe(true);
  });
});
