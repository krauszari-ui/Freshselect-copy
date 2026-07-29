/**
 * generateClientPdf.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Generates a comprehensive per-client PDF using pdf-lib (already installed).
 * Called from AdminClientDetail when the user clicks "Download PDF".
 *
 * Sections:
 *  1. Header (name, stage, reference number, generated date)
 *  2. Client Information (CIN, DOB, phone, address, language, program, vendor)
 *  3. Household Members
 *  4. Health Categories
 *  5. SCN Screening Questionnaire (all 19 questions)
 *  6. Food Allergies / Dietary Restrictions
 *  7. Household Appliance / Cooking Needs
 *  8. Assessment Notes
 *  9. Services
 * 10. Case Notes
 * 11. Stage History
 * 12. Footer (confidential, page numbers)
 */

import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

// ─── Colour palette ───────────────────────────────────────────────────────────
const C = {
  green:  rgb(0.13, 0.55, 0.33),
  amber:  rgb(0.85, 0.55, 0.10),
  slate:  rgb(0.35, 0.40, 0.47),
  black:  rgb(0.10, 0.10, 0.12),
  light:  rgb(0.94, 0.96, 0.98),
  border: rgb(0.86, 0.88, 0.92),
  white:  rgb(1, 1, 1),
  red:    rgb(0.80, 0.15, 0.15),
};

const PAGE_W  = 595;
const PAGE_H  = 842;
const MARGIN  = 45;
const COL_W   = PAGE_W - MARGIN * 2;
const LINE_H  = 16;

// ─── Stage labels ─────────────────────────────────────────────────────────────
const STAGE_LABELS: Record<string, string> = {
  referral:                      "Referral",
  assessment:                    "Assessment",
  assessment_recorded:           "Assessment Recorded",
  missing_information:           "Missing Information",
  not_eligible:                  "Not Eligible",
  level_one_only:                "Level One Only",
  level_one_household:           "Level One (Household)",
  level_2_active:                "Level 2 Active",
  ineligible:                    "Ineligible For SCN",
  provider_attestation_required: "Provider Attestation Required",
  flagged:                       "Flagged",
};

