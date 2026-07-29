import { TRPCError } from "@trpc/server";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { randomUUID, randomBytes, createHash } from "crypto";
import { getSessionCookieOptions } from "./_core/cookies";

import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  createSubmission, getAllSubmissions, getSubmissionById, getSubmissionStats,
  listAllUsers, listSubmissions, listWorkers, listStaffUsers, setUserRole,
  toggleWorkerActive, updateSubmissionStatus,
  updateSubmissionStage, updateSubmissionAssignment, updateWorkerPermissions,
  getRecentSubmissions, getRecentlyUpdated, getAddedCount,
  createTask, getTasksBySubmission, getTasksBySubmissionWithDetails, listTasks, getTaskStats, updateTaskStatus,
  createCaseNote, getCaseNotesBySubmission,
  createDocument, getDocumentsBySubmission, getLibraryDocuments, deleteDocument,
  createService, getServicesBySubmission, updateServiceStatus,
  updateSubmissionFields, updateSubmissionPriority, deleteSubmission, bulkDeleteSubmissions,
  createReferralLink, listReferralLinks, getReferralLinkByCode,
  recordFailedLogin, clearFailedLogins,
  updateReferralLink, deleteReferralLink, incrementReferralUsage, getReferralStats,
  getReferralLinkByEmail, getClientsByReferralCode, getUserByEmail,
  getSubmissionByRef,
  getSubmissionByMedicaidId,
  createStaffUser, setPasswordResetToken, getUserByResetToken, clearPasswordResetToken,
  createReferrerMessage, listReferrerMessages, listReferrerMessagesBySubmission, markReferrerMessageRead, getUnreadCountByReferrer,
  deleteReferrerMessage, deleteReferrerMessageById, markAllReferrerMessagesRead,
  createClientEmail, listClientEmails, listClientEmailsById, deleteClientEmailById,
  createStageHistoryEntry, getStageHistoryBySubmission,
  getFilterCounts,
  getAssessmentReport,
  getCompletedAssessmentsExport,
  getSubmissionsByIds,
  createNotification, listNotifications, getUnreadNotificationCount,
  markNotificationRead, markAllNotificationsRead,
  logAudit, getAuditLogs, getAuditLogsBySession,
  createEmailBlast, listEmailBlasts, cancelEmailBlast,
  getEmailBlastById, getBlastReplies, updateEmailBlastStatus,
  listAssessors, updateSubmissionAssessor,
  getUserById,
  createClientMessage, listClientMessages, getNewClientMessages, deleteClientMessage, getClientMessageById, getThreadReadWatermarks,
  toggleMessageReaction, markThreadRead, getThreadUnreadCount, getAllUnreadCounts, getInboxThreads,
  listOrganizations, getOrganizationById, createOrganization, updateOrganization,
  listOrgMembers, assignUserToOrg, referClientToOrg, listSubmissionsByOrg,
  createOrgGroupMessage, listOrgGroupMessages, getOrgGroupUnreadCount, markOrgGroupRead, listAllOrgGroupsWithUnread, getOrgGroupMessageById, getOrgGroupReadWatermarks,
  type WorkerPermissions,
} from "./db";
import bcrypt from "bcryptjs";
import { sdk } from "./_core/sdk";
import { sendAdminNotification, sendApplicantConfirmation, sendEmail } from "./email";
import { generateAttestationPdf } from "./generateAttestationPdf";
import { storagePut, storageGet } from "./storage";
import { z } from "zod";
import { parse as parseCookieHeader } from "cookie";

/**
 * SECURITY HELPER: Check if an assessor can access a given submission.
 * An assessor can access a client if:
 *   1. They are the assigned assessor (submission.assessorId === user.id), OR
 *   2. The client is explicitly referred to their organization (submission.referredOrgId === user.orgId), OR
 *   3. The client's assigned assessor is a member of the same org as this user (Option A org-level visibility)
 * Returns true if access is allowed, false if denied.
 */
async function canAssessorAccessClient(
  user: { id: number; orgId?: number | null },
  submission: { assessorId?: number | null; referredOrgId?: number | null },
): Promise<boolean> {
  // Rule 1: directly assigned assessor
  if (submission.assessorId === user.id) return true;
  const userOrgId = (user as any).orgId as number | null | undefined;
  if (userOrgId == null) return false;
  // Rule 2: client explicitly referred to this org
  if ((submission as any).referredOrgId === userOrgId) return true;
  // Rule 3 (Option A): client's assessor is a member of the same org
  if (submission.assessorId != null) {
    const orgMembers = await listOrgMembers(userOrgId);
    if (orgMembers.some((m) => m.id === submission.assessorId)) return true;
  }
  return false;
}

// Admin-only guard middleware
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin")
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  return next({ ctx });
});

// Super-admin only guard
const superAdminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "super_admin")
    throw new TRPCError({ code: "FORBIDDEN", message: "Super admin access required" });
  return next({ ctx });
});

// Worker or Admin guard (read-only access — viewer and assessor can query but NOT mutate)
const staffProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin" && ctx.user.role !== "worker" && ctx.user.role !== "super_admin" && ctx.user.role !== "viewer" && ctx.user.role !== "assessor")
    throw new TRPCError({ code: "FORBIDDEN", message: "Staff access required" });
  return next({ ctx });
});

// Edit guard: worker (with canEdit), admin, super_admin — viewer and assessor are blocked
const editProcedure = protectedProcedure.use(({ ctx, next }) => {
  const role = ctx.user.role;
  if (role === "admin" || role === "super_admin") return next({ ctx });
  if (role === "worker") {
    const perms = (ctx.user as any).permissions;
    if (perms?.canEdit) return next({ ctx });
    throw new TRPCError({ code: "FORBIDDEN", message: "You do not have edit permission" });
  }
  throw new TRPCError({ code: "FORBIDDEN", message: "Edit access required" });
});

// Delete guard: worker (with canDelete), admin, super_admin only
const deleteProcedure = protectedProcedure.use(({ ctx, next }) => {
  const role = ctx.user.role;
  if (role === "admin" || role === "super_admin") return next({ ctx });
  if (role === "worker") {
    const perms = (ctx.user as any).permissions;
    if (perms?.canDelete) return next({ ctx });
    throw new TRPCError({ code: "FORBIDDEN", message: "You do not have delete permission" });
  }
  throw new TRPCError({ code: "FORBIDDEN", message: "Delete access required" });
});

// Assessor guard (assessor + admin + super_admin)
const assessorProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "assessor" && ctx.user.role !== "admin" && ctx.user.role !== "super_admin")
    throw new TRPCError({ code: "FORBIDDEN", message: "Assessor access required" });
  return next({ ctx });
});

const householdMemberSchema = z.object({ name: z.string(), dateOfBirth: z.string(), medicaidId: z.string(), relationship: z.string().optional().default("") });

// In-memory rate-limit map for logPageView: userId -> array of timestamps
const pageViewRateMap = new Map<number, number[]>();

const screeningQuestionsSchema = z.object({
  livingSituation: z.string().optional(), utilityShutoff: z.string().optional(),
  receivesSnap: z.string().optional(), receivesWic: z.string().optional(),
  receivesTanf: z.string().optional(), enrolledHealthHome: z.string().optional(),
  householdMembersCount: z.string().optional(), householdMembersWithMedicaid: z.string().optional(),
  needsWorkAssistance: z.string().optional(), wantsSchoolHelp: z.string().optional(),
  transportationBarrier: z.string().optional(), hasChronicIllness: z.string().optional(),
  otherHealthIssues: z.string().optional(), medicationsRequireRefrigeration: z.string().optional(),
  pregnantOrPostpartum: z.string().optional(), breastmilkRefrigeration: z.string().optional(),
});

const submissionInputSchema = z.object({
  neighborhood: z.string().optional().default(""),
  supermarket: z.string().min(1),
  firstName: z.string().min(1), lastName: z.string().min(1),
  dateOfBirth: z.string().min(1),
  medicaidId: z.string().regex(/^[A-Za-z]{2}\d{5}[A-Za-z]$/, "Medicaid ID must be 2 letters, 5 numbers, 1 letter"),
  cellPhone: z.string().min(1), homePhone: z.string().optional(),
  email: z.string().email(),
  streetAddress: z.string().min(1), aptUnit: z.string().optional(),
  city: z.string().min(1), state: z.string().min(1), zipcode: z.string().min(1),
  healthCategories: z.array(z.string()).min(1, "At least one health category is required"),
  dueDate: z.string().optional(), miscarriageDate: z.string().optional(),
  infantName: z.string().optional(), infantDateOfBirth: z.string().optional(), infantMedicaidId: z.string().optional(),
  employed: z.string().min(1), spouseEmployed: z.string().min(1),
  hasWic: z.string().optional().default(""), hasSnap: z.string().optional().default(""),
  foodAllergies: z.string().optional(), foodAllergiesDetails: z.string().optional(),
  dietaryRestrictions: z.string().optional(),
  newApplicant: z.string().min(1),
  transferAgencyName: z.string().optional(),
  additionalMembersCount: z.string().optional().default("0"),
  householdMembers: z.array(householdMemberSchema),
  mealFocus: z.array(z.string()),
  breakfastItems: z.string().optional(), lunchItems: z.string().optional(),
  dinnerItems: z.string().optional(), snackItems: z.string().optional(),
  needsRefrigerator: z.string().min(1), needsMicrowave: z.string().min(1), needsCookingUtensils: z.string().min(1),
  hipaaConsent: z.boolean().refine((val) => val === true, { message: "HIPAA consent is required" }),
  guardianName: z.string().min(1, "Guardian name is required"),
  // BUG-SEC3-B FIX: cap signature to ~375 KB decoded (500_000 base64 chars) to prevent DoS via huge SVG
  signatureDataUrl: z.string().min(1, "Electronic signature is required").max(500_000, "Signature data is too large"),
  ref: z.string().optional(),
  screeningQuestions: screeningQuestionsSchema.optional(),
  uploadedDocuments: z.record(z.string(), z.string()).optional(),
}).passthrough();

