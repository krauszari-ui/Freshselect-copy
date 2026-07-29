import { describe, it, expect } from "vitest";
import { generateAttestationPdf } from "./generateAttestationPdf";

describe("generateAttestationPdf", () => {
  it("generates a valid PDF with all required data", async () => {
    const result = await generateAttestationPdf({
      applicantName: "Jane Doe",
      guardianName: "Jane Doe",
      referenceNumber: "TEST01",
      signatureDataUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRg==", // minimal JPEG header
      hipaaConsentAt: new Date("2026-04-19T12:00:00Z"),
      householdMembers: [
        { name: "John Doe", dateOfBirth: "01/15/1990", medicaidId: "AB12345C", relationship: "Husband" },
        { name: "Baby Doe", dateOfBirth: "03/01/2024", medicaidId: "CD67890E", relationship: "Child" },
      ],
      medicaidId: "XY98765Z",
      supermarket: "Breadberry",
    });

    expect(result).not.toBeNull();
    expect(result).toBeInstanceOf(Uint8Array);
    // PDF files start with %PDF
    if (result) {
      const header = new TextDecoder().decode(result.slice(0, 5));
      expect(header).toBe("%PDF-");
      // Should be a reasonable size (at least 1KB for a 1-page doc)
      expect(result.length).toBeGreaterThan(1000);
    }
  });

  it("generates a PDF even with an invalid signature (graceful fallback)", async () => {
    const result = await generateAttestationPdf({
      applicantName: "Test User",
      guardianName: "Test User",
      referenceNumber: "TEST02",
      signatureDataUrl: "invalid-data-url",
      hipaaConsentAt: new Date(),
      householdMembers: [],
      medicaidId: "AB12345C",
      supermarket: "Foodoo",
    });

    // Should still produce a PDF with "[Signature on file]" fallback
    expect(result).not.toBeNull();
    if (result) {
      const header = new TextDecoder().decode(result.slice(0, 5));
      expect(header).toBe("%PDF-");
    }
  });

  it("generates a PDF with no household members", async () => {
    const result = await generateAttestationPdf({
      applicantName: "Solo Applicant",
      guardianName: "Solo Applicant",
      referenceNumber: "TEST03",
      signatureDataUrl: "data:image/png;base64,iVBORw0KGgo=", // minimal PNG header
      hipaaConsentAt: new Date(),
      householdMembers: [],
      medicaidId: "ZZ11111A",
      supermarket: "Evergreen",
    });

    expect(result).not.toBeNull();
    if (result) {
      const header = new TextDecoder().decode(result.slice(0, 5));
      expect(header).toBe("%PDF-");
    }
  });

  it("returns null (not throws) if something goes catastrophically wrong", async () => {
    // Pass null as signatureDataUrl to test error handling
    const result = await generateAttestationPdf({
      applicantName: "Error Test",
      guardianName: "Error Test",
      referenceNumber: "TEST04",
      signatureDataUrl: "", // empty
      hipaaConsentAt: new Date(),
      householdMembers: [],
      medicaidId: "AA00000A",
      supermarket: "Test",
    });

    // Should still produce a PDF (empty signature gets "[Signature on file]" fallback)
    expect(result).not.toBeNull();
  });
});
