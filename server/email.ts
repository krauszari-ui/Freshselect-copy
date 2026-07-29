/**
 * Email service using Resend.
 *
 * Best practices implemented:
 * - Idempotency keys prevent duplicate sends on retry
 * - Exponential back-off retry (up to 3 attempts) for 429 / 5xx errors
 * - FROM_EMAIL reads from RESEND_FROM_EMAIL env var so it can be changed
 *   without a code deploy (falls back to onboarding@resend.dev for local dev)
 * - All errors are caught and logged; functions return boolean so callers
 *   can decide whether to surface the failure to the user
 */

import { Resend } from "resend";
import { ENV } from "./_core/env";

// ─── Client singleton ────────────────────────────────────────────────────────

let _resend: Resend | null = null;
let _resendKey: string | null = null;

function getResend(): Resend {
  // Always read from process.env directly so updated secrets are picked up
  // without requiring a full process restart
  const currentKey = process.env.RESEND_API_KEY ?? ENV.resendApiKey;
  if (!_resend || currentKey !== _resendKey) {
    _resend = new Resend(currentKey);
    _resendKey = currentKey;
  }
  return _resend;
}

// ─── Configuration ───────────────────────────────────────────────────────────

/**
 * FROM_EMAIL is read from the RESEND_FROM_EMAIL environment variable.
 * Once you verify freshselectmeals.com in Resend, set:
 *   RESEND_FROM_EMAIL = "FreshSelect Meals <noreply@freshselectmeals.com>"
 *
 * Until then, the fallback uses Resend's shared testing address which only
 * delivers to the account owner's email (scn@levelupresources.org).
 */
