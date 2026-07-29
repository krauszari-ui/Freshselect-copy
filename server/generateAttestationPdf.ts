/**
 * Generate a professional 1-page PDF for Household Attestation + HIPAA Consent.
 * Uses pdf-lib (pure ESM, no CJS/native dependencies).
 *
 * Returns a Uint8Array of the PDF bytes, or null if generation fails.
 * Errors are logged but never thrown — this is designed to be non-blocking.
 */
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

interface AttestationData {
  /** Applicant full name (firstName + lastName) */
  applicantName: string;
  /** Guardian / signer name */
  guardianName: string;
  /** Submission reference number */
  referenceNumber: string;
  /** Signature as a JPEG data URL (data:image/jpeg;base64,...) */
  signatureDataUrl: string;
  /** HIPAA consent timestamp */
  hipaaConsentAt: Date;
  /** Household members array */
  householdMembers: Array<{ name: string; dateOfBirth: string; medicaidId: string; relationship?: string }>;
  /** Medicaid ID of primary member */
  medicaidId: string;
  /** Selected vendor */
  supermarket: string;
}

const ATTESTATION_TEXT =
  "I attest that the information provided in this application is true and accurate to the best of my knowledge. " +
  "I understand that providing false information may result in the denial or termination of services. " +
  "I authorize FreshSelect Meals and its partners to verify the information provided in this application.";

const HIPAA_TEXT =
  "I acknowledge that I have been informed of my rights under the Health Insurance Portability and Accountability Act (HIPAA). " +
  "I consent to the collection, use, and disclosure of my protected health information (PHI) for the purpose of determining " +
  "eligibility and providing nutritional support services through the New York Social Care Network (SCN) program. " +
  "I understand that my information will be kept confidential and will only be shared as necessary to provide services.";

export async function generateAttestationPdf(data: AttestationData): Promise<Uint8Array | null> {
  try {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]); // US Letter
    const helvetica = await doc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);

    const margin = 50;
    const pageWidth = 612 - margin * 2;
    let y = 742;

    const green = rgb(0.133, 0.545, 0.133); // FreshSelect green
    const black = rgb(0, 0, 0);
    const gray = rgb(0.4, 0.4, 0.4);

    // ── Header ──
    page.drawText("FreshSelect Meals", { x: margin, y, font: helveticaBold, size: 20, color: green });
    y -= 18;
    page.drawText("Household Attestation & HIPAA Consent", { x: margin, y, font: helveticaBold, size: 14, color: black });
    y -= 12;
    // Divider line
    page.drawLine({ start: { x: margin, y }, end: { x: 612 - margin, y }, thickness: 1.5, color: green });
    y -= 20;

    // ── Applicant Info ──
    const infoLines = [
      ["Applicant:", data.applicantName],
      ["Medicaid ID:", data.medicaidId],
      ["Vendor:", data.supermarket],
      ["Reference #:", data.referenceNumber],
      ["Date Signed:", data.hipaaConsentAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })],
    ];
    for (const [label, value] of infoLines) {
      page.drawText(label, { x: margin, y, font: helveticaBold, size: 10, color: gray });
      page.drawText(value, { x: margin + 90, y, font: helvetica, size: 10, color: black });
      y -= 15;
    }
    y -= 5;

    // ── Household Members ──
    if (data.householdMembers.length > 0) {
      page.drawText("Household Members:", { x: margin, y, font: helveticaBold, size: 10, color: black });
      y -= 14;
      for (const member of data.householdMembers) {
        const rel = member.relationship ? ` (${member.relationship})` : "";
        const line = `  •  ${member.name}${rel} — DOB: ${member.dateOfBirth}, CIN: ${member.medicaidId || "N/A"}`;
        page.drawText(line, { x: margin + 10, y, font: helvetica, size: 9, color: black });
        y -= 13;
        if (y < 120) break; // safety: don't overflow the page
      }
      y -= 5;
    }

    // ── Household Attestation ──
    page.drawText("Household Attestation", { x: margin, y, font: helveticaBold, size: 11, color: black });
    y -= 14;
    y = drawWrappedText(page, ATTESTATION_TEXT, margin, y, pageWidth, helvetica, 9, black);
    y -= 12;

    // ── HIPAA Consent ──
    page.drawText("HIPAA Consent", { x: margin, y, font: helveticaBold, size: 11, color: black });
    y -= 14;
    y = drawWrappedText(page, HIPAA_TEXT, margin, y, pageWidth, helvetica, 9, black);
    y -= 16;

    // ── Signature ──
    page.drawText("Electronic Signature:", { x: margin, y, font: helveticaBold, size: 10, color: black });
    y -= 5;

    // Embed the signature image
    if (data.signatureDataUrl && data.signatureDataUrl.startsWith("data:image/")) {
      try {
        const base64Data = data.signatureDataUrl.split(",")[1];
        if (base64Data) {
          const sigBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
          let sigImage;
          if (data.signatureDataUrl.includes("image/png")) {
            sigImage = await doc.embedPng(sigBytes);
          } else {
            sigImage = await doc.embedJpg(sigBytes);
          }
          // Scale signature to fit within a reasonable box
          const maxW = 200;
          const maxH = 60;
          const scale = Math.min(maxW / sigImage.width, maxH / sigImage.height, 1);
          const sigW = sigImage.width * scale;
          const sigH = sigImage.height * scale;
          page.drawImage(sigImage, { x: margin, y: y - sigH, width: sigW, height: sigH });
          y -= sigH + 5;
        }
      } catch (sigErr) {
        // If signature embedding fails, add text fallback
        page.drawText("[Signature on file]", { x: margin, y: y - 15, font: helvetica, size: 9, color: gray });
        y -= 20;
      }
    } else {
      page.drawText("[Signature on file]", { x: margin, y: y - 15, font: helvetica, size: 9, color: gray });
      y -= 20;
    }

    // Signer name
    y -= 5;
    page.drawText(`Signed by: ${data.guardianName}`, { x: margin, y, font: helvetica, size: 9, color: black });
    y -= 20;

    // ── Footer ──
    page.drawLine({ start: { x: margin, y: 50 }, end: { x: 612 - margin, y: 50 }, thickness: 0.5, color: gray });
    page.drawText(
      `FreshSelect Meals — SCN Approved Vendor  |  (718) 307-4664  |  admin@freshselectmeals.com`,
      { x: margin, y: 38, font: helvetica, size: 7, color: gray }
    );
    page.drawText(
      `Generated on ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}  |  Ref: ${data.referenceNumber}`,
      { x: margin, y: 28, font: helvetica, size: 7, color: gray }
    );

    return await doc.save();
  } catch (err) {
    console.error("[PDF] Failed to generate attestation PDF:", err);
    return null;
  }
}

/** Helper: draw wrapped text and return the new Y position */
function drawWrappedText(
  page: ReturnType<PDFDocument["addPage"]>,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  fontSize: number,
  color: ReturnType<typeof rgb>
): number {
  const words = text.split(" ");
  let line = "";
  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    const width = font.widthOfTextAtSize(testLine, fontSize);
    if (width > maxWidth && line) {
      page.drawText(line, { x, y, font, size: fontSize, color });
      y -= fontSize + 3;
      line = word;
    } else {
      line = testLine;
    }
  }
  if (line) {
    page.drawText(line, { x, y, font, size: fontSize, color });
    y -= fontSize + 3;
  }
  return y;
}
