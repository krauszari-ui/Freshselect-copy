/** Reports — CSV serialization (RFC 4180) + registry integrity. */
import { describe, it, expect } from "vitest";
import { csvField, toCsv, REPORT_DEFINITIONS, reportDefinition } from "./reports";

describe("csvField", () => {
  it("passes simple values through", () => {
    expect(csvField("hello")).toBe("hello");
    expect(csvField(42)).toBe("42");
    expect(csvField(null)).toBe("");
    expect(csvField(undefined)).toBe("");
  });
  it("quotes and escapes fields containing comma, quote, or newline", () => {
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField('she said "hi"')).toBe('"she said ""hi"""');
    expect(csvField("line1\nline2")).toBe('"line1\nline2"');
  });
  it("serializes Dates as ISO", () => {
    expect(csvField(new Date("2026-01-02T03:04:05.000Z"))).toBe("2026-01-02T03:04:05.000Z");
  });
});

describe("toCsv", () => {
  it("emits a header row then data rows, CRLF-delimited", () => {
    const csv = toCsv({ columns: ["a", "b"], rows: [{ a: 1, b: "x,y" }, { a: 2, b: "z" }] });
    expect(csv).toBe('a,b\r\n1,"x,y"\r\n2,z');
  });
  it("handles missing keys as empty", () => {
    expect(toCsv({ columns: ["a", "b"], rows: [{ a: 1 }] })).toBe("a,b\r\n1,");
  });
});

describe("report registry", () => {
  it("every report has a unique key, title, and permission", () => {
    const keys = new Set<string>();
    for (const d of REPORT_DEFINITIONS) {
      expect(d.key).toBeTruthy();
      expect(d.title).toBeTruthy();
      expect(d.permission).toMatch(/:/);
      expect(keys.has(d.key)).toBe(false);
      keys.add(d.key);
    }
    expect(REPORT_DEFINITIONS.length).toBeGreaterThanOrEqual(15);
  });
  it("reportDefinition looks up by key", () => {
    expect(reportDefinition("client_readiness")?.title).toBe("Client Readiness");
    expect(reportDefinition("nope")).toBeUndefined();
  });
});