// Read FROM_EMAIL dynamically so env var updates are picked up without restart.
// Some deployment platforms (Vercel) store angle brackets as \u003c / \u003e —
// we decode those so Resend receives a valid RFC 5322 address.
function getFromEmail(): string {
  const raw = process.env.RESEND_FROM_EMAIL ?? "FreshSelect Meals <admin@freshselectmeals.com>";
  // Decode \uXXXX sequences that Vercel/some env stores may inject
  return raw.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

const ADMIN_EMAIL = "info@freshselectmeals.com";

// ─── Retry helper ────────────────────────────────────────────────────────────

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

async function sendWithRetry(
  sendFn: (idempotencyKey: string) => Promise<{ error: unknown }>,
  idempotencyKey: string
): Promise<boolean> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { error } = await sendFn(idempotencyKey);
      if (!error) return true;

      // Resend error objects have a statusCode field
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode && !RETRYABLE_STATUS_CODES.has(statusCode)) {
        // Non-retryable error (e.g. 403 domain not verified, 422 invalid address)
        console.error(`[Email] Non-retryable error (${statusCode}):`, error);
        return false;
      }

      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1); // 500ms, 1s, 2s
        console.warn(`[Email] Attempt ${attempt} failed (${statusCode}), retrying in ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
      } else {
        console.error(`[Email] All ${MAX_RETRIES} attempts failed:`, error);
      }
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        console.warn(`[Email] Attempt ${attempt} threw, retrying in ${delay}ms:`, err);
        await new Promise((r) => setTimeout(r, delay));
      } else {
        console.error(`[Email] All ${MAX_RETRIES} attempts threw:`, err);
      }
    }
  }
  return false;
}

// ─── Email data types ─────────────────────────────────────────────────────────

interface SubmissionEmailData {
  referenceNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  cellPhone: string;
  medicaidId: string;
  supermarket: string;
  formData: Record<string, unknown>;
}

// ─── HTML builder ─────────────────────────────────────────────────────────────

/** HTML-escape a value for safe interpolation into email HTML. */
function esc(val: unknown): string {
  return String(val ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildEmailHtml(data: SubmissionEmailData, isAdmin: boolean): string {
  const fd = data.formData as Record<string, unknown>;
  const screeningQuestions = fd.screeningQuestions as Record<string, unknown> | undefined;
  const householdMembers = fd.householdMembers as Array<Record<string, string>> | undefined;
  const healthCategories = fd.healthCategories as string[] | undefined;
  const mealFocus = fd.mealFocus as string[] | undefined;

  let html = `
<!DOCTYPE html>
<html>
<head>
<style>
  body { font-family: 'Georgia', serif; color: #2d2d2d; background: #faf8f5; margin: 0; padding: 20px; }
  .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; padding: 32px; border: 1px solid #e8e0d4; }
  .header { text-align: center; border-bottom: 2px solid #2d5a27; padding-bottom: 16px; margin-bottom: 24px; }
  .header h1 { color: #2d5a27; font-size: 24px; margin: 0; }
  .header p { color: #6b7280; font-size: 14px; margin: 4px 0 0; }
  .section { margin-bottom: 20px; }
  .section h3 { color: #2d5a27; font-size: 16px; border-bottom: 1px solid #e8e0d4; padding-bottom: 6px; margin-bottom: 12px; }
  .field { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f3f0eb; }
  .field-label { color: #6b7280; font-size: 13px; }
  .field-value { color: #2d2d2d; font-size: 13px; font-weight: 600; }
  .ref-box { background: #f0f7ef; border: 1px solid #2d5a27; border-radius: 8px; padding: 16px; text-align: center; margin-bottom: 20px; }
  .ref-box .ref { font-size: 24px; font-weight: bold; color: #2d5a27; letter-spacing: 2px; }
  .footer { text-align: center; color: #9ca3af; font-size: 12px; margin-top: 24px; padding-top: 16px; border-top: 1px solid #e8e0d4; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>FreshSelect Meals</h1>
    <p>${isAdmin ? "New Application Received" : "Your Application Confirmation"}</p>
  </div>
  <div class="ref-box">
    <div style="font-size:12px;color:#6b7280;">Reference Number</div>
    <div class="ref">${data.referenceNumber}</div>
  </div>

  <div class="section">
    <h3>Primary Member Information</h3>
    <div class="field"><span class="field-label">Name</span><span class="field-value">${esc(data.firstName)} ${esc(data.lastName)}</span></div>
    <div class="field"><span class="field-label">Date of Birth</span><span class="field-value">${esc(fd.dateOfBirth) || "N/A"}</span></div>
    <div class="field"><span class="field-label">Medicaid ID</span><span class="field-value">${esc(data.medicaidId)}</span></div>
  </div>

  <div class="section">
    <h3>Contact Information</h3>
    <div class="field"><span class="field-label">Phone</span><span class="field-value">${esc(data.cellPhone)}</span></div>
    <div class="field"><span class="field-label">Email</span><span class="field-value">${esc(data.email)}</span></div>
    <div class="field"><span class="field-label">Address</span><span class="field-value">${esc(fd.streetAddress)}, ${esc(fd.city) || "Brooklyn"}, ${esc(fd.state) || "NY"} ${esc(fd.zipcode)}</span></div>
  </div>

  <div class="section">
    <h3>Vendor</h3>
    <div class="field"><span class="field-label">Selected Vendor</span><span class="field-value">${esc(data.supermarket)}</span></div>
  </div>`;

  if (screeningQuestions && Object.keys(screeningQuestions).length > 0) {
    html += `
  <div class="section">
    <h3>SCN Screening Questions</h3>`;
    const labels: Record<string, string> = {
      livingSituation: "Current Living Situation",
      utilityShutoff: "Utility Shutoff Threat",
      receivesSnap: "Receives SNAP",
      receivesWic: "Receives WIC",
      hasChronicIllness: "Has Chronic Illness",
      otherHealthIssues: "Other Health Issues",
      medicationsRequireRefrigeration: "Medications Require Refrigeration",
      pregnantOrPostpartum: "Pregnant or Postpartum",
      breastmilkRefrigeration: "Breastmilk Refrigeration Needed",
    };
    for (const [key, label] of Object.entries(labels)) {
      const val = (screeningQuestions as Record<string, unknown>)[key];
      if (val !== undefined && val !== null && val !== "") {
        html += `<div class="field"><span class="field-label">${esc(label)}</span><span class="field-value">${esc(val)}</span></div>`;
      }
    }
    html += `</div>`;
  }

  if (healthCategories && healthCategories.length > 0) {
    html += `
  <div class="section">
    <h3>Health Categories</h3>
    <div class="field"><span class="field-label">Selected</span><span class="field-value">${healthCategories.map(esc).join(", ")}</span></div>`;
    if (fd.dueDate) html += `<div class="field"><span class="field-label">Due Date</span><span class="field-value">${esc(fd.dueDate)}</span></div>`;
    if (fd.miscarriageDate) html += `<div class="field"><span class="field-label">Miscarriage Date</span><span class="field-value">${esc(fd.miscarriageDate)}</span></div>`;
    if (fd.infantName) html += `<div class="field"><span class="field-label">Infant Name</span><span class="field-value">${esc(fd.infantName)}</span></div>`;
    html += `</div>`;
  }

  if (fd.foodAllergies || fd.dietaryRestrictions) {
    html += `
  <div class="section">
    <h3>Food Allergies / Dietary Restrictions</h3>`;
    if (fd.foodAllergies) html += `<div class="field"><span class="field-label">Food Allergies</span><span class="field-value">${esc(fd.foodAllergiesDetails) || esc(fd.foodAllergies)}</span></div>`;
    if (fd.dietaryRestrictions) html += `<div class="field"><span class="field-label">Dietary Restrictions</span><span class="field-value">${esc(fd.dietaryRestrictions)}</span></div>`;
    html += `</div>`;
  }

  if (householdMembers && householdMembers.length > 0) {
    html += `
  <div class="section">
    <h3>Household Members</h3>`;
    householdMembers.forEach((m, i) => {
      html += `<div class="field"><span class="field-label">Member ${i + 1}</span><span class="field-value">${esc(m.name) || "N/A"} (DOB: ${esc(m.dateOfBirth) || "N/A"}, CIN: ${esc(m.medicaidId) || "N/A"})</span></div>`;
    });
    html += `</div>`;
  }

  if (mealFocus && mealFocus.length > 0) {
    html += `
  <div class="section">
    <h3>Meal Preferences</h3>
    <div class="field"><span class="field-label">Meal Focus</span><span class="field-value">${mealFocus.map(esc).join(", ")}</span></div>
  </div>`;
  }

  html += `
  <div class="section">
    <h3>Household Appliances</h3>
    <div class="field"><span class="field-label">Needs Refrigerator</span><span class="field-value">${esc(fd.needsRefrigerator) || "N/A"}</span></div>
    <div class="field"><span class="field-label">Needs Microwave</span><span class="field-value">${esc(fd.needsMicrowave) || "N/A"}</span></div>
    <div class="field"><span class="field-label">Needs Cooking Utensils</span><span class="field-value">${esc(fd.needsCookingUtensils) || "N/A"}</span></div>
  </div>`;

  if (isAdmin) {
    const uploadUrls = fd.uploadedDocuments as Record<string, string> | undefined;
    if (uploadUrls && Object.keys(uploadUrls).length > 0) {
      html += `
  <div class="section">
    <h3>Uploaded Documents</h3>`;
      for (const [key, url] of Object.entries(uploadUrls)) {
        const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (s: string) => s.toUpperCase());
        // Only allow https:// document URLs to prevent javascript: injection
        const safeUrl = typeof url === "string" && url.startsWith("https://") ? url : "#";
        html += `<div class="field"><span class="field-label">${esc(label)}</span><span class="field-value"><a href="${esc(safeUrl)}" style="color:#2d5a27;">View Document</a></span></div>`;
      }
      html += `</div>`;
    }
  }

  html += `
  <div class="footer">
    <p>${isAdmin ? "This is an automated notification from FreshSelect Meals." : "Thank you for your application. Our team will review it and contact you within 5 business days."}</p>
    <p>FreshSelect Meals &mdash; SCN Approved Vendor</p>
    <p>Contact: (718) 307-4664 | info@freshselectmeals.com</p>
  </div>
</div>
</body>
</html>`;

  return html;
}

// ─── Public send functions ────────────────────────────────────────────────────

/**
 * Generic email sender — use for transactional emails outside the submission flow.
 */
export async function sendEmail(params: { to: string; subject: string; html: string; replyTo?: string; from?: string }): Promise<boolean> {
  const idempotencyKey = `generic-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return sendWithRetry(
    (key) => getResend().emails.send({
      from: params.from ?? getFromEmail(),
      to: params.to,
      subject: params.subject,
      html: params.html,
      replyTo: params.replyTo,
      headers: { "Idempotency-Key": key },
    }),
    idempotencyKey
  );
}

export async function sendApplicantConfirmation(data: SubmissionEmailData): Promise<boolean> {
  const resend = getResend();
  const subject = `FreshSelect Meals - Application Received (Ref: ${data.referenceNumber})`;
  const html = buildEmailHtml(data, false);
  // Idempotency key: applicant + ref prevents duplicate sends on retry
  const idempotencyKey = `applicant-${data.referenceNumber}`;

  const success = await sendWithRetry(
    (key) =>
      resend.emails.send({
        from: getFromEmail(),
        to: [data.email],
        subject,
        html,
        headers: { "X-Idempotency-Key": key },
      }),
    idempotencyKey
  );

  if (success) {
    console.log(`[Email] ✓ Applicant confirmation sent to ${data.email} (ref: ${data.referenceNumber})`);
  } else {
    console.error(`[Email] ✗ Failed to send applicant confirmation to ${data.email} (ref: ${data.referenceNumber})`);
  }
  return success;
}

export async function sendAdminNotification(data: SubmissionEmailData): Promise<boolean> {
  const resend = getResend();
  const subject = `New Application: ${data.firstName} ${data.lastName} (Ref: ${data.referenceNumber})`;
  const html = buildEmailHtml(data, true);
  const idempotencyKey = `admin-${data.referenceNumber}`;

  const success = await sendWithRetry(
    (key) =>
      resend.emails.send({
        from: getFromEmail(),
        to: [ADMIN_EMAIL],
        subject,
        html,
        headers: { "X-Idempotency-Key": key },
      }),
    idempotencyKey
  );

  if (success) {
    console.log(`[Email] ✓ Admin notification sent for ${data.firstName} ${data.lastName} (ref: ${data.referenceNumber})`);
  } else {
    console.error(`[Email] ✗ Failed to send admin notification (ref: ${data.referenceNumber})`);
  }
  return success;
}
