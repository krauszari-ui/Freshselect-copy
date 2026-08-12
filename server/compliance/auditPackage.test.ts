/** Audit-package manifest — deterministic, checksummed, tamper-evident. */
import { describe, it, expect } from "vitest";
import { buildManifest, type AuditPackageData } from "./auditPackage";

function emptyData(overrides: Partial<AuditPackageData> = {}): AuditPackageData {
  const audit = { id: 7, title: "Q3 Billing Audit", auditType: "billing_accuracy", status: "closed", periodStart: null, periodEnd: null, leadAuditorId: null, recordStatus: "active", version: 1, createdBy: null, closedBy: null, createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01") } as AuditPackageData["audit"];
  return {
    audit, scopes: [], populations: [], samples: [], tests: [], findings: [],
    managementResponses: [], correctiveActions: [], followUpTests: [], requirementVersions: [],
    ...overrides,
  };
}

describe("buildManifest", () => {
  it("counts every record set and hashes each", () => {
    const data = emptyData({ findings: [{ id: 1 } as AuditPackageData["findings"][number], { id: 2 } as AuditPackageData["findings"][number]] });
    const m = buildManifest(data, "2026-08-12T00:00:00.000Z");
    expect(m.auditId).toBe(7);
    expect(m.counts.findings).toBe(2);
    expect(m.counts.audit).toBe(1);
    expect(m.recordChecksums.findings).toMatch(/^[0-9a-f]{64}$/);
    expect(m.contentChecksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for identical data + timestamp", () => {
    const a = buildManifest(emptyData(), "2026-08-12T00:00:00.000Z");
    const b = buildManifest(emptyData(), "2026-08-12T00:00:00.000Z");
    expect(a.contentChecksum).toBe(b.contentChecksum);
  });

  it("changes the checksum when any included record changes (tamper-evident)", () => {
    const base = buildManifest(emptyData({ findings: [{ id: 1, risk: "low" } as AuditPackageData["findings"][number]] }), "2026-08-12T00:00:00.000Z");
    const changed = buildManifest(emptyData({ findings: [{ id: 1, risk: "high" } as AuditPackageData["findings"][number]] }), "2026-08-12T00:00:00.000Z");
    expect(changed.recordChecksums.findings).not.toBe(base.recordChecksums.findings);
    expect(changed.contentChecksum).not.toBe(base.contentChecksum);
  });
});
