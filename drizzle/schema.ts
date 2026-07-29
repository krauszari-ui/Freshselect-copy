import { boolean, index, int, json, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

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
