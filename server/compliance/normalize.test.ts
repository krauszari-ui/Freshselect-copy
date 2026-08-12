import { describe, it, expect } from "vitest";
import { extractNormalizedFields } from "./normalize";

describe("extractNormalizedFields (pure)", () => {
  it("projects canonical fields from columns when formData agrees", () => {
    const n = extractNormalizedFields({
      medicaidId: "AB123 45C", firstName: "Jane", lastName: "Doe", email: "Jane@Example.COM ", cellPhone: "(718) 555-1212", zipcode: "11211-1234",
      formData: { medicaidId: "ab12345c", firstName: "jane", lastName: "doe", email: "jane@example.com", cellPhone: "7185551212", zipcode: "11211" },
    });
    expect(n.mismatchFlags).toEqual([]);
    expect(n.medicaidIdNormalized).toBe("AB12345C");
    expect(n.email).toBe("jane@example.com");
    expect(n.phoneNormalized).toBe("7185551212");
    expect(n.zipcode).toBe("11211");
  });

  it("flags fields where the column disagrees with formData", () => {
    const n = extractNormalizedFields({
      medicaidId: "AB12345C", firstName: "Jane", lastName: "Doe", email: "jane@example.com", cellPhone: "7185551212", zipcode: "11211",
      formData: { medicaidId: "ZZ99999Z", firstName: "Jane", lastName: "Smith", email: "jane@example.com", cellPhone: "7185551212", zipcode: "11211" },
    });
    expect(n.mismatchFlags.sort()).toEqual(["lastName", "medicaidId"]);
  });

  it("does not flag when one side is missing (nothing to disagree with)", () => {
    const n = extractNormalizedFields({ medicaidId: "AB12345C", firstName: "Jane", formData: {} });
    expect(n.mismatchFlags).toEqual([]);
    expect(n.medicaidIdNormalized).toBe("AB12345C");
    expect(n.firstName).toBe("Jane");
  });

  it("falls back to formData when the structured column is empty", () => {
    const n = extractNormalizedFields({ formData: { firstName: "Ari", cin: "cd 678 90e" } });
    expect(n.firstName).toBe("Ari");
    expect(n.medicaidIdNormalized).toBe("CD67890E");
    expect(n.mismatchFlags).toEqual([]);
  });

  it("tolerates a stringified formData blob", () => {
    const n = extractNormalizedFields({ firstName: "Sam", formData: JSON.stringify({ firstName: "Sam" }) });
    expect(n.firstName).toBe("Sam");
    expect(n.mismatchFlags).toEqual([]);
  });

  it("produces a stable sourceHash for equal inputs and a different one on change", () => {
    const a = extractNormalizedFields({ firstName: "Sam", formData: { firstName: "Sam" } });
    const b = extractNormalizedFields({ firstName: "Sam", formData: { firstName: "Sam" } });
    const c = extractNormalizedFields({ firstName: "Samuel", formData: { firstName: "Samuel" } });
    expect(a.sourceHash).toBe(b.sourceHash);
    expect(a.sourceHash).not.toBe(c.sourceHash);
  });
});