const SESSION_ID_COOKIE = "admin_session_id";
const IMPERSONATION_COOKIE = "impersonation_original_session";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(async ({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      ctx.res.clearCookie(SESSION_ID_COOKIE, { ...cookieOptions, maxAge: -1 });
      if (ctx.user) {
        const ip = (ctx.req as any).ip ?? ctx.req.socket?.remoteAddress ?? "unknown";
        const sessionId = parseCookieHeader(ctx.req.headers.cookie ?? "")?.[SESSION_ID_COOKIE] ?? null;
        await logAudit({ actorId: ctx.user.id, actorName: ctx.user.name ?? ctx.user.email ?? "Staff", action: "logout", details: { ip }, sessionId });
      }
      return { success: true } as const;
    }),
    dbStatus: publicProcedure.query(async () => {
      // SECURITY: only expose connection health, never DB internals or counts
      const { getDb } = await import("./db");
      const db = await getDb();
      return { dbConnected: !!db };
    }),
    adminLogin: publicProcedure
      .input(z.object({ email: z.string().email(), password: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const ip = (ctx.req as any).ip ?? ctx.req.socket?.remoteAddress ?? "unknown";
        const user = await getUserByEmail(input.email);
        if (!user || !user.passwordHash) {
          // Constant-time dummy compare to prevent user-enumeration via timing
          await bcrypt.compare(input.password, "$2b$12$invalidhashpaddingtomatch.cost.rounds.here");
          await logAudit({ action: "login_failed", actorName: input.email, details: { reason: "unknown_email", ip } });
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
        }
        // ── Per-account lockout check (must happen BEFORE bcrypt to save CPU) ──
        if (user.lockedUntil && new Date() < user.lockedUntil) {
          const remainingMs = user.lockedUntil.getTime() - Date.now();
          const remainingMin = Math.ceil(remainingMs / 60000);
          const isHardLock = (user.failedLoginAttempts ?? 0) >= 15;
          await logAudit({ actorId: user.id, actorName: user.email ?? input.email, action: "login_failed", details: { reason: "account_locked", lockedUntil: user.lockedUntil, ip } });
          if (isHardLock) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Your account has been locked due to too many failed attempts. Please reset your password to regain access." });
          }
          throw new TRPCError({ code: "FORBIDDEN", message: `Your account is temporarily locked. Please try again in ${remainingMin} minute${remainingMin !== 1 ? "s" : ""}.` });
        }
        const valid = await bcrypt.compare(input.password, user.passwordHash);
        if (!valid) {
          const { attempts, lockedUntil } = await recordFailedLogin(user.id);
          await logAudit({ actorId: user.id, actorName: user.email ?? input.email, action: "login_failed", details: { reason: "wrong_password", attempts, ip } });
          if (lockedUntil && attempts >= 15) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Your account has been locked due to too many failed attempts. Please reset your password to regain access." });
          }
          if (lockedUntil && attempts >= 10) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Too many failed attempts. Your account is locked for 1 hour." });
          }
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
        }
        if (user.role !== "admin" && user.role !== "worker" && user.role !== "super_admin" && user.role !== "viewer" && user.role !== "assessor") {
          await logAudit({ actorId: user.id, actorName: user.email ?? input.email, action: "login_failed", details: { reason: "insufficient_role", role: user.role, ip } });
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied: staff role required" });
        }
        // Reject deactivated accounts
        if (!user.isActive) {
          await logAudit({ actorId: user.id, actorName: user.email ?? input.email, action: "login_failed", details: { reason: "account_deactivated", ip } });
          throw new TRPCError({ code: "FORBIDDEN", message: "Your account has been deactivated. Please contact your administrator." });
        }
        // Clear failed-login counter on successful auth
        await clearFailedLogins(user.id);
        // Generate a session UUID for activity grouping
        const sessionId = randomUUID();
        // Log successful login
        await logAudit({ actorId: user.id, actorName: user.email ?? input.email, action: "login_success", details: { role: user.role, ip }, sessionId });
        // SECURITY: admin/worker sessions expire in 8 hours (not 1 year).
        // Shorter sessions limit the blast radius of a stolen cookie.
        const SESSION_8H_MS = 8 * 60 * 60 * 1000;
        const sessionToken = await sdk.createSessionToken(user.openId, { name: user.name || "", expiresInMs: SESSION_8H_MS });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: SESSION_8H_MS });
        ctx.res.cookie(SESSION_ID_COOKIE, sessionId, { ...cookieOptions, maxAge: SESSION_8H_MS });
        return { success: true, role: user.role } as const;
      }),
  }),

  // ─── File Upload ──────────────────────────────────────────────────────────
  upload: router({
    document: publicProcedure
      .input(z.object({ fileName: z.string(), fileData: z.string(), contentType: z.string(), category: z.string() }))
      .mutation(async ({ input }) => {
        // MIME type whitelist — reject anything that isn't a known safe document/image type
        const ALLOWED_MIME_TYPES: Record<string, string> = {
          "application/pdf": "pdf",
          "image/jpeg": "jpg",
          "image/png": "png",
          "image/webp": "webp",
          "image/gif": "gif",
          "application/msword": "doc",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
        };
        if (!ALLOWED_MIME_TYPES[input.contentType]) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `File type '${input.contentType}' is not allowed. Accepted types: PDF, JPG, PNG, WEBP, GIF, DOC, DOCX.`,
          });
        }
        // FIX: derive extension from MIME type, not from user-supplied filename
        // This prevents an attacker from uploading malicious.php with contentType=image/jpeg
        const safeExt = ALLOWED_MIME_TYPES[input.contentType];
        const buffer = Buffer.from(input.fileData, "base64");
        // BUG-SEC5-B FIX: enforce server-side file size limit (10 MB decoded)
        // The public endpoint has no auth, so this prevents unauthenticated S3 flooding.
        const MAX_PUBLIC_UPLOAD_BYTES = 3 * 1024 * 1024; // 3 MB (Vercel 4.5 MB body limit; base64 inflates ~33%)
        if (buffer.byteLength > MAX_PUBLIC_UPLOAD_BYTES) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "File too large. Maximum allowed size is 10 MB.",
          });
        }
        // BUG-SEC3-C FIX: use cryptographically random suffix (128-bit) instead of Math.random() (6 base-36 chars)
        const suffix = randomBytes(16).toString("hex");
        // FIX: sanitize category to alphanumeric + hyphens only to prevent S3 path traversal
        const safeCategory = input.category.replace(/[^a-zA-Z0-9-_]/g, "").slice(0, 50) || "doc";
        const key = `documents/${safeCategory}-${suffix}.${safeExt}`;
        const { url } = await storagePut(key, buffer, input.contentType);
        return { url, key };
      }),
  }),

  // ─── Submission ───────────────────────────────────────────────────────────
  submission: router({
    submit: publicProcedure.input(submissionInputSchema).mutation(async ({ input }) => {
      const refNumber = Math.random().toString(36).substring(2, 8).toUpperCase();
      const consentAt = new Date();

      console.log(`[Submission] Processing new submission (ref: ${refNumber})`);

      // Step 1: Save to database (this is the ONLY critical step)
      // Duplicate detection is now handled by the UNIQUE index on medicaidId (ER_DUP_ENTRY / errno 1062).
      // The pre-INSERT lookup has been removed to eliminate the read-before-write race condition under load.
      try {
        await createSubmission({
          referenceNumber: refNumber, firstName: input.firstName, lastName: input.lastName,
          email: input.email, cellPhone: input.cellPhone, medicaidId: input.medicaidId,
          supermarket: input.supermarket, referralSource: input.ref ?? null,
          status: "new", stage: "referral",
          formData: input as unknown as Record<string, unknown>,
          hipaaConsentAt: consentAt,
          borough: input.city === "Brooklyn" ? "Brooklyn" : input.city,
          neighborhood: input.neighborhood || null,
          additionalMembersCount: parseInt(input.additionalMembersCount || "0") || 0,
          newApplicant: input.newApplicant || null,
          transferAgencyName: (input as any).transferAgencyName || null,
          zipcode: input.zipcode ? String(input.zipcode).trim().substring(0, 5) : null,
        });
        console.log(`[Submission] ✓ Saved to database (ref: ${refNumber})`);
      } catch (dbErr: any) {
        // MySQL duplicate-key error (UNIQUE constraint on medicaidId)
        // Drizzle wraps the mysql2 error in dbErr.cause, so check both levels
        const isDupEntry = dbErr?.code === "ER_DUP_ENTRY" || dbErr?.errno === 1062
          || dbErr?.cause?.code === "ER_DUP_ENTRY" || dbErr?.cause?.errno === 1062;
        if (isDupEntry) {
          const dup = await getSubmissionByMedicaidId(input.medicaidId);
          throw new TRPCError({
            code: "CONFLICT",
            message: `DUPLICATE:${dup?.referenceNumber ?? "UNKNOWN"}`,
          });
        }
        const errMsg = dbErr?.message || String(dbErr);
        console.error(`[Submission] ✗ Database save failed (ref: ${refNumber}): ${errMsg}`);
        // Surface DB_URL missing error clearly in logs
        if (errMsg.includes("DATABASE_URL")) {
          console.error("[Submission] CRITICAL: DATABASE_URL environment variable is not configured on this server!");
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to save application. Please try again." });
      }

      // ── Everything below is FIRE-AND-FORGET ──
      // These run in the background and NEVER affect the response to the user.
      // We use setTimeout(0) to fully detach from the request lifecycle.
      setTimeout(() => {
        try {
          // Track referral link usage
          if (input.ref) {
            incrementReferralUsage(input.ref).catch((err) => console.warn("[Referral] Failed to track:", err));
          }
          // Send emails (non-blocking, with individual try-catch)
          // _skipEmail: true suppresses Resend calls during load tests / CI
          const skipEmail = (input as any)._skipEmail === true;
          const emailPayload = { referenceNumber: refNumber, firstName: input.firstName, lastName: input.lastName, email: input.email, cellPhone: input.cellPhone, medicaidId: input.medicaidId, supermarket: input.supermarket, formData: input as unknown as Record<string, unknown> };
          if (!skipEmail) {
            sendApplicantConfirmation(emailPayload).catch((err) => console.warn("[Email] Applicant confirmation failed:", err));
            sendAdminNotification(emailPayload).catch((err) => console.warn("[Email] Admin notification failed:", err));
          } else {
            console.log(`[Email] Skipped (load test mode) for ref: ${refNumber}`);
          }
          // In-app notification for new submission
          createNotification({
            type: "new_submission",
            title: `New application: ${input.firstName} ${input.lastName}`,
            body: `Ref: ${refNumber} \u2014 ${input.supermarket} \u2014 ${input.email}`,
            link: `/admin/clients`,
            submissionId: null,
          }).catch((e: unknown) => console.warn("[Notification] new_submission:", e));

          // Generate Household Attestation + HIPAA PDF (non-blocking)
          generateAttestationPdf({
            applicantName: `${input.firstName} ${input.lastName}`,
            guardianName: input.guardianName,
            referenceNumber: refNumber,
            signatureDataUrl: input.signatureDataUrl,
            hipaaConsentAt: consentAt,
            householdMembers: input.householdMembers || [],
            medicaidId: input.medicaidId,
            supermarket: input.supermarket,
          }).then(async (pdfBytes) => {
            if (!pdfBytes) {
              console.warn(`[PDF] Attestation PDF generation returned null (ref: ${refNumber})`);
              return;
            }
            try {
              const suffix = Math.random().toString(36).substring(2, 8);
              const key = `attestations/${refNumber}-${suffix}.pdf`;
              const { url } = await storagePut(key, Buffer.from(pdfBytes), "application/pdf");
              console.log(`[PDF] ✓ Attestation PDF uploaded (ref: ${refNumber}): ${url}`);

              // Link the PDF to the submission in the documents table
              const submission = await getSubmissionByRef(refNumber);
              if (submission) {
                await createDocument({
                  submissionId: submission.id,
                  name: `Attestation & HIPAA Consent - ${input.firstName} ${input.lastName}`,
                  category: "consent",
                  url,
                  fileKey: key,
                  mimeType: "application/pdf",
                  fileSize: pdfBytes.length,
                });
                console.log(`[PDF] ✓ Attestation PDF linked to submission ${submission.id}`);
              }
            } catch (uploadErr) {
              console.error(`[PDF] Failed to upload/link attestation PDF (ref: ${refNumber}):`, uploadErr);
            }
          }).catch((pdfErr) => console.error(`[PDF] Attestation generation error (ref: ${refNumber}):`, pdfErr));
        } catch (bgErr) {
          console.warn("[Submission] Background tasks error (non-blocking):", bgErr);
        }
      }, 0);

      // Return success IMMEDIATELY after DB save
      return { success: true, referenceNumber: refNumber };
    }),
  }),

  // ─── Admin procedures ─────────────────────────────────────────────────────
  admin: router({
    // Check for duplicate phone/CIN before adding or editing a client
    checkDuplicate: editProcedure.input(z.object({
      cellPhone: z.string().optional(),
      medicaidId: z.string().optional(),
      excludeId: z.number().optional(), // exclude the current client when editing
    })).query(async ({ input }) => {
      const db = await (await import("./db")).getDb();
      if (!db) return { phoneMatch: null, cinMatch: null };
      const { eq, and, ne } = await import("drizzle-orm");
      const { submissions: subs } = await import("../drizzle/schema");
      let phoneMatch: { id: number; name: string } | null = null;
      let cinMatch: { id: number; name: string } | null = null;
      if (input.cellPhone && input.cellPhone.trim()) {
        const cond = input.excludeId ? and(eq(subs.cellPhone, input.cellPhone.trim()), ne(subs.id, input.excludeId)) : eq(subs.cellPhone, input.cellPhone.trim());
        const rows = await db.select({ id: subs.id, firstName: subs.firstName, lastName: subs.lastName }).from(subs).where(cond).limit(1);
        if (rows[0]) phoneMatch = { id: rows[0].id, name: `${rows[0].firstName} ${rows[0].lastName}` };
      }
      if (input.medicaidId && input.medicaidId.trim()) {
        const cond = input.excludeId ? and(eq(subs.medicaidId, input.medicaidId.trim()), ne(subs.id, input.excludeId)) : eq(subs.medicaidId, input.medicaidId.trim());
        const rows = await db.select({ id: subs.id, firstName: subs.firstName, lastName: subs.lastName }).from(subs).where(cond).limit(1);
        if (rows[0]) cinMatch = { id: rows[0].id, name: `${rows[0].firstName} ${rows[0].lastName}` };
      }
      return { phoneMatch, cinMatch };
    }),

    // Dashboard stats
    stats: staffProcedure.query(async () => getSubmissionStats()),
    taskStats: staffProcedure.query(async () => getTaskStats()),
    // BUG-SEC4-B FIX: add .int().min(1).max() bounds to prevent a compromised staff account
    // from passing limit=999999 to dump the entire submissions table in one query.
    recentClients: staffProcedure.input(z.object({ days: z.number().int().min(1).max(365).optional(), limit: z.number().int().min(1).max(200).optional() }).optional()).query(async ({ input }) => getRecentSubmissions(input?.days ?? 7, input?.limit ?? 10)),
    recentlyUpdated: staffProcedure.input(z.object({ days: z.number().int().min(1).max(365).optional(), limit: z.number().int().min(1).max(200).optional() }).optional()).query(async ({ input }) => getRecentlyUpdated(input?.days ?? 7, input?.limit ?? 10)),
    addedCount: staffProcedure.input(z.object({ days: z.number().int().min(1).max(365).optional() }).optional()).query(async ({ input }) => getAddedCount(input?.days ?? 7)),
    staffList: staffProcedure.query(async () => listStaffUsers()),

    // Assessor: list all clients assigned to this assessor (no assessment-completion filter)
    assessorStats: assessorProcedure.query(async ({ ctx }) => {
      // Returns scoped stats for the logged-in assessor (admins see all)
      // listSubmissions returns { rows, total, ... } — use .total for accurate counts
      const assessorFilter = (ctx.user.role === "admin" || ctx.user.role === "super_admin") ? undefined : ctx.user.id;
      const terminalStages = ["assessment_recorded", "missing_information", "not_eligible"];
      const [pendingResult, recordedResult, missingResult, notEligibleResult] = await Promise.all([
        listSubmissions({ excludeStages: terminalStages, assessorId: assessorFilter, pageSize: 1, page: 1 }),
        listSubmissions({ stage: "assessment_recorded", assessorId: assessorFilter, pageSize: 1, page: 1 }),
        listSubmissions({ stage: "missing_information", assessorId: assessorFilter, pageSize: 1, page: 1 }),
        listSubmissions({ stage: "not_eligible", assessorId: assessorFilter, pageSize: 1, page: 1 }),
      ]);
      const getTotal = (r: any) => typeof r?.total === "number" ? r.total : (Array.isArray(r) ? r.length : 0);
      const pending = getTotal(pendingResult);
      const recorded = getTotal(recordedResult);
      const missing = getTotal(missingResult);
      const notEligible = getTotal(notEligibleResult);
      return { total: pending + recorded + missing + notEligible, pending, recorded, missing, notEligible };
    }),

    assessorList: assessorProcedure.input(z.object({
      search: z.string().optional(),
      page: z.number().min(1).optional(),
      pageSize: z.number().min(1).max(200).optional(),
      tab: z.enum(["pending", "recorded", "missing_information", "not_eligible"]).optional(),
      priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
      newApplicant: z.enum(["new", "transfer"]).optional(),
    })).query(async ({ input, ctx }) => {
      const tab = input.tab ?? "pending";
      // "pending": assessment completed, not yet categorised into a terminal assessor stage
      // "recorded": stage = assessment_recorded
      // "missing_information": stage = missing_information
      // "not_eligible": stage = not_eligible
      const terminalStages = ["assessment_recorded", "missing_information", "not_eligible"];
      const stageFilter =
        tab === "pending" ? undefined :
        tab === "recorded" ? "assessment_recorded" :
        tab === "missing_information" ? "missing_information" :
        "not_eligible";
      // Scope to only clients assigned to this assessor (admins see all)
      const assessorFilter = (ctx.user.role === "admin" || ctx.user.role === "super_admin") ? undefined : ctx.user.id;
      const result = await listSubmissions({
        search: input.search,
        page: input.page,
        pageSize: input.pageSize ?? 200,
        stage: stageFilter,
        priority: input.priority,
        newApplicant: input.newApplicant,
        assessorId: assessorFilter,
        // For pending: exclude all terminal assessor stages so completed ones don't show
        ...(tab === "pending" ? { excludeStages: terminalStages } : {}),
      });
      return Array.isArray(result) ? result : (result as any).rows ?? [];
    }),

    // Client list
    list: staffProcedure.input(z.object({
      search: z.string().optional(),
      status: z.enum(["all", "new", "in_review", "approved", "rejected", "on_hold"]).optional(),
      stage: z.string().optional(),
      supermarket: z.string().optional(),
      neighborhood: z.string().optional(),
      program: z.string().optional(),
      newApplicant: z.enum(["new", "transfer"]).optional(),
      language: z.string().optional(),
      borough: z.string().optional(),
      assignedTo: z.number().optional(),
      intakeRep: z.number().optional(),
      assessorId: z.number().optional(),
      referralSource: z.string().optional(),
      assessmentCompleted: z.boolean().optional(),
      zipcode: z.string().optional(),
      priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
      sortDir: z.enum(["asc", "desc"]).optional(),
      page: z.number().min(1).optional(),
      pageSize: z.number().min(1).max(100).optional(),
      notInterested: z.boolean().optional(),
      orgId: z.number().optional(),
    })).query(async ({ input, ctx }) => {
      // SECURITY: Assessors can only see clients assigned to them — enforce server-side
      // regardless of what the frontend passes. This cannot be bypassed via API.
      if (ctx.user.role === "assessor") {
        return listSubmissions({ ...input, assessorId: ctx.user.id });
      }
      return listSubmissions(input);
    }),

    updatePriority: editProcedure.input(z.object({
      id: z.number(),
      priority: z.enum(["low", "normal", "high", "urgent"]),
    })).mutation(async ({ input, ctx }) => {
      await updateSubmissionPriority(input.id, input.priority);
      await logAudit({ actorId: ctx.user.id, actorName: ctx.user.name ?? ctx.user.email, action: "priority_changed", clientId: input.id, details: { priority: input.priority } });
      return { success: true };
    }),

    filterCounts: staffProcedure.query(async () => getFilterCounts()),
    getDuplicates: staffProcedure.query(async () => {
      const db = await (await import('./db')).getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
      const { sql, eq, and } = await import('drizzle-orm');
      // Duplicate Medicaid IDs
      const dupMedicaid = await db.execute(sql`
        SELECT medicaidId as matchKey, 'medicaid' as matchType, COUNT(*) as cnt,
          GROUP_CONCAT(id ORDER BY createdAt ASC SEPARATOR ',') as ids
        FROM submissions
        WHERE medicaidId IS NOT NULL AND medicaidId != ''
        GROUP BY medicaidId HAVING COUNT(*) > 1
      `);
      // Duplicate phones (normalized)
      const dupPhone = await db.execute(sql`
        SELECT REGEXP_REPLACE(cellPhone,'[^0-9]','') as matchKey, 'phone' as matchType, COUNT(*) as cnt,
          GROUP_CONCAT(id ORDER BY createdAt ASC SEPARATOR ',') as ids
        FROM submissions
        WHERE cellPhone IS NOT NULL AND cellPhone != ''
        GROUP BY REGEXP_REPLACE(cellPhone,'[^0-9]','')
        HAVING COUNT(*) > 1
      `);
      // Drizzle mysql2 execute() returns [rows, fields] — extract rows from index 0
      const medicaidRows = (Array.isArray((dupMedicaid as any)[0]) ? (dupMedicaid as any)[0] : dupMedicaid) as any[];
      const phoneRows = (Array.isArray((dupPhone as any)[0]) ? (dupPhone as any)[0] : dupPhone) as any[];
      const allGroups = [...medicaidRows, ...phoneRows];
      // Fetch full details for all flagged IDs
      const allIds = Array.from(new Set(allGroups.flatMap((g: any) => String(g.ids).split(',').map(Number))));
      if (allIds.length === 0) return [];
      const { submissions } = await import('../drizzle/schema');
      const { inArray } = await import('drizzle-orm');
      const rows = await db.select({
        id: submissions.id, firstName: submissions.firstName, lastName: submissions.lastName,
        medicaidId: submissions.medicaidId, cellPhone: submissions.cellPhone,
        email: submissions.email, createdAt: submissions.createdAt,
        stage: submissions.stage, status: submissions.status,
        supermarket: submissions.supermarket, neighborhood: submissions.neighborhood,
      }).from(submissions).where(inArray(submissions.id, allIds));
      const rowMap = new Map(rows.map(r => [r.id, r]));
      return allGroups.map((g: any) => ({
        matchKey: g.matchKey,
        matchType: g.matchType,
        count: Number(g.cnt),
        records: String(g.ids).split(',').map(Number).map(id => rowMap.get(id)).filter(Boolean),
      }));
    }),
    deleteDuplicate: deleteProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const { deleteSubmission } = await import('./db');
      const existing = await getSubmissionById(input.id);
      await deleteSubmission(input.id);
      await logAudit({ actorId: ctx.user.id, actorName: ctx.user.name ?? ctx.user.email ?? "Staff", action: "duplicate_deleted", clientId: input.id, clientName: existing ? `${existing.firstName} ${existing.lastName}` : undefined });
      return { success: true };
    }),

    assessmentReport: staffProcedure.query(async () => getAssessmentReport()),
    exportCompletedAssessments: staffProcedure.query(async () => getCompletedAssessmentsExport()),

    bulkGetByIds: staffProcedure.input(z.object({ ids: z.array(z.number()).min(1).max(200) })).query(async ({ input }) => {
      return getSubmissionsByIds(input.ids);
    }),

    getById: staffProcedure.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => {
      const submission = await getSubmissionById(input.id);
      if (!submission) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" });
      // SECURITY: Assessors can only view clients assigned to them OR referred to their org
      if (ctx.user.role === "assessor") {
        const userOrgId = (ctx.user as any).orgId as number | null;
        const isAssignedAssessor = submission.assessorId === ctx.user.id;
        const isOrgReferral = userOrgId != null && (submission as any).referredOrgId === userOrgId;
        if (!isAssignedAssessor && !isOrgReferral) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this client" });
        }
      }
      return submission;
    }),
    // ─── Referrer Notes (per client) ──────────────────────────────────────
    sendReferrerNote: staffProcedure.input(z.object({
      submissionId: z.number(),
      message: z.string().min(1).max(2000),
      attachmentUrl: z.string().url().startsWith("https://").optional(),
    })).mutation(async ({ ctx, input }) => {
      const submission = await getSubmissionById(input.submissionId);
      if (!submission) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" });
      // SECURITY: Assessors can only send notes for their assigned clients
      if (ctx.user.role === "assessor" && !(await canAssessorAccessClient(ctx.user as any, submission as any))) throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this client" });
      if (!submission.referralSource) throw new TRPCError({ code: "BAD_REQUEST", message: "This client has no referrer" });
      const link = await getReferralLinkByCode(submission.referralSource);
      if (!link) throw new TRPCError({ code: "NOT_FOUND", message: "Referral link not found" });
      // SECURITY: only allow https:// attachment URLs — prevents javascript:/data: injection
      const safeAttachmentUrl = input.attachmentUrl && input.attachmentUrl.startsWith("https://")
        ? input.attachmentUrl
        : null;
      const id = await createReferrerMessage({
        referralLinkId: link.id,
        submissionId: input.submissionId,
        senderId: ctx.user.id,
        message: input.message,
        attachmentUrl: safeAttachmentUrl,
      });
      return { success: true, id };
    }),
    listReferrerNotes: staffProcedure.input(z.object({
      submissionId: z.number(),
    })).query(async ({ input, ctx }) => {
      const submission = await getSubmissionById(input.submissionId);
      if (!submission || !submission.referralSource) return [];
      // SECURITY: Assessors can only view referrer notes for their assigned clients
      if (ctx.user.role === "assessor" && !(await canAssessorAccessClient(ctx.user as any, submission as any))) throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this client" });
      const link = await getReferralLinkByCode(submission.referralSource);
      if (!link) return [];
      return listReferrerMessagesBySubmission(input.submissionId);
    }),
    deleteReferrerNote: deleteProcedure.input(z.object({
      messageId: z.number(),
    })).mutation(async ({ input, ctx }) => {
      // SECURITY: verify message exists before deleting (prevents blind IDOR enumeration)
      const { getReferrerMessageById } = await import("./db");
      const msg = await getReferrerMessageById(input.messageId);
      if (!msg) throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" });
      await deleteReferrerMessageById(input.messageId);
      await logAudit({ actorId: ctx.user.id, actorName: ctx.user.name ?? ctx.user.email ?? "Staff", action: "referrer_note_deleted", details: { messageId: input.messageId } });
      return { success: true };
    }),

    // ─── Client Email Thread ──────────────────────────────────────────────
    sendClientEmail: editProcedure.input(z.object({
      submissionId: z.number(),
      subject: z.string().max(512).optional(),
      body: z.string().min(1),
      attachmentUrls: z.array(z.string()).optional(),
    })).mutation(async ({ ctx, input }) => {
      const submission = await getSubmissionById(input.submissionId);
      if (!submission) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" });
      // SECURITY: Assessors can only email their assigned clients
      if (ctx.user.role === "assessor" && !(await canAssessorAccessClient(ctx.user as any, submission as any))) throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this client" });
      if (!submission.email) throw new TRPCError({ code: "BAD_REQUEST", message: "Client has no email address" });
      // Use a client-specific reply-to so inbound replies are automatically matched to this client.
      // Format: reply-{submissionId}@freshselectmeals.com
      // Resend inbound webhook at /api/inbound-email parses this to find the right client record.
      const INBOUND_DOMAIN = process.env.RESEND_INBOUND_DOMAIN ?? "inbound.freshselectmeals.com";
      const replyTo = `reply-${input.submissionId}@${INBOUND_DOMAIN}`;
      const fromEmail = process.env.RESEND_FROM_EMAIL ?? `FreshSelect Meals <admin@freshselectmeals.com>`;
      const resolvedSubject = input.subject?.trim() || "Message from FreshSelect Meals";
      // HTML-escape the body so staff cannot accidentally or maliciously inject HTML/scripts
      const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
      const safeBody = escapeHtml(input.body).replace(/\n/g, "<br/>");
      // Validate attachment URLs — only allow https:// to prevent javascript: injection
      const safeAttachmentUrls = (input.attachmentUrls ?? []).filter((u) => u.startsWith("https://"));
      const success = await sendEmail({
        to: submission.email,
        subject: resolvedSubject,
        replyTo,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
          <p style="color:#2d5a27;font-weight:bold;">FreshSelect Meals</p>
          ${safeBody}
          ${safeAttachmentUrls.length > 0 ? `<hr/><p style="font-size:13px;color:#666;">Attachments: ${safeAttachmentUrls.map((u, i) => `<a href="${escapeHtml(u)}">Attachment ${i + 1}</a>`).join(", ")}</p>` : ""}
          <hr/><p style="font-size:12px;color:#999;">FreshSelect Meals &mdash; (718) 307-4664 | admin@freshselectmeals.com<br/>To reply, simply reply to this email.</p>
        </div>`,
      });
       if (!success) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to send email" });
      const id = await createClientEmail({
        submissionId: input.submissionId,
        direction: "outbound",
        subject: resolvedSubject,
        body: input.body,
        fromEmail: fromEmail,
        toEmail: submission.email,
        attachmentUrls: input.attachmentUrls ? JSON.stringify(input.attachmentUrls) : null,
        sentBy: ctx.user.id,
      });
      await logAudit({ actorId: ctx.user.id, actorName: ctx.user.name ?? ctx.user.email ?? "Staff", action: "email_sent", clientId: input.submissionId, clientName: submission ? `${submission.firstName} ${submission.lastName}` : undefined, details: { subject: resolvedSubject, to: submission.email } });
      return { success: true, id };
    }),
    listClientEmails: staffProcedure.input(z.object({
      submissionId: z.number(),
    })).query(async ({ input, ctx }) => {
      // SECURITY: Assessors can only view emails for their assigned clients
      if (ctx.user.role === "assessor") {
        const sub = await getSubmissionById(input.submissionId);
        if (!sub || !(await canAssessorAccessClient(ctx.user as any, sub as any))) throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this client" });
      }
      return listClientEmails(input.submissionId);
    }),
    deleteClientEmail: deleteProcedure.input(z.object({
      id: z.number(),
    })).mutation(async ({ input, ctx }) => {
      // SECURITY: verify the email record exists before deleting (prevents blind IDOR enumeration)
      const emails = await listClientEmailsById(input.id);
      if (!emails) throw new TRPCError({ code: "NOT_FOUND", message: "Email not found" });
      await deleteClientEmailById(input.id);
      await logAudit({ actorId: ctx.user.id, actorName: ctx.user.name ?? ctx.user.email ?? "Staff", action: "email_deleted", details: { emailId: input.id } });
      return { success: true };
    }),

    updateStatus: editProcedure.input(z.object({
      id: z.number(),
      status: z.enum(["new", "in_review", "approved", "rejected", "on_hold"]),
      adminNotes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const existing = await getSubmissionById(input.id);
      await updateSubmissionStatus(input.id, input.status, input.adminNotes);
      await logAudit({ actorId: ctx.user.id, actorName: ctx.user.name ?? ctx.user.email ?? "Staff", action: "status_changed", clientId: input.id, clientName: existing ? `${existing.firstName} ${existing.lastName}` : undefined, details: { from: existing?.status ?? null, to: input.status } });
      return { success: true };
    }),

    updateStage: editProcedure.input(z.object({
      id: z.number(),
      stage: z.enum(["referral", "assessment", "assessment_recorded", "missing_information", "not_eligible", "level_one_only", "level_one_household", "level_2_active", "ineligible", "provider_attestation_required", "flagged"]),
    })).mutation(async ({ input, ctx }) => {
      // Fetch current stage for history
      const existing = await getSubmissionById(input.id);
      await updateSubmissionStage(input.id, input.stage);
      // Log stage change to history
      await createStageHistoryEntry({
        submissionId: input.id,
        fromStage: existing?.stage ?? null,
        toStage: input.stage,
        changedBy: ctx.user.id,
        changedByName: ctx.user.name ?? ctx.user.email ?? "Staff",
      });
      // Audit log
      await logAudit({
        actorId: ctx.user.id, actorName: ctx.user.name ?? ctx.user.email ?? "Staff",
        action: "stage_changed",
        clientId: input.id,
        clientName: existing ? `${existing.firstName} ${existing.lastName}` : undefined,
        details: { from: existing?.stage ?? null, to: input.stage },
      });
      return { success: true };
    }),

    stageHistory: staffProcedure.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => {
      // SECURITY: Assessors can only view stage history for their assigned clients
      if (ctx.user.role === "assessor") {
        const sub = await getSubmissionById(input.id);
        if (!sub || !(await canAssessorAccessClient(ctx.user as any, sub as any))) throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this client" });
      }
      return getStageHistoryBySubmission(input.id);
    }),

    updateAssignment: adminProcedure.input(z.object({
      id: z.number(), assignedTo: z.number().nullable(), intakeRep: z.number().nullable().optional(),
    })).mutation(async ({ input, ctx }) => {
      const existing = await getSubmissionById(input.id);
      await updateSubmissionAssignment(input.id, input.assignedTo, input.intakeRep);
      await logAudit({ actorId: ctx.user.id, actorName: ctx.user.name ?? ctx.user.email ?? "Admin", action: "assignment_changed", clientId: input.id, clientName: existing ? `${existing.firstName} ${existing.lastName}` : undefined, details: { assignedTo: input.assignedTo, intakeRep: input.intakeRep } });
      return { success: true };
    }),
    // ─── Assessor Assignment ─────────────────────────────────────────────────
    listAssessors: staffProcedure.query(async () => {
      return listAssessors();
    }),
    assignAssessor: editProcedure.input(z.object({
      submissionId: z.number(),
      assessorId: z.number().nullable(),
    })).mutation(async ({ input, ctx }) => {
      const existing = await getSubmissionById(input.submissionId);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" });
      const previousAssessorId = (existing as any).assessorId ?? null;
      await updateSubmissionAssessor(input.submissionId, input.assessorId);
      await logAudit({
        actorId: ctx.user.id,
        actorName: ctx.user.name ?? ctx.user.email ?? "Staff",
        action: "assessor_assigned",
        clientId: input.submissionId,
        clientName: `${existing.firstName} ${existing.lastName}`,
        details: { previousAssessorId, newAssessorId: input.assessorId },
      });
      // Notify the newly assigned assessor (if assigning, not unassigning)
      if (input.assessorId) {
        await createNotification({
          type: "assessor_assigned",
          title: "New client assigned to you",
          body: `${existing.firstName} ${existing.lastName} (${existing.medicaidId}) has been assigned to you for assessment.`,
          link: `/assessor`,
          submissionId: input.submissionId,
        });
      }
      return { success: true };
    }),

    // CSV Export
    exportCsv: staffProcedure.input(z.object({
      status: z.string().optional(), supermarket: z.string().optional(), stage: z.string().optional(),
      neighborhood: z.string().optional(), language: z.string().optional(), borough: z.string().optional(),
      search: z.string().optional(),
      assignedTo: z.number().optional(), intakeRep: z.number().optional(),
      referralSource: z.string().optional(), program: z.string().optional(),
      assessmentCompleted: z.boolean().optional(),
    }))
      .mutation(async ({ ctx, input }) => {
        // SECURITY: assessors and viewers cannot export client PII
        if (ctx.user.role === "assessor" || ctx.user.role === "viewer") {
          throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to export client data" });
        }
        // 'assessment_completed' is a virtual filter — maps to assessmentCompletedAt IS NOT NULL
        const { assessmentCompleted, program, assignedTo, intakeRep, referralSource, ...baseFilters } = input;
        let rows = await getAllSubmissions({ ...baseFilters, assignedTo, intakeRep, referralSource });
        if (assessmentCompleted === true) rows = rows.filter((r: any) => r.assessmentCompletedAt != null);
        if (assessmentCompleted === false) rows = rows.filter((r: any) => r.assessmentCompletedAt == null);
        if (program && program !== "all") rows = rows.filter((r: any) => r.program === program);
        const headers = ["Reference #", "First Name", "Last Name", "Email", "Phone", "Medicaid ID", "DOB", "Address", "City", "State", "Zip", "Language", "Neighborhood", "Vendor", "Stage", "Status", "Household Members", "Health Categories", "Referral Source", "Guardian Name", "Submitted"];
        const csvRows = rows.map((r) => {
          const fd = (r.formData as any) || {};
          const householdNames = (fd.householdMembers || []).map((m: any) => `${m.firstName || ""} ${m.lastName || ""} (${m.relationship || ""})`.trim()).join("; ");
          const healthCats = (fd.healthCategories || []).join("; ");
          return [
            r.referenceNumber, r.firstName, r.lastName, r.email, r.cellPhone, r.medicaidId,
            fd.dateOfBirth || "", fd.address || "", fd.city || "", fd.state || "", fd.zipCode || "",
            fd.language || r.language || "English", fd.neighborhood || "", r.supermarket, r.stage, r.status,
            householdNames, healthCats, r.referralSource || "", fd.guardianName || "",
            r.createdAt.toISOString()
          ];
        });
        const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
        const csv = [headers.map(escape).join(","), ...csvRows.map((row) => row.map(escape).join(","))].join("\n");
                // AUDIT: log every export so admins can track who downloaded client PII
        await logAudit({
          actorId: ctx.user.id,
          actorName: ctx.user.name ?? ctx.user.email ?? "Staff",
          action: "csv_export",
          details: { recordCount: rows.length, filters: input, role: ctx.user.role },
        }).catch(() => {});
        return { csv, count: rows.length, headers, data: csvRows };
      }),
    // ─── Tasks ────────────────────────────────────────────────────────────
    tasks: router({
      list: staffProcedure.input(z.object({
        search: z.string().optional(),
        status: z.enum(["all", "open", "completed", "verified"]).optional(),
        area: z.enum(["all", "intake_rep", "assigned_worker"]).optional(),
        assignedTo: z.number().optional(),
        completedFrom: z.string().optional(),
        completedTo: z.string().optional(),
        page: z.number().min(1).optional(), pageSize: z.number().min(1).max(100).optional(),
      })).query(async ({ input }) => listTasks(input)),

      stats: staffProcedure.query(async () => getTaskStats()),

      byClient: staffProcedure.input(z.object({ submissionId: z.number() })).query(async ({ input, ctx }) => {
        // SECURITY: Assessors can only view tasks for their assigned clients
        if (ctx.user.role === "assessor") {
          const sub = await getSubmissionById(input.submissionId);
          if (!sub || !(await canAssessorAccessClient(ctx.user as any, sub as any))) throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this client" });
        }
        return getTasksBySubmission(input.submissionId);
      }),

      byClientWithDetails: staffProcedure.input(z.object({ submissionId: z.number() })).query(async ({ input, ctx }) => {
        if (ctx.user.role === "assessor") {
          const sub = await getSubmissionById(input.submissionId);
          if (!sub || !(await canAssessorAccessClient(ctx.user as any, sub as any))) throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this client" });
        }
        return getTasksBySubmissionWithDetails(input.submissionId);
      }),

      create: editProcedure.input(z.object({
        submissionId: z.number(),
        title: z.string().min(1).max(256),
        description: z.string().default(""),
        area: z.enum(["intake_rep", "assigned_worker"]),
        assignedTo: z.number().optional(),
        priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
        dueDate: z.string().optional(), // ISO date string
        sourceMessageId: z.number().optional(),
        sourceMessageType: z.enum(["client", "org_group"]).optional(),
      })).mutation(async ({ ctx, input }) => {
        const id = await createTask({
          submissionId: input.submissionId,
          title: input.title,
          description: input.description,
          area: input.area,
          assignedTo: input.assignedTo ?? null,
          priority: input.priority,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          sourceMessageId: input.sourceMessageId ?? null,
          sourceMessageType: input.sourceMessageType ?? null,
          createdBy: ctx.user.id,
        });
        const client = await getSubmissionById(input.submissionId);
        await logAudit({ actorId: ctx.user.id, actorName: ctx.user.name ?? ctx.user.email ?? "Staff", action: "task_created", clientId: input.submissionId, clientName: client ? `${client.firstName} ${client.lastName}` : undefined, details: { title: input.title, description: input.description, area: input.area, sourceMessageId: input.sourceMessageId } });
        return { success: true, id };
      }),

      update: editProcedure.input(z.object({
        id: z.number(),
        title: z.string().min(1).max(256).optional(),
        description: z.string().optional(),
        area: z.enum(["intake_rep", "assigned_worker"]).optional(),
        assignedTo: z.number().nullable().optional(),
        priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
        dueDate: z.string().nullable().optional(),
      })).mutation(async ({ input, ctx }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { eq } = await import("drizzle-orm");
        const { tasks: tasksTable } = await import("../drizzle/schema");
        const patch: Record<string, unknown> = {};
        if (input.title !== undefined) patch.title = input.title;
        if (input.description !== undefined) patch.description = input.description;
        if (input.area !== undefined) patch.area = input.area;
        if (input.assignedTo !== undefined) patch.assignedTo = input.assignedTo;
        if (input.priority !== undefined) patch.priority = input.priority;
        if (input.dueDate !== undefined) patch.dueDate = input.dueDate ? new Date(input.dueDate) : null;
        if (Object.keys(patch).length > 0) await db.update(tasksTable).set(patch).where(eq(tasksTable.id, input.id));
        await logAudit({ actorId: ctx.user.id, actorName: ctx.user.name ?? ctx.user.email ?? "Staff", action: "task_updated", details: { taskId: input.id, patch } });
        return { success: true };
      }),

      delete: editProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { eq } = await import("drizzle-orm");
        const { tasks: tasksTable } = await import("../drizzle/schema");
        await db.delete(tasksTable).where(eq(tasksTable.id, input.id));
        await logAudit({ actorId: ctx.user.id, actorName: ctx.user.name ?? ctx.user.email ?? "Staff", action: "task_deleted", details: { taskId: input.id } });
        return { success: true };
      }),

      updateStatus: editProcedure.input(z.object({
        id: z.number(), status: z.enum(["open", "completed", "verified"]),
      })).mutation(async ({ input, ctx }) => {
        await updateTaskStatus(input.id, input.status);
        await logAudit({ actorId: ctx.user.id, actorName: ctx.user.name ?? ctx.user.email ?? "Staff", action: "task_status_changed", details: { taskId: input.id, status: input.status } });
        return { success: true };
      }),
    }),

    // ─── Case Notes ───────────────────────────────────────────────────────
    notes: router({
      byClient: staffProcedure.input(z.object({ submissionId: z.number() })).query(async ({ input, ctx }) => {
        // SECURITY: Assessors can only view notes for their assigned clients
        if (ctx.user.role === "assessor") {
          const sub = await getSubmissionById(input.submissionId);
          if (!sub || !(await canAssessorAccessClient(ctx.user as any, sub as any))) throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this client" });
        }
        return getCaseNotesBySubmission(input.submissionId);
      }),
      create: staffProcedure.input(z.object({ submissionId: z.number(), content: z.string().min(1) }))
        .mutation(async ({ ctx, input }) => {
          // SECURITY: Assessors can only add notes for their assigned clients
          if (ctx.user.role === "assessor") {
            const sub = await getSubmissionById(input.submissionId);
            if (!sub || !(await canAssessorAccessClient(ctx.user as any, sub as any))) throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this client" });
          }
          const authorName = ctx.user.name ?? ctx.user.email ?? "Staff";
          const id = await createCaseNote({ ...input, createdBy: ctx.user.id, authorName });
          const client = await getSubmissionById(input.submissionId);
          await logAudit({ actorId: ctx.user.id, actorName: authorName, action: "case_note_added", clientId: input.submissionId, clientName: client ? `${client.firstName} ${client.lastName}` : undefined, details: { preview: input.content.substring(0, 120) } });
          return { success: true, id };
        }),
    }),

    // ─── Documents ────────────────────────────────────────────────────────
    documents: router({
      byClient: staffProcedure.input(z.object({ submissionId: z.number() })).query(async ({ input, ctx }) => {
        // SECURITY: Assessors can only view documents for their assigned clients
        if (ctx.user.role === "assessor") {
          const sub = await getSubmissionById(input.submissionId);
          if (!sub || !(await canAssessorAccessClient(ctx.user as any, sub as any))) throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this client" });
        }
        return getDocumentsBySubmission(input.submissionId);
      }),
      library: staffProcedure.input(z.object({ category: z.string().optional() }).optional()).query(async ({ input }) => getLibraryDocuments(input?.category)),
      upload: editProcedure.input(z.object({
        submissionId: z.number().nullable(), name: z.string(), category: z.enum(["provider_attestation", "consent", "supporting_documentation", "id_document", "medicaid_card", "birth_certificate", "marriage_license", "forms", "uncategorized"]),
        fileData: z.string(), contentType: z.string(),
      })).mutation(async ({ ctx, input }) => {
        // MIME type whitelist — same allowed set as the public upload endpoint
        const ALLOWED_MIME_TYPES = new Set([
          "application/pdf",
          "image/jpeg",
          "image/png",
          "image/webp",
          "image/gif",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ]);
        if (!ALLOWED_MIME_TYPES.has(input.contentType)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `File type '${input.contentType}' is not allowed. Accepted types: PDF, JPG, PNG, WEBP, GIF, DOC, DOCX.`,
          });
        }
        const buffer = Buffer.from(input.fileData, "base64");
        // BUG-SEC-B FIX: enforce 10 MB server-side limit on decoded bytes
        const MAX_ADMIN_UPLOAD_BYTES = 3 * 1024 * 1024; // 3 MB (Vercel 4.5 MB body limit; base64 inflates ~33%)
        if (buffer.length > MAX_ADMIN_UPLOAD_BYTES) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "File is too large. Maximum allowed size is 10 MB." });
        }
        // BUG-SEC3-C FIX: use cryptographically random suffix (128-bit) instead of Math.random()
        const suffix = randomBytes(16).toString("hex");
        // BUG-SEC-C FIX: derive extension from MIME type, not user-supplied filename
        // Prevents name="evil.php" with contentType=image/jpeg from storing a .php key in S3
        const MIME_TO_EXT: Record<string, string> = {
          "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png",
          "image/webp": "webp", "image/gif": "gif", "application/msword": "doc",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
        };
        const safeExt = MIME_TO_EXT[input.contentType] ?? "bin";
        const key = `admin-docs/${input.category}-${suffix}.${safeExt}`;
        const { url } = await storagePut(key, buffer, input.contentType);
        const id = await createDocument({
          submissionId: input.submissionId, name: input.name, category: input.category,
          url, fileKey: key, mimeType: input.contentType, fileSize: buffer.length,
          uploadedBy: ctx.user.id,
        });
        await logAudit({ actorId: ctx.user.id, actorName: ctx.user.name ?? ctx.user.email ?? "Staff", action: "document_uploaded", clientId: input.submissionId ?? undefined, details: { name: input.name, category: input.category, mimeType: input.contentType } });
        return { success: true, id, url };
      }),
      delete: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
        await deleteDocument(input.id);
        await logAudit({ actorId: ctx.user.id, actorName: ctx.user.name ?? ctx.user.email ?? "Admin", action: "document_deleted", details: { documentId: input.id } });
        return { success: true };
      }),
      // Returns a fresh pre-signed URL for a document — avoids ExpiredRequest errors
      // when the stored URL has exceeded its 7-day TTL.
      getFreshUrl: staffProcedure
        .input(z.object({
          // Pass either a stored fileKey (e.g. "documents/file.pdf") OR a full stored URL.
          // The server will extract the R2 key from the URL when needed.
          fileKey: z.string().min(1),
          submissionId: z.number().nullable().optional(),
        }))
        .query(async ({ input, ctx }) => {
          // SECURITY: Assessors may only fetch URLs for their assigned clients
          if (ctx.user.role === "assessor" && input.submissionId) {
            const sub = await getSubmissionById(input.submissionId);
            if (!sub || !(await canAssessorAccessClient(ctx.user as any, sub as any))) {
              throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this document" });
            }
          }

          let key = input.fileKey;

          // If a full URL was passed instead of a bare key, extract the R2 object key.
          // Handles three URL formats stored in the DB:
          //   1. https://pub-xxx.r2.dev/<key>                        (R2 public URL)
          //   2. https://<account>.r2.cloudflarestorage.com/<bucket>/<key>?X-Amz-...  (R2 presigned)
          //   3. https://d2xsxph8kpxj0f.cloudfront.net/.../<key>    (Manus Forge CDN — permanent, no refresh needed)
          if (key.startsWith("http://") || key.startsWith("https://")) {
            try {
              const parsed = new URL(key);
              const hostname = parsed.hostname;

              if (hostname.endsWith(".r2.cloudflarestorage.com")) {
                // Format 2: bucket name is in the hostname (e.g. freshselect-documents.xxx.r2.cloudflarestorage.com)
                // The path is already just /<key> with no bucket prefix to strip
                key = parsed.pathname.replace(/^\//, "");
              } else if (hostname.endsWith(".r2.dev") || (process.env.R2_PUBLIC_URL && key.startsWith(process.env.R2_PUBLIC_URL))) {
                // Format 1: /<key>
                key = parsed.pathname.replace(/^\//, "");
              } else {
                // Format 3 (Forge CDN / CloudFront) or unknown — URL is already permanent, return as-is
                return { url: key.split("?")[0] }; // strip any stale query params
              }
            } catch {
              // Not a valid URL — treat as bare key
            }
          }

          const { url } = await storageGet(key);
          return { url };
        }),
    }),

    // ─── Services ─────────────────────────────────────────────────────────
    services: router({
      byClient: staffProcedure.input(z.object({ submissionId: z.number() })).query(async ({ input, ctx }) => {
        // SECURITY: Assessors can only view services for their assigned clients
        if (ctx.user.role === "assessor") {
          const sub = await getSubmissionById(input.submissionId);
          if (!sub || !(await canAssessorAccessClient(ctx.user as any, sub as any))) throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this client" });
        }
        return getServicesBySubmission(input.submissionId);
      }),
      create: editProcedure.input(z.object({
        submissionId: z.number(), name: z.string().min(1), description: z.string().optional(),
        startDate: z.string().optional(),
      })).mutation(async ({ ctx, input }) => {
        const id = await createService({
          submissionId: input.submissionId, name: input.name, description: input.description ?? null,
          startDate: input.startDate ? new Date(input.startDate) : new Date(),
          createdBy: ctx.user.id,
        });
        const client = await getSubmissionById(input.submissionId);
        await logAudit({ actorId: ctx.user.id, actorName: ctx.user.name ?? ctx.user.email ?? "Staff", action: "service_created", clientId: input.submissionId, clientName: client ? `${client.firstName} ${client.lastName}` : undefined, details: { name: input.name } });
        return { success: true, id };
      }),
      updateStatus: editProcedure.input(z.object({
        id: z.number(), status: z.enum(["active", "completed", "cancelled"]),
      })).mutation(async ({ input, ctx }) => {
        await updateServiceStatus(input.id, input.status);
        await logAudit({ actorId: ctx.user.id, actorName: ctx.user.name ?? ctx.user.email ?? "Staff", action: "service_status_changed", details: { serviceId: input.id, status: input.status } });
        return { success: true };
      }),
    }),

    // ─── Client edit/delete ────────────────────────────────────────────────
    updateClient: editProcedure.input(z.object({
      id: z.number(),
      // Top-level DB columns
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      email: z.string().optional(),
      cellPhone: z.string().optional(),
      medicaidId: z.string().optional(),
      language: z.string().optional(),
      program: z.string().optional(),
      borough: z.string().optional(),
      neighborhood: z.string().optional(),
      supermarket: z.string().optional(),
      referralSource: z.string().optional(),
      additionalMembersCount: z.number().optional(),
      // formData fields (merged into existing JSON)
      formData: z.record(z.string(), z.unknown()).optional(),
    })).mutation(async ({ input, ctx }) => {
      const { id, formData, ...fields } = input;
      const existing = await getSubmissionById(id);
      const updateData: Record<string, unknown> = {};
      // Build before/after diff for top-level fields
      const changedFields: Record<string, { from: unknown; to: unknown }> = {};
      Object.entries(fields).forEach(([k, v]) => {
        if (v !== undefined) {
          updateData[k] = v;
          if (existing && (existing as any)[k] !== v) changedFields[k] = { from: (existing as any)[k], to: v };
        }
      });
      if (formData) {
        if (existing) {
          const merged = { ...(existing.formData as Record<string, unknown>), ...formData };
          updateData.formData = merged;
          // Auto-sync additionalMembersCount from householdMembers array if provided
          if (Array.isArray(merged.householdMembers) && fields.additionalMembersCount === undefined) {
            updateData.additionalMembersCount = (merged.householdMembers as unknown[]).length;
          }
          // Track formData field changes
          const existingFd = (existing.formData as Record<string, unknown>) || {};
          Object.entries(formData).forEach(([k, v]) => {
            if (existingFd[k] !== v) changedFields[`formData.${k}`] = { from: existingFd[k], to: v };
          });
        }
      }
      await updateSubmissionFields(id, updateData as any);
      await logAudit({
        actorId: ctx.user.id, actorName: ctx.user.name ?? ctx.user.email ?? "Staff",
        action: "client_edited",
        clientId: id,
        clientName: existing ? `${existing.firstName} ${existing.lastName}` : undefined,
        details: { changedFields },
      });
      return { success: true };
    }),

    deleteClient: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const existing = await getSubmissionById(input.id);
      await deleteSubmission(input.id);
      await logAudit({
        actorId: ctx.user.id, actorName: ctx.user.name ?? ctx.user.email ?? "Admin",
        action: "client_deleted",
        clientId: input.id,
        clientName: existing ? `${existing.firstName} ${existing.lastName}` : undefined,
      });
      return { success: true };
    }),

    bulkDeleteClients: adminProcedure.input(z.object({ ids: z.array(z.number()).min(1).max(100) })).mutation(async ({ input, ctx }) => {
      await bulkDeleteSubmissions(input.ids);
      await logAudit({ actorId: ctx.user.id, actorName: ctx.user.name ?? ctx.user.email ?? "Admin", action: "bulk_deleted", details: { count: input.ids.length, ids: input.ids } });
      return { success: true, deleted: input.ids.length };
    }),

    // ─── Not Interested (soft-delete) ─────────────────────────────────────────
    // Permission: admin, super_admin always; worker only if canMarkNotInterested
    markNotInterested: protectedProcedure.input(z.object({
      id: z.number(),
    })).mutation(async ({ input, ctx }) => {
      const role = ctx.user.role;
      if (role !== "admin" && role !== "super_admin") {
        if (role !== "worker") throw new TRPCError({ code: "FORBIDDEN", message: "Permission denied" });
        const perms = (ctx.user as any).permissions;
        if (!perms?.canMarkNotInterested) throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to mark clients as Not Interested" });
      }
      const existing = await getSubmissionById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" });
      await updateSubmissionFields(input.id, {
        notInterested: true,
        notInterestedAt: new Date(),
        notInterestedBy: ctx.user.id,
      } as any);
      await logAudit({
        actorId: ctx.user.id, actorName: ctx.user.name ?? ctx.user.email ?? "Staff",
        action: "marked_not_interested",
        clientId: input.id,
        clientName: `${existing.firstName} ${existing.lastName}`,
      });
      return { success: true };
    }),

    // Restore a Not Interested client back to the main list
    // Permission: admin, super_admin always; worker only if canMarkNotInterested
    restoreClient: protectedProcedure.input(z.object({
      id: z.number(),
    })).mutation(async ({ input, ctx }) => {
      const role = ctx.user.role;
      if (role !== "admin" && role !== "super_admin") {
        if (role !== "worker") throw new TRPCError({ code: "FORBIDDEN", message: "Permission denied" });
        const perms = (ctx.user as any).permissions;
        if (!perms?.canMarkNotInterested) throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to restore clients" });
      }
      const existing = await getSubmissionById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" });
      await updateSubmissionFields(input.id, {
        notInterested: false,
        notInterestedAt: null,
        notInterestedBy: null,
      } as any);
      await logAudit({
        actorId: ctx.user.id, actorName: ctx.user.name ?? ctx.user.email ?? "Staff",
        action: "restored_from_not_interested",
        clientId: input.id,
        clientName: `${existing.firstName} ${existing.lastName}`,
      });
      return { success: true };
    }),

    // ─── Update admin notes (assessment) ──────────────────────────────────
    updateAdminNotes: editProcedure.input(z.object({
      id: z.number(),
      adminNotes: z.string(),
    })).mutation(async ({ input, ctx }) => {
      const existing = await getSubmissionById(input.id);
      await updateSubmissionFields(input.id, { adminNotes: input.adminNotes });
      await logAudit({
        actorId: ctx.user.id, actorName: ctx.user.name ?? ctx.user.email ?? "Staff",
        action: "notes_edited",
        clientId: input.id,
        clientName: existing ? `${existing.firstName} ${existing.lastName}` : undefined,
      });
      return { success: true };
    }),

    // ─── Assessor: approve / reject client ────────────────────────────────────
    approveClient: assessorProcedure.input(z.object({
      id: z.number(),
    })).mutation(async ({ input, ctx }) => {
      const existing = await getSubmissionById(input.id);
      await updateSubmissionFields(input.id, {
        status: "approved",
        approvedBy: ctx.user.name || ctx.user.email || "Assessor",
        approvedAt: new Date(),
        rejectedBy: null,
        rejectedAt: null,
        rejectionReason: null,
      } as any);
      await logAudit({
        actorId: ctx.user.id, actorName: ctx.user.name ?? ctx.user.email ?? "Assessor",
        action: "client_approved",
        clientId: input.id,
        clientName: existing ? `${existing.firstName} ${existing.lastName}` : undefined,
      });
      return { success: true };
    }),

    rejectClient: assessorProcedure.input(z.object({
      id: z.number(),
      reason: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const existing = await getSubmissionById(input.id);
      await updateSubmissionFields(input.id, {
        status: "rejected",
        rejectedBy: ctx.user.name || ctx.user.email || "Assessor",
        rejectedAt: new Date(),
        rejectionReason: input.reason || null,
        approvedBy: null,
        approvedAt: null,
      } as any);
      await logAudit({
        actorId: ctx.user.id, actorName: ctx.user.name ?? ctx.user.email ?? "Assessor",
        action: "client_rejected",
        clientId: input.id,
        clientName: existing ? `${existing.firstName} ${existing.lastName}` : undefined,
        details: input.reason ? { reason: input.reason } : undefined,
      });
      return { success: true };
    }),

    markMissingInfo: assessorProcedure.input(z.object({
      id: z.number(),
      note: z.string().min(1),
    })).mutation(async ({ input, ctx }) => {
      const existing = await getSubmissionById(input.id);
      await updateSubmissionStage(input.id, "missing_information");
      await updateSubmissionFields(input.id, { missingInfoNote: input.note } as any);
      await logAudit({
        actorId: ctx.user.id, actorName: ctx.user.name ?? ctx.user.email ?? "Assessor",
        action: "stage_changed",
        clientId: input.id,
        clientName: existing ? `${existing.firstName} ${existing.lastName}` : undefined,
        details: { stage: "missing_information", note: input.note },
      });
      // Send email to client if they have an email address
      if (existing?.email) {
        const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
        const clientName = escHtml(`${existing.firstName ?? ""} ${existing.lastName ?? ""}`.trim());
        const escapedNote = escHtml(input.note);
        await sendEmail({
          to: existing.email,
          subject: "Action Required: Additional Information Needed — FreshSelect Meals",
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
              <h2 style="color:#16a34a;margin-bottom:8px;">FreshSelect Meals</h2>
              <hr style="border:none;border-top:1px solid #e5e7eb;margin-bottom:20px;" />
              <p>Dear ${clientName},</p>
              <p>Thank you for your application to the FreshSelect Meals program. After reviewing your file, our assessor has identified some information that is missing or needs to be provided before we can continue processing your application.</p>
              <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:16px;margin:20px 0;">
                <p style="font-weight:bold;color:#c2410c;margin:0 0 8px;">Missing Information:</p>
                <p style="color:#7c2d12;margin:0;">${escapedNote}</p>
              </div>
              <p>Please contact us as soon as possible so we can complete your application:</p>
              <ul style="color:#374151;">
                <li>Phone: <strong>(718) 307-4664</strong></li>
                <li>Email: <strong>info@freshselectmeals.com</strong></li>
              </ul>
              <p style="color:#6b7280;font-size:13px;margin-top:24px;">This message was sent on behalf of FreshSelect Meals. If you have questions, please call us directly.</p>
            </div>
          `,
        }).catch(() => { /* non-blocking */ });
      }
      return { success: true };
    }),

    markNotEligible: assessorProcedure.input(z.object({
      id: z.number(),
      reason: z.string().min(1),
    })).mutation(async ({ input, ctx }) => {
      const existing = await getSubmissionById(input.id);
      await updateSubmissionStage(input.id, "not_eligible");
      await updateSubmissionFields(input.id, { notEligibleReason: input.reason } as any);
      await logAudit({
        actorId: ctx.user.id, actorName: ctx.user.name ?? ctx.user.email ?? "Assessor",
        action: "stage_changed",
        clientId: input.id,
        clientName: existing ? `${existing.firstName} ${existing.lastName}` : undefined,
        details: { stage: "not_eligible", reason: input.reason },
      });
      return { success: true };
    }),

    // ─── Assessment Completion & SCN Edits ─────────────────────────────────
    updateAssessmentCompleted: editProcedure.input(z.object({
      id: z.number(),
      completed: z.boolean(),
    })).mutation(async ({ input, ctx }) => {
      const existing = await getSubmissionById(input.id);
      await updateSubmissionFields(input.id, {
        assessmentCompletedAt: input.completed ? new Date() : null,
      } as any);
      await logAudit({
        actorId: ctx.user.id, actorName: ctx.user.name ?? ctx.user.email ?? "Staff",
        action: input.completed ? "assessment_completed" : "assessment_incomplete",
        clientId: input.id,
        clientName: existing ? `${existing.firstName} ${existing.lastName}` : undefined,
      });
      return { success: true };
    }),

    updateScreeningAnswers: editProcedure.input(z.object({
      id: z.number(),
      // Full flat formData patch — top-level fields (screenerName, screeningDate, receivesSnap, etc.)
      // plus an optional nested 'screening' object that gets deep-merged
      formData: z.record(z.string(), z.unknown()),
    })).mutation(async ({ input, ctx }) => {
      const existing = await getSubmissionById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      const existingFd = (existing.formData as Record<string, unknown>) || {};
      const { screening: newScreening, screeningQuestions: newScreeningQuestions, ...topLevelFields } = input.formData as any;
      // Support both canonical 'screeningQuestions' key (intake form) and legacy 'screening' key
      const incomingScreening = newScreeningQuestions || newScreening || {};
      const mergedScreening = {
        ...((existingFd as any)?.screeningQuestions || (existingFd as any)?.screening || {}),
        ...incomingScreening,
      };
      const merged = {
        ...existingFd,
        ...topLevelFields,
        screeningQuestions: mergedScreening,
        screening: mergedScreening, // keep legacy key in sync
      };
      await updateSubmissionFields(input.id, { formData: merged } as any);
      await logAudit({
        actorId: ctx.user.id, actorName: ctx.user.name ?? ctx.user.email ?? "Staff",
        action: "scn_edited",
        clientId: input.id,
        clientName: existing ? `${existing.firstName} ${existing.lastName}` : undefined,
      });
      return { success: true };
    }),

    // ─── Referral Links ──────────────────────────────────────────────────
    referrals: router({
      list: staffProcedure.query(async () => listReferralLinks()),
      stats: staffProcedure.query(async () => getReferralStats()),
      getByCode: publicProcedure.input(z.object({ code: z.string() })).query(async ({ input }) => {
        const link = await getReferralLinkByCode(input.code);
        if (!link) return null;
        // SECURITY: never expose the bcrypt hash to the client
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { passwordHash: _ph, ...safeLink } = link;
        return safeLink;
      }),
      create: adminProcedure.input(z.object({
        code: z.string().min(2).max(64),
        referrerName: z.string().min(1),
        description: z.string().optional(),
        email: z.string().email().optional(),
        password: z.string().min(6).optional(),
      })).mutation(async ({ ctx, input }) => {
        const { password, ...rest } = input;
        const data: any = { ...rest, createdBy: ctx.user.id };
        if (input.email) data.email = input.email;
        if (password) data.passwordHash = await bcrypt.hash(password, 10);
        const id = await createReferralLink(data);
        await logAudit({ actorId: ctx.user.id, actorName: ctx.user.name ?? ctx.user.email ?? "Admin", action: "referral_link_created", details: { code: input.code, referrerName: input.referrerName } });
        return { success: true, id };
      }),
      update: adminProcedure.input(z.object({
        id: z.number(),
        referrerName: z.string().optional(),
        description: z.string().optional(),
        isActive: z.number().optional(),
        email: z.string().email().optional(),
        password: z.string().min(6).optional(),
      })).mutation(async ({ input, ctx }) => {
        const { id, password, ...data } = input;
        const updateData: any = { ...data };
        if (password) updateData.passwordHash = await bcrypt.hash(password, 10);
        await updateReferralLink(id, updateData);
        await logAudit({ actorId: ctx.user.id, actorName: ctx.user.name ?? ctx.user.email ?? "Admin", action: "referral_link_updated", details: { id, changes: Object.keys(data) } });
        return { success: true };
      }),
      delete: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
        await deleteReferralLink(input.id);
        await logAudit({ actorId: ctx.user.id, actorName: ctx.user.name ?? ctx.user.email ?? "Admin", action: "referral_link_deleted", details: { id: input.id } });
        return { success: true };
      }),
      // ─── Referrer Messages ───────────────────────────────────────────
      sendMessage: staffProcedure.input(z.object({
        referralLinkId: z.number(),
        submissionId: z.number().optional(),
        message: z.string().min(1).max(2000),
      })).mutation(async ({ ctx, input }) => {
        const id = await createReferrerMessage({
          referralLinkId: input.referralLinkId,
          submissionId: input.submissionId ?? null,
          senderId: ctx.user.id,
          message: input.message,
        });
        return { success: true, id };
      }),
      listMessages: staffProcedure.input(z.object({
        referralLinkId: z.number(),
      })).query(async ({ input }) => {
        return listReferrerMessages(input.referralLinkId);
      }),
      markRead: staffProcedure.input(z.object({
        messageId: z.number(),
      })).mutation(async ({ input }) => {
        await markReferrerMessageRead(input.messageId);
        return { success: true };
      }),
      unreadCounts: staffProcedure.query(async () => {
        return getUnreadCountByReferrer();
      }),
    }),

    // ─── Referrer Portal (public login + read-only access) ─────────────
    referrerPortal: router({
      login: publicProcedure.input(z.object({
        email: z.string().email(),
        password: z.string(),
      })).mutation(async ({ ctx, input }) => {
        const ip = (ctx.req as any).ip ?? ctx.req.socket?.remoteAddress ?? "unknown";
        const link = await getReferralLinkByEmail(input.email);
        if (!link || !link.passwordHash) {
          await logAudit({ action: "login_failed", actorName: input.email, details: { reason: "unknown_referrer_email", ip, portal: "referrer" } });
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
        }
        if (!link.isActive) {
          await logAudit({ action: "login_failed", actorName: input.email, details: { reason: "account_deactivated", ip, portal: "referrer" } });
          throw new TRPCError({ code: "FORBIDDEN", message: "This account has been deactivated" });
        }
        const valid = await bcrypt.compare(input.password, link.passwordHash);
        if (!valid) {
          await logAudit({ action: "login_failed", actorName: input.email, details: { reason: "wrong_password", ip, portal: "referrer" } });
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
        }
        await logAudit({ action: "login_success", actorName: input.email, details: { referrerId: link.id, ip, portal: "referrer" } });
        return { success: true, referrerId: link.id, referrerName: link.referrerName, code: link.code };
      }),
      myClients: publicProcedure.input(z.object({
        code: z.string(),
      })).query(async ({ input }) => {
        const link = await getReferralLinkByCode(input.code);
        if (!link) throw new TRPCError({ code: "NOT_FOUND", message: "Referral link not found" });
        // SECURITY: reject deactivated referrer accounts — they should not be able to read client data
        if (!link.isActive) throw new TRPCError({ code: "FORBIDDEN", message: "This referral account has been deactivated" });
        const clients = await getClientsByReferralCode(link.code);
        return clients.map((c) => ({
          id: c.id,
          firstName: c.firstName,
          lastName: c.lastName,
          cellPhone: c.cellPhone,
          email: c.email,
          supermarket: c.supermarket,
          stage: c.stage,
          status: c.status,
          createdAt: c.createdAt,
          language: c.language,
        }));
      }),
      myStats: publicProcedure.input(z.object({
        code: z.string(),
      })).query(async ({ input }) => {
        const link = await getReferralLinkByCode(input.code);
        if (!link) throw new TRPCError({ code: "NOT_FOUND", message: "Referral link not found" });
        if (!link.isActive) throw new TRPCError({ code: "FORBIDDEN", message: "This referral account has been deactivated" });
        const clients = await getClientsByReferralCode(link.code);
        const stages: Record<string, number> = {};
        clients.forEach((c) => { stages[c.stage] = (stages[c.stage] || 0) + 1; });
        const totalMembers = clients.reduce((sum, c) => sum + (c.additionalMembersCount ?? 0) + 1, 0);
        return { totalClients: clients.length, stages, referrerName: link.referrerName, code: link.code, totalMembers };
      }),
      myMessages: publicProcedure.input(z.object({
        code: z.string(),
      })).query(async ({ input }) => {
        const link = await getReferralLinkByCode(input.code);
        if (!link) throw new TRPCError({ code: "NOT_FOUND", message: "Referral link not found" });
        if (!link.isActive) throw new TRPCError({ code: "FORBIDDEN", message: "This referral account has been deactivated" });
        return listReferrerMessages(link.id);
      }),
      reply: publicProcedure.input(z.object({
        code: z.string(),
        message: z.string().min(1).max(2000),
        submissionId: z.number().optional(),
        attachmentUrl: z.string().url().startsWith("https://").optional(),
      })).mutation(async ({ input }) => {
        const link = await getReferralLinkByCode(input.code);
        if (!link) throw new TRPCError({ code: "NOT_FOUND", message: "Referral link not found" });
        if (!link.isActive) throw new TRPCError({ code: "FORBIDDEN", message: "This referral account has been deactivated" });
        // SECURITY: verify the submissionId (if provided) actually belongs to this referrer.
        // Without this check, any referrer with a valid code could tag a message to any
        // client in the system, polluting another referrer's client thread.
        if (input.submissionId != null) {
          const sub = await getSubmissionById(input.submissionId);
          if (!sub || sub.referralSource !== link.code) {
            throw new TRPCError({ code: "FORBIDDEN", message: "This client does not belong to your referral link" });
          }
        }
        // Validate attachment URL — only allow https:// to prevent javascript:/data: injection
        const safeAttachmentUrl = input.attachmentUrl && input.attachmentUrl.startsWith("https://")
          ? input.attachmentUrl
          : null;
        const id = await createReferrerMessage({
          referralLinkId: link.id,
          submissionId: input.submissionId ?? null,
          senderId: null,
          message: input.message,
          direction: "referrer",
          attachmentUrl: safeAttachmentUrl,
        });
        // Fire in-app notification for staff
        createNotification({
          type: "referrer_reply",
          title: `New message from referrer: ${link.referrerName || link.email || link.code}`,
          body: input.message.slice(0, 160) + (input.message.length > 160 ? "\u2026" : ""),
          link: input.submissionId ? `/admin/clients/${input.submissionId}` : `/admin/referrals`,
          submissionId: input.submissionId ?? null,
        }).catch((e: unknown) => console.warn("[Notification] referrer_reply:", e));
        return { success: true, id };
      }),
      markAllRead: publicProcedure.input(z.object({
        code: z.string(),
      })).mutation(async ({ input }) => {
        const link = await getReferralLinkByCode(input.code);
        if (!link) throw new TRPCError({ code: "NOT_FOUND", message: "Referral link not found" });
        if (!link.isActive) throw new TRPCError({ code: "FORBIDDEN", message: "This referral account has been deactivated" });
        await markAllReferrerMessagesRead(link.id);
        return { success: true };
      }),
      deleteMessage: publicProcedure.input(z.object({
        code: z.string(),
        messageId: z.number(),
      })).mutation(async ({ input }) => {
        const link = await getReferralLinkByCode(input.code);
        if (!link) throw new TRPCError({ code: "NOT_FOUND", message: "Referral link not found" });
        if (!link.isActive) throw new TRPCError({ code: "FORBIDDEN", message: "This referral account has been deactivated" });
        // Pass referralLinkId so the DB helper verifies ownership before deleting
        await deleteReferrerMessage(input.messageId, link.id);
        return { success: true };
      }),
    }),

    // ─── Worker management ────────────────────────────────────────────────
    workers: router({
      list: adminProcedure.query(async () => listWorkers()),
      allUsers: adminProcedure.query(async () => listAllUsers()),
      promote: adminProcedure.input(z.object({
        userId: z.number(), permissions: z.object({ canView: z.boolean(), canEdit: z.boolean(), canExport: z.boolean(), canDelete: z.boolean().default(false), showReferralLinks: z.boolean().default(true), canMarkNotInterested: z.boolean().default(false) }),
      })).mutation(async ({ input, ctx }) => {
        await setUserRole(input.userId, "worker");
        await updateWorkerPermissions(input.userId, input.permissions);
        await logAudit({ actorId: ctx.user.id, actorName: ctx.user.name ?? ctx.user.email ?? "Admin", action: "worker_promoted", details: { userId: input.userId, permissions: input.permissions } });
        return { success: true };
      }),
      updatePermissions: adminProcedure.input(z.object({
        userId: z.number(), permissions: z.object({ canView: z.boolean(), canEdit: z.boolean(), canExport: z.boolean(), canDelete: z.boolean().default(false), showReferralLinks: z.boolean().default(true), canMarkNotInterested: z.boolean().default(false) }),
      })).mutation(async ({ input, ctx }) => {
        await updateWorkerPermissions(input.userId, input.permissions);
        await logAudit({ actorId: ctx.user.id, actorName: ctx.user.name ?? ctx.user.email ?? "Admin", action: "worker_permissions_updated", details: { userId: input.userId, permissions: input.permissions } });
        return { success: true };
      }),
      toggleActive: adminProcedure.input(z.object({ userId: z.number(), isActive: z.boolean() }))
        .mutation(async ({ input, ctx }) => {
          await toggleWorkerActive(input.userId, input.isActive);
          await logAudit({ actorId: ctx.user.id, actorName: ctx.user.name ?? ctx.user.email ?? "Admin", action: input.isActive ? "worker_activated" : "worker_deactivated", details: { userId: input.userId } });
          return { success: true };
        }),
      demote: adminProcedure.input(z.object({ userId: z.number() }))
        .mutation(async ({ input, ctx }) => {
          await setUserRole(input.userId, "user");
          await logAudit({ actorId: ctx.user.id, actorName: ctx.user.name ?? ctx.user.email ?? "Admin", action: "worker_demoted", details: { userId: input.userId } });
          return { success: true };
        }),
      // Create a new staff account and send an invite email with a password-setup link.
      // No temporary password — the new staff member sets their own password via the link.
      createStaff: superAdminProcedure.input(z.object({
        email: z.string().email(),
        name: z.string().min(1),
        role: z.enum(["admin", "worker", "viewer", "assessor"]),
        permissions: z.object({ canView: z.boolean(), canEdit: z.boolean(), canExport: z.boolean(), canDelete: z.boolean(), showReferralLinks: z.boolean().default(true), canMarkNotInterested: z.boolean().default(false) }).optional(),
        origin: z.string().url().optional(),
      })).mutation(async ({ ctx, input }) => {
        const existing = await getUserByEmail(input.email);
        const STAFF_ROLES = ["admin", "worker", "viewer", "assessor", "super_admin"];
        if (existing && STAFF_ROLES.includes(existing.role ?? "")) {
          throw new TRPCError({ code: "CONFLICT", message: "A staff account with this email already exists" });
        }
        let id: number;
        if (existing) {
          // Existing non-staff user (e.g. role='user') — upgrade to staff role instead of creating a duplicate
          const { getDb } = await import("./db");
          const { users } = await import("../drizzle/schema");
          const { eq } = await import("drizzle-orm");
          const db = await getDb();
          if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
          await db.update(users).set({
            role: input.role as any,
            name: input.name || existing.name,
            loginMethod: "password",
            permissions: (input.permissions ?? { canView: true, canEdit: false, canExport: false, canDelete: false }) as unknown as null,
            isActive: 1,
          }).where(eq(users.id, existing.id));
          id = existing.id;
        } else {
          // Create account with no password — they must set it via the invite link
          id = await createStaffUser({ email: input.email, name: input.name, passwordHash: null, role: input.role, permissions: input.permissions });
        }
        // Generate a 24-hour invite/setup token (same mechanism as forgot-password)
        const token = randomBytes(32).toString("hex");
        const tokenHash = createHash("sha256").update(token).digest("hex");
        const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        await setPasswordResetToken(id, tokenHash, expires);
        // Determine the safe origin for the setup URL
        const { ALLOWED_ORIGINS } = await import("./_core/security");
        const reqOrigin = ctx.req.headers.origin as string | undefined;
        const originToUse = (() => {
          for (const candidate of [input.origin, reqOrigin]) {
            if (!candidate) continue;
            const allowed = ALLOWED_ORIGINS.some((o: string | RegExp) =>
              typeof o === "string" ? o === candidate : o.test(candidate)
            );
            if (allowed) return candidate;
          }
          return "https://freshselectmeals.com";
        })();
        const setupUrl = `${originToUse}/admin/reset-password?token=${token}`;
        const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
        const safeName = escHtml(input.name || "there");
        await sendEmail({
          to: input.email,
          subject: "You've been invited to FreshSelect Meals",
          html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
  <h2 style="color:#2d6a4f">Welcome to FreshSelect Meals</h2>
  <p>Hi ${safeName},</p>
  <p>An admin has created a staff account for you on the FreshSelect Meals portal. Click the button below to set your password and get started.</p>
  <p style="margin:24px 0">
    <a href="${setupUrl}" style="background:#2d6a4f;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold">Set Up My Password</a>
  </p>
  <p style="color:#666;font-size:13px">This link expires in 24 hours. If you weren't expecting this invitation, you can safely ignore this email.</p>
  <p style="color:#666;font-size:13px">Or copy this link: ${setupUrl}</p>
</div>`,
        });
        await logAudit({ actorId: ctx.user.id, actorName: ctx.user.name ?? ctx.user.email ?? "Admin", action: "staff_invite_sent", details: { targetEmail: input.email, role: input.role } });
        return { success: true, id };
      }),
      // Update an existing staff member's name, role, or permissions
      updateStaff: superAdminProcedure.input(z.object({
        userId: z.number(),
        name: z.string().min(1).optional(),
        role: z.enum(["admin", "worker", "viewer", "assessor"]).optional(),
        permissions: z.object({ canView: z.boolean(), canEdit: z.boolean(), canExport: z.boolean(), canDelete: z.boolean(), showReferralLinks: z.boolean().default(true), canMarkNotInterested: z.boolean().default(false) }).optional(),
        newPassword: z.string().min(8).optional(),
      })).mutation(async ({ input, ctx }) => {
        const { userId, name, role, permissions, newPassword } = input;
        // SECURITY: prevent modifying another super_admin's account
        const targetUser = await getUserById(userId);
        if (!targetUser) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
        if (targetUser.role === "super_admin" && targetUser.id !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Cannot modify another super admin account" });
        const updates: Record<string, unknown> = {};
        if (name) updates.name = name;
        if (role) updates.role = role;
        if (permissions) updates.permissions = permissions;
        if (newPassword) updates.passwordHash = await bcrypt.hash(newPassword, 12);
        if (Object.keys(updates).length) {
          const { getDb } = await import("./db");
          const { users } = await import("../drizzle/schema");
          const { eq } = await import("drizzle-orm");
          const db = await getDb();
          if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
          await db.update(users).set(updates as any).where(eq(users.id, userId));
        }
        return { success: true };
      }),
      // List all staff (super_admin, admin, worker, viewer)
      listStaff: adminProcedure.query(async () => listStaffUsers()),
      // Resend invite email to a staff member who hasn't set their password yet
      resendInvite: superAdminProcedure.input(z.object({
        userId: z.number(),
        origin: z.string().url().optional(),
      })).mutation(async ({ ctx, input }) => {
        const user = await getUserById(input.userId);
        if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
        if (!user.email) throw new TRPCError({ code: "BAD_REQUEST", message: "User has no email address" });
        // Generate a fresh 24-hour invite token
        const token = randomBytes(32).toString("hex");
        const tokenHash = createHash("sha256").update(token).digest("hex");
        const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await setPasswordResetToken(user.id, tokenHash, expires);
        const originToUse = input.origin ?? "https://freshselectmeals.com";
        const setupUrl = `${originToUse}/admin/reset-password?token=${token}`;
        const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
        const safeName = escHtml(user.name || "there");
        const isNewAccount = !user.passwordHash;
        await sendEmail({
          to: user.email,
          subject: isNewAccount ? "You've been invited to FreshSelect Meals" : "Reset your FreshSelect Meals password",
          html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
  <h2 style="color:#2d6a4f">${isNewAccount ? "Welcome to FreshSelect Meals" : "Password Setup Link"}</h2>
  <p>Hi ${safeName},</p>
  <p>${isNewAccount ? "An admin has created a staff account for you. Click the button below to set your password and get started." : "Here is a new link to set up your FreshSelect Meals account password."}</p>
  <p style="margin:24px 0">
    <a href="${setupUrl}" style="background:#2d6a4f;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold">Set Up My Password</a>
  </p>
  <p style="color:#666;font-size:13px">This link expires in 24 hours.</p>
  <p style="color:#666;font-size:13px">Or copy this link: ${setupUrl}</p>
</div>`,
        });
        await logAudit({ actorId: ctx.user.id, actorName: ctx.user.name ?? ctx.user.email ?? "Admin", action: "staff_invite_resent", details: { targetEmail: user.email, targetId: user.id } });
        return { success: true };
      }),
    }),
  }),

  // ─── Password Reset (public — no auth required) ───────────────────────────
  passwordReset: router({
    forgotPassword: publicProcedure.input(z.object({
      email: z.string().email(),
      origin: z.string().url(),
    })).mutation(async ({ input }) => {
      // Always return success to prevent email enumeration
      const user = await getUserByEmail(input.email);
      if (!user || !user.passwordHash) return { success: true };
      if (user.role !== "admin" && user.role !== "worker" && user.role !== "super_admin" && user.role !== "viewer" && user.role !== "assessor") return { success: true };
      // Validate origin against allowlist to prevent open redirect — attacker could craft a
      // reset link pointing to evil.com to steal the token
      const { ALLOWED_ORIGINS } = await import("./_core/security");
      const originAllowed = ALLOWED_ORIGINS.some((o: string | RegExp) =>
        typeof o === "string" ? o === input.origin : o.test(input.origin)
      );
      if (!originAllowed) return { success: true }; // silently ignore — don't reveal allowlist
      const token = randomBytes(32).toString("hex");
      // Store SHA-256 hash of the token so a DB leak doesn't expose usable tokens.
      // The raw token is sent in the email link; the hash is what lives in the DB.
      const tokenHash = createHash("sha256").update(token).digest("hex");
      const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await setPasswordResetToken(user.id, tokenHash, expires);
      const resetUrl = `${input.origin}/admin/reset-password?token=${token}`;
      const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
      const safeName = escHtml(user.name || "there");
      const { sendEmail } = await import("./email");
      await sendEmail({
        to: user.email!,
        subject: "Reset your FreshSelect Meals password",
        html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
  <h2 style="color:#2d6a4f">Password Reset Request</h2>
  <p>Hi ${safeName},</p>
  <p>We received a request to reset your password for the FreshSelect Meals admin portal.</p>
  <p style="margin:24px 0">
    <a href="${resetUrl}" style="background:#2d6a4f;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold">Reset Password</a>
  </p>
  <p style="color:#666;font-size:13px">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
  <p style="color:#666;font-size:13px">Or copy this link: ${resetUrl}</p>
</div>`,
      });
      return { success: true };
    }),
    resetPassword: publicProcedure.input(z.object({
      token: z.string().min(1),
      newPassword: z.string().min(8, "Password must be at least 8 characters"),
    })).mutation(async ({ input }) => {
      // Hash the incoming token before DB lookup — the DB stores the hash, not the raw token
      const tokenHash = createHash("sha256").update(input.token).digest("hex");
      const user = await getUserByResetToken(tokenHash);
      if (!user) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid or expired reset link" });
      if (!user.passwordResetExpires || new Date() > user.passwordResetExpires)
        throw new TRPCError({ code: "BAD_REQUEST", message: "This reset link has expired. Please request a new one." });
      const passwordHash = await bcrypt.hash(input.newPassword, 12);
      await clearPasswordResetToken(user.id, passwordHash);
      await logAudit({ actorId: user.id, actorName: user.email ?? "Staff", action: "password_reset", details: { method: "reset_link" } });
      return { success: true };
    }),
    validateToken: publicProcedure.input(z.object({ token: z.string() })).query(async ({ input }) => {
      const tokenHash = createHash("sha256").update(input.token).digest("hex");
      const user = await getUserByResetToken(tokenHash);
      if (!user || !user.passwordResetExpires || new Date() > user.passwordResetExpires)
        return { valid: false };
      return { valid: true, email: user.email, name: user.name };
    }),
  }),

  notifications: router({
    list: protectedProcedure
      .input(z.object({ limit: z.number().int().min(1).max(200).optional().default(50) }))
      .query(async ({ ctx, input }) => {
        return listNotifications(ctx.user.id, input.limit);
      }),

    unreadCount: protectedProcedure
      .query(async ({ ctx }) => {
        return { count: await getUnreadNotificationCount(ctx.user.id) };
      }),

    markRead: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        await markNotificationRead(input.id, ctx.user.id);
        return { success: true };
      }),

    markAllRead: protectedProcedure
      .mutation(async ({ ctx }) => {
        await markAllNotificationsRead(ctx.user.id);
        return { success: true };
      }),
  }),

  // ─── Audit Log ────────────────────────────────────────────────────────────
  auditLog: router({
    list: adminProcedure
      .input(z.object({
        action: z.string().optional(),
        clientId: z.number().optional(),
        actorId: z.number().optional(),
        page: z.number().int().min(1).optional().default(1),
        pageSize: z.number().int().min(1).max(100).optional().default(50),
      }))
      .query(async ({ input }) => {
        const { page, pageSize, ...filters } = input;
        const offset = (page - 1) * pageSize;
        return getAuditLogs({ ...filters, limit: pageSize, offset });
      }),
    // Log a page view from the frontend — called on every route change
    // Rate-limited: max 60 page views per user per minute (prevents audit log flooding)
    logPageView: protectedProcedure
      .input(z.object({ path: z.string(), title: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        // In-memory sliding window: 60 page views per user per 60 seconds
        const now = Date.now();
        const windowMs = 60_000;
        const maxPerWindow = 60;
        const userId = ctx.user.id;
        if (!pageViewRateMap.has(userId)) pageViewRateMap.set(userId, []);
        const timestamps = pageViewRateMap.get(userId)!.filter(t => now - t < windowMs);
        if (timestamps.length >= maxPerWindow) {
          // Silently drop — don't throw, just skip logging
          return { success: true };
        }
        timestamps.push(now);
        pageViewRateMap.set(userId, timestamps);
        // Memory-leak guard: evict entries for users who have had no page views in the last
        // 5 minutes. Without this, the Map grows unbounded as new user IDs accumulate.
        if (pageViewRateMap.size > 500) {
          const evictBefore = now - 5 * 60_000;
          for (const [uid, ts] of Array.from(pageViewRateMap.entries())) {
            if (ts.length === 0 || ts[ts.length - 1] < evictBefore) pageViewRateMap.delete(uid);
          }
        }
        const sessionId = parseCookieHeader(ctx.req.headers.cookie ?? "")?.[SESSION_ID_COOKIE] ?? null;
        await logAudit({
          actorId: ctx.user.id,
          actorName: ctx.user.name ?? ctx.user.email ?? "Staff",
          action: "page_view",
          details: { path: input.path, title: input.title ?? null },
          sessionId,
        });
        return { success: true };
      }),
    // Get all audit log entries for a specific session
    getSessionActivity: adminProcedure
      .input(z.object({ sessionId: z.string() }))
      .query(async ({ input }) => {
        return getAuditLogsBySession(input.sessionId);
      }),
  }),

  // ─── Impersonation router ─────────────────────────────────────────────────
  impersonate: router({
    // Start impersonating a staff member — super_admin only
    start: superAdminProcedure
      .input(z.object({ targetUserId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const target = await getUserById(input.targetUserId);
        if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
        if (target.role === "super_admin") throw new TRPCError({ code: "FORBIDDEN", message: "Cannot impersonate a super admin" });
        if (!target.isActive) throw new TRPCError({ code: "FORBIDDEN", message: "Cannot impersonate a deactivated account" });
        // Save the current admin's session token into the impersonation cookie
        const parsedCookies = parseCookieHeader(ctx.req.headers.cookie ?? "");
        const originalToken = parsedCookies[COOKIE_NAME];
        if (!originalToken) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No active session to preserve" });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        const SESSION_2H_MS = 2 * 60 * 60 * 1000;
        // Issue a short-lived session token for the target user
        const impersonationToken = await sdk.createSessionToken(target.openId, { name: target.name || target.email || "", expiresInMs: SESSION_2H_MS });
        // Store original admin session in impersonation cookie
        ctx.res.cookie(IMPERSONATION_COOKIE, originalToken, { ...cookieOptions, maxAge: SESSION_2H_MS });
        // Replace main session with impersonation session
        ctx.res.cookie(COOKIE_NAME, impersonationToken, { ...cookieOptions, maxAge: SESSION_2H_MS });
        await logAudit({
          actorId: ctx.user.id,
          actorName: ctx.user.name ?? ctx.user.email ?? `User #${ctx.user.id}`,
          action: "impersonation_start",
          details: { targetUserId: target.id, targetName: target.name, targetEmail: target.email, targetRole: target.role },
        });
        return { success: true, targetName: target.name || target.email, targetRole: target.role };
      }),
    // Stop impersonation and restore original admin session
    stop: protectedProcedure
      .mutation(async ({ ctx }) => {
        const parsedCookies = parseCookieHeader(ctx.req.headers.cookie ?? "");
        const originalToken = parsedCookies[IMPERSONATION_COOKIE];
        if (!originalToken) throw new TRPCError({ code: "BAD_REQUEST", message: "No active impersonation session" });
        // Verify the original token is still valid
        const originalSession = await sdk.verifySession(originalToken);
        if (!originalSession) throw new TRPCError({ code: "UNAUTHORIZED", message: "Original admin session has expired. Please log in again." });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        const SESSION_8H_MS = 8 * 60 * 60 * 1000;
        // Restore original admin session
        ctx.res.cookie(COOKIE_NAME, originalToken, { ...cookieOptions, maxAge: SESSION_8H_MS });
        // Clear the impersonation cookie
        ctx.res.clearCookie(IMPERSONATION_COOKIE, { ...cookieOptions, maxAge: -1 });
        await logAudit({
          actorId: ctx.user.id,
          actorName: ctx.user.name ?? ctx.user.email ?? `User #${ctx.user.id}`,
          action: "impersonation_stop",
          details: { impersonatedUserId: ctx.user.id },
        });
        return { success: true };
      }),
    // Check if current session is an impersonation
    status: protectedProcedure
      .query(async ({ ctx }) => {
        const parsedCookies = parseCookieHeader(ctx.req.headers.cookie ?? "");
        const originalToken = parsedCookies[IMPERSONATION_COOKIE];
        if (!originalToken) return { isImpersonating: false, originalAdminName: null };
        const originalSession = await sdk.verifySession(originalToken);
        if (!originalSession) return { isImpersonating: false, originalAdminName: null };
        return {
          isImpersonating: true,
          originalAdminName: originalSession.name || "Admin",
          currentUserName: ctx.user.name || ctx.user.email,
          currentUserRole: ctx.user.role,
        };
      }),
  }),
  // ─── Email Blast router ──────────────────────────────────────────────────
  emailBlast: router({
    list: superAdminProcedure.query(async () => {
      return listEmailBlasts();
    }),

    create: superAdminProcedure
      .input(z.object({
        name: z.string().min(1),
        subject: z.string().min(1),
        body: z.string().min(1),
        filterStatus: z.string().optional().nullable(),
        scheduledAt: z.date(),
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await createEmailBlast({
          name: input.name,
          subject: input.subject,
          body: input.body,
          filterStatus: input.filterStatus ?? null,
          scheduledAt: input.scheduledAt,
          createdBy: ctx.user.id,
        });
        // Blast is saved to DB with blastStatus='scheduled'.
        // Vercel Cron calls /api/cron/send-blasts every minute to fire due blasts.
        return { id };
      }),

    cancel: superAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const blast = await getEmailBlastById(input.id);
        if (!blast) throw new TRPCError({ code: "NOT_FOUND", message: "Blast not found" });
        if (blast.blastStatus !== "scheduled") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Only scheduled blasts can be cancelled" });
        }
        await cancelEmailBlast(input.id, undefined);
        return { success: true };
      }),

    getReplies: superAdminProcedure
      .input(z.object({ blastId: z.number() }))
      .query(async ({ input }) => {
        return getBlastReplies(input.blastId);
      }),

    retry: superAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const blast = await getEmailBlastById(input.id);
        if (!blast) throw new TRPCError({ code: "NOT_FOUND", message: "Blast not found" });
        if (blast.blastStatus !== "failed" && blast.blastStatus !== "sending") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Only failed or stuck blasts can be retried" });
        }
        await updateEmailBlastStatus(input.id, "scheduled");
        return { success: true };
      }),
  }),
  chat: router({
    /** List messages for a client thread (paginated, chronological) */
    list: staffProcedure
      .input(z.object({ submissionId: z.number(), beforeId: z.number().optional(), limit: z.number().min(1).max(100).default(50) }))
      .query(async ({ input, ctx }) => {
        // Assessors can only read chats for their assigned clients
        if (ctx.user.role === "assessor") {
          const sub = await getSubmissionById(input.submissionId);
          if (!sub || !(await canAssessorAccessClient(ctx.user as any, sub as any))) throw new TRPCError({ code: "FORBIDDEN" });
        }
        return listClientMessages(input.submissionId, { limit: input.limit, beforeId: input.beforeId });
      }),

    /** List all staff users for @mention autocomplete */
    staffList: staffProcedure.query(async () => {
      const staff = await listStaffUsers();
      return staff.map(u => ({ id: u.id, name: u.name ?? "", role: u.role, email: u.email ?? "" }));
    }),
    /** Send a message in a client thread */
    send: staffProcedure
      .input(z.object({
        submissionId: z.number(),
        content: z.string().min(0).max(4000),
        attachmentUrl: z.string().optional(),
        attachmentName: z.string().optional(),
        attachmentType: z.string().optional(),
        mentionedUserIds: z.array(z.number()).optional(),
        replyToId: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role === "viewer") throw new TRPCError({ code: "FORBIDDEN", message: "Viewers cannot send messages" });
        if (!input.content.trim() && !input.attachmentUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "Message cannot be empty" });
        if (ctx.user.role === "assessor") {
          const sub = await getSubmissionById(input.submissionId);
          if (!sub || !(await canAssessorAccessClient(ctx.user as any, sub as any))) throw new TRPCError({ code: "FORBIDDEN" });
        }
        // Look up the replied-to message for denormalised preview
        let replyToSenderName: string | null = null;
        let replyToContent: string | null = null;
        if (input.replyToId) {
          const replyMsg = await getClientMessageById(input.replyToId);
          if (replyMsg) {
            replyToSenderName = replyMsg.senderName;
            replyToContent = (replyMsg.attachmentName ? `[${replyMsg.attachmentName}]` : replyMsg.content).slice(0, 300);
          }
        }
        const msg = await createClientMessage({
          submissionId: input.submissionId,
          senderId: ctx.user.id,
          senderName: ctx.user.name ?? "Staff",
          senderRole: ctx.user.role,
          content: input.content,
          attachmentUrl: input.attachmentUrl ?? null,
          attachmentName: input.attachmentName ?? null,
          attachmentType: input.attachmentType ?? null,
          reactions: [],
          replyToId: input.replyToId ?? null,
          replyToSenderName,
          replyToContent,
        });
        // Auto-mark as read for the sender
        await markThreadRead(ctx.user.id, input.submissionId, msg.id);
        // Fire mention notifications for each tagged user
        if (input.mentionedUserIds?.length) {
          const sub = await getSubmissionById(input.submissionId);
          const clientLabel = sub
            ? `${(sub.formData as any)?.firstName ?? ""} ${(sub.formData as any)?.lastName ?? ""}`.trim() || `Client #${input.submissionId}`
            : `Client #${input.submissionId}`;
          for (const mentionedId of input.mentionedUserIds) {
            if (mentionedId === ctx.user.id) continue;
            const mentionedUser = await getUserById(mentionedId);
            if (!mentionedUser) continue;
            createNotification({
              type: "chat_mention",
              title: `${ctx.user.name ?? "Staff"} mentioned you in ${clientLabel}'s chat`,
              body: input.content.slice(0, 200),
              link: `/admin/clients/${input.submissionId}?tab=chat`,
              submissionId: input.submissionId,
            }).catch(() => {});
          }
        }
        return msg;
      }),

    /** Poll for new messages since a given message ID (used by SSE fallback) */
    poll: staffProcedure
      .input(z.object({ submissionId: z.number(), afterId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role === "assessor") {
          const sub = await getSubmissionById(input.submissionId);
          if (!sub || !(await canAssessorAccessClient(ctx.user as any, sub as any))) throw new TRPCError({ code: "FORBIDDEN" });
        }
        return getNewClientMessages(input.submissionId, input.afterId);
      }),

    /** Soft-delete a message */
    delete: staffProcedure
      .input(z.object({ messageId: z.number(), submissionId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const msgs = await listClientMessages(input.submissionId, { limit: 200 });
        const msg = msgs.find(m => m.id === input.messageId);
        if (!msg) throw new TRPCError({ code: "NOT_FOUND" });
        if (msg.senderId !== ctx.user.id && ctx.user.role !== "admin" && ctx.user.role !== "super_admin")
          throw new TRPCError({ code: "FORBIDDEN", message: "You can only delete your own messages" });
        await deleteClientMessage(input.messageId);
        return { success: true };
      }),

    /** Toggle an emoji reaction on a message */
    react: staffProcedure
      .input(z.object({ messageId: z.number(), submissionId: z.number(), emoji: z.string().max(8) }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role === "viewer") throw new TRPCError({ code: "FORBIDDEN" });
        const updated = await toggleMessageReaction(input.messageId, ctx.user.id, input.emoji);
        if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
        return updated;
      }),

    /** Get read watermarks for all participants in a thread (for ✓✓ read receipts) */
    readWatermarks: staffProcedure
      .input(z.object({ submissionId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role === "assessor") {
          const sub = await getSubmissionById(input.submissionId);
          if (!sub || !(await canAssessorAccessClient(ctx.user as any, sub as any))) throw new TRPCError({ code: "FORBIDDEN" });
        }
        return getThreadReadWatermarks(input.submissionId);
      }),

    /** Mark a thread as read up to the latest message */
    markRead: staffProcedure
      .input(z.object({ submissionId: z.number(), lastReadMessageId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await markThreadRead(ctx.user.id, input.submissionId, input.lastReadMessageId);
        return { success: true };
      }),

    /** Get unread count for a single thread */
    unreadCount: staffProcedure
      .input(z.object({ submissionId: z.number() }))
      .query(async ({ input, ctx }) => {
        const count = await getThreadUnreadCount(ctx.user.id, input.submissionId);
        return { count };
      }),

    /** Get unread counts across all threads (for global inbox badge) */
    allUnreadCounts: staffProcedure
      .query(async ({ ctx }) => {
        return getAllUnreadCounts(ctx.user.id);
      }),

    /** Get inbox threads with latest message and unread count */
    inbox: staffProcedure
      .query(async ({ ctx }) => {
        const rows = await getInboxThreads(ctx.user.id);
        return rows.map((r: any) => ({
          submissionId: r.submissionId,
          clientName: r.firstName && r.lastName
            ? `${r.firstName} ${r.lastName}`
            : (r.firstName ?? r.lastName ?? null),
          stage: r.stage ?? "referral",
          lastMessage: r.lastMessageContent ?? null,
          lastMessageAt: r.lastMessageAt ?? null,
          lastSenderName: r.lastMessageSender ?? null,
          unreadCount: Number(r.unreadCount ?? 0),
          referenceNumber: r.referenceNumber ?? null,
        }));
      }),

    /** Upload a file attachment for chat */
    uploadAttachment: staffProcedure
      .input(z.object({
        submissionId: z.number(),
        fileName: z.string(),
        // BUG-SEC: cap base64 string to ~13.3 MB (10 MB decoded) to prevent DoS
        fileData: z.string().max(14_000_000, "File too large (max 10 MB)"), // base64
        contentType: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role === "viewer") throw new TRPCError({ code: "FORBIDDEN" });
        // SECURITY: MIME type whitelist — reject executables and other dangerous types
        const ALLOWED_CHAT_MIME_TYPES = new Set([
          "application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "text/plain",
        ]);
        if (!ALLOWED_CHAT_MIME_TYPES.has(input.contentType)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `File type '${input.contentType}' is not allowed in chat.` });
        }
        const buffer = Buffer.from(input.fileData, "base64");
        // SECURITY: enforce 10 MB decoded size limit
        const MAX_CHAT_UPLOAD_BYTES = 10 * 1024 * 1024;
        if (buffer.length > MAX_CHAT_UPLOAD_BYTES) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "File too large (max 10 MB)" });
        }
        // SECURITY: derive extension from MIME type, not from user-supplied filename
        const MIME_TO_EXT: Record<string, string> = {
          "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png",
          "image/webp": "webp", "image/gif": "gif",
          "application/msword": "doc",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
          "text/plain": "txt",
        };
        const ext = MIME_TO_EXT[input.contentType] ?? "bin";
        const key = `chat/${input.submissionId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { url } = await storagePut(key, buffer, input.contentType);
        return { url, key, fileName: input.fileName, contentType: input.contentType };
      }),
  }),

  // ─── Organizations ────────────────────────────────────────────────────────
  org: router({
    /** List clients referred to the caller's org (org staff only) */
    listReferredClients: staffProcedure
      .input(z.object({ search: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        const userOrgId = (ctx.user as any).orgId as number | undefined;
        if (!userOrgId) throw new TRPCError({ code: "FORBIDDEN", message: "No organization assigned" });
        return listSubmissionsByOrg(userOrgId, input.search);
      }),
    /** Get own org info (for org staff portal header) */
    myOrg: staffProcedure
      .query(async ({ ctx }) => {
        const userOrgId = (ctx.user as any).orgId as number | undefined;
        if (!userOrgId) return null;
        return getOrganizationById(userOrgId);
      }),
    /** List all active organizations (staff can see, admin can see inactive too) */
    list: staffProcedure
      .input(z.object({ includeInactive: z.boolean().optional().default(false) }))
      .query(async ({ ctx, input }) => {
        const isAdmin = ctx.user.role === "admin" || ctx.user.role === "super_admin";
        return listOrganizations(isAdmin ? input.includeInactive : false);
      }),

    /** Get a single org with its members */
    get: adminProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const org = await getOrganizationById(input.id);
        if (!org) throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });
        const members = await listOrgMembers(input.id);
        return { ...org, members };
      }),

    /** Create a new organization */
    create: adminProcedure
      .input(z.object({
        name: z.string().min(1).max(256),
        contactEmail: z.string().email().optional(),
        contactPhone: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await createOrganization(input);
        await logAudit({ actorId: ctx.user.id, actorName: ctx.user.name ?? ctx.user.email ?? "Staff", action: "org_created", details: { orgName: input.name } }).catch(() => {});
        return { id };
      }),

    /** Update organization details */
    update: adminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(256).optional(),
        contactEmail: z.string().email().optional().nullable(),
        contactPhone: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
        isActive: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        await updateOrganization(id, data);
        await logAudit({ actorId: ctx.user.id, actorName: ctx.user.name ?? ctx.user.email ?? "Staff", action: "org_updated", details: { orgId: id, changes: data } }).catch(() => {});
        return { success: true };
      }),

    /** List members of an org */
    listMembers: adminProcedure
      .input(z.object({ orgId: z.number() }))
      .query(async ({ input }) => listOrgMembers(input.orgId)),

    /** Assign a staff user to an org (or remove by passing orgId: null) */
    assignUser: adminProcedure
      .input(z.object({ userId: z.number(), orgId: z.number().nullable() }))
      .mutation(async ({ ctx, input }) => {
        await assignUserToOrg(input.userId, input.orgId);
        await logAudit({ actorId: ctx.user.id, actorName: ctx.user.name ?? ctx.user.email ?? "Staff", action: "org_user_assigned", details: { userId: input.userId, orgId: input.orgId } }).catch(() => {});
        return { success: true };
      }),

    /** Refer a client to an organization (admin only, replaces existing referral) */
    referClient: adminProcedure
      .input(z.object({
        submissionId: z.number(),
        orgId: z.number().nullable(),
        note: z.string().optional().nullable(),
      }))
      .mutation(async ({ ctx, input }) => {
        await referClientToOrg(input.submissionId, input.orgId, input.note ?? null);
        let orgName: string | undefined;
        if (input.orgId) {
          const org = await getOrganizationById(input.orgId);
          orgName = org?.name;
          // Notify all org members
          const members = await listOrgMembers(input.orgId);
          for (const member of members) {
            await createNotification({
              userId: member.id,
              type: "org_referral",
              title: `New client referred to ${orgName ?? "your organization"}`,
              body: input.note ? `Note: ${input.note}` : "A new client has been referred to your organization.",
            }).catch(() => {});
          }
        }
        await logAudit({ actorId: ctx.user.id, actorName: ctx.user.name ?? ctx.user.email ?? "Staff", action: "client_referred_to_org", clientId: input.submissionId, details: { orgId: input.orgId, orgName, note: input.note } }).catch(() => {});
        return { success: true };
      }),

    // ─── Org Group Chat ────────────────────────────────────────────────────
    /** List messages in an org's group chat channel */
    groupMessages: staffProcedure
      .input(z.object({ orgId: z.number(), limit: z.number().optional().default(100) }))
      .query(async ({ ctx, input }) => {
        const role = ctx.user.role;
        const isFreshSelect = role === "admin" || role === "super_admin" || role === "worker" || role === "viewer";
        // Org staff can only see their own org's channel
        if (!isFreshSelect) {
          const userOrgId = (ctx.user as any).orgId;
          if (userOrgId !== input.orgId) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        return listOrgGroupMessages(input.orgId, input.limit);
      }),

    /** Send a message to an org group channel */
    sendGroupMessage: staffProcedure
      .input(z.object({
        orgId: z.number(),
        content: z.string().min(1).max(10000),
        mentionedUserIds: z.array(z.number()).optional().default([]),
        mentionedOrgIds: z.array(z.number()).optional().default([]),
        replyToId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const role = ctx.user.role;
        const isFreshSelect = role === "admin" || role === "super_admin" || role === "worker" || role === "viewer";
        const userOrgId = (ctx.user as any).orgId;
        // Org staff can only post to their own org's channel
        if (!isFreshSelect && userOrgId !== input.orgId) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        const org = await getOrganizationById(input.orgId);
        // Look up the replied-to message for denormalised preview
        let replyToSenderName: string | null = null;
        let replyToContent: string | null = null;
        if (input.replyToId) {
          const replyMsg = await getOrgGroupMessageById(input.replyToId);
          if (replyMsg) {
            replyToSenderName = replyMsg.senderName;
            replyToContent = (replyMsg.attachmentName ? `[${replyMsg.attachmentName}]` : replyMsg.content).slice(0, 300);
          }
        }
        const msgId = await createOrgGroupMessage({
          orgId: input.orgId,
          senderId: ctx.user.id,
          senderName: ctx.user.name ?? ctx.user.email ?? "Staff",
          senderRole: ctx.user.role,
          senderOrgName: isFreshSelect ? "FreshSelect Meals" : (org?.name ?? undefined),
          content: input.content,
          replyToId: input.replyToId ?? null,
          replyToSenderName,
          replyToContent,
        });
        // Notify individually @mentioned users
        for (const uid of input.mentionedUserIds) {
          await createNotification({
            userId: uid,
            type: "chat_mention",
            title: `${ctx.user.name ?? "Staff"} mentioned you in ${org?.name ?? "org"} group chat`,
            body: input.content.slice(0, 200),
          }).catch(() => {});
        }
        // Notify all members of @mentioned orgs
        for (const oid of input.mentionedOrgIds) {
          const members = await listOrgMembers(oid);
          const mentionedOrg = await getOrganizationById(oid);
          for (const member of members) {
            if (member.id === ctx.user.id) continue;
            await createNotification({
              userId: member.id,
              type: "chat_mention",
              title: `${ctx.user.name ?? "Staff"} mentioned @${mentionedOrg?.name ?? "your org"} in group chat`,
              body: input.content.slice(0, 200),
            }).catch(() => {});
          }
        }
        return { id: msgId };
      }),

    /** Mark org group chat as read up to a given message */
    markGroupRead: staffProcedure
      .input(z.object({ orgId: z.number(), lastMessageId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await markOrgGroupRead(ctx.user.id, input.orgId, input.lastMessageId);
        return { success: true };
      }),

    /** Get unread count for a specific org group channel */
    groupUnreadCount: staffProcedure
      .input(z.object({ orgId: z.number() }))
      .query(async ({ ctx, input }) => getOrgGroupUnreadCount(ctx.user.id, input.orgId)),

    /** List all org group channels with unread counts (FreshSelect staff sees all, org staff sees only theirs) */
    allGroupsWithUnread: staffProcedure
      .query(async ({ ctx }) => {
        const role = ctx.user.role;
        const isFreshSelect = role === "admin" || role === "super_admin" || role === "worker" || role === "viewer";
        if (isFreshSelect) {
          return listAllOrgGroupsWithUnread(ctx.user.id);
        }
        // Org staff: only their own org
        const userOrgId = (ctx.user as any).orgId;
        if (!userOrgId) return [];
        return listAllOrgGroupsWithUnread(ctx.user.id).then((rows) => rows.filter((r: any) => r.orgId === userOrgId));
      }),
  }),
});
export type AppRouter = typeof appRouter;

