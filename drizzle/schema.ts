import { boolean, decimal, index, int, json, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * role: super_admin (full control + user management), admin (full access), worker (limited access), viewer (read-only), user (public)
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "worker", "super_admin", "viewer", "assessor"]).default("user").notNull(),
  /** Staff-specific: permissions JSON (e.g. { canView: true, canEdit: false, canExport: false, canDelete: false }) */
  permissions: json("permissions"),
  /** Hashed password for internal bcrypt authentication (null for legacy OAuth users) */
  passwordHash: varchar("passwordHash", { length: 256 }),
  /** Password reset token (hex string, single-use) */
  passwordResetToken: varchar("passwordResetToken", { length: 128 }),
  /** Password reset token expiry (UTC timestamp) */
  passwordResetExpires: timestamp("passwordResetExpires"),
  /** Organization this staff member belongs to (null = FreshSelect internal staff) */
  orgId: int("orgId"),
  /** Whether the staff account is active */
  isActive: int("isActive").default(1).notNull(),
  /** Per-account brute-force protection: consecutive failed login counter */
  failedLoginAttempts: int("failedLoginAttempts").default(0).notNull(),
  /** Per-account lockout expiry (null = not locked) */
  lockedUntil: timestamp("lockedUntil"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Submissions table — stores every FreshSelect Meals application.
 * The full form payload is stored as JSON in `formData` for flexibility.
 * Now also acts as the "client" record for the CareFlow-style admin.
 */
export const submissions = mysqlTable("submissions", {
  id: int("id").autoincrement().primaryKey(),
  referenceNumber: varchar("referenceNumber", { length: 16 }).notNull().unique(),
  firstName: varchar("firstName", { length: 128 }).notNull(),
  lastName: varchar("lastName", { length: 128 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  cellPhone: varchar("cellPhone", { length: 32 }).notNull(),
  medicaidId: varchar("medicaidId", { length: 32 }).notNull(),
  supermarket: varchar("supermarket", { length: 128 }).notNull(),
  referralSource: varchar("referralSource", { length: 128 }),
  /** CareFlow-style stage for intake journey */
  stage: mysqlEnum("stage", [
    "referral",
    "assessment",
    "assessment_recorded",
    "missing_information",
    "not_eligible",
    "level_one_only",
    "level_one_household",
    "level_2_active",
    "ineligible",
    "provider_attestation_required",
    "flagged"
  ]).default("referral").notNull(),
  status: mysqlEnum("status", ["new", "in_review", "approved", "rejected", "on_hold"])
    .default("new")
    .notNull(),
  adminNotes: text("adminNotes"),
  /** Full form payload stored as JSON (includes screening answers, uploads, etc.) */
  formData: json("formData").notNull(),
  hipaaConsentAt: timestamp("hipaaConsentAt").notNull(),
  emailSentAt: timestamp("emailSentAt"),
  /** Assigned worker user ID */
  assignedTo: int("assignedTo"),
  /** Intake rep user ID */
  intakeRep: int("intakeRep"),
  /** Language preference */
  language: varchar("language", { length: 32 }).default("English"),
  /** Borough */
  borough: varchar("borough", { length: 64 }),
  /** Neighborhood (e.g. Williamsburg, Borough Park, Flatbush, Monsey, Monroe) */
  neighborhood: varchar("neighborhood", { length: 64 }),
  /** Number of additional household members */
  additionalMembersCount: int("additionalMembersCount").default(0),
  /** Program */
  program: varchar("program", { length: 64 }),
  /** Zipcode */
  zipcode: varchar("zipcode", { length: 10 }),
  /** Whether this is a new applicant or a transfer ("Yes" = new, "No" = transfer) */
  newApplicant: varchar("newApplicant", { length: 8 }),
  /** Name of the agency the client is transferring from (if transfer) */
  transferAgencyName: varchar("transferAgencyName", { length: 256 }),
  /** Staff-assigned priority level for this client */
  priority: mysqlEnum("priority", ["low", "normal", "high", "urgent"]).default("normal").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  /** When the SCN assessment was marked completed by staff */
  assessmentCompletedAt: timestamp("assessmentCompletedAt"),
  /** Name of assessor who approved this client */
  approvedBy: varchar("approvedBy", { length: 128 }),
  /** When the client was approved by assessor */
  approvedAt: timestamp("approvedAt"),
  /** Name of assessor who rejected this client */
  rejectedBy: varchar("rejectedBy", { length: 128 }),
  /** When the client was rejected by assessor */
  rejectedAt: timestamp("rejectedAt"),
  /** Reason for rejection provided by assessor */
  rejectionReason: text("rejectionReason"),
  /** Note from assessor about what information is missing */
  missingInfoNote: text("missingInfoNote"),
  /** Reason from assessor why client is not eligible */
  notEligibleReason: text("notEligibleReason"),
  /** Assessor user ID assigned to review this client (separate from assignedTo worker) */
  assessorId: int("assessorId"),
  /** Organization this client has been referred to (null = not referred to any org) */
  referredOrgId: int("referredOrgId"),
  /** When the client was referred to the org */
  referredOrgAt: timestamp("referredOrgAt"),
  /** Admin note explaining why this client was referred to this org */
  referredOrgNote: text("referredOrgNote"),
  /** Soft-delete: true = client marked as 'Not Interested', hidden from main list */
  notInterested: boolean("notInterested").default(false).notNull(),
  /** When the client was marked as Not Interested */
  notInterestedAt: timestamp("notInterestedAt"),
  /** User ID of the staff member who marked this client as Not Interested */
  notInterestedBy: int("notInterestedBy"),
  /** When the stage was last changed — used for SLA tracking (days in current stage) */
  stageUpdatedAt: timestamp("stageUpdatedAt"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  idx_submissions_medicaidId: uniqueIndex("idx_submissions_medicaidId").on(t.medicaidId),
  idx_submissions_createdAt: index("idx_submissions_createdAt").on(t.createdAt),
  idx_submissions_status: index("idx_submissions_status").on(t.status),
  idx_submissions_stage: index("idx_submissions_stage").on(t.stage),
  idx_submissions_email: index("idx_submissions_email").on(t.email),
}));

export type Submission = typeof submissions.$inferSelect;
export type InsertSubmission = typeof submissions.$inferInsert;

/**
 * Tasks / Action Items — assigned to workers for specific clients.
 */
export const tasks = mysqlTable("tasks", {
  id: int("id").autoincrement().primaryKey(),
  /** The client (submission) this task relates to */
  submissionId: int("submissionId").notNull(),
  /** Short task title (required for task-from-message flow) */
  title: varchar("title", { length: 256 }).notNull().default(""),
  /** Task description */
  description: text("description").notNull(),
  /** Area: intake_rep or assigned_worker */
  area: mysqlEnum("area", ["intake_rep", "assigned_worker"]).default("intake_rep").notNull(),
  /** Assigned to user ID */
  assignedTo: int("assignedTo"),
  /** Task priority */
  priority: mysqlEnum("priority", ["low", "normal", "high", "urgent"]).default("normal").notNull(),
  /** Due date for this task */
  dueDate: timestamp("dueDate"),
  /** Status */
  status: mysqlEnum("status", ["open", "completed", "verified"]).default("open").notNull(),
  /** Created by user ID */
  createdBy: int("createdBy").notNull(),
  /** ID of the chat message this task was created from (null = created manually) */
  sourceMessageId: int("sourceMessageId"),
  /** Type of source message: 'client' | 'org_group' */
  sourceMessageType: varchar("sourceMessageType", { length: 32 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export type Task = typeof tasks.$inferSelect;
export type InsertTask = typeof tasks.$inferInsert;

/**
 * Case Notes — notes added by workers/admins on a client record.
 */
export const caseNotes = mysqlTable("caseNotes", {
  id: int("id").autoincrement().primaryKey(),
  submissionId: int("submissionId").notNull(),
  content: text("content").notNull(),
  createdBy: int("createdBy").notNull(),
  /** Display name of the staff member who wrote this note */
  authorName: varchar("authorName", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CaseNote = typeof caseNotes.$inferSelect;
export type InsertCaseNote = typeof caseNotes.$inferInsert;

/**
 * Documents — uploaded files associated with clients or the document library.
 */
export const documents = mysqlTable("documents", {
  id: int("id").autoincrement().primaryKey(),
  /** If null, it's a library document; if set, it's client-specific */
  submissionId: int("submissionId"),
  /** Document name/filename */
  name: varchar("name", { length: 256 }).notNull(),
  /** Category: provider_attestation, consent, supporting_documentation, id, medicaid_card, forms, uncategorized */
  category: mysqlEnum("category", [
    "provider_attestation",
    "consent",
    "supporting_documentation",
    "id_document",
    "medicaid_card",
    "birth_certificate",
    "marriage_license",
    "forms",
    "uncategorized"
  ]).default("uncategorized").notNull(),
  /** S3 URL */
  url: varchar("url", { length: 1024 }).notNull(),
  /** S3 file key */
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  /** MIME type */
  mimeType: varchar("mimeType", { length: 128 }),
  /** File size in bytes */
  fileSize: int("fileSize"),
  /** Uploaded by user ID */
  uploadedBy: int("uploadedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Document = typeof documents.$inferSelect;
export type InsertDocument = typeof documents.$inferInsert;

/**
 * Services — services assigned to clients (e.g., Medically Tailored Food Prescription Boxes).
 */
export const services = mysqlTable("services", {
  id: int("id").autoincrement().primaryKey(),
  submissionId: int("submissionId").notNull(),
  name: varchar("name", { length: 256 }).notNull(),
  description: text("description"),
  startDate: timestamp("startDate"),
  endDate: timestamp("endDate"),
  status: mysqlEnum("status", ["active", "completed", "cancelled"]).default("active").notNull(),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Service = typeof services.$inferSelect;
export type InsertService = typeof services.$inferInsert;

/**
 * Referral Links — trackable links that attribute new clients to a referrer.
 */
export const referralLinks = mysqlTable("referralLinks", {
  id: int("id").autoincrement().primaryKey(),
  /** Unique code used in the URL (e.g., ?ref=abc123) */
  code: varchar("code", { length: 64 }).notNull().unique(),
  /** Human-readable name for the referrer (e.g., "John Smith", "Community Center") */
  referrerName: varchar("referrerName", { length: 256 }).notNull(),
  /** Optional description/notes */
  description: text("description"),
  /** Referrer login email */
  email: varchar("email", { length: 320 }),
  /** Hashed password for referrer portal login */
  passwordHash: varchar("passwordHash", { length: 256 }),
  /** Number of times this link was used (submissions with this ref code) */
  usageCount: int("usageCount").default(0).notNull(),
  /** Whether this link is active */
  isActive: int("isActive").default(1).notNull(),
  /** Created by admin user ID */
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ReferralLink = typeof referralLinks.$inferSelect;
export type InsertReferralLink = typeof referralLinks.$inferInsert;

// ─── Referrer Messages ────────────────────────────────────────────────────────
/**
 * Messages sent by admin staff to referrers.
 * Example: "@ah please get me the DOB from client one"
 * Each message is linked to a referral link (referrer) and optionally a specific client.
 */
export const referrerMessages = mysqlTable("referrerMessages", {
  id: int("id").autoincrement().primaryKey(),
  /** The referral link (referrer) this message is addressed to */
  referralLinkId: int("referralLinkId").notNull(),
  /** Optional: the specific client this message is about */
  submissionId: int("submissionId"),
  /** The admin user who sent the message (null if sent by referrer) */
  senderId: int("senderId"),
  /** Message text */
  message: text("message").notNull(),
  /** Direction: 'admin' = sent by staff to referrer, 'referrer' = reply from referrer */
  direction: varchar("direction", { length: 16 }).notNull().default("admin"),
  /** Optional file attachment URL */
  attachmentUrl: text("attachmentUrl"),
  /** When the referrer read/acknowledged the message (null = unread) */
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ReferrerMessage = typeof referrerMessages.$inferSelect;
export type InsertReferrerMessage = typeof referrerMessages.$inferInsert;

// ─── Client Email Thread ──────────────────────────────────────────────────────
/**
 * Emails sent to/from clients directly from the admin panel.
 * Sent via Resend from info@freshselectmeals.com.
 * Inbound replies are captured via Resend webhook.
 */
export const clientEmails = mysqlTable("clientEmails", {
  id: int("id").autoincrement().primaryKey(),
  /** The client (submission) this email belongs to */
  submissionId: int("submissionId").notNull(),
  /** 'outbound' = sent by admin, 'inbound' = reply from client */
  direction: varchar("direction", { length: 16 }).notNull(),
  subject: varchar("subject", { length: 512 }).notNull(),
  body: text("body").notNull(),
  fromEmail: varchar("fromEmail", { length: 256 }).notNull(),
  toEmail: varchar("toEmail", { length: 256 }).notNull(),
  /** JSON array of S3 URLs for attachments */
  attachmentUrls: text("attachmentUrls"),
  /** Resend message ID for threading */
  resendMessageId: varchar("resendMessageId", { length: 256 }),
  /** In-reply-to header for threading */
  inReplyTo: varchar("inReplyTo", { length: 256 }),
  /** Staff member who sent (null for inbound) */
  sentBy: int("sentBy"),
  /** If this reply came in response to an email blast, the blast ID */
  blastId: int("blastId"),
  sentAt: timestamp("sentAt").defaultNow().notNull(),
}, (t) => ({
  idx_clientEmails_submissionId: index("idx_clientEmails_submissionId").on(t.submissionId),
  idx_clientEmails_blastId: index("idx_clientEmails_blastId").on(t.blastId),
  idx_clientEmails_resendMessageId: index("idx_clientEmails_resendMessageId").on(t.resendMessageId),
}));
export type ClientEmail = typeof clientEmails.$inferSelect;
export type InsertClientEmail = typeof clientEmails.$inferInsert;

// ─── Client Stage History ─────────────────────────────────────────────────────
/**
 * Audit log of every stage change for a client.
 * Created automatically whenever admin.updateStage is called.
 */
export const stageHistory = mysqlTable("stageHistory", {
  id: int("id").autoincrement().primaryKey(),
  /** The client (submission) this history entry belongs to */
  submissionId: int("submissionId").notNull(),
  /** Stage value before the change (null for first entry) */
  fromStage: varchar("fromStage", { length: 64 }),
  /** Stage value after the change */
  toStage: varchar("toStage", { length: 64 }).notNull(),
  /** Staff user ID who made the change */
  changedBy: int("changedBy"),
  /** Staff user name (denormalized for display) */
  changedByName: varchar("changedByName", { length: 256 }),
  /** Optional note about the change */
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  idx_stageHistory_submissionId: index("idx_stageHistory_submissionId").on(t.submissionId),
}));
export type StageHistory = typeof stageHistory.$inferSelect;
export type InsertStageHistory = typeof stageHistory.$inferInsert;

/**
 * In-app notifications for admin/staff — surfaces events like inbound emails,
 * referrer replies, new submissions, and task updates.
 */
export const notifications = mysqlTable("notifications", {
  id: int("id").primaryKey().autoincrement(),
  /** Category of event */
  type: varchar("type", { length: 64 }).notNull(),
  /** Short headline shown in the bell dropdown */
  title: varchar("title", { length: 256 }).notNull(),
  /** Longer description shown on the notifications page */
  body: text("body"),
  /** Deep-link URL to the relevant page (e.g. /admin/clients/123) */
  link: varchar("link", { length: 512 }),
  /** Optional: related submission/client ID */
  submissionId: int("submissionId"),
  /** Optional: target user ID — if set, only this user sees the notification; if null, all staff see it */
  userId: int("userId"),
  /** false = unread (bold), true = read */
  isRead: boolean("isRead").notNull().default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  idx_notifications_isRead: index("idx_notifications_isRead").on(t.isRead),
  idx_notifications_createdAt: index("idx_notifications_createdAt").on(t.createdAt),
}));
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

/**
 * Per-user read receipts for notifications.
 * A row here means the given user has read the given notification.
 */
export const notificationReads = mysqlTable("notificationReads", {
  id: int("id").primaryKey().autoincrement(),
  notificationId: int("notificationId").notNull(),
  userId: int("userId").notNull(),
  readAt: timestamp("readAt").defaultNow().notNull(),
}, (t) => ({
  idx_notificationReads_notificationId: index("idx_notificationReads_notificationId").on(t.notificationId),
  idx_notificationReads_userId: index("idx_notificationReads_userId").on(t.userId),
}));
export type NotificationRead = typeof notificationReads.$inferSelect;

/**
 * Immutable audit trail of every admin action taken on client records.
 */
export const auditLogs = mysqlTable("auditLogs", {
  id: int("id").primaryKey().autoincrement(),
  /** ID of the staff member who performed the action */
  actorId: int("actorId"),
  /** Display name of the staff member */
  actorName: varchar("actorName", { length: 256 }),
  /** Machine-readable action key, e.g. 'stage_changed', 'assessment_completed' */
  action: varchar("action", { length: 64 }).notNull(),
  /** ID of the client record affected */
  clientId: int("clientId"),
  /** Display name of the client at time of action */
  clientName: varchar("clientName", { length: 256 }),
  /** JSON payload with action-specific details */
  details: json("details"),
  /** Session UUID — groups all actions from a single login session */
  sessionId: varchar("sessionId", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  idx_auditLogs_actorId: index("idx_auditLogs_actorId").on(t.actorId),
  idx_auditLogs_createdAt: index("idx_auditLogs_createdAt").on(t.createdAt),
}));

/**
 * Scheduled email blasts — admin-created one-time emails sent to all active clients.
 */
export const emailBlasts = mysqlTable("emailBlasts", {
  id: int("id").primaryKey().autoincrement(),
  /** Short name for the blast (admin reference only) */
  name: varchar("name", { length: 256 }).notNull(),
  /** Email subject line */
  subject: varchar("subject", { length: 512 }).notNull(),
  /** HTML/plain body of the email */
  body: text("body").notNull(),
  /** Optional filter: only send to clients with this status (null = all active) */
  filterStatus: varchar("filterStatus", { length: 64 }),
  /** Scheduled send time stored as UTC unix ms */
  scheduledAt: timestamp("scheduledAt").notNull(),
  /** Manus Heartbeat task UID for the scheduled job */
  scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
  /** Status of the blast */
  blastStatus: mysqlEnum("blastStatus", ["scheduled", "sending", "sent", "cancelled", "failed"])
    .notNull()
    .default("scheduled"),
  /** How many emails were sent */
  sentCount: int("sentCount").default(0),
  /** How many emails failed */
  failedCount: int("failedCount").default(0),
  /** ID of the admin who created this blast */
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  /** Automatically updated whenever the row is modified (used for stale-sending detection) */
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
  sentAt: timestamp("sentAt"),
});
export type EmailBlast = typeof emailBlasts.$inferSelect;
export type InsertEmailBlast = typeof emailBlasts.$inferInsert;

/**
 * Per-client staff chat messages.
 * Each client has a dedicated chat thread where all assigned staff can communicate.
 */
export const clientMessages = mysqlTable("clientMessages", {
  id: int("id").primaryKey().autoincrement(),
  /** The client (submission) this message belongs to */
  submissionId: int("submissionId").notNull(),
  /** ID of the staff member who sent the message */
  senderId: int("senderId").notNull(),
  /** Display name of the sender (denormalised for history) */
  senderName: varchar("senderName", { length: 256 }).notNull(),
  /** Role of the sender at time of sending */
  senderRole: varchar("senderRole", { length: 64 }).notNull(),
  /** Message text content (supports markdown-lite: bold, italic, mentions) */
  content: text("content").notNull(),
  /** Optional file attachment URL (S3/R2 key) */
  attachmentUrl: text("attachmentUrl"),
  /** Original filename of the attachment */
  attachmentName: varchar("attachmentName", { length: 512 }),
  /** MIME type of the attachment */
  attachmentType: varchar("attachmentType", { length: 128 }),
  /** JSON array of { userId, emoji } reaction objects */
  reactions: json("reactions"),
  /** ID of the message this is replying to (null if not a reply) */
  replyToId: int("replyToId"),
  /** Denormalised sender name of the replied-to message */
  replyToSenderName: varchar("replyToSenderName", { length: 256 }),
  /** Denormalised content snippet of the replied-to message (first 300 chars) */
  replyToContent: varchar("replyToContent", { length: 300 }),
  /** Whether this message has been soft-deleted */
  isDeleted: int("isDeleted").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  idx_clientMessages_submissionId: index("idx_clientMessages_submissionId").on(t.submissionId),
  idx_clientMessages_senderId: index("idx_clientMessages_senderId").on(t.senderId),
  idx_clientMessages_createdAt: index("idx_clientMessages_createdAt").on(t.createdAt),
}));

export type ClientMessage = typeof clientMessages.$inferSelect;
export type InsertClientMessage = typeof clientMessages.$inferInsert;

/**
 * Tracks which staff members have read up to which message in each client thread.
 * Used to compute unread counts for the global inbox.
 */
export const messageReads = mysqlTable("messageReads", {
  id: int("id").primaryKey().autoincrement(),
  /** Staff member */
  userId: int("userId").notNull(),
  /** Client thread */
  submissionId: int("submissionId").notNull(),
  /** ID of the last message this user has read in this thread */
  lastReadMessageId: int("lastReadMessageId").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  idx_messageReads_userId_submissionId: uniqueIndex("idx_messageReads_userId_submissionId").on(t.userId, t.submissionId),
}));

export type MessageRead = typeof messageReads.$inferSelect;
export type InsertMessageRead = typeof messageReads.$inferInsert;

/**
 * Organizations — external partner organizations (e.g. Lahoyal) that FreshSelect refers clients to.
 * All staff members belonging to an org automatically see clients referred to their org.
 */
export const organizations = mysqlTable("organizations", {
  id: int("id").primaryKey().autoincrement(),
  /** Display name of the organization */
  name: varchar("name", { length: 256 }).notNull(),
  /** Optional contact email for the org */
  contactEmail: varchar("contactEmail", { length: 320 }),
  /** Optional contact phone */
  contactPhone: varchar("contactPhone", { length: 64 }),
  /** Internal admin notes about this org */
  notes: text("notes"),
  /** Whether this org is active (soft-delete) */
  isActive: int("isActive").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = typeof organizations.$inferInsert;

/**
 * Org Group Messages — messages in an organization's group chat channel.
 * FreshSelect staff can see all org group chats; org staff only see their own org's channel.
 */
export const orgGroupMessages = mysqlTable("orgGroupMessages", {
  id: int("id").primaryKey().autoincrement(),
  /** The organization this group message belongs to */
  orgId: int("orgId").notNull(),
  /** ID of the staff member who sent the message */
  senderId: int("senderId").notNull(),
  /** Display name of the sender (denormalised for history) */
  senderName: varchar("senderName", { length: 256 }).notNull(),
  /** Role of the sender at time of sending */
  senderRole: varchar("senderRole", { length: 64 }).notNull(),
  /** Name of the sender's org (for FreshSelect staff display) */
  senderOrgName: varchar("senderOrgName", { length: 256 }),
  /** Message text content (supports @mentions) */
  content: text("content").notNull(),
  /** Optional file attachment URL */
  attachmentUrl: text("attachmentUrl"),
  /** Original filename of the attachment */
  attachmentName: varchar("attachmentName", { length: 512 }),
  /** MIME type of the attachment */
  attachmentType: varchar("attachmentType", { length: 128 }),
  /** JSON array of { userId, emoji } reaction objects */
  reactions: json("reactions"),
  /** ID of the message this is replying to (null if not a reply) */
  replyToId: int("replyToId"),
  /** Denormalised sender name of the replied-to message */
  replyToSenderName: varchar("replyToSenderName", { length: 256 }),
  /** Denormalised content snippet of the replied-to message (first 300 chars) */
  replyToContent: varchar("replyToContent", { length: 300 }),
  /** Whether this message has been soft-deleted */
  isDeleted: int("isDeleted").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  idx_orgGroupMessages_orgId: index("idx_orgGroupMessages_orgId").on(t.orgId),
  idx_orgGroupMessages_senderId: index("idx_orgGroupMessages_senderId").on(t.senderId),
  idx_orgGroupMessages_createdAt: index("idx_orgGroupMessages_createdAt").on(t.createdAt),
}));
export type OrgGroupMessage = typeof orgGroupMessages.$inferSelect;
export type InsertOrgGroupMessage = typeof orgGroupMessages.$inferInsert;

/**
 * Tracks which staff members have read up to which message in each org group channel.
 */
export const orgMessageReads = mysqlTable("orgMessageReads", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("userId").notNull(),
  orgId: int("orgId").notNull(),
  lastReadMessageId: int("lastReadMessageId").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  idx_orgMessageReads_userId_orgId: uniqueIndex("idx_orgMessageReads_userId_orgId").on(t.userId, t.orgId),
}));
export type OrgMessageRead = typeof orgMessageReads.$inferSelect;
export type InsertOrgMessageRead = typeof orgMessageReads.$inferInsert;

// ════════════════════════════════════════════════════════════════════════════
//  COMPLIANCE & AUDIT MODULE (additive, backward-compatible)
//
//  All tables below are new. They reference the EXISTING `submissions.id` as the
//  canonical client identifier and `users.id` as the actor. Nothing here renames
//  or removes an existing table. Foreign keys, version columns (optimistic
//  concurrency), soft-delete columns, created/updated-by, and effective dates are
//  applied throughout. Money uses DECIMAL. Records are never hard-deleted.
// ════════════════════════════════════════════════════════════════════════════

// ─── Durable append-only audit events (tamper-evident hash chain) ────────────
/**
 * Replaces the silent `auditLogs` logger for material operations. Written INSIDE
 * the same DB transaction as the business change. `hash` = SHA-256 over the
 * event payload + `prevHash`, forming a chain: any edit/delete of a historical
 * row breaks verification downstream. Normal users (incl. admins) must never
 * UPDATE or DELETE rows here — enforced at the application layer and documented
 * for DB-level GRANT hardening.
 */
export const auditEvents = mysqlTable("auditEvents", {
  id: int("id").autoincrement().primaryKey(),
  /** Effective actor (who the system acted as). During impersonation this is the impersonated user. */
  actorId: int("actorId"),
  actorName: varchar("actorName", { length: 256 }),
  /** Original actor during impersonation (the real logged-in user); null otherwise. */
  originalActorId: int("originalActorId"),
  actorRole: varchar("actorRole", { length: 64 }),
  orgId: int("orgId"),
  action: varchar("action", { length: 96 }).notNull(),
  recordType: varchar("recordType", { length: 64 }).notNull(),
  recordId: varchar("recordId", { length: 64 }),
  clientId: int("clientId"),
  /** Previous / new value snapshots (JSON) for material changes. */
  prevValue: json("prevValue"),
  newValue: json("newValue"),
  reason: text("reason"),
  /** Optional link to an approval record justifying the action. */
  approvalId: int("approvalId"),
  requestId: varchar("requestId", { length: 64 }),
  sessionId: varchar("sessionId", { length: 64 }),
  correlationId: varchar("correlationId", { length: 64 }),
  ip: varchar("ip", { length: 64 }),
  userAgent: varchar("userAgent", { length: 512 }),
  /** Whether the underlying operation succeeded (false = attempted/denied). */
  success: boolean("success").notNull().default(true),
  /** Tamper-evidence: hash of the previous row and this row's hash. */
  prevHash: varchar("prevHash", { length: 64 }),
  hash: varchar("hash", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  idx_auditEvents_recordType_recordId: index("idx_auditEvents_recordType_recordId").on(t.recordType, t.recordId),
  idx_auditEvents_clientId: index("idx_auditEvents_clientId").on(t.clientId),
  idx_auditEvents_actorId: index("idx_auditEvents_actorId").on(t.actorId),
  idx_auditEvents_createdAt: index("idx_auditEvents_createdAt").on(t.createdAt),
  idx_auditEvents_action: index("idx_auditEvents_action").on(t.action),
}));
export type AuditEvent = typeof auditEvents.$inferSelect;
export type InsertAuditEvent = typeof auditEvents.$inferInsert;

// ─── Normalized RBAC ─────────────────────────────────────────────────────────
export const complianceRoles = mysqlTable("complianceRoles", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ComplianceRoleRow = typeof complianceRoles.$inferSelect;

export const compliancePermissions = mysqlTable("compliancePermissions", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 96 }).notNull().unique(),
  description: text("description"),
});
export type CompliancePermission = typeof compliancePermissions.$inferSelect;

export const rolePermissions = mysqlTable("rolePermissions", {
  id: int("id").autoincrement().primaryKey(),
  roleId: int("roleId").notNull().references(() => complianceRoles.id),
  permissionId: int("permissionId").notNull().references(() => compliancePermissions.id),
}, (t) => ({
  uniq_rolePermissions: uniqueIndex("uniq_rolePermissions").on(t.roleId, t.permissionId),
}));

export const userComplianceRoles = mysqlTable("userComplianceRoles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  roleId: int("roleId").notNull().references(() => complianceRoles.id),
  grantedBy: int("grantedBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  uniq_userComplianceRoles: uniqueIndex("uniq_userComplianceRoles").on(t.userId, t.roleId),
}));

/** Record-level scoping: restrict a user to specific clients/orgs/regions. */
export const recordScopes = mysqlTable("recordScopes", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  scopeType: mysqlEnum("scopeType", ["client", "organization", "region", "all"]).notNull(),
  scopeValue: varchar("scopeValue", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  idx_recordScopes_userId: index("idx_recordScopes_userId").on(t.userId),
}));

/** Time-limited emergency ("break-glass") access grants with enhanced auditing. */
export const tempAccessGrants = mysqlTable("tempAccessGrants", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  reason: text("reason").notNull(),
  scope: varchar("scope", { length: 256 }).notNull(),
  approvedBy: int("approvedBy").references(() => users.id),
  grantedAt: timestamp("grantedAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  revokedAt: timestamp("revokedAt"),
  isBreakGlass: boolean("isBreakGlass").notNull().default(true),
}, (t) => ({
  idx_tempAccessGrants_userId: index("idx_tempAccessGrants_userId").on(t.userId),
  idx_tempAccessGrants_expiresAt: index("idx_tempAccessGrants_expiresAt").on(t.expiresAt),
}));
export type TempAccessGrant = typeof tempAccessGrants.$inferSelect;

// ─── MFA (interface-backed; TOTP secret + recovery codes are hashed) ─────────
export const mfaEnrollments = mysqlTable("mfaEnrollments", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id).unique(),
  /** Encrypted/at-rest-protected TOTP secret (base32). */
  totpSecret: varchar("totpSecret", { length: 256 }),
  method: mysqlEnum("method", ["totp", "webauthn"]).notNull().default("totp"),
  enrolledAt: timestamp("enrolledAt"),
  isActive: boolean("isActive").notNull().default(false),
  /** Pending reset approval workflow. */
  resetRequestedAt: timestamp("resetRequestedAt"),
  resetApprovedBy: int("resetApprovedBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type MfaEnrollment = typeof mfaEnrollments.$inferSelect;

export const mfaRecoveryCodes = mysqlTable("mfaRecoveryCodes", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  /** SHA-256 of the recovery code; the plaintext is shown once at generation. */
  codeHash: varchar("codeHash", { length: 64 }).notNull(),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  idx_mfaRecoveryCodes_userId: index("idx_mfaRecoveryCodes_userId").on(t.userId),
}));

// ─── Durable background jobs (replaces detached setTimeout work) ─────────────
export const jobs = mysqlTable("jobs", {
  id: int("id").autoincrement().primaryKey(),
  jobType: varchar("jobType", { length: 64 }).notNull(),
  /** Idempotency key — a second enqueue with the same key is a no-op. */
  idempotencyKey: varchar("idempotencyKey", { length: 128 }),
  payload: json("payload"),
  status: mysqlEnum("status", ["queued", "running", "succeeded", "failed", "dead_letter"]).notNull().default("queued"),
  attempts: int("attempts").notNull().default(0),
  maxAttempts: int("maxAttempts").notNull().default(5),
  /** Next earliest run time (for backoff scheduling). */
  runAfter: timestamp("runAfter").defaultNow().notNull(),
  lastError: text("lastError"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  completedAt: timestamp("completedAt"),
}, (t) => ({
  uniq_jobs_idempotencyKey: uniqueIndex("uniq_jobs_idempotencyKey").on(t.idempotencyKey),
  idx_jobs_status_runAfter: index("idx_jobs_status_runAfter").on(t.status, t.runAfter),
}));
export type Job = typeof jobs.$inferSelect;
export type InsertJob = typeof jobs.$inferInsert;

// ─── One-time upload tokens (bound to a client / intake draft) ───────────────
export const uploadTokens = mysqlTable("uploadTokens", {
  id: int("id").autoincrement().primaryKey(),
  /** SHA-256 of the token; plaintext returned once to the client. */
  tokenHash: varchar("tokenHash", { length: 64 }).notNull().unique(),
  /** Bind the token to a specific client (submission) or a draft key. */
  submissionId: int("submissionId").references(() => submissions.id),
  draftKey: varchar("draftKey", { length: 128 }),
  issuedBy: int("issuedBy").references(() => users.id),
  maxBytes: int("maxBytes").notNull().default(26214400),
  usedAt: timestamp("usedAt"),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  idx_uploadTokens_submissionId: index("idx_uploadTokens_submissionId").on(t.submissionId),
}));
export type UploadToken = typeof uploadTokens.$inferSelect;

// ─── Compliance documents (object-key based, versioned, scanned, retained) ───
/**
 * Unlike the legacy `documents` table (which stores an expiring presigned URL as
 * the authoritative location), this stores only the STORAGE OBJECT KEY. Signed
 * URLs are minted on demand after an authorization + scope check, and every
 * reveal is logged.
 */
export const complianceDocuments = mysqlTable("complianceDocuments", {
  id: int("id").autoincrement().primaryKey(),
  submissionId: int("submissionId").references(() => submissions.id),
  /** Authoritative storage object key (NOT a URL). */
  objectKey: varchar("objectKey", { length: 512 }).notNull(),
  originalFilename: varchar("originalFilename", { length: 256 }).notNull(),
  mimeType: varchar("mimeType", { length: 128 }),
  fileSize: int("fileSize"),
  /** SHA-256 checksum of the stored bytes. */
  checksum: varchar("checksum", { length: 64 }),
  scanStatus: mysqlEnum("scanStatus", ["pending", "quarantined", "passed", "failed"]).notNull().default("quarantined"),
  confidentiality: mysqlEnum("confidentiality", ["standard", "sensitive", "highly_sensitive", "attorney_client_privileged"]).notNull().default("standard"),
  /** Document versioning: version N supersedes the row named by supersedesId. */
  version: int("version").notNull().default(1),
  supersedesId: int("supersedesId"),
  category: varchar("category", { length: 64 }),
  approvalStatus: mysqlEnum("approvalStatus", ["pending", "approved", "rejected"]).notNull().default("pending"),
  effectiveDate: timestamp("effectiveDate"),
  expirationDate: timestamp("expirationDate"),
  retentionDate: timestamp("retentionDate"),
  legalHold: boolean("legalHold").notNull().default(false),
  recordStatus: mysqlEnum("recordStatus", ["active", "archived", "voided", "superseded"]).notNull().default("active"),
  uploadedBy: int("uploadedBy").references(() => users.id),
  deletedAt: timestamp("deletedAt"),
  deletedBy: int("deletedBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  idx_complianceDocuments_submissionId: index("idx_complianceDocuments_submissionId").on(t.submissionId),
  idx_complianceDocuments_scanStatus: index("idx_complianceDocuments_scanStatus").on(t.scanStatus),
}));
export type ComplianceDocument = typeof complianceDocuments.$inferSelect;
export type InsertComplianceDocument = typeof complianceDocuments.$inferInsert;

// ─── Document access log (every reveal/download recorded) ────────────────────
export const documentAccessLog = mysqlTable("documentAccessLog", {
  id: int("id").autoincrement().primaryKey(),
  documentId: int("documentId").notNull().references(() => complianceDocuments.id),
  userId: int("userId").references(() => users.id),
  action: mysqlEnum("action", ["view", "download", "url_mint"]).notNull(),
  ip: varchar("ip", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  idx_documentAccessLog_documentId: index("idx_documentAccessLog_documentId").on(t.documentId),
}));

// ─── Eligibility verifications (append-only; never overwrite) ────────────────
export const eligibilityVerifications = mysqlTable("eligibilityVerifications", {
  id: int("id").autoincrement().primaryKey(),
  submissionId: int("submissionId").notNull().references(() => submissions.id),
  verificationType: varchar("verificationType", { length: 64 }).notNull().default("medicaid"),
  medicaidStatus: mysqlEnum("medicaidStatus", ["active", "inactive", "pending", "unknown"]).notNull().default("unknown"),
  managedCareStatus: varchar("managedCareStatus", { length: 64 }),
  mco: varchar("mco", { length: 128 }),
  /** Normalized CIN (uppercase, alphanumeric only). Full value is masked in the UI. */
  cinNormalized: varchar("cinNormalized", { length: 64 }),
  verificationSource: varchar("verificationSource", { length: 128 }),
  verificationReference: varchar("verificationReference", { length: 128 }),
  verifiedDate: timestamp("verifiedDate"),
  effectiveStartDate: timestamp("effectiveStartDate"),
  effectiveEndDate: timestamp("effectiveEndDate"),
  /** Whether this verification applies to the date-of-service being evaluated. */
  dateOfServiceApplicability: text("dateOfServiceApplicability"),
  evidenceDocumentId: int("evidenceDocumentId").references(() => complianceDocuments.id),
  verifiedBy: int("verifiedBy").references(() => users.id),
  verificationMethod: varchar("verificationMethod", { length: 64 }),
  notes: text("notes"),
  status: mysqlEnum("status", ["verified", "pending", "expired", "not_eligible", "superseded"]).notNull().default("pending"),
  recordStatus: mysqlEnum("recordStatus", ["active", "archived", "voided", "superseded"]).notNull().default("active"),
  version: int("version").notNull().default(1),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  idx_eligibilityVerifications_submissionId: index("idx_eligibilityVerifications_submissionId").on(t.submissionId),
  idx_eligibilityVerifications_status: index("idx_eligibilityVerifications_status").on(t.status),
}));
export type EligibilityVerification = typeof eligibilityVerifications.$inferSelect;
export type InsertEligibilityVerification = typeof eligibilityVerifications.$inferInsert;

// ─── Enrollment episodes (multiple historical periods per client) ────────────
export const enrollmentEpisodes = mysqlTable("enrollmentEpisodes", {
  id: int("id").autoincrement().primaryKey(),
  submissionId: int("submissionId").notNull().references(() => submissions.id),
  program: varchar("program", { length: 128 }),
  scn: varchar("scn", { length: 128 }),
  mco: varchar("mco", { length: 128 }),
  serviceRegion: varchar("serviceRegion", { length: 128 }),
  enrollmentStart: timestamp("enrollmentStart"),
  enrollmentEnd: timestamp("enrollmentEnd"),
  enrollmentStatus: mysqlEnum("enrollmentStatus", ["active", "terminated", "pending", "suspended"]).notNull().default("pending"),
  terminationReason: text("terminationReason"),
  referralId: int("referralId"),
  recordStatus: mysqlEnum("recordStatus", ["active", "archived", "voided", "superseded"]).notNull().default("active"),
  version: int("version").notNull().default(1),
  createdBy: int("createdBy").references(() => users.id),
  approvedBy: int("approvedBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  idx_enrollmentEpisodes_submissionId: index("idx_enrollmentEpisodes_submissionId").on(t.submissionId),
}));
export type EnrollmentEpisode = typeof enrollmentEpisodes.$inferSelect;
export type InsertEnrollmentEpisode = typeof enrollmentEpisodes.$inferInsert;

// ─── SCN referrals ───────────────────────────────────────────────────────────
export const scnReferrals = mysqlTable("scnReferrals", {
  id: int("id").autoincrement().primaryKey(),
  submissionId: int("submissionId").notNull().references(() => submissions.id),
  enrollmentEpisodeId: int("enrollmentEpisodeId").references(() => enrollmentEpisodes.id),
  referralIdentifier: varchar("referralIdentifier", { length: 128 }),
  referringEntity: varchar("referringEntity", { length: 256 }),
  referralSource: varchar("referralSource", { length: 128 }),
  referralDate: timestamp("referralDate"),
  receivedDate: timestamp("receivedDate"),
  requestedService: varchar("requestedService", { length: 256 }),
  screeningResult: varchar("screeningResult", { length: 256 }),
  nutritionNeed: text("nutritionNeed"),
  enhancedPopulationCategory: varchar("enhancedPopulationCategory", { length: 128 }),
  navigator: varchar("navigator", { length: 256 }),
  scn: varchar("scn", { length: 128 }),
  referralStatus: mysqlEnum("referralStatus", ["received", "in_review", "accepted", "rejected", "expired", "withdrawn"]).notNull().default("received"),
  acceptanceDate: timestamp("acceptanceDate"),
  rejectionReason: text("rejectionReason"),
  referralEvidenceId: int("referralEvidenceId").references(() => complianceDocuments.id),
  effectiveStartDate: timestamp("effectiveStartDate"),
  effectiveEndDate: timestamp("effectiveEndDate"),
  recordStatus: mysqlEnum("recordStatus", ["active", "archived", "voided", "superseded"]).notNull().default("active"),
  version: int("version").notNull().default(1),
  createdBy: int("createdBy").references(() => users.id),
  reviewedBy: int("reviewedBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  idx_scnReferrals_submissionId: index("idx_scnReferrals_submissionId").on(t.submissionId),
  idx_scnReferrals_status: index("idx_scnReferrals_referralStatus").on(t.referralStatus),
}));
export type ScnReferral = typeof scnReferrals.$inferSelect;
export type InsertScnReferral = typeof scnReferrals.$inferInsert;

// ─── Service authorizations (DECIMAL money; transactional unit consumption) ──
export const serviceAuthorizations = mysqlTable("serviceAuthorizations", {
  id: int("id").autoincrement().primaryKey(),
  submissionId: int("submissionId").notNull().references(() => submissions.id),
  referralId: int("referralId").references(() => scnReferrals.id),
  enrollmentEpisodeId: int("enrollmentEpisodeId").references(() => enrollmentEpisodes.id),
  authorizationNumber: varchar("authorizationNumber", { length: 128 }),
  scn: varchar("scn", { length: 128 }),
  mco: varchar("mco", { length: 128 }),
  serviceCategory: varchar("serviceCategory", { length: 128 }),
  serviceCode: varchar("serviceCode", { length: 64 }),
  modifier: varchar("modifier", { length: 32 }),
  authorizedUnits: int("authorizedUnits").notNull().default(0),
  unitType: mysqlEnum("unitType", ["meal", "box", "delivery", "day", "week", "unit"]).notNull().default("unit"),
  frequency: varchar("frequency", { length: 64 }),
  /** Money — DECIMAL to avoid float rounding. */
  rate: decimal("rate", { precision: 12, scale: 2 }),
  rateSource: varchar("rateSource", { length: 128 }),
  startDate: timestamp("startDate"),
  endDate: timestamp("endDate"),
  restrictions: text("restrictions"),
  /** Remaining units — decremented under a row lock; guarded to never go negative. */
  remainingUnits: int("remainingUnits").notNull().default(0),
  status: mysqlEnum("status", ["draft", "active", "exhausted", "expired", "suspended", "voided"]).notNull().default("draft"),
  sourceDocumentId: int("sourceDocumentId").references(() => complianceDocuments.id),
  recordStatus: mysqlEnum("recordStatus", ["active", "archived", "voided", "superseded"]).notNull().default("active"),
  version: int("version").notNull().default(1),
  createdBy: int("createdBy").references(() => users.id),
  reviewedBy: int("reviewedBy").references(() => users.id),
  approvedBy: int("approvedBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  idx_serviceAuthorizations_submissionId: index("idx_serviceAuthorizations_submissionId").on(t.submissionId),
  idx_serviceAuthorizations_status: index("idx_serviceAuthorizations_status").on(t.status),
  uniq_serviceAuthorizations_number: uniqueIndex("uniq_serviceAuthorizations_authorizationNumber").on(t.authorizationNumber),
}));
export type ServiceAuthorization = typeof serviceAuthorizations.$inferSelect;
export type InsertServiceAuthorization = typeof serviceAuthorizations.$inferInsert;

// ─── Requirements engine ─────────────────────────────────────────────────────
/** A named requirement; its actual rules live in versioned rows. */
export const requirementDefinitions = mysqlTable("requirementDefinitions", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 96 }).notNull().unique(),
  category: varchar("category", { length: 96 }),
  isActive: boolean("isActive").notNull().default(true),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type RequirementDefinition = typeof requirementDefinitions.$inferSelect;

/**
 * Versioned requirement content. Evaluation always selects the version whose
 * [effectiveDate, endDate) window contains the applicable SERVICE date. A newer
 * version is never applied retroactively unless `retroactiveApproved` is set with
 * a recorded legal basis + approver.
 */
export const requirementVersions = mysqlTable("requirementVersions", {
  id: int("id").autoincrement().primaryKey(),
  definitionId: int("definitionId").notNull().references(() => requirementDefinitions.id),
  version: int("version").notNull().default(1),
  title: varchar("title", { length: 256 }).notNull(),
  plainDescription: text("plainDescription"),
  sourceOrganization: varchar("sourceOrganization", { length: 128 }),
  sourceDocument: varchar("sourceDocument", { length: 256 }),
  sourceUrl: varchar("sourceUrl", { length: 512 }),
  section: varchar("section", { length: 128 }),
  page: varchar("page", { length: 32 }),
  effectiveDate: timestamp("effectiveDate"),
  endDate: timestamp("endDate"),
  serviceCategory: varchar("serviceCategory", { length: 128 }),
  population: varchar("population", { length: 128 }),
  program: varchar("program", { length: 128 }),
  scn: varchar("scn", { length: 128 }),
  mco: varchar("mco", { length: 128 }),
  evidenceRequired: text("evidenceRequired"),
  responsibleRole: varchar("responsibleRole", { length: 64 }),
  reviewerRole: varchar("reviewerRole", { length: 64 }),
  /** Blocking requirements gate service readiness / invoicing. */
  blocking: boolean("blocking").notNull().default(true),
  renewalFrequency: varchar("renewalFrequency", { length: 64 }),
  dueDateRule: varchar("dueDateRule", { length: 128 }),
  riskLevel: mysqlEnum("riskLevel", ["low", "medium", "high", "critical"]).notNull().default("medium"),
  auditTest: text("auditTest"),
  failureConsequence: text("failureConsequence"),
  internalInterpretation: text("internalInterpretation"),
  attorneyReviewStatus: varchar("attorneyReviewStatus", { length: 64 }),
  approvalStatus: mysqlEnum("approvalStatus", ["draft", "internal_review", "attorney_review", "approved", "retired"]).notNull().default("draft"),
  supersededById: int("supersededById"),
  /** Retroactive application controls. */
  retroactiveApproved: boolean("retroactiveApproved").notNull().default(false),
  retroactiveLegalBasis: text("retroactiveLegalBasis"),
  retroactiveApprovedBy: int("retroactiveApprovedBy").references(() => users.id),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  uniq_requirementVersions: uniqueIndex("uniq_requirementVersions").on(t.definitionId, t.version),
  idx_requirementVersions_effective: index("idx_requirementVersions_effectiveDate").on(t.effectiveDate),
}));
export type RequirementVersion = typeof requirementVersions.$inferSelect;
export type InsertRequirementVersion = typeof requirementVersions.$inferInsert;

/** Declarative applicability rules (config-driven, not hard-coded in React). */
export const requirementApplicabilityRules = mysqlTable("requirementApplicabilityRules", {
  id: int("id").autoincrement().primaryKey(),
  requirementVersionId: int("requirementVersionId").notNull().references(() => requirementVersions.id),
  /** Field on the evaluation context to match (e.g. serviceCategory, program, mco, population). */
  attribute: varchar("attribute", { length: 64 }).notNull(),
  operator: mysqlEnum("operator", ["eq", "neq", "in", "exists"]).notNull().default("eq"),
  value: varchar("value", { length: 256 }),
});
export type RequirementApplicabilityRule = typeof requirementApplicabilityRules.$inferSelect;

/** A requirement version assigned to a client (and optionally a service date). */
export const requirementAssignments = mysqlTable("requirementAssignments", {
  id: int("id").autoincrement().primaryKey(),
  submissionId: int("submissionId").notNull().references(() => submissions.id),
  requirementVersionId: int("requirementVersionId").notNull().references(() => requirementVersions.id),
  serviceDate: timestamp("serviceDate"),
  status: mysqlEnum("status", ["pending", "in_progress", "satisfied", "failed", "waived", "not_applicable"]).notNull().default("pending"),
  dueDate: timestamp("dueDate"),
  blocking: boolean("blocking").notNull().default(true),
  satisfiedAt: timestamp("satisfiedAt"),
  recordStatus: mysqlEnum("recordStatus", ["active", "archived", "voided", "superseded"]).notNull().default("active"),
  version: int("version").notNull().default(1),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  uniq_requirementAssignments: uniqueIndex("uniq_requirementAssignments").on(t.submissionId, t.requirementVersionId, t.serviceDate),
  idx_requirementAssignments_submissionId: index("idx_requirementAssignments_submissionId").on(t.submissionId),
}));
export type RequirementAssignment = typeof requirementAssignments.$inferSelect;
export type InsertRequirementAssignment = typeof requirementAssignments.$inferInsert;

export const requirementEvidence = mysqlTable("requirementEvidence", {
  id: int("id").autoincrement().primaryKey(),
  assignmentId: int("assignmentId").notNull().references(() => requirementAssignments.id),
  documentId: int("documentId").references(() => complianceDocuments.id),
  note: text("note"),
  addedBy: int("addedBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  idx_requirementEvidence_assignmentId: index("idx_requirementEvidence_assignmentId").on(t.assignmentId),
}));

export const requirementReviews = mysqlTable("requirementReviews", {
  id: int("id").autoincrement().primaryKey(),
  assignmentId: int("assignmentId").notNull().references(() => requirementAssignments.id),
  reviewerId: int("reviewerId").references(() => users.id),
  outcome: mysqlEnum("outcome", ["approved", "rejected", "needs_info"]).notNull(),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** A permitted, audited override of a blocking requirement. */
export const requirementExceptions = mysqlTable("requirementExceptions", {
  id: int("id").autoincrement().primaryKey(),
  submissionId: int("submissionId").notNull().references(() => submissions.id),
  assignmentId: int("assignmentId").references(() => requirementAssignments.id),
  exceptionType: varchar("exceptionType", { length: 64 }).notNull(),
  justification: text("justification").notNull(),
  supportingDocumentId: int("supportingDocumentId").references(() => complianceDocuments.id),
  requestedBy: int("requestedBy").notNull().references(() => users.id),
  approvedBy: int("approvedBy").references(() => users.id),
  complianceApprovedBy: int("complianceApprovedBy").references(() => users.id),
  status: mysqlEnum("status", ["requested", "approved", "rejected", "expired"]).notNull().default("requested"),
  effectiveDate: timestamp("effectiveDate"),
  expirationDate: timestamp("expirationDate"),
  followUpTaskId: int("followUpTaskId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  idx_requirementExceptions_submissionId: index("idx_requirementExceptions_submissionId").on(t.submissionId),
}));
export type RequirementException = typeof requirementExceptions.$inferSelect;
export type InsertRequirementException = typeof requirementExceptions.$inferInsert;

export const requirementApprovals = mysqlTable("requirementApprovals", {
  id: int("id").autoincrement().primaryKey(),
  requirementVersionId: int("requirementVersionId").notNull().references(() => requirementVersions.id),
  approverId: int("approverId").references(() => users.id),
  approvalType: varchar("approvalType", { length: 64 }).notNull(),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Cached readiness snapshot (derived; recomputed by jobs/mutations) ────────
export const complianceReadiness = mysqlTable("complianceReadiness", {
  id: int("id").autoincrement().primaryKey(),
  submissionId: int("submissionId").notNull().references(() => submissions.id).unique(),
  status: mysqlEnum("status", [
    "intake_pending", "eligibility_pending", "referral_pending", "authorization_pending",
    "clinical_review_pending", "evidence_missing", "compliance_review_pending",
    "ready_for_service", "service_hold", "billing_hold", "under_audit", "inactive",
  ]).notNull().default("intake_pending"),
  /** JSON list of unmet blocking reasons that produced this status. */
  blockingReasons: json("blockingReasons"),
  computedAt: timestamp("computedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ComplianceReadiness = typeof complianceReadiness.$inferSelect;
export type InsertComplianceReadiness = typeof complianceReadiness.$inferInsert;

// ════════════════════════════════════════════════════════════════════════════
//  COMPLIANCE MODULE — Phase 3: nutrition, delivery, billing, self-audit/CAPA,
//  overpayments. Same conventions: FKs, version, soft-delete, effective dates,
//  DECIMAL money, append-only history, no hard delete.
// ════════════════════════════════════════════════════════════════════════════

// ─── Nutrition ───────────────────────────────────────────────────────────────
export const nutritionAssessments = mysqlTable("nutritionAssessments", {
  id: int("id").autoincrement().primaryKey(),
  submissionId: int("submissionId").notNull().references(() => submissions.id),
  assessmentDate: timestamp("assessmentDate"),
  clinicalCriteria: text("clinicalCriteria"),
  nutritionDiagnosis: text("nutritionDiagnosis"),
  allergies: text("allergies"),
  dietaryRestrictions: text("dietaryRestrictions"),
  culturalPreferences: text("culturalPreferences"),
  medicalRestrictions: text("medicalRestrictions"),
  reassessmentDate: timestamp("reassessmentDate"),
  effectiveStartDate: timestamp("effectiveStartDate"),
  effectiveEndDate: timestamp("effectiveEndDate"),
  superseded: boolean("superseded").notNull().default(false),
  recordStatus: mysqlEnum("recordStatus", ["active", "archived", "voided", "superseded"]).notNull().default("active"),
  version: int("version").notNull().default(1),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({ idx_nutritionAssessments_submissionId: index("idx_nutritionAssessments_submissionId").on(t.submissionId) }));
export type NutritionAssessment = typeof nutritionAssessments.$inferSelect;
export type InsertNutritionAssessment = typeof nutritionAssessments.$inferInsert;

export const nutritionPlans = mysqlTable("nutritionPlans", {
  id: int("id").autoincrement().primaryKey(),
  submissionId: int("submissionId").notNull().references(() => submissions.id),
  assessmentId: int("assessmentId").references(() => nutritionAssessments.id),
  serviceCategory: varchar("serviceCategory", { length: 128 }),
  frequency: varchar("frequency", { length: 64 }),
  duration: varchar("duration", { length: 64 }),
  status: mysqlEnum("status", ["draft", "active", "superseded"]).notNull().default("draft"),
  currentVersion: int("currentVersion").notNull().default(1),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({ idx_nutritionPlans_submissionId: index("idx_nutritionPlans_submissionId").on(t.submissionId) }));
export type NutritionPlan = typeof nutritionPlans.$inferSelect;

export const nutritionPlanVersions = mysqlTable("nutritionPlanVersions", {
  id: int("id").autoincrement().primaryKey(),
  planId: int("planId").notNull().references(() => nutritionPlans.id),
  version: int("version").notNull(),
  mealPlan: text("mealPlan"),
  dietCategory: varchar("dietCategory", { length: 128 }),
  evidenceDocumentId: int("evidenceDocumentId").references(() => complianceDocuments.id),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({ uniq_nutritionPlanVersions: uniqueIndex("uniq_nutritionPlanVersions").on(t.planId, t.version) }));
export type NutritionPlanVersion = typeof nutritionPlanVersions.$inferSelect;

export const clinicalApprovals = mysqlTable("clinicalApprovals", {
  id: int("id").autoincrement().primaryKey(),
  submissionId: int("submissionId").notNull().references(() => submissions.id),
  planId: int("planId").references(() => nutritionPlans.id),
  assessmentId: int("assessmentId").references(() => nutritionAssessments.id),
  reviewerId: int("reviewerId").references(() => users.id),
  reviewerName: varchar("reviewerName", { length: 256 }),
  /** Snapshot of the reviewer's credential at approval time. */
  credentialType: varchar("credentialType", { length: 32 }),
  credentialNumber: varchar("credentialNumber", { length: 64 }),
  credentialValidFrom: timestamp("credentialValidFrom"),
  credentialValidUntil: timestamp("credentialValidUntil"),
  approvalDate: timestamp("approvalDate"),
  serviceDate: timestamp("serviceDate"),
  outcome: mysqlEnum("outcome", ["approved", "rejected"]).notNull().default("approved"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({ idx_clinicalApprovals_submissionId: index("idx_clinicalApprovals_submissionId").on(t.submissionId) }));
export type ClinicalApproval = typeof clinicalApprovals.$inferSelect;
export type InsertClinicalApproval = typeof clinicalApprovals.$inferInsert;

// ─── Service delivery ────────────────────────────────────────────────────────
export const servicePlans = mysqlTable("servicePlans", {
  id: int("id").autoincrement().primaryKey(),
  submissionId: int("submissionId").notNull().references(() => submissions.id),
  authorizationId: int("authorizationId").references(() => serviceAuthorizations.id),
  serviceCategory: varchar("serviceCategory", { length: 128 }),
  status: mysqlEnum("status", ["active", "completed", "cancelled"]).notNull().default("active"),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ServicePlan = typeof servicePlans.$inferSelect;

export const serviceEncounters = mysqlTable("serviceEncounters", {
  id: int("id").autoincrement().primaryKey(),
  submissionId: int("submissionId").notNull().references(() => submissions.id),
  authorizationId: int("authorizationId").references(() => serviceAuthorizations.id),
  referralId: int("referralId").references(() => scnReferrals.id),
  serviceCategory: varchar("serviceCategory", { length: 128 }),
  dateOfService: timestamp("dateOfService"),
  units: int("units").notNull().default(0),
  unitType: mysqlEnum("unitType", ["meal", "box", "delivery", "day", "week", "unit"]).notNull().default("unit"),
  itemDescription: text("itemDescription"),
  dietCategory: varchar("dietCategory", { length: 128 }),
  /** State machine: draft→documented→pending_review→approved→locked→invoiced→paid… */
  state: mysqlEnum("state", ["draft", "documented", "pending_review", "approved", "locked", "invoiced", "paid", "corrected_by_amendment", "voided"]).notNull().default("draft"),
  documentationCompletedAt: timestamp("documentationCompletedAt"),
  approvedBy: int("approvedBy").references(() => users.id),
  invoiceLineId: int("invoiceLineId"),
  recordStatus: mysqlEnum("recordStatus", ["active", "archived", "voided", "superseded"]).notNull().default("active"),
  version: int("version").notNull().default(1),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  idx_serviceEncounters_submissionId: index("idx_serviceEncounters_submissionId").on(t.submissionId),
  idx_serviceEncounters_state: index("idx_serviceEncounters_state").on(t.state),
}));
export type ServiceEncounter = typeof serviceEncounters.$inferSelect;
export type InsertServiceEncounter = typeof serviceEncounters.$inferInsert;

export const deliveries = mysqlTable("deliveries", {
  id: int("id").autoincrement().primaryKey(),
  encounterId: int("encounterId").notNull().references(() => serviceEncounters.id),
  deliveryAddress: text("deliveryAddress"),
  deliveredAt: timestamp("deliveredAt"),
  staffOrVendor: varchar("staffOrVendor", { length: 256 }),
  podMethod: mysqlEnum("podMethod", ["signature", "photo", "gps", "recipient_confirmation", "staff_attestation"]),
  signatureDocumentId: int("signatureDocumentId").references(() => complianceDocuments.id),
  photoDocumentId: int("photoDocumentId").references(() => complianceDocuments.id),
  gpsEvidence: varchar("gpsEvidence", { length: 128 }),
  temperatureRecord: varchar("temperatureRecord", { length: 64 }),
  incident: text("incident"),
  status: mysqlEnum("status", ["delivered", "failed", "redelivered"]).notNull().default("delivered"),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({ idx_deliveries_encounterId: index("idx_deliveries_encounterId").on(t.encounterId) }));
export type Delivery = typeof deliveries.$inferSelect;

export const deliveryAttempts = mysqlTable("deliveryAttempts", {
  id: int("id").autoincrement().primaryKey(),
  encounterId: int("encounterId").notNull().references(() => serviceEncounters.id),
  attemptedAt: timestamp("attemptedAt"),
  failedReason: text("failedReason"),
  redelivery: boolean("redelivery").notNull().default(false),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type DeliveryAttempt = typeof deliveryAttempts.$inferSelect;

/** Amendments preserve the ORIGINAL encounter values when correcting after lock. */
export const serviceAmendments = mysqlTable("serviceAmendments", {
  id: int("id").autoincrement().primaryKey(),
  encounterId: int("encounterId").notNull().references(() => serviceEncounters.id),
  reason: text("reason").notNull(),
  /** Full snapshot of the original values (JSON) — never overwritten. */
  originalValues: json("originalValues").notNull(),
  amendedValues: json("amendedValues").notNull(),
  amendedBy: int("amendedBy").references(() => users.id),
  approvedBy: int("approvedBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({ idx_serviceAmendments_encounterId: index("idx_serviceAmendments_encounterId").on(t.encounterId) }));
export type ServiceAmendment = typeof serviceAmendments.$inferSelect;

// ─── Billing ─────────────────────────────────────────────────────────────────
export const invoiceHeaders = mysqlTable("invoiceHeaders", {
  id: int("id").autoincrement().primaryKey(),
  invoiceNumber: varchar("invoiceNumber", { length: 128 }),
  submissionId: int("submissionId").notNull().references(() => submissions.id),
  status: mysqlEnum("status", ["draft", "validated", "approved", "submitted", "paid", "denied", "void"]).notNull().default("draft"),
  expectedTotal: decimal("expectedTotal", { precision: 12, scale: 2 }),
  submittedTotal: decimal("submittedTotal", { precision: 12, scale: 2 }),
  paidTotal: decimal("paidTotal", { precision: 12, scale: 2 }),
  submissionDate: timestamp("submissionDate"),
  timelinessDeadline: timestamp("timelinessDeadline"),
  acceptedDate: timestamp("acceptedDate"),
  reconciliationStatus: mysqlEnum("reconciliationStatus", ["unreconciled", "partial", "reconciled"]).notNull().default("unreconciled"),
  recordStatus: mysqlEnum("recordStatus", ["active", "archived", "voided", "superseded"]).notNull().default("active"),
  version: int("version").notNull().default(1),
  createdBy: int("createdBy").references(() => users.id),
  approvedBy: int("approvedBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  idx_invoiceHeaders_submissionId: index("idx_invoiceHeaders_submissionId").on(t.submissionId),
  uniq_invoiceHeaders_invoiceNumber: uniqueIndex("uniq_invoiceHeaders_invoiceNumber").on(t.invoiceNumber),
}));
export type InvoiceHeader = typeof invoiceHeaders.$inferSelect;
export type InsertInvoiceHeader = typeof invoiceHeaders.$inferInsert;

export const invoiceLines = mysqlTable("invoiceLines", {
  id: int("id").autoincrement().primaryKey(),
  invoiceId: int("invoiceId").notNull().references(() => invoiceHeaders.id),
  encounterId: int("encounterId").references(() => serviceEncounters.id),
  authorizationId: int("authorizationId").references(() => serviceAuthorizations.id),
  serviceCode: varchar("serviceCode", { length: 64 }),
  serviceDate: timestamp("serviceDate"),
  units: int("units").notNull().default(0),
  rate: decimal("rate", { precision: 12, scale: 2 }),
  expectedAmount: decimal("expectedAmount", { precision: 12, scale: 2 }),
  /** Deterministic key that makes duplicate billing of the same service impossible. */
  idempotencyKey: varchar("idempotencyKey", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  uniq_invoiceLines_idempotencyKey: uniqueIndex("uniq_invoiceLines_idempotencyKey").on(t.idempotencyKey),
  idx_invoiceLines_invoiceId: index("idx_invoiceLines_invoiceId").on(t.invoiceId),
}));
export type InvoiceLine = typeof invoiceLines.$inferSelect;
export type InsertInvoiceLine = typeof invoiceLines.$inferInsert;

export const invoiceSubmissions = mysqlTable("invoiceSubmissions", {
  id: int("id").autoincrement().primaryKey(),
  invoiceId: int("invoiceId").notNull().references(() => invoiceHeaders.id),
  submittedAt: timestamp("submittedAt"),
  submittedBy: int("submittedBy").references(() => users.id),
  clearinghouseRef: varchar("clearinghouseRef", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type InvoiceSubmission = typeof invoiceSubmissions.$inferSelect;

export const payments = mysqlTable("payments", {
  id: int("id").autoincrement().primaryKey(),
  invoiceId: int("invoiceId").references(() => invoiceHeaders.id),
  submissionId: int("submissionId").notNull().references(() => submissions.id),
  paidAmount: decimal("paidAmount", { precision: 12, scale: 2 }).notNull(),
  paymentDate: timestamp("paymentDate"),
  payerReference: varchar("payerReference", { length: 128 }),
  /** Optional caller/payer-supplied idempotency key; unique when present so a
   * retried payment callback cannot double-insert (NULLs are allowed to repeat). */
  idempotencyKey: varchar("idempotencyKey", { length: 128 }),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  idx_payments_invoiceId: index("idx_payments_invoiceId").on(t.invoiceId),
  uniq_payments_idempotencyKey: uniqueIndex("uniq_payments_idempotencyKey").on(t.idempotencyKey),
}));
export type Payment = typeof payments.$inferSelect;
export type InsertPayment = typeof payments.$inferInsert;

export const paymentAllocations = mysqlTable("paymentAllocations", {
  id: int("id").autoincrement().primaryKey(),
  paymentId: int("paymentId").notNull().references(() => payments.id),
  invoiceLineId: int("invoiceLineId").notNull().references(() => invoiceLines.id),
  allocatedAmount: decimal("allocatedAmount", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PaymentAllocation = typeof paymentAllocations.$inferSelect;

export const denials = mysqlTable("denials", {
  id: int("id").autoincrement().primaryKey(),
  invoiceId: int("invoiceId").references(() => invoiceHeaders.id),
  invoiceLineId: int("invoiceLineId").references(() => invoiceLines.id),
  denialCode: varchar("denialCode", { length: 64 }),
  denialReason: text("denialReason"),
  appealStatus: mysqlEnum("appealStatus", ["none", "appealed", "overturned", "upheld"]).notNull().default("none"),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Denial = typeof denials.$inferSelect;

export const adjustments = mysqlTable("adjustments", {
  id: int("id").autoincrement().primaryKey(),
  invoiceId: int("invoiceId").references(() => invoiceHeaders.id),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  reason: text("reason"),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Adjustment = typeof adjustments.$inferSelect;

export const recoupments = mysqlTable("recoupments", {
  id: int("id").autoincrement().primaryKey(),
  invoiceId: int("invoiceId").references(() => invoiceHeaders.id),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  reason: text("reason"),
  recoupedAt: timestamp("recoupedAt"),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Recoupment = typeof recoupments.$inferSelect;

export const billingHolds = mysqlTable("billingHolds", {
  id: int("id").autoincrement().primaryKey(),
  submissionId: int("submissionId").references(() => submissions.id),
  invoiceId: int("invoiceId").references(() => invoiceHeaders.id),
  reason: text("reason").notNull(),
  active: boolean("active").notNull().default(true),
  placedBy: int("placedBy").references(() => users.id),
  releasedBy: int("releasedBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  releasedAt: timestamp("releasedAt"),
}, (t) => ({ idx_billingHolds_submissionId: index("idx_billingHolds_submissionId").on(t.submissionId) }));
export type BillingHold = typeof billingHolds.$inferSelect;

// ─── Self-audit & CAPA ───────────────────────────────────────────────────────
export const audits = mysqlTable("audits", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 256 }).notNull(),
  auditType: varchar("auditType", { length: 64 }).notNull(),
  status: mysqlEnum("status", ["planning", "fieldwork", "review", "closed"]).notNull().default("planning"),
  periodStart: timestamp("periodStart"),
  periodEnd: timestamp("periodEnd"),
  leadAuditorId: int("leadAuditorId").references(() => users.id),
  recordStatus: mysqlEnum("recordStatus", ["active", "archived", "voided", "superseded"]).notNull().default("active"),
  version: int("version").notNull().default(1),
  createdBy: int("createdBy").references(() => users.id),
  closedBy: int("closedBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Audit = typeof audits.$inferSelect;
export type InsertAudit = typeof audits.$inferInsert;

export const auditScopes = mysqlTable("auditScopes", {
  id: int("id").autoincrement().primaryKey(),
  auditId: int("auditId").notNull().references(() => audits.id),
  description: text("description"),
  requirementVersionId: int("requirementVersionId").references(() => requirementVersions.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type AuditScope = typeof auditScopes.$inferSelect;

export const auditPopulations = mysqlTable("auditPopulations", {
  id: int("id").autoincrement().primaryKey(),
  auditId: int("auditId").notNull().references(() => audits.id),
  description: varchar("description", { length: 256 }),
  totalCount: int("totalCount").notNull().default(0),
  totalAmount: decimal("totalAmount", { precision: 14, scale: 2 }),
  /** Preserved snapshot of the population (JSON list of ids/keys) at selection time. */
  snapshot: json("snapshot"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type AuditPopulation = typeof auditPopulations.$inferSelect;

export const auditSamples = mysqlTable("auditSamples", {
  id: int("id").autoincrement().primaryKey(),
  auditId: int("auditId").notNull().references(() => audits.id),
  populationId: int("populationId").notNull().references(() => auditPopulations.id),
  method: mysqlEnum("method", ["full_population", "random", "stratified", "risk_based", "dollar_based", "judgmental"]).notNull(),
  seed: int("seed"),
  size: int("size").notNull().default(0),
  selectionDate: timestamp("selectionDate").defaultNow().notNull(),
  /** Immutable once set: the selected ids and excluded ids + reasons. */
  selectedIds: json("selectedIds"),
  excludedIds: json("excludedIds"),
  exclusionReasons: json("exclusionReasons"),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type AuditSample = typeof auditSamples.$inferSelect;
export type InsertAuditSample = typeof auditSamples.$inferInsert;

export const auditTests = mysqlTable("auditTests", {
  id: int("id").autoincrement().primaryKey(),
  auditId: int("auditId").notNull().references(() => audits.id),
  sampleId: int("sampleId").references(() => auditSamples.id),
  sampleItemId: varchar("sampleItemId", { length: 64 }),
  requirementVersionId: int("requirementVersionId").references(() => requirementVersions.id),
  result: mysqlEnum("result", ["pass", "fail", "observation", "not_applicable", "insufficient_evidence", "pending_clarification"]).notNull().default("pending_clarification"),
  financialExposure: decimal("financialExposure", { precision: 12, scale: 2 }),
  note: text("note"),
  testedBy: int("testedBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({ idx_auditTests_auditId: index("idx_auditTests_auditId").on(t.auditId) }));
export type AuditTest = typeof auditTests.$inferSelect;
export type InsertAuditTest = typeof auditTests.$inferInsert;

export const auditWorkpapers = mysqlTable("auditWorkpapers", {
  id: int("id").autoincrement().primaryKey(),
  auditId: int("auditId").notNull().references(() => audits.id),
  title: varchar("title", { length: 256 }),
  documentId: int("documentId").references(() => complianceDocuments.id),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type AuditWorkpaper = typeof auditWorkpapers.$inferSelect;

export const auditEvidence = mysqlTable("auditEvidence", {
  id: int("id").autoincrement().primaryKey(),
  auditTestId: int("auditTestId").notNull().references(() => auditTests.id),
  documentId: int("documentId").references(() => complianceDocuments.id),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type AuditEvidence = typeof auditEvidence.$inferSelect;

export const auditFindings = mysqlTable("auditFindings", {
  id: int("id").autoincrement().primaryKey(),
  findingNumber: varchar("findingNumber", { length: 64 }),
  auditId: int("auditId").notNull().references(() => audits.id),
  submissionId: int("submissionId").references(() => submissions.id),
  requirementVersionId: int("requirementVersionId").references(() => requirementVersions.id),
  conditionFound: text("conditionFound"),
  expectedCondition: text("expectedCondition"),
  cause: text("cause"),
  effect: text("effect"),
  risk: mysqlEnum("risk", ["low", "medium", "high", "critical"]).notNull().default("medium"),
  financialExposure: decimal("financialExposure", { precision: 12, scale: 2 }),
  repeatFinding: boolean("repeatFinding").notNull().default(false),
  responsibleOwnerId: int("responsibleOwnerId").references(() => users.id),
  state: mysqlEnum("state", ["open", "management_response", "corrective_action", "follow_up", "closed", "reopened"]).notNull().default("open"),
  dueDate: timestamp("dueDate"),
  closureApprovedBy: int("closureApprovedBy").references(() => users.id),
  reopenCount: int("reopenCount").notNull().default(0),
  recordStatus: mysqlEnum("recordStatus", ["active", "archived", "voided", "superseded"]).notNull().default("active"),
  version: int("version").notNull().default(1),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({ idx_auditFindings_auditId: index("idx_auditFindings_auditId").on(t.auditId) }));
export type AuditFinding = typeof auditFindings.$inferSelect;
export type InsertAuditFinding = typeof auditFindings.$inferInsert;

export const managementResponses = mysqlTable("managementResponses", {
  id: int("id").autoincrement().primaryKey(),
  findingId: int("findingId").notNull().references(() => auditFindings.id),
  response: text("response").notNull(),
  respondedBy: int("respondedBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ManagementResponse = typeof managementResponses.$inferSelect;

export const correctiveActions = mysqlTable("correctiveActions", {
  id: int("id").autoincrement().primaryKey(),
  findingId: int("findingId").notNull().references(() => auditFindings.id),
  immediateCorrection: text("immediateCorrection"),
  rootCauseAnalysis: text("rootCauseAnalysis"),
  correctiveAction: text("correctiveAction"),
  preventiveAction: text("preventiveAction"),
  dueDate: timestamp("dueDate"),
  completed: boolean("completed").notNull().default(false),
  completedAt: timestamp("completedAt"),
  ownerId: int("ownerId").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({ idx_correctiveActions_findingId: index("idx_correctiveActions_findingId").on(t.findingId) }));
export type CorrectiveAction = typeof correctiveActions.$inferSelect;

export const correctiveActionEvidence = mysqlTable("correctiveActionEvidence", {
  id: int("id").autoincrement().primaryKey(),
  correctiveActionId: int("correctiveActionId").notNull().references(() => correctiveActions.id),
  documentId: int("documentId").references(() => complianceDocuments.id),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type CorrectiveActionEvidence = typeof correctiveActionEvidence.$inferSelect;

export const followUpTests = mysqlTable("followUpTests", {
  id: int("id").autoincrement().primaryKey(),
  findingId: int("findingId").notNull().references(() => auditFindings.id),
  result: mysqlEnum("result", ["pass", "fail", "observation", "not_applicable", "insufficient_evidence", "pending_clarification"]).notNull().default("pending_clarification"),
  testedBy: int("testedBy").references(() => users.id),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({ idx_followUpTests_findingId: index("idx_followUpTests_findingId").on(t.findingId) }));
export type FollowUpTest = typeof followUpTests.$inferSelect;

export const auditApprovals = mysqlTable("auditApprovals", {
  id: int("id").autoincrement().primaryKey(),
  auditId: int("auditId").notNull().references(() => audits.id),
  approverId: int("approverId").references(() => users.id),
  approvalType: varchar("approvalType", { length: 64 }).notNull(),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type AuditApproval = typeof auditApprovals.$inferSelect;

// ─── Overpayments (restricted; advisory only) ────────────────────────────────
export const overpaymentCases = mysqlTable("overpaymentCases", {
  id: int("id").autoincrement().primaryKey(),
  discoveryDate: timestamp("discoveryDate"),
  discoverySource: varchar("discoverySource", { length: 256 }),
  periodStart: timestamp("periodStart"),
  periodEnd: timestamp("periodEnd"),
  preliminaryAmount: decimal("preliminaryAmount", { precision: 14, scale: 2 }),
  finalAmount: decimal("finalAmount", { precision: 14, scale: 2 }),
  calculationMethodology: text("calculationMethodology"),
  rootCause: text("rootCause"),
  legalReviewStatus: mysqlEnum("legalReviewStatus", ["not_started", "in_review", "complete"]).notNull().default("not_started"),
  complianceReviewStatus: mysqlEnum("complianceReviewStatus", ["not_started", "in_review", "complete"]).notNull().default("not_started"),
  repaymentDeadline: timestamp("repaymentDeadline"),
  selfDisclosureEvaluation: text("selfDisclosureEvaluation"),
  status: mysqlEnum("status", ["open", "under_review", "resolved", "closed"]).notNull().default("open"),
  recordStatus: mysqlEnum("recordStatus", ["active", "archived", "voided", "superseded"]).notNull().default("active"),
  version: int("version").notNull().default(1),
  createdBy: int("createdBy").references(() => users.id),
  closureApprovedBy: int("closureApprovedBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type OverpaymentCase = typeof overpaymentCases.$inferSelect;
export type InsertOverpaymentCase = typeof overpaymentCases.$inferInsert;

// ════════════════════════════════════════════════════════════════════════════
//  COMPLIANCE MODULE — Guidance & clarification library
//  Source guidance from CMS/NYSDOH/OMIG/SCNs/MCOs/contracts/attorneys, the
//  clarification workflow for unclear requirements, and attorney-client
//  privileged records (protected by a separate permission). Append-only history.
// ════════════════════════════════════════════════════════════════════════════

export const guidanceDocuments = mysqlTable("guidanceDocuments", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 256 }).notNull(),
  sourceOrganization: varchar("sourceOrganization", { length: 128 }),
  sourceType: mysqlEnum("sourceType", ["cms", "nysdoh_ohip", "omig", "scn", "mco", "contract", "attorney", "consultant", "other"]).notNull().default("other"),
  /** Attorney-client privileged / work-product guidance is gated behind a separate permission. */
  privileged: boolean("privileged").notNull().default(false),
  currentVersion: int("currentVersion").notNull().default(1),
  recordStatus: mysqlEnum("recordStatus", ["active", "archived", "voided", "superseded"]).notNull().default("active"),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({ idx_guidanceDocuments_sourceType: index("idx_guidanceDocuments_sourceType").on(t.sourceType) }));
export type GuidanceDocument = typeof guidanceDocuments.$inferSelect;
export type InsertGuidanceDocument = typeof guidanceDocuments.$inferInsert;

export const guidanceVersions = mysqlTable("guidanceVersions", {
  id: int("id").autoincrement().primaryKey(),
  guidanceDocumentId: int("guidanceDocumentId").notNull().references(() => guidanceDocuments.id),
  version: int("version").notNull(),
  summary: text("summary"),
  sourceUrl: varchar("sourceUrl", { length: 512 }),
  section: varchar("section", { length: 128 }),
  documentId: int("documentId").references(() => complianceDocuments.id),
  effectiveDate: timestamp("effectiveDate"),
  endDate: timestamp("endDate"),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({ uniq_guidanceVersions: uniqueIndex("uniq_guidanceVersions").on(t.guidanceDocumentId, t.version) }));
export type GuidanceVersion = typeof guidanceVersions.$inferSelect;

/** A precise question about an unclear requirement, driven through the workflow. */
export const clarificationRequests = mysqlTable("clarificationRequests", {
  id: int("id").autoincrement().primaryKey(),
  question: text("question").notNull(),
  facts: text("facts"),
  submissionId: int("submissionId").references(() => submissions.id),
  requirementVersionId: int("requirementVersionId").references(() => requirementVersions.id),
  controllingGuidanceId: int("controllingGuidanceId").references(() => guidanceDocuments.id),
  status: mysqlEnum("status", ["submitted", "facts_recorded", "legal_requested", "sent_to_agency", "answered", "interpreted", "closed"]).notNull().default("submitted"),
  sentToOrganization: varchar("sentToOrganization", { length: 128 }),
  privileged: boolean("privileged").notNull().default(false),
  recordStatus: mysqlEnum("recordStatus", ["active", "archived", "voided", "superseded"]).notNull().default("active"),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({ idx_clarificationRequests_status: index("idx_clarificationRequests_status").on(t.status) }));
export type ClarificationRequest = typeof clarificationRequests.$inferSelect;
export type InsertClarificationRequest = typeof clarificationRequests.$inferInsert;

export const agencyResponses = mysqlTable("agencyResponses", {
  id: int("id").autoincrement().primaryKey(),
  clarificationRequestId: int("clarificationRequestId").notNull().references(() => clarificationRequests.id),
  organization: varchar("organization", { length: 128 }),
  responseType: mysqlEnum("responseType", ["formal", "informal"]).notNull().default("informal"),
  /** The response uploaded in original form. */
  documentId: int("documentId").references(() => complianceDocuments.id),
  summary: text("summary"),
  receivedAt: timestamp("receivedAt"),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type AgencyResponse = typeof agencyResponses.$inferSelect;

/** Attorney legal review — privileged; visible only with the privilege permission. */
export const legalReviews = mysqlTable("legalReviews", {
  id: int("id").autoincrement().primaryKey(),
  clarificationRequestId: int("clarificationRequestId").references(() => clarificationRequests.id),
  requirementVersionId: int("requirementVersionId").references(() => requirementVersions.id),
  attorneyId: int("attorneyId").references(() => users.id),
  privileged: boolean("privileged").notNull().default(true),
  workProduct: boolean("workProduct").notNull().default(true),
  summary: text("summary"),
  status: mysqlEnum("status", ["requested", "in_review", "complete"]).notNull().default("requested"),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type LegalReview = typeof legalReviews.$inferSelect;

/** An approved internal interpretation of the guidance/response. */
export const internalDecisions = mysqlTable("internalDecisions", {
  id: int("id").autoincrement().primaryKey(),
  clarificationRequestId: int("clarificationRequestId").references(() => clarificationRequests.id),
  interpretation: text("interpretation").notNull(),
  basis: text("basis"),
  approvedBy: int("approvedBy").references(() => users.id),
  approvedAt: timestamp("approvedAt"),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type InternalDecision = typeof internalDecisions.$inferSelect;

/** Which requirement versions / clients / services / invoices a decision affects. */
export const policyChangeImpacts = mysqlTable("policyChangeImpacts", {
  id: int("id").autoincrement().primaryKey(),
  internalDecisionId: int("internalDecisionId").notNull().references(() => internalDecisions.id),
  requirementVersionId: int("requirementVersionId").references(() => requirementVersions.id),
  affectedSubmissionId: int("affectedSubmissionId").references(() => submissions.id),
  affectedInvoiceId: int("affectedInvoiceId").references(() => invoiceHeaders.id),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({ idx_policyChangeImpacts_decision: index("idx_policyChangeImpacts_internalDecisionId").on(t.internalDecisionId) }));
export type PolicyChangeImpact = typeof policyChangeImpacts.$inferSelect;

/** Staff training acknowledgment of a decision/guidance. */
export const trainingAcknowledgments = mysqlTable("trainingAcknowledgments", {
  id: int("id").autoincrement().primaryKey(),
  internalDecisionId: int("internalDecisionId").references(() => internalDecisions.id),
  guidanceDocumentId: int("guidanceDocumentId").references(() => guidanceDocuments.id),
  userId: int("userId").notNull().references(() => users.id),
  acknowledgedAt: timestamp("acknowledgedAt").defaultNow().notNull(),
}, (t) => ({ uniq_trainingAcknowledgments: uniqueIndex("uniq_trainingAcknowledgments").on(t.internalDecisionId, t.userId) }));
export type TrainingAcknowledgment = typeof trainingAcknowledgments.$inferSelect;

// ─── Session management (server-side session records) ────────────────────────
/**
 * A durable record of every staff login session, keyed by the opaque session id
 * stored in the `admin_session_id` cookie. Enables server-side revocation, a
 * device/session list, idle + absolute timeout enforcement, reauth stamping for
 * sensitive actions, and forced logout on role/password/MFA change. Enforced
 * only when COMPLIANCE_SESSIONS is enabled (else purely observational / off).
 */
export const userSessions = mysqlTable("userSessions", {
  id: int("id").autoincrement().primaryKey(),
  /** Opaque id shared with the client via the admin_session_id cookie. */
  sessionId: varchar("sessionId", { length: 64 }).notNull(),
  userId: int("userId").notNull().references(() => users.id),
  /** Snapshots taken at login — used to detect drift and for display. */
  openId: varchar("openId", { length: 128 }),
  role: varchar("role", { length: 64 }),
  ip: varchar("ip", { length: 64 }),
  userAgent: varchar("userAgent", { length: 512 }),
  mfaVerified: boolean("mfaVerified").notNull().default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
  /** Absolute expiry (login + max lifetime). */
  expiresAt: timestamp("expiresAt").notNull(),
  /** Last successful re-authentication (for sensitive-action reauth windows). */
  reauthAt: timestamp("reauthAt"),
  revokedAt: timestamp("revokedAt"),
  revokedBy: int("revokedBy").references(() => users.id),
  revokeReason: varchar("revokeReason", { length: 128 }),
}, (t) => ({
  uniq_userSessions_sessionId: uniqueIndex("uniq_userSessions_sessionId").on(t.sessionId),
  idx_userSessions_userId: index("idx_userSessions_userId").on(t.userId),
  idx_userSessions_expiresAt: index("idx_userSessions_expiresAt").on(t.expiresAt),
}));
export type UserSession = typeof userSessions.$inferSelect;

// ─── Compliance notifications / escalation ───────────────────────────────────
/**
 * In-app notifications for compliance events (break-glass activation, new
 * findings, escalations). Addressed to a specific recipient user. Purely
 * additive; surfaced in the compliance UI and never blocks any workflow.
 */
export const complianceNotifications = mysqlTable("complianceNotifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  category: varchar("category", { length: 64 }).notNull(),
  severity: varchar("severity", { length: 16 }).notNull().default("info"), // info | warning | critical
  title: varchar("title", { length: 256 }).notNull(),
  body: text("body"),
  relatedRecordType: varchar("relatedRecordType", { length: 64 }),
  relatedRecordId: varchar("relatedRecordId", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  readAt: timestamp("readAt"),
}, (t) => ({
  idx_complianceNotifications_userId: index("idx_complianceNotifications_userId").on(t.userId),
  idx_complianceNotifications_readAt: index("idx_complianceNotifications_readAt").on(t.readAt),
}));
export type ComplianceNotification = typeof complianceNotifications.$inferSelect;