// ─── WinAnsi sanitizer ───────────────────────────────────────────────────────
// pdf-lib's Helvetica / HelveticaBold fonts only support WinAnsi (cp1252).
// Any character outside that range throws an unrecoverable encode error.
// This function replaces every out-of-range character with a safe ASCII
// equivalent so the PDF always generates regardless of client data.
function toWinAnsi(text: string): string {
  if (!text) return text;
  return text
    // Common Unicode punctuation → ASCII equivalents
    .replace(/[\u2018\u2019\u0060]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014\u2015]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u2022/g, "*")
    .replace(/\u2019/g, "'")
    .replace(/\u00A0/g, " ")
    .replace(/\u00AD/g, "-")
    // Accented Latin → base letter (covers most European names)
    .replace(/[\u00C0-\u00C5\u00E0-\u00E5]/g, (c) => c <= "\u00C5" ? "A" : "a")
    .replace(/[\u00C6]/g, "AE").replace(/[\u00E6]/g, "ae")
    .replace(/[\u00C7]/g, "C").replace(/[\u00E7]/g, "c")
    .replace(/[\u00C8-\u00CB\u00E8-\u00EB]/g, (c) => c <= "\u00CB" ? "E" : "e")
    .replace(/[\u00CC-\u00CF\u00EC-\u00EF]/g, (c) => c <= "\u00CF" ? "I" : "i")
    .replace(/[\u00D0]/g, "D").replace(/[\u00F0]/g, "d")
    .replace(/[\u00D1]/g, "N").replace(/[\u00F1]/g, "n")
    .replace(/[\u00D2-\u00D6\u00D8\u00F2-\u00F6\u00F8]/g, (c) => c <= "\u00D8" ? "O" : "o")
    .replace(/[\u00D9-\u00DC\u00F9-\u00FC]/g, (c) => c <= "\u00DC" ? "U" : "u")
    .replace(/[\u00DD]/g, "Y").replace(/[\u00FD\u00FF]/g, "y")
    .replace(/[\u00DF]/g, "ss")
    // Hebrew, Arabic, CJK, and all other non-Latin scripts → "?"
    .replace(/[^\x00-\xFF]/g, "?")
    // Any remaining WinAnsi control chars → space
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(val: unknown): string {
  if (!val) return "-";
  try {
    const d = new Date(val as string);
    if (isNaN(d.getTime())) return toWinAnsi(String(val));
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch { return toWinAnsi(String(val)); }
}

function fmtBool(val: unknown): string {
  if (val === true || val === "Yes" || val === "yes") return "Yes";
  if (val === false || val === "No" || val === "no") return "No";
  if (val === null || val === undefined || val === "") return "-";
  return toWinAnsi(String(val));
}

function safe(val: unknown): string {
  if (val === null || val === undefined || val === "") return "-";
  return toWinAnsi(String(val));
}

/** Wrap text to fit within maxWidth, returning array of lines */
function wrapText(rawText: string, font: any, fontSize: number, maxWidth: number): string[] {
  const text = toWinAnsi(rawText || "");
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    const w = font.widthOfTextAtSize(test, fontSize);
    if (w > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

// ─── Main export function ─────────────────────────────────────────────────────
export async function generateClientPdf(opts: {
  client: any;
  notes: any[];
  tasks: any[];
  services: any[];
  stageHistory: any[];
  staffName?: (id: number | null | undefined) => string;
}) {
  const { client, notes, tasks, services, stageHistory, staffName } = opts;
  const fd = (client.formData ?? {}) as any;
  const screening = fd.screeningQuestions || fd.screening || {};
  const healthCategories: string[] = fd.healthCategories || [];
  const householdMembers: any[] = fd.householdMembers || [];

  const pdfDoc = await PDFDocument.create();
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontReg  = await pdfDoc.embedFont(StandardFonts.Helvetica);

  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  // ── Footer ────────────────────────────────────────────────────────────────
  const drawFooter = () => {
    page.drawLine({
      start: { x: MARGIN, y: MARGIN + 14 },
      end:   { x: PAGE_W - MARGIN, y: MARGIN + 14 },
      thickness: 0.5, color: C.border,
    });
    page.drawText(
      `FreshSelect Meals SCN - Confidential - ${new Date().toLocaleDateString()}`,
      { x: MARGIN, y: MARGIN + 4, size: 7, font: fontReg, color: C.slate }
    );
    page.drawText(
      `Page ${pdfDoc.getPageCount()}`,
      { x: PAGE_W - MARGIN - 30, y: MARGIN + 4, size: 7, font: fontReg, color: C.slate }
    );
  };

  const addPage = () => {
    drawFooter();
    page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  };

  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN + 30) addPage();
  };

  // ── Section header ────────────────────────────────────────────────────────
  const drawSectionHeader = (title: string) => {
    ensureSpace(30);
    y -= 8;
    page.drawRectangle({ x: MARGIN, y: y - 18, width: COL_W, height: 22, color: C.light, borderColor: C.border, borderWidth: 0.5 });
    page.drawText(toWinAnsi(title.toUpperCase()), { x: MARGIN + 8, y: y - 12, size: 9, font: fontBold, color: C.black });
    y -= 28;
  };

  // ── Info row (label: value) ───────────────────────────────────────────────
  const drawInfoRow = (label: string, value: string, indent = 0) => {
    ensureSpace(LINE_H + 2);
    page.drawText(toWinAnsi(label), { x: MARGIN + indent, y: y - 10, size: 8, font: fontBold, color: C.slate, maxWidth: COL_W * 0.38 });
    // Wrap value if long
    const maxValW = COL_W * 0.56;
    const lines = wrapText(value, fontReg, 8, maxValW);
    lines.forEach((line, i) => {
      if (i > 0) { ensureSpace(LINE_H); y -= LINE_H; }
      page.drawText(line, { x: MARGIN + COL_W * 0.42 + indent, y: y - 10, size: 8, font: fontReg, color: C.black });
    });
    page.drawLine({ start: { x: MARGIN, y: y - LINE_H + 2 }, end: { x: PAGE_W - MARGIN, y: y - LINE_H + 2 }, thickness: 0.3, color: C.border });
    y -= LINE_H;
  };

  // ── Screening question row ────────────────────────────────────────────────
  const drawQRow = (num: number, label: string, value: string) => {
    ensureSpace(LINE_H + 2);
    const qLabel = `${num}. ${label}`;
    const maxLabelW = COL_W * 0.70;
    const labelLines = wrapText(qLabel, fontReg, 8, maxLabelW);
    const rowHeight = labelLines.length * LINE_H;
    ensureSpace(rowHeight + 4);
    labelLines.forEach((line, i) => {
      page.drawText(line, { x: MARGIN + 4, y: y - 10 - i * LINE_H, size: 8, font: fontReg, color: C.slate });
    });
    page.drawText(toWinAnsi(value), { x: MARGIN + COL_W * 0.76, y: y - 10, size: 8, font: fontBold, color: value === "Yes" ? C.green : value === "No" ? C.slate : C.black });
    page.drawLine({ start: { x: MARGIN, y: y - rowHeight + 2 }, end: { x: PAGE_W - MARGIN, y: y - rowHeight + 2 }, thickness: 0.3, color: C.border });
    y -= rowHeight;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 1. HEADER BLOCK
  // ─────────────────────────────────────────────────────────────────────────
  const stageLabel = toWinAnsi(STAGE_LABELS[client.stage] || client.stage || "-");
  page.drawRectangle({ x: 0, y: PAGE_H - 72, width: PAGE_W, height: 72, color: C.green });
  page.drawText("FreshSelect Meals SCN", { x: MARGIN, y: PAGE_H - 26, size: 13, font: fontBold, color: C.white });
  page.drawText("Client Information & Assessment Report", { x: MARGIN, y: PAGE_H - 42, size: 10, font: fontReg, color: rgb(0.85, 0.95, 0.88) });
  page.drawText(`Generated: ${new Date().toLocaleString()}`, { x: MARGIN, y: PAGE_H - 56, size: 8, font: fontReg, color: rgb(0.75, 0.90, 0.80) });
  page.drawText(`Ref: ${toWinAnsi(client.referenceNumber || "-")}`, { x: PAGE_W - MARGIN - 90, y: PAGE_H - 26, size: 9, font: fontBold, color: C.white });
  page.drawText(`Stage: ${stageLabel}`, { x: PAGE_W - MARGIN - 90, y: PAGE_H - 42, size: 8, font: fontReg, color: rgb(0.85, 0.95, 0.88) });
  page.drawText(`Priority: ${(client.priority || "normal").charAt(0).toUpperCase() + (client.priority || "normal").slice(1)}`, { x: PAGE_W - MARGIN - 90, y: PAGE_H - 56, size: 8, font: fontReg, color: rgb(0.85, 0.95, 0.88) });
  y = PAGE_H - 88;

  // Client name large
  page.drawText(toWinAnsi(`${client.firstName || ""} ${client.lastName || ""}`), { x: MARGIN, y, size: 18, font: fontBold, color: C.black });
  y -= 24;

  // ─────────────────────────────────────────────────────────────────────────
  // 2. CLIENT INFORMATION
  // ─────────────────────────────────────────────────────────────────────────
  drawSectionHeader("Client Information");
  drawInfoRow("CIN / Medicaid ID", safe(client.medicaidId));
  drawInfoRow("Date of Birth", fmtDate(fd.dateOfBirth));
  drawInfoRow("Cell Phone", safe(client.cellPhone));
  const addr = [fd.streetAddress, fd.aptUnit, fd.city || "Brooklyn", fd.state || "NY", fd.zipcode || client.zipcode].filter(Boolean).join(" ");
  drawInfoRow("Address", addr || "-");
  drawInfoRow("Email", safe(client.email));
  drawInfoRow("Language", safe(client.language || "English"));
  drawInfoRow("Program", safe(client.program || "PHS"));
  drawInfoRow("Vendor / Supermarket", safe(client.supermarket));
  drawInfoRow("Neighborhood", safe(client.neighborhood || fd.neighborhood));
  drawInfoRow("Borough", safe(client.borough || fd.borough));
  if (client.referralSource) drawInfoRow("Referred By", safe(client.referralSource));
  drawInfoRow("New Applicant", safe(fd.newApplicant));
  if (fd.transferAgencyName) drawInfoRow("Transfer Agency", safe(fd.transferAgencyName));
  drawInfoRow("Intake Rep", safe(staffName?.(client.intakeRep) || "-"));
  drawInfoRow("Assigned Worker", safe(staffName?.(client.assignedTo) || "-"));
  drawInfoRow("Submitted On", fmtDate(client.createdAt));
  drawInfoRow("HIPAA Consent", client.hipaaConsentAt ? `Yes - ${fmtDate(client.hipaaConsentAt)}` : "-");
  if (client.assessmentCompletedAt) {
    drawInfoRow("Assessment Completed", fmtDate(client.assessmentCompletedAt));
  }
  if (client.approvedBy) drawInfoRow("Approved By", `${client.approvedBy}${client.approvedAt ? ` on ${fmtDate(client.approvedAt)}` : ""}`);
  if (client.rejectedBy) drawInfoRow("Rejected By", toWinAnsi(`${client.rejectedBy}${client.rejectionReason ? ` - ${client.rejectionReason}` : ""}`));
  if (client.missingInfoNote) drawInfoRow("Missing Info Note", safe(client.missingInfoNote));
  if (client.notEligibleReason) drawInfoRow("Not Eligible Reason", safe(client.notEligibleReason));

  // ─────────────────────────────────────────────────────────────────────────
  // 3. HOUSEHOLD MEMBERS
  // ─────────────────────────────────────────────────────────────────────────
  if (householdMembers.length > 0) {
    drawSectionHeader(`Household Members (${householdMembers.length})`);
    householdMembers.forEach((m: any, i: number) => {
      ensureSpace(60);
      const memberLabel = m.name || `Member ${i + 1}`;
      page.drawText(toWinAnsi(memberLabel), { x: MARGIN + 4, y: y - 10, size: 9, font: fontBold, color: C.black });
      y -= LINE_H;
      drawInfoRow("Date of Birth", fmtDate(m.dateOfBirth || m.dob), 12);
      drawInfoRow("Medicaid ID", safe(m.medicaidId), 12);
      if (m.relationship) drawInfoRow("Relationship", safe(m.relationship), 12);
      y -= 4;
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 4. HEALTH CATEGORIES
  // ─────────────────────────────────────────────────────────────────────────
  drawSectionHeader("Health Categories");
  if (healthCategories.length > 0) {
    // Draw as wrapped comma-separated list
    const catText = toWinAnsi(healthCategories.join("  -  "));
    const catLines = wrapText(catText, fontReg, 8.5, COL_W - 8);
    catLines.forEach((line) => {
      ensureSpace(LINE_H);
      page.drawText(line, { x: MARGIN + 4, y: y - 10, size: 8.5, font: fontReg, color: C.black });
      y -= LINE_H;
    });

    // Sub-details: due date, miscarriage date, infant info
    if (healthCategories.includes("Pregnant") && (fd.dueDate || screening.dueDate)) {
      drawInfoRow("Due Date", fmtDate(fd.dueDate || screening.dueDate), 8);
    }
    if (healthCategories.includes("Had a Miscarriage") && fd.miscarriageDate) {
      drawInfoRow("Date of Miscarriage", fmtDate(fd.miscarriageDate), 8);
    }
    if (healthCategories.some((c: string) => c.startsWith("Postpartum"))) {
      if (fd.infantName) drawInfoRow("Infant Name", safe(fd.infantName), 8);
      if (fd.infantDateOfBirth) drawInfoRow("Infant Date of Birth", fmtDate(fd.infantDateOfBirth), 8);
      if (fd.infantMedicaidId) drawInfoRow("Infant Medicaid ID", safe(fd.infantMedicaidId), 8);
    }

    // Medical condition client names
    const MEDICAL_CONDITIONS = ["HIV / AIDS", "Hypertension", "Chronic Condition", "Substance Use Disorder", "Diabetes", "Serious Mental Illness (SMI)"];
    const conditionDetails: Record<string, any> = fd.conditionDetails || {};
    const conditionClientNames: Record<string, string> = fd.conditionClientNames || {};
    MEDICAL_CONDITIONS.filter((c) => healthCategories.includes(c)).forEach((cond) => {
      const clientName = conditionDetails[cond]?.clientName || conditionClientNames[cond];
      if (clientName) drawInfoRow(`${cond} - Client Name`, safe(clientName), 8);
    });
    if (healthCategories.includes("Other") && fd.otherHealthCategoryDetails) {
      drawInfoRow("Other Health - Description", safe(fd.otherHealthCategoryDetails), 8);
    }
  } else {
    ensureSpace(LINE_H);
    page.drawText("No health categories selected", { x: MARGIN + 4, y: y - 10, size: 8, font: fontReg, color: C.slate });  // ASCII safe
    y -= LINE_H;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 5. SCN SCREENING QUESTIONNAIRE
  // ─────────────────────────────────────────────────────────────────────────
  drawSectionHeader("SCN Screening Questionnaire");

  // Screening metadata
  const screeningDate = fd.screeningDate || (client.createdAt ? fmtDate(client.createdAt) : "-");
  const screenerName  = toWinAnsi(fd.screenerName || staffName?.(client.intakeRep) || "-");
  drawInfoRow("Screening Date", screeningDate);
  drawInfoRow("Screener Name", screenerName);
  y -= 4;

  // All 19 questions
  const sq = screening;
  drawQRow(1,  "Current living situation",                                safe(sq.livingSituation));
  drawQRow(2,  "Utility shutoff threat in the past 12 months",           fmtBool(sq.utilityShutoff));
  drawQRow(3,  "Receives SNAP benefits",                                  fmtBool(sq.receivesSnap ?? fd.receivesSnap ?? fd.hasSnap));
  drawQRow(4,  "Receives WIC benefits",                                   fmtBool(sq.receivesWic ?? fd.receivesWic ?? fd.hasWic));
  drawQRow(5,  "Receives TANF benefits",                                  fmtBool(sq.receivesTanf));
  drawQRow(6,  "Enrolled in Health Home Care Management",                 fmtBool(sq.enrolledHealthHome));
  const hhCount = sq.householdMembersCount || fd.householdMembersCount || fd.householdMemberCount || sq.householdMemberCount;
  drawQRow(7,  "Number of household members",                             safe(hhCount));
  drawQRow(8,  "Number of household members with Medicaid",               safe(sq.householdMembersWithMedicaid));
  drawQRow(9,  "Needs work / employment assistance",                      fmtBool(sq.needsWorkAssistance));
  const schoolVal = sq.wantsSchoolHelp ?? sq.wantsSchoolTraining ?? fd.wantsSchoolHelp ?? fd.wantsSchoolTraining;
  drawQRow(10, "Wants help with school or job training",                  fmtBool(schoolVal));
  drawQRow(11, "Transportation is a barrier to healthcare",               fmtBool(sq.transportationBarrier));
  drawQRow(12, "Has a chronic illness",                                   fmtBool(sq.hasChronicIllness));
  if (sq.chronicIllnessDetails || fd.chronicIllnessDetails) {
    drawInfoRow("Chronic illness details", safe(sq.chronicIllnessDetails || fd.chronicIllnessDetails), 12);
  }
  drawQRow(13, "Other known health issues",                               fmtBool(sq.otherHealthIssues));
  drawQRow(14, "Medications require refrigeration",                       fmtBool(sq.medicationsRequireRefrigeration));
  const pregnantVal = sq.pregnantOrPostpartum || (healthCategories.includes("Pregnant") || healthCategories.some((c: string) => c.startsWith("Postpartum")) ? "Yes" : "-");
  drawQRow(15, "Pregnant or postpartum",                                  fmtBool(pregnantVal));
  if (String(pregnantVal).toLowerCase() === "yes" || pregnantVal === true) {
    const dueDateVal = fd.dueDate || sq.dueDate;
    drawInfoRow("Due date", dueDateVal ? fmtDate(dueDateVal) : "Not entered", 12);
  }
  drawQRow(16, "Breastmilk refrigeration needed",                        fmtBool(sq.breastmilkRefrigeration));
  drawQRow(17, "Struggles with paying for housing / falling behind",      fmtBool(sq.housingPaymentStruggle));

  // Q18: housing problems (may be array legacy)
  const HOUSING_OPTIONS = ["No","Pests such as bugs, ants, or mice","Mold","Lead paint or pipes","Lack of heat","Oven or stove not working","Smoke detectors missing or not working","Water leaks"];
  const housingProblemsRaw = sq.housingProblems;
  let housingProblemsVal = "-";
  if (Array.isArray(housingProblemsRaw)) {
    const joined = housingProblemsRaw.join(", ");
    housingProblemsVal = toWinAnsi(HOUSING_OPTIONS.find((opt) => joined.includes(opt)) || joined || "-");
  } else if (housingProblemsRaw) {
    housingProblemsVal = String(housingProblemsRaw);
  }
  drawQRow(18, "Housing problems",                                        housingProblemsVal);
  drawQRow(19, "Member has difficulty climbing stairs or bathing",        fmtBool(sq.difficultyClimbingStairs));

  // ─────────────────────────────────────────────────────────────────────────
  // 6. FOOD ALLERGIES / DIETARY RESTRICTIONS
  // ─────────────────────────────────────────────────────────────────────────
  drawSectionHeader("Food Allergies / Dietary Restrictions");
  const allergyDisplay = toWinAnsi(fd.foodAllergies === "Yes" ? (fd.foodAllergiesDetails || "Yes") : (fd.foodAllergies || "-"));
  drawInfoRow("Food allergies", allergyDisplay);
  drawInfoRow("Dietary restrictions", safe(fd.dietaryRestrictions));

  // ─────────────────────────────────────────────────────────────────────────
  // 7. HOUSEHOLD APPLIANCE / COOKING NEEDS
  // ─────────────────────────────────────────────────────────────────────────
  drawSectionHeader("Household Appliance / Cooking Needs");
  drawInfoRow("Needs refrigerator", fmtBool(fd.needsRefrigerator));
  drawInfoRow("Needs microwave", fmtBool(fd.needsMicrowave));
  drawInfoRow("Needs cooking utensils/supplies", fmtBool(fd.needsCookingUtensils));

  // ─────────────────────────────────────────────────────────────────────────
  // 8. ASSESSMENT NOTES
  // ─────────────────────────────────────────────────────────────────────────
  if (client.adminNotes) {
    drawSectionHeader("Assessment Notes");
    const noteLines = wrapText(client.adminNotes, fontReg, 8, COL_W - 8);
    noteLines.forEach((line) => {
      ensureSpace(LINE_H);
      page.drawText(line, { x: MARGIN + 4, y: y - 10, size: 8, font: fontReg, color: C.black });
      y -= LINE_H;
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 9. SERVICES
  // ─────────────────────────────────────────────────────────────────────────
  if (services && services.length > 0) {
    drawSectionHeader(`Services (${services.length})`);
    services.forEach((svc: any) => {
      ensureSpace(50);
      page.drawText(toWinAnsi(safe(svc.name)), { x: MARGIN + 4, y: y - 10, size: 9, font: fontBold, color: C.black });
      y -= LINE_H;
      drawInfoRow("Status", safe(svc.status), 12);
      if (svc.startDate) drawInfoRow("Start Date", fmtDate(svc.startDate), 12);
      if (svc.endDate)   drawInfoRow("End Date",   fmtDate(svc.endDate),   12);
      if (svc.description) {
        const descLines = wrapText(svc.description, fontReg, 8, COL_W - 20);
        descLines.forEach((line) => {
          ensureSpace(LINE_H);
          page.drawText(line, { x: MARGIN + 16, y: y - 10, size: 8, font: fontReg, color: C.slate });
          y -= LINE_H;
        });
      }
      y -= 4;
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 10. CASE NOTES
  // ─────────────────────────────────────────────────────────────────────────
  if (notes && notes.length > 0) {
    drawSectionHeader(`Case Notes (${notes.length})`);
    notes.forEach((note: any) => {
      ensureSpace(40);
      const noteDate = fmtDate(note.createdAt);
      const noteBy   = note.authorName || staffName?.(note.createdBy) || "Staff";
      page.drawText(toWinAnsi(`${noteDate} - ${noteBy}`), { x: MARGIN + 4, y: y - 10, size: 7.5, font: fontBold, color: C.slate });
      y -= LINE_H;
      const contentLines = wrapText(note.content || "", fontReg, 8, COL_W - 12);
      contentLines.forEach((line) => {
        ensureSpace(LINE_H);
        page.drawText(line, { x: MARGIN + 8, y: y - 10, size: 8, font: fontReg, color: C.black });
        y -= LINE_H;
      });
      y -= 4;
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 11. STAGE HISTORY
  // ─────────────────────────────────────────────────────────────────────────
  if (stageHistory && stageHistory.length > 0) {
    drawSectionHeader("Stage History");
    stageHistory.forEach((entry: any) => {
      ensureSpace(LINE_H + 4);
      const from = entry.fromStage ? (STAGE_LABELS[entry.fromStage] || entry.fromStage) : "Initial";
      const to   = STAGE_LABELS[entry.toStage] || entry.toStage;
      const who  = entry.changedByName || "Staff";
      const when = fmtDate(entry.createdAt);
      const rowText = toWinAnsi(`${from}  ->  ${to}   |   ${who}   |   ${when}`);
      const rowLines = wrapText(rowText, fontReg, 8, COL_W - 8);
      rowLines.forEach((line) => {
        ensureSpace(LINE_H);
        page.drawText(line, { x: MARGIN + 4, y: y - 10, size: 8, font: fontReg, color: C.black });
        y -= LINE_H;
      });
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Final footer
  // ─────────────────────────────────────────────────────────────────────────
  drawFooter();

  // ─────────────────────────────────────────────────────────────────────────
  // Save & trigger download
  // ─────────────────────────────────────────────────────────────────────────
  const pdfBytes = await pdfDoc.save();
  const blob = new Blob(
    [pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer],
    { type: "application/pdf" }
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safeName = `${client.firstName || "client"}-${client.lastName || ""}`.replace(/\s+/g, "-").toLowerCase();
  a.download = `freshselect-${safeName}-${client.referenceNumber || client.id}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
