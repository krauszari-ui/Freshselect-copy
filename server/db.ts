import { and, count, desc, eq, like, ne, notInArray, or, sql, isNull, isNotNull, asc, gte, lte, inArray } from "drizzle-orm";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import {
  InsertSubmission, InsertUser, Submission, submissions, users,
  tasks, InsertTask, Task,
  caseNotes, InsertCaseNote, CaseNote,
  documents, InsertDocument, Document,
  services, InsertService, Service,
  referralLinks, InsertReferralLink, ReferralLink,
  stageHistory, InsertStageHistory,
  notifications, InsertNotification, Notification,
  notificationReads,
  auditLogs,
  emailBlasts,
  clientMessages, ClientMessage, InsertClientMessage,
  messageReads,
  organizations, Organization, InsertOrganization,
  orgGroupMessages, OrgGroupMessage, InsertOrgGroupMessage,
  orgMessageReads, OrgMessageRead, InsertOrgMessageRead,
} from "../drizzle/schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _db: MySql2Database<Record<string, unknown>> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const url = new URL(process.env.DATABASE_URL);
      // TiDB Cloud / PlanetScale require SSL
      const sslConfig = url.hostname.includes("localhost") || url.hostname.includes("127.0.0.1")
        ? undefined
        : { rejectUnauthorized: true };
      // Explicit pool: 2-5 connections is ideal for serverless (Vercel) where
      // each function invocation is short-lived. Keeps warm connections without
      // exhausting the DB's connection limit.
      const pool = mysql.createPool({
        uri: url.toString(),
        ssl: sslConfig,
        connectionLimit: 20,
        waitForConnections: true,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000,
        idleTimeout: 60_000,
      });
      _db = drizzle(pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) { console.error("[Database] Failed to upsert user:", error); throw error; }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Submission / Client helpers ──────────────────────────────────────────

export async function createSubmission(data: InsertSubmission): Promise<void> {
  const db = await getDb();
  if (!db) {
    const reason = process.env.DATABASE_URL ? "connection failed" : "DATABASE_URL env var is not set";
    console.error(`[Database] createSubmission failed: ${reason}`);
    throw new Error(`Database not available: ${reason}`);
  }
  await db.insert(submissions).values(data);
}

export async function getSubmissionByRef(referenceNumber: string): Promise<Submission | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(submissions).where(eq(submissions.referenceNumber, referenceNumber)).limit(1);
  return result[0];
}

export async function getSubmissionById(id: number): Promise<Submission | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(submissions).where(eq(submissions.id, id)).limit(1);
  return result[0];
}
export async function getSubmissionByMedicaidId(medicaidId: string): Promise<Submission | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(submissions).where(eq(submissions.medicaidId, medicaidId)).orderBy(desc(submissions.createdAt)).limit(1);
  return result[0];
}

export interface ListSubmissionsOptions {
  search?: string;
  status?: Submission["status"] | "all";
  stage?: string;
  excludeStage?: string;
  excludeStages?: string[];
  supermarket?: string;
  neighborhood?: string;
  program?: string;
  newApplicant?: string;
  language?: string;
  borough?: string;
  assignedTo?: number;
  intakeRep?: number;
  referralSource?: string;
  assessmentCompleted?: boolean;
  zipcode?: string;
  priority?: string;
  assessorId?: number;
  /** If true, only return notInterested clients. If false, exclude notInterested clients. If undefined, return all. */
  notInterested?: boolean;
  /** Filter to clients belonging to a specific org (Option A: referredOrgId=orgId OR assessorId IN org staff) */
  orgId?: number;
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export async function listSubmissions(opts: ListSubmissionsOptions = {}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { search, status, stage, excludeStage, excludeStages, supermarket, neighborhood, program, newApplicant, language, borough, assignedTo, intakeRep, referralSource, assessmentCompleted, zipcode, priority, assessorId, notInterested, orgId, sortDir = "desc", page = 1, pageSize = 20 } = opts;
  const offset = (page - 1) * pageSize;
  const conditions = [];

  if (search && search.trim()) {
    const q = `%${search.trim()}%`;
    conditions.push(or(
      like(submissions.firstName, q), like(submissions.lastName, q),
      like(submissions.email, q), like(submissions.medicaidId, q),
      like(submissions.referenceNumber, q), like(submissions.cellPhone, q)
    ));
  }
  if (status && status !== "all") conditions.push(eq(submissions.status, status));
  if (stage && stage !== "all") conditions.push(eq(submissions.stage, stage as Submission["stage"]));
  if (excludeStage && excludeStage !== "all") conditions.push(ne(submissions.stage, excludeStage as Submission["stage"]));
  if (excludeStages && excludeStages.length > 0) conditions.push(notInArray(submissions.stage, excludeStages as Submission["stage"][]));
  if (supermarket && supermarket !== "all") conditions.push(eq(submissions.supermarket, supermarket));
  if (neighborhood && neighborhood !== "all") conditions.push(eq(submissions.neighborhood, neighborhood));
  if (program && program !== "all") conditions.push(eq(submissions.program, program));
  if (newApplicant && newApplicant !== "all") conditions.push(eq(submissions.newApplicant, newApplicant));
  if (language && language !== "all") conditions.push(eq(submissions.language, language));
  if (borough && borough !== "all") conditions.push(eq(submissions.borough, borough));
  if (assignedTo) conditions.push(eq(submissions.assignedTo, assignedTo));
  if (intakeRep) conditions.push(eq(submissions.intakeRep, intakeRep));
  if (referralSource && referralSource !== "all") conditions.push(eq(submissions.referralSource, referralSource));
  if (assessmentCompleted === true) conditions.push(sql`${submissions.assessmentCompletedAt} IS NOT NULL`);
  else if (assessmentCompleted === false) conditions.push(sql`${submissions.assessmentCompletedAt} IS NULL`);
  if (zipcode && zipcode !== "all") conditions.push(eq(submissions.zipcode, zipcode));
  if (priority && priority !== "all") conditions.push(eq(submissions.priority, priority as Submission["priority"]));
  if (assessorId) conditions.push(eq(submissions.assessorId, assessorId));
  // Org filter (Option A): clients where referredOrgId=orgId OR assessorId is any active member of that org
  if (orgId) {
    const orgStaff = await db.select({ id: users.id }).from(users).where(and(eq(users.orgId, orgId), eq(users.isActive, 1)));
    const orgStaffIds = orgStaff.map((u) => u.id);
    const orgCondition = orgStaffIds.length > 0
      ? or(eq(submissions.referredOrgId, orgId), inArray(submissions.assessorId, orgStaffIds)) as any
      : eq(submissions.referredOrgId, orgId) as any;
    conditions.push(orgCondition);
  }
  if (notInterested === true) conditions.push(eq(submissions.notInterested, true));
  else if (notInterested === false) conditions.push(eq(submissions.notInterested, false));
  else conditions.push(eq(submissions.notInterested, false)); // default: exclude not-interested

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [rows, countResult, membersResult] = await Promise.all([
    db.select({
      id: submissions.id, firstName: submissions.firstName, lastName: submissions.lastName,
      email: submissions.email, cellPhone: submissions.cellPhone, medicaidId: submissions.medicaidId,
      referenceNumber: submissions.referenceNumber, status: submissions.status, stage: submissions.stage,
      supermarket: submissions.supermarket, neighborhood: submissions.neighborhood, borough: submissions.borough,
      zipcode: submissions.zipcode, newApplicant: submissions.newApplicant, program: submissions.program,
      language: submissions.language, additionalMembersCount: submissions.additionalMembersCount,
      assignedTo: submissions.assignedTo, intakeRep: submissions.intakeRep, referralSource: submissions.referralSource,
      assessorId: submissions.assessorId,
      createdAt: submissions.createdAt, updatedAt: submissions.updatedAt,
      assessmentCompletedAt: submissions.assessmentCompletedAt,
      transferAgencyName: submissions.transferAgencyName,
      priority: submissions.priority,
      approvedBy: submissions.approvedBy,
      rejectedBy: submissions.rejectedBy,
      missingInfoNote: submissions.missingInfoNote,
      notEligibleReason: submissions.notEligibleReason,
      notInterested: submissions.notInterested,
      notInterestedAt: submissions.notInterestedAt,
      notInterestedBy: submissions.notInterestedBy,
      stageUpdatedAt: submissions.stageUpdatedAt,
    }).from(submissions).where(where).orderBy(sortDir === "asc" ? asc(submissions.createdAt) : desc(submissions.createdAt)).limit(pageSize).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(submissions).where(where),
    db.select({ totalAdditional: sql<number>`COALESCE(SUM(additionalMembersCount), 0)`, totalClients: sql<number>`count(*)` }).from(submissions).where(where),
  ]);
  const total = Number(countResult[0]?.count ?? 0);
  const totalAdditional = Number(membersResult[0]?.totalAdditional ?? 0);
  const totalClients = Number(membersResult[0]?.totalClients ?? 0);
  // totalMembers = each client counts as 1 (primary) + their additional household members
  const totalMembers = totalClients + totalAdditional;
  return { rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize), totalMembers };
}

export async function getAllSubmissions(opts: { status?: string; supermarket?: string; stage?: string; neighborhood?: string; language?: string; borough?: string; search?: string; assignedTo?: number; intakeRep?: number; referralSource?: string } = {}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const conditions = [];
  if (opts.status && opts.status !== "all") conditions.push(eq(submissions.status, opts.status as Submission["status"]));
  if (opts.supermarket && opts.supermarket !== "all") conditions.push(eq(submissions.supermarket, opts.supermarket));
  if (opts.stage && opts.stage !== "all") conditions.push(eq(submissions.stage, opts.stage as Submission["stage"]));
  if (opts.language && opts.language !== "all") conditions.push(eq(submissions.language, opts.language));
  if (opts.borough && opts.borough !== "all") conditions.push(eq(submissions.borough, opts.borough));
  if (opts.neighborhood && opts.neighborhood !== "all") conditions.push(eq(submissions.neighborhood, opts.neighborhood));
  if (opts.assignedTo) conditions.push(eq(submissions.assignedTo, opts.assignedTo));
  if (opts.intakeRep) conditions.push(eq(submissions.intakeRep, opts.intakeRep));
  if (opts.referralSource && opts.referralSource !== "all") conditions.push(eq(submissions.referralSource, opts.referralSource));
  if (opts.search) {
    const term = `%${opts.search}%`;
    conditions.push(or(like(submissions.firstName, term), like(submissions.lastName, term), like(submissions.medicaidId, term)) as any);
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = await db.select().from(submissions).where(where).orderBy(desc(submissions.createdAt));
  return rows;
}

// Server-side cache for filterCounts (30 second TTL)
let _filterCountsCache: { data: Awaited<ReturnType<typeof _getFilterCountsRaw>>; expiresAt: number } | null = null;

export async function _getFilterCountsRaw() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Single query using conditional aggregation — one table scan instead of 8
  const result = await db.execute(sql`
    SELECT
      stage                                                      AS dim,
      'stage'                                                    AS category,
      COUNT(*)                                                   AS cnt
    FROM submissions GROUP BY stage
    UNION ALL
    SELECT neighborhood, 'neighborhood', COUNT(*)
    FROM submissions WHERE neighborhood IS NOT NULL AND neighborhood != '' GROUP BY neighborhood
    UNION ALL
    SELECT supermarket, 'vendor', COUNT(*)
    FROM submissions WHERE supermarket IS NOT NULL AND supermarket != '' GROUP BY supermarket
    UNION ALL
    SELECT program, 'program', COUNT(*)
    FROM submissions WHERE program IS NOT NULL AND program != '' GROUP BY program
    UNION ALL
    SELECT language, 'language', COUNT(*)
    FROM submissions WHERE language IS NOT NULL AND language != '' GROUP BY language
    UNION ALL
    SELECT borough, 'borough', COUNT(*)
    FROM submissions WHERE borough IS NOT NULL AND borough != '' GROUP BY borough
    UNION ALL
    SELECT newApplicant, 'applicantType', COUNT(*)
    FROM submissions WHERE newApplicant IS NOT NULL AND newApplicant != '' GROUP BY newApplicant
    UNION ALL
    SELECT zipcode, 'zipcode', COUNT(*)
    FROM submissions WHERE zipcode IS NOT NULL AND zipcode != '' GROUP BY zipcode
  `);
  const out: Record<string, Record<string, number>> = {
    stage: {}, neighborhood: {}, vendor: {}, program: {}, language: {}, borough: {}, applicantType: {}, zipcode: {},
  };
  // Drizzle mysql2 execute() returns [rows, fields] — extract rows from index 0
  const rows = (Array.isArray((result as any)[0]) ? (result as any)[0] : result) as any[];
  for (const row of rows) {
    const cat = row.category as string;
    const dim = row.dim as string;
    if (cat && dim && out[cat] !== undefined) out[cat][dim] = Number(row.cnt);
  }
  return out;
}

/** Reset the filter counts cache — for testing only */
export function _resetFilterCountsCache() { _filterCountsCache = null; }

// Returns per-value counts for all filterable dimensions — cached 30s to reduce DB load
export async function getFilterCounts() {
  const now = Date.now();
  if (_filterCountsCache && _filterCountsCache.expiresAt > now) return _filterCountsCache.data;
  const data = await _getFilterCountsRaw();
  _filterCountsCache = { data, expiresAt: now + 30_000 };
  return data;
}

export async function updateSubmissionStatus(id: number, status: Submission["status"], adminNotes?: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateData: Partial<InsertSubmission> = { status };
  if (adminNotes !== undefined) updateData.adminNotes = adminNotes;
  await db.update(submissions).set(updateData).where(eq(submissions.id, id));
}

export async function updateSubmissionStage(id: number, stage: Submission["stage"]): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(submissions).set({ stage }).where(eq(submissions.id, id));
}

export async function updateSubmissionAssignment(id: number, assignedTo: number | null, intakeRep?: number | null): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const data: Record<string, unknown> = { assignedTo };
  if (intakeRep !== undefined) data.intakeRep = intakeRep;
  await db.update(submissions).set(data).where(eq(submissions.id, id));
}

export async function updateSubmissionEmailSent(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(submissions).set({ emailSentAt: new Date() }).where(eq(submissions.id, id));
}

export async function getSubmissionStats() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [statusResult, stageResult, membersResult] = await Promise.all([
    db.select({ status: submissions.status, count: sql<number>`count(*)` }).from(submissions).groupBy(submissions.status),
    db.select({ stage: submissions.stage, count: sql<number>`count(*)` }).from(submissions).groupBy(submissions.stage),
    db.select({ totalAdditional: sql<number>`COALESCE(SUM(additionalMembersCount), 0)`, totalApplications: sql<number>`count(*)` }).from(submissions),
  ]);
  const stats: Record<string, number> = { total: 0, new: 0, in_review: 0, approved: 0, rejected: 0, on_hold: 0 };
  for (const row of statusResult) { stats[row.status] = Number(row.count); stats.total += Number(row.count); }
  const stages: Record<string, number> = {};
  for (const row of stageResult) { stages[row.stage] = Number(row.count); }
  // Total members = sum of all additionalMembersCount + 1 per application (primary applicant)
  const totalAdditional = Number(membersResult[0]?.totalAdditional ?? 0);
  const totalApplications = Number(membersResult[0]?.totalApplications ?? 0);
  const totalMembers = totalAdditional + totalApplications;
  return { ...stats, stages, totalMembers };
}

export async function getRecentSubmissions(days: number = 7, limit: number = 10) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  // Explicit column selection — avoids returning formData (JSON object) to the frontend
  // which would cause React error #300 if accidentally rendered as JSX text
  return db.select({
    id: submissions.id,
    firstName: submissions.firstName,
    lastName: submissions.lastName,
    medicaidId: submissions.medicaidId,
    stage: submissions.stage,
    status: submissions.status,
    createdAt: submissions.createdAt,
    assignedTo: submissions.assignedTo,
    intakeRep: submissions.intakeRep,
    referralSource: submissions.referralSource,
    priority: submissions.priority,
    language: submissions.language,
    borough: submissions.borough,
    neighborhood: submissions.neighborhood,
    newApplicant: submissions.newApplicant,
    transferAgencyName: submissions.transferAgencyName,
    stageUpdatedAt: submissions.stageUpdatedAt,
  }).from(submissions).where(gte(submissions.createdAt, since)).orderBy(desc(submissions.createdAt)).limit(limit);
}

export async function getRecentlyUpdated(days: number = 7, limit: number = 10) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return db.select().from(submissions).where(gte(submissions.updatedAt, since)).orderBy(desc(submissions.updatedAt)).limit(limit);
}

export async function getAddedCount(days: number = 7) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const result = await db.select({ count: sql<number>`count(*)` }).from(submissions).where(gte(submissions.createdAt, since));
  return Number(result[0]?.count ?? 0);
}

// ─── Task helpers ─────────────────────────────────────────────────────────

export async function createTask(data: InsertTask): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(tasks).values(data);
  return Number(result[0].insertId);
}

export async function getTasksBySubmission(submissionId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(tasks).where(eq(tasks.submissionId, submissionId)).orderBy(desc(tasks.createdAt));
}

/** Get tasks for a submission with assignee display name joined from users table. */
export async function getTasksBySubmissionWithDetails(submissionId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.select().from(tasks).where(eq(tasks.submissionId, submissionId)).orderBy(desc(tasks.createdAt));
  // Fetch assignee names in one query
  const assigneeIds = Array.from(new Set(rows.map(r => r.assignedTo).filter(Boolean))) as number[];
  let nameMap: Record<number, string> = {};
  if (assigneeIds.length > 0) {
    const staffRows = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, assigneeIds));
    nameMap = Object.fromEntries(staffRows.map(r => [r.id, r.name ?? ""])) as Record<number, string>;
  }
  return rows.map(r => ({ ...r, assigneeName: r.assignedTo ? (nameMap[r.assignedTo] ?? null) : null }));
}

export interface ListTasksOptions {
  search?: string;
  status?: "open" | "completed" | "verified" | "all";
  area?: "intake_rep" | "assigned_worker" | "all";
  assignedTo?: number;
  completedFrom?: string;
  completedTo?: string;
  page?: number;
  pageSize?: number;
}

export async function listTasks(opts: ListTasksOptions = {}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { search, status, area, assignedTo, completedFrom, completedTo, page = 1, pageSize = 20 } = opts;
  const offset = (page - 1) * pageSize;
  const conditions = [];
  if (search && search.trim()) conditions.push(like(tasks.description, `%${search.trim()}%`));
  if (status && status !== "all") conditions.push(eq(tasks.status, status));
  if (area && area !== "all") conditions.push(eq(tasks.area, area));
  if (assignedTo) conditions.push(eq(tasks.assignedTo, assignedTo));
  if (completedFrom) conditions.push(gte(tasks.completedAt, new Date(completedFrom)));
  if (completedTo) { const to = new Date(completedTo); to.setHours(23, 59, 59, 999); conditions.push(lte(tasks.completedAt, to)); }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [rows, countResult] = await Promise.all([
    db.select().from(tasks).where(where).orderBy(desc(tasks.createdAt)).limit(pageSize).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(tasks).where(where),
  ]);
  return { rows, total: Number(countResult[0]?.count ?? 0), page, pageSize };
}

export async function getTaskStats() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select({ status: tasks.status, count: sql<number>`count(*)` }).from(tasks).groupBy(tasks.status);
  const stats: Record<string, number> = { open: 0, completed: 0, verified: 0, total: 0 };
  for (const row of result) { stats[row.status] = Number(row.count); stats.total += Number(row.count); }
  return stats;
}

export async function updateTaskStatus(id: number, status: Task["status"]): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const data: Record<string, unknown> = { status };
  if (status === "completed") data.completedAt = new Date();
  await db.update(tasks).set(data).where(eq(tasks.id, id));
}

// ─── Case Notes helpers ───────────────────────────────────────────────────

export async function createCaseNote(data: InsertCaseNote): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(caseNotes).values(data);
  return Number(result[0].insertId);
}

export async function getCaseNotesBySubmission(submissionId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(caseNotes).where(eq(caseNotes.submissionId, submissionId)).orderBy(desc(caseNotes.createdAt));
}

// ─── Document helpers ─────────────────────────────────────────────────────

export async function createDocument(data: InsertDocument): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(documents).values(data);
  return Number(result[0].insertId);
}

export async function getDocumentsBySubmission(submissionId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(documents).where(eq(documents.submissionId, submissionId)).orderBy(desc(documents.createdAt));
}

export async function getLibraryDocuments(category?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const conditions = [isNull(documents.submissionId)];
  if (category && category !== "all") conditions.push(eq(documents.category, category as Document["category"]));
  return db.select().from(documents).where(and(...conditions)).orderBy(desc(documents.createdAt));
}

export async function deleteDocument(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(documents).where(eq(documents.id, id));
}

// ─── Service helpers ──────────────────────────────────────────────────────

export async function createService(data: InsertService): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(services).values(data);
  return Number(result[0].insertId);
}

export async function getServicesBySubmission(submissionId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(services).where(eq(services.submissionId, submissionId)).orderBy(desc(services.createdAt));
}

export async function updateServiceStatus(id: number, status: Service["status"]): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(services).set({ status }).where(eq(services.id, id));
}

// ─── Worker management helpers ────────────────────────────────────────────

export interface WorkerPermissions { canView: boolean; canEdit: boolean; canExport: boolean; canDelete: boolean; canMarkNotInterested?: boolean; showReferralLinks?: boolean; }

// Safe user columns — never include passwordHash or passwordResetToken in list responses
const SAFE_USER_COLUMNS = {
  id: users.id,
  openId: users.openId,
  name: users.name,
  email: users.email,
  loginMethod: users.loginMethod,
  role: users.role,
  permissions: users.permissions,
  isActive: users.isActive,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
  lastSignedIn: users.lastSignedIn,
} as const;

export async function listWorkers() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select(SAFE_USER_COLUMNS).from(users).where(eq(users.role, "worker")).orderBy(desc(users.createdAt));
}

export async function listStaffUsers() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // SAFE_USER_COLUMNS projection — never exposes hash
  // Only return active (non-deactivated) staff for @mention dropdown
  const staffRoleFilter = or(eq(users.role, "worker"), eq(users.role, "admin"), eq(users.role, "super_admin"), eq(users.role, "viewer"), eq(users.role, "assessor"));
  const rows = await db.select(SAFE_USER_COLUMNS).from(users).where(
    and(staffRoleFilter, eq(users.isActive, 1))
  ).orderBy(desc(users.createdAt));
  // Fetch hasPassword separately to avoid exposing the hash
  const hashRows = await db.select({ id: users.id, passwordHash: users.passwordHash }).from(users).where(
    and(staffRoleFilter, eq(users.isActive, 1))
  );
  const hashMap = new Map(hashRows.map(r => [r.id, !!r.passwordHash]));
  return rows.map(row => ({ ...row, hasPassword: hashMap.get(row.id) ?? false }));
}

export async function createStaffUser(data: {
  email: string;
  name: string;
  passwordHash: string | null;
  role: "admin" | "worker" | "viewer" | "assessor";
  permissions?: WorkerPermissions;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Generate a unique openId for internal staff accounts
  const openId = `staff_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const [result] = await db.insert(users).values({
    openId,
    email: data.email,
    name: data.name,
    passwordHash: data.passwordHash,
    role: data.role,
    loginMethod: "password",
    permissions: (data.permissions ?? { canView: true, canEdit: false, canExport: false, canDelete: false }) as unknown as null,
    isActive: 1,
  });
  return (result as any).insertId;
}

export async function setPasswordResetToken(userId: number, token: string, expires: Date): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ passwordResetToken: token, passwordResetExpires: expires }).where(eq(users.id, userId));
}

export async function getUserByResetToken(token: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.select().from(users).where(eq(users.passwordResetToken, token)).limit(1);
  return rows[0] ?? null;
}

export async function clearPasswordResetToken(userId: number, newPasswordHash: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ passwordHash: newPasswordHash, passwordResetToken: null, passwordResetExpires: null }).where(eq(users.id, userId));
}

export async function updateWorkerPermissions(userId: number, permissions: WorkerPermissions): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ permissions: permissions as unknown as null }).where(eq(users.id, userId));
}

export async function toggleWorkerActive(userId: number, isActive: boolean): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ isActive: isActive ? 1 : 0 }).where(eq(users.id, userId));
}

/** Increment failed login counter and optionally set a lockout expiry */
export async function recordFailedLogin(userId: number): Promise<{ attempts: number; lockedUntil: Date | null }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Atomically increment and fetch
  await db.update(users)
    .set({ failedLoginAttempts: sql`failedLoginAttempts + 1` })
    .where(eq(users.id, userId));
  const [row] = await db.select({ failedLoginAttempts: users.failedLoginAttempts, lockedUntil: users.lockedUntil })
    .from(users).where(eq(users.id, userId)).limit(1);
  const attempts = row?.failedLoginAttempts ?? 1;
  let lockedUntil: Date | null = row?.lockedUntil ?? null;
  // 10+ attempts → lock for 1 hour; 15+ → lock for 24 hours (require reset)
  if (attempts >= 15) {
    lockedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db.update(users).set({ lockedUntil }).where(eq(users.id, userId));
  } else if (attempts >= 10) {
    lockedUntil = new Date(Date.now() + 60 * 60 * 1000);
    await db.update(users).set({ lockedUntil }).where(eq(users.id, userId));
  }
  return { attempts, lockedUntil };
}

/** Clear failed login counter and lockout after a successful login */
export async function clearFailedLogins(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ failedLoginAttempts: 0, lockedUntil: null }).where(eq(users.id, userId));
}

export async function setUserRole(userId: number, role: "user" | "admin" | "worker" | "super_admin" | "viewer" | "assessor"): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

export async function listAllUsers() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select(SAFE_USER_COLUMNS).from(users).orderBy(desc(users.createdAt));
}

// ─── Submission update/delete helpers ────────────────────────────────────

export async function updateSubmissionFields(id: number, data: Partial<InsertSubmission>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(submissions).set(data).where(eq(submissions.id, id));
}

export async function updateSubmissionPriority(id: number, priority: Submission["priority"]): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(submissions).set({ priority }).where(eq(submissions.id, id));
}

export async function deleteSubmission(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Delete related records first
  await db.delete(tasks).where(eq(tasks.submissionId, id));
  await db.delete(caseNotes).where(eq(caseNotes.submissionId, id));
  await db.delete(documents).where(eq(documents.submissionId, id));
  await db.delete(services).where(eq(services.submissionId, id));
  await db.delete(submissions).where(eq(submissions.id, id));
}

export async function bulkDeleteSubmissions(ids: number[]): Promise<void> {
  if (!ids.length) return;
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Delete related records for all ids first
  for (const id of ids) {
    await db.delete(tasks).where(eq(tasks.submissionId, id));
    await db.delete(caseNotes).where(eq(caseNotes.submissionId, id));
    await db.delete(documents).where(eq(documents.submissionId, id));
    await db.delete(services).where(eq(services.submissionId, id));
  }
  // Delete all submissions in one query using IN clause
  await db.delete(submissions).where(sql`id IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`);
}

// ─── Referral Link helpers ───────────────────────────────────────────────

export async function createReferralLink(data: InsertReferralLink): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(referralLinks).values(data);
  return Number(result[0].insertId);
}

export async function listReferralLinks() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.select().from(referralLinks).orderBy(desc(referralLinks.createdAt));
  // SECURITY: never send bcrypt hashes to the client — strip before returning
  return rows.map(({ passwordHash: _ph, ...safe }) => safe);
}

export async function getReferralLinkByCode(code: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(referralLinks).where(eq(referralLinks.code, code)).limit(1);
  return result[0];
}

export async function updateReferralLink(id: number, data: Partial<InsertReferralLink>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(referralLinks).set(data).where(eq(referralLinks.id, id));
}

export async function deleteReferralLink(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(referralLinks).where(eq(referralLinks.id, id));
}

export async function incrementReferralUsage(code: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(referralLinks).set({ usageCount: sql`usageCount + 1` }).where(eq(referralLinks.code, code));
}

export async function getReferralLinkByEmail(email: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(referralLinks).where(eq(referralLinks.email, email)).limit(1);
  return result[0];
}

export async function getClientsByReferralCode(code: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(submissions).where(eq(submissions.referralSource, code)).orderBy(desc(submissions.createdAt));
}

export async function getReferralStats() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [links, membersResult] = await Promise.all([
    db.select().from(referralLinks).orderBy(desc(referralLinks.usageCount)),
    db.select({
      totalAdditional: sql<number>`COALESCE(SUM(additionalMembersCount), 0)`,
      totalPrimary: sql<number>`count(*)`
    }).from(submissions).where(sql`referralSource IS NOT NULL AND referralSource != ''`),
  ]);
  const totalReferrals = links.reduce((sum, l) => sum + l.usageCount, 0);
  const totalAdditional = Number(membersResult[0]?.totalAdditional ?? 0);
  const totalPrimary = Number(membersResult[0]?.totalPrimary ?? 0);
  const totalMembers = totalAdditional + totalPrimary;
  return { links, totalReferrals, totalLinks: links.length, totalMembers };
}

// ─── Referrer Messages ────────────────────────────────────────────────────────
import { referrerMessages, InsertReferrerMessage } from "../drizzle/schema";

export async function createReferrerMessage(data: InsertReferrerMessage): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(referrerMessages).values(data);
  return (result[0] as any).insertId as number;
}

export async function listReferrerMessages(referralLinkId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db
    .select({
      id: referrerMessages.id,
      referralLinkId: referrerMessages.referralLinkId,
      submissionId: referrerMessages.submissionId,
      senderId: referrerMessages.senderId,
      message: referrerMessages.message,
      direction: referrerMessages.direction,
      attachmentUrl: referrerMessages.attachmentUrl,
      createdAt: referrerMessages.createdAt,
      readAt: referrerMessages.readAt,
      clientFirstName: submissions.firstName,
      clientLastName: submissions.lastName,
    })
    .from(referrerMessages)
    .leftJoin(submissions, eq(referrerMessages.submissionId, submissions.id))
    .where(eq(referrerMessages.referralLinkId, referralLinkId))
    .orderBy(asc(referrerMessages.createdAt));
}
/** Staff-only: delete any referrer message by ID (no ownership check — caller must be staff). */
export async function deleteReferrerMessageById(messageId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(referrerMessages).where(eq(referrerMessages.id, messageId));
}
/** Referrer portal: delete a message only if it belongs to the given referral link. */
export async function deleteReferrerMessage(messageId: number, referralLinkId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Enforce ownership: only delete if the message belongs to the given referral link.
  // Without this check, any referrer with a valid code could delete another referrer's messages.
  await db.delete(referrerMessages).where(
    and(eq(referrerMessages.id, messageId), eq(referrerMessages.referralLinkId, referralLinkId))
  );
}
export async function markAllReferrerMessagesRead(referralLinkId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(referrerMessages)
    .set({ readAt: new Date() })
    .where(and(eq(referrerMessages.referralLinkId, referralLinkId), isNull(referrerMessages.readAt)));
}

export async function markReferrerMessageRead(messageId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(referrerMessages).set({ readAt: new Date() }).where(eq(referrerMessages.id, messageId));
}

export async function getUnreadCountByReferrer(): Promise<Record<number, number>> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db
    .select({
      referralLinkId: referrerMessages.referralLinkId,
      count: sql<number>`count(*)`,
    })
    .from(referrerMessages)
    .where(isNull(referrerMessages.readAt))
    .groupBy(referrerMessages.referralLinkId);
  const result: Record<number, number> = {};
  for (const row of rows) {
    result[row.referralLinkId] = Number(row.count);
  }
  return result;
}

export async function listReferrerMessagesBySubmission(submissionId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select({
    id: referrerMessages.id,
    referralLinkId: referrerMessages.referralLinkId,
    submissionId: referrerMessages.submissionId,
    senderId: referrerMessages.senderId,
    message: referrerMessages.message,
    direction: referrerMessages.direction,
    attachmentUrl: referrerMessages.attachmentUrl,
    createdAt: referrerMessages.createdAt,
    readAt: referrerMessages.readAt,
  }).from(referrerMessages)
    .where(eq(referrerMessages.submissionId, submissionId))
    .orderBy(asc(referrerMessages.createdAt));
}


// ─── Client Email Thread ──────────────────────────────────────────────────────
import { clientEmails, InsertClientEmail } from "../drizzle/schema";

export async function createClientEmail(data: InsertClientEmail): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(clientEmails).values(data);
  return (result[0] as any).insertId as number;
}

export async function listClientEmails(submissionId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(clientEmails)
    .where(eq(clientEmails.submissionId, submissionId))
    .orderBy(asc(clientEmails.sentAt));
}

export async function getClientEmailByResendId(resendMessageId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(clientEmails)
    .where(eq(clientEmails.resendMessageId, resendMessageId))
    .limit(1);
  return rows[0];
}

export async function getClientEmailBySubmissionAndSubject(submissionId: number, subject: string) {
  const db = await getDb();
  if (!db) return undefined;
  // Find the most recent outbound email with this subject for threading
  const rows = await db.select().from(clientEmails)
    .where(and(eq(clientEmails.submissionId, submissionId), eq(clientEmails.direction, "outbound")))
    .orderBy(desc(clientEmails.sentAt))
    .limit(1);
  return rows[0];
}

export async function listClientEmailsById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.select().from(clientEmails).where(eq(clientEmails.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function deleteClientEmailById(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(clientEmails).where(eq(clientEmails.id, id));
}

// ─── Stage History ────────────────────────────────────────────────────────────

export async function createStageHistoryEntry(data: InsertStageHistory): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(stageHistory).values(data);
}

export async function getStageHistoryBySubmission(submissionId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(stageHistory)
    .where(eq(stageHistory.submissionId, submissionId))
    .orderBy(asc(stageHistory.createdAt));
}

// ─── Assessment Report ────────────────────────────────────────────────────────

export async function getAssessmentReport() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.execute(sql`
    SELECT
      stage,
      supermarket                                                     AS vendor,
      neighborhood,
      COUNT(*)                                                        AS total,
      SUM(CASE WHEN assessmentCompletedAt IS NOT NULL THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN assessmentCompletedAt IS NULL THEN 1 ELSE 0 END)     AS pending
    FROM submissions
    GROUP BY stage, supermarket, neighborhood
    ORDER BY stage, supermarket, neighborhood
  `);

  // Aggregate totals
  const byStage: Record<string, { total: number; completed: number; pending: number }> = {};
  const byVendor: Record<string, { total: number; completed: number; pending: number }> = {};
  const byNeighborhood: Record<string, { total: number; completed: number; pending: number }> = {};
  let grandTotal = 0, grandCompleted = 0, grandPending = 0;

  // Drizzle mysql2 execute() returns [rows, fields] — extract rows from index 0
  const rows = (Array.isArray((result as any)[0]) ? (result as any)[0] : result) as any[];
  for (const row of rows) {
    const total = Number(row.total);
    const completed = Number(row.completed);
    const pending = Number(row.pending);
    const stage = row.stage as string;
    const vendor = row.vendor as string;
    const neighborhood = (row.neighborhood as string) || "Unknown";

    grandTotal += total; grandCompleted += completed; grandPending += pending;

    if (!byStage[stage]) byStage[stage] = { total: 0, completed: 0, pending: 0 };
    byStage[stage].total += total; byStage[stage].completed += completed; byStage[stage].pending += pending;

    if (vendor) {
      if (!byVendor[vendor]) byVendor[vendor] = { total: 0, completed: 0, pending: 0 };
      byVendor[vendor].total += total; byVendor[vendor].completed += completed; byVendor[vendor].pending += pending;
    }

    if (neighborhood) {
      if (!byNeighborhood[neighborhood]) byNeighborhood[neighborhood] = { total: 0, completed: 0, pending: 0 };
      byNeighborhood[neighborhood].total += total; byNeighborhood[neighborhood].completed += completed; byNeighborhood[neighborhood].pending += pending;
    }
  }

  return { grandTotal, grandCompleted, grandPending, byStage, byVendor, byNeighborhood };
}

// ─── Completed Assessments Export ───────────────────────────────────────────

export async function getCompletedAssessmentsExport() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db
    .select()
    .from(submissions)
    .where(sql`${submissions.assessmentCompletedAt} IS NOT NULL`)
    .orderBy(asc(submissions.lastName), asc(submissions.firstName));
}

// ─── Bulk Fetch by IDs (for PDF export) ──────────────────────────────────────

export async function getSubmissionsByIds(ids: number[]) {
  if (ids.length === 0) return [];
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(submissions)
    .where(inArray(submissions.id, ids))
    .orderBy(asc(submissions.lastName), asc(submissions.firstName));
}

// ─── Notifications ────────────────────────────────────────────────────────────

export async function createNotification(payload: Omit<InsertNotification, "id" | "createdAt" | "isRead">) {
  const db = await getDb();
  if (!db) return null;
  // Keep isRead=false on the row for backwards compat; per-user state is in notificationReads
  const result = await db.insert(notifications).values({ ...payload, isRead: false });
  return (result[0] as any).insertId as number;
}

/** List notifications for a user: shows notifications targeted to them (userId = userId) OR broadcast (userId IS NULL). */
export async function listNotifications(userId: number, limit = 50): Promise<(Notification & { isReadByUser: boolean })[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(notifications)
    .where(or(isNull(notifications.userId), eq(notifications.userId, userId)))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
  if (rows.length === 0) return [];
  // Fetch which of these notifications the user has already read
  const notifIds = rows.map((r) => r.id);
  const readRows = await db.select({ notificationId: notificationReads.notificationId })
    .from(notificationReads)
    .where(and(eq(notificationReads.userId, userId), inArray(notificationReads.notificationId, notifIds)));
  const readSet = new Set(readRows.map((r) => r.notificationId));
  return rows.map((r) => ({ ...r, isReadByUser: readSet.has(r.id) }));
}

/** Count unread notifications for a specific user (targeted to them or broadcast). */
export async function getUnreadNotificationCount(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  // Total notifications visible to this user (targeted + broadcast)
  const [totalRow] = await db.select({ count: count() }).from(notifications)
    .where(or(isNull(notifications.userId), eq(notifications.userId, userId)));
  const total = Number(totalRow?.count ?? 0);
  if (total === 0) return 0;
  // Subtract those the user has already read
  const visibleRows = await db.select({ id: notifications.id }).from(notifications)
    .where(or(isNull(notifications.userId), eq(notifications.userId, userId)));
  const visibleIds = visibleRows.map((r) => r.id);
  if (visibleIds.length === 0) return 0;
  const [readRow] = await db.select({ count: count() }).from(notificationReads)
    .where(and(eq(notificationReads.userId, userId), inArray(notificationReads.notificationId, visibleIds)));
  const readCount = Number(readRow?.count ?? 0);
  return Math.max(0, total - readCount);
}

/** Mark a single notification as read for a specific user (upsert — safe to call multiple times). */
export async function markNotificationRead(notificationId: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.insert(notificationReads)
    .values({ notificationId, userId })
    .onDuplicateKeyUpdate({ set: { readAt: new Date() } });
}

/** Mark all current notifications as read for a specific user. */
export async function markAllNotificationsRead(userId: number) {
  const db = await getDb();
  if (!db) return;
  const allNotifs = await db.select({ id: notifications.id }).from(notifications);
  if (allNotifs.length === 0) return;
  // Upsert a read receipt for every notification for this user
  await db.insert(notificationReads)
    .values(allNotifs.map((n) => ({ notificationId: n.id, userId })))
    .onDuplicateKeyUpdate({ set: { readAt: new Date() } });
}

export type { Notification };

// ── Audit Log helpers ───────────────────────────────────────────────────────────────────────────────

export interface LogAuditParams {
  actorId?: number | null;
  actorName?: string | null;
  action: string;
  clientId?: number | null;
  clientName?: string | null;
  details?: Record<string, unknown> | null;
  sessionId?: string | null;
}

/** Write an immutable audit log entry. Fire-and-forget: never throws. */
export async function logAudit(params: LogAuditParams): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(auditLogs).values({
      actorId: params.actorId ?? null,
      actorName: params.actorName ?? null,
      action: params.action,
      clientId: params.clientId ?? null,
      clientName: params.clientName ?? null,
      details: params.details ?? null,
      sessionId: params.sessionId ?? null,
    });
  } catch {
    // Audit log failures must never break the main operation
  }
}

export interface AuditLogRow {
  id: number;
  actorId: number | null;
  actorName: string | null;
  action: string;
  clientId: number | null;
  clientName: string | null;
  details: unknown;
  sessionId: string | null;
  createdAt: Date;
}

export async function getAuditLogs(opts: {
  limit?: number;
  offset?: number;
  action?: string;
  actorId?: number;
  clientId?: number;
}): Promise<{ rows: AuditLogRow[]; total: number }> {
  const db = await getDb();
  if (!db) return { rows: [], total: 0 };

  const { desc, eq: eqOp, and, count: countFn } = await import("drizzle-orm");
  const conditions: ReturnType<typeof eqOp>[] = [];
  if (opts.action) conditions.push(eqOp(auditLogs.action, opts.action));
  if (opts.actorId) conditions.push(eqOp(auditLogs.actorId, opts.actorId));
  if (opts.clientId) conditions.push(eqOp(auditLogs.clientId, opts.clientId));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, totalResult] = await Promise.all([
    db.select().from(auditLogs)
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(opts.limit ?? 50)
      .offset(opts.offset ?? 0),
    db.select({ count: countFn() }).from(auditLogs).where(where),
  ]);

  return {
    rows: rows as AuditLogRow[],
    total: Number(totalResult[0]?.count ?? 0),
  };
}

/** Fetch all audit log entries for a given session UUID, ordered chronologically. */
export async function getAuditLogsBySession(sessionId: string): Promise<AuditLogRow[]> {
  const db = await getDb();
  if (!db) return [];
  const { eq, asc } = await import("drizzle-orm");
  const rows = await db.select().from(auditLogs)
    .where(eq(auditLogs.sessionId, sessionId))
    .orderBy(asc(auditLogs.createdAt));
  return rows as AuditLogRow[];
}

// ─── Daily Digest ────────────────────────────────────────────────────────────

export interface DailyDigestData {
  date: string; // e.g. "2026-07-28"
  newClients: Array<{ id: number; name: string; referralSource: string | null; stage: string; createdAt: Date }>;
  stageChanges: Array<{ clientId: number | null; clientName: string | null; actorName: string | null; fromStage: string | null; toStage: string; createdAt: Date }>;
  tasksCreated: Array<{ id: number; title: string; description: string; clientName: string | null; actorName: string | null; createdAt: Date }>;
  tasksCompleted: Array<{ id: number; title: string; clientName: string | null; actorName: string | null; completedAt: Date | null }>;
  documentsUploaded: Array<{ clientName: string | null; actorName: string | null; fileName: string; createdAt: Date }>;
  staffLogins: Array<{ actorName: string | null; createdAt: Date }>;
  allActions: Array<{ actorName: string | null; action: string; clientName: string | null; details: unknown; createdAt: Date }>;
  totalActions: number;
}

export async function getDailyDigestData(dateStr: string): Promise<DailyDigestData> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const start = new Date(dateStr + "T00:00:00.000Z");
  const end = new Date(dateStr + "T23:59:59.999Z");

  // New clients added today
  const newClients = await db.select({
    id: submissions.id,
    firstName: submissions.firstName,
    lastName: submissions.lastName,
    referralSource: submissions.referralSource,
    stage: submissions.stage,
    createdAt: submissions.createdAt,
  }).from(submissions).where(and(gte(submissions.createdAt, start), lte(submissions.createdAt, end))).orderBy(asc(submissions.createdAt));

  // Stage changes from audit log
  const stageChangeLogs = await db.select().from(auditLogs).where(
    and(eq(auditLogs.action, "stage_changed"), gte(auditLogs.createdAt, start), lte(auditLogs.createdAt, end))
  ).orderBy(asc(auditLogs.createdAt));

  // Tasks created today
  const tasksCreatedRows = await db.select().from(tasks).where(
    and(gte(tasks.createdAt, start), lte(tasks.createdAt, end))
  ).orderBy(asc(tasks.createdAt));

  // Tasks completed today
  const tasksCompletedRows = await db.select().from(tasks).where(
    and(eq(tasks.status, "completed"), gte(tasks.completedAt, start), lte(tasks.completedAt, end))
  ).orderBy(asc(tasks.completedAt));

  // Documents uploaded today
  const docsLogs = await db.select().from(auditLogs).where(
    and(eq(auditLogs.action, "document_uploaded"), gte(auditLogs.createdAt, start), lte(auditLogs.createdAt, end))
  ).orderBy(asc(auditLogs.createdAt));

  // Staff logins today
  const loginLogs = await db.select().from(auditLogs).where(
    and(eq(auditLogs.action, "login"), gte(auditLogs.createdAt, start), lte(auditLogs.createdAt, end))
  ).orderBy(asc(auditLogs.createdAt));

  // All audit actions today (for the full log section)
  const allActions = await db.select().from(auditLogs).where(
    and(gte(auditLogs.createdAt, start), lte(auditLogs.createdAt, end))
  ).orderBy(asc(auditLogs.createdAt)).limit(500);

  // Fetch client names for tasks
  const taskClientIds = Array.from(new Set([
    ...tasksCreatedRows.map(t => t.submissionId),
    ...tasksCompletedRows.map(t => t.submissionId),
  ]));
  let clientNameMap: Record<number, string> = {};
  if (taskClientIds.length > 0) {
    const clientRows = await db.select({ id: submissions.id, firstName: submissions.firstName, lastName: submissions.lastName })
      .from(submissions).where(inArray(submissions.id, taskClientIds));
    clientNameMap = Object.fromEntries(clientRows.map(r => [r.id, `${r.firstName} ${r.lastName}`]));
  }

  return {
    date: dateStr,
    newClients: newClients.map(c => ({ id: c.id, name: `${c.firstName} ${c.lastName}`, referralSource: c.referralSource, stage: c.stage, createdAt: c.createdAt })),
    stageChanges: stageChangeLogs.map(l => ({ clientId: l.clientId, clientName: l.clientName, actorName: l.actorName, fromStage: (l.details as any)?.fromStage ?? null, toStage: (l.details as any)?.toStage ?? "", createdAt: l.createdAt })),
    tasksCreated: tasksCreatedRows.map(t => ({ id: t.id, title: t.title || t.description.slice(0, 60), description: t.description, clientName: clientNameMap[t.submissionId] ?? null, actorName: null, createdAt: t.createdAt })),
    tasksCompleted: tasksCompletedRows.map(t => ({ id: t.id, title: t.title || t.description.slice(0, 60), clientName: clientNameMap[t.submissionId] ?? null, actorName: null, completedAt: t.completedAt })),
    documentsUploaded: docsLogs.map(l => ({ clientName: l.clientName, actorName: l.actorName, fileName: (l.details as any)?.fileName ?? "document", createdAt: l.createdAt })),
    staffLogins: loginLogs.map(l => ({ actorName: l.actorName, createdAt: l.createdAt })),
    allActions: allActions.map(l => ({ actorName: l.actorName, action: l.action, clientName: l.clientName, details: l.details, createdAt: l.createdAt })),
    totalActions: allActions.length,
  };
}

// ─── Email Blasts ─────────────────────────────────────────────────────────────

export async function createEmailBlast(data: {
  name: string;
  subject: string;
  body: string;
  filterStatus?: string | null;
  scheduledAt: Date;
  createdBy?: number;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(emailBlasts).values({
    name: data.name,
    subject: data.subject,
    body: data.body,
    filterStatus: data.filterStatus ?? null,
    scheduledAt: data.scheduledAt,
    createdBy: data.createdBy ?? null,
    blastStatus: "scheduled",
  });
  return (result as any)[0]?.insertId ?? 0;
}

export async function updateEmailBlastCronUid(id: number, taskUid: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(emailBlasts).set({ scheduleCronTaskUid: taskUid }).where(eq(emailBlasts.id, id));
}

export async function updateEmailBlastStatus(
  id: number,
  status: "scheduled" | "sending" | "sent" | "cancelled" | "failed",
  counts?: { sentCount?: number; failedCount?: number; sentAt?: Date },
  /** When set, the UPDATE only applies if the blast is currently in this state.
   * Use this to atomically claim a blast (e.g. 'scheduled' -> 'sending') so
   * two concurrent cron invocations cannot both process the same blast. */
  fromStatus?: "scheduled" | "sending" | "sent" | "cancelled" | "failed"
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const where = fromStatus
    ? and(eq(emailBlasts.id, id), eq(emailBlasts.blastStatus, fromStatus))
    : eq(emailBlasts.id, id);
  const result = await db.update(emailBlasts).set({
    blastStatus: status,
    ...(counts?.sentCount !== undefined ? { sentCount: counts.sentCount } : {}),
    ...(counts?.failedCount !== undefined ? { failedCount: counts.failedCount } : {}),
    ...(counts?.sentAt ? { sentAt: counts.sentAt } : {}),
  }).where(where);
  // mysql2 returns [ResultSetHeader, ...] — rowsAffected is in result[0]
  const affected = (result as any)?.[0]?.affectedRows ?? (result as any)?.rowsAffected ?? 1;
  return Number(affected) > 0;
}

export async function listEmailBlasts(): Promise<typeof emailBlasts.$inferSelect[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(emailBlasts).orderBy(desc(emailBlasts.createdAt));
}

export async function getEmailBlastByTaskUid(taskUid: string): Promise<typeof emailBlasts.$inferSelect | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(emailBlasts).where(eq(emailBlasts.scheduleCronTaskUid, taskUid)).limit(1);
  return rows[0] ?? null;
}

export async function cancelEmailBlast(id: number, taskUid?: string | null): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(emailBlasts).set({ blastStatus: "cancelled" }).where(eq(emailBlasts.id, id));
}

/** Get all client emails for a blast (optionally filtered by status) */
export async function getClientEmailsForBlast(filterStatus?: string | null): Promise<{ id: number; email: string; firstName: string; lastName: string }[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions: ReturnType<typeof eq>[] = [];
  if (filterStatus && filterStatus !== "all") {
    // filterStatus is a stage value (e.g. 'not_eligible', 'level_2_active')
    // Must filter by submissions.stage, not submissions.status
    conditions.push(eq(submissions.stage, filterStatus as any));
  }
  const rows = await db.select({
    id: submissions.id,
    email: submissions.email,
    firstName: submissions.firstName,
    lastName: submissions.lastName,
  }).from(submissions).where(conditions.length > 0 ? and(...conditions) : undefined);
  // Deduplicate by email
  const seen = new Set<string>();
  return rows.filter(r => {
    if (!r.email || seen.has(r.email)) return false;
    seen.add(r.email);
    return true;
  });
}

/** Get all inbound replies linked to a specific email blast */
export async function getBlastReplies(blastId: number) {
  const db = await getDb();
  if (!db) return [];
  const { clientEmails } = await import("../drizzle/schema");
  const rows = await db
    .select({
      id: clientEmails.id,
      submissionId: clientEmails.submissionId,
      fromEmail: clientEmails.fromEmail,
      subject: clientEmails.subject,
      body: clientEmails.body,
      sentAt: clientEmails.sentAt,
      firstName: submissions.firstName,
      lastName: submissions.lastName,
    })
    .from(clientEmails)
    .leftJoin(submissions, eq(clientEmails.submissionId, submissions.id))
    .where(eq(clientEmails.blastId, blastId))
    .orderBy(desc(clientEmails.sentAt));
  return rows;
}

/** Returns the set of submissionIds that already have an outbound email recorded for this blast.
 * Used during retry to skip clients who already received the blast. */
export async function getBlastAlreadySentIds(blastId: number): Promise<Set<number>> {
  const db = await getDb();
  if (!db) return new Set();
  const { clientEmails } = await import("../drizzle/schema");
  const rows = await db
    .select({ submissionId: clientEmails.submissionId })
    .from(clientEmails)
    .where(and(eq(clientEmails.blastId, blastId), eq(clientEmails.direction, "outbound")));
  return new Set(rows.map(r => r.submissionId).filter((id): id is number => id !== null));
}

export async function getEmailBlastById(id: number): Promise<typeof emailBlasts.$inferSelect | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(emailBlasts).where(eq(emailBlasts.id, id)).limit(1);
  return rows[0] ?? null;
}

// ─── Assessor Assignment helpers ──────────────────────────────────────────────
/** Returns all active users with the assessor role (for dropdown population). */
export async function listAssessors() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    role: users.role,
    isActive: users.isActive,
  }).from(users).where(and(eq(users.role, "assessor"), eq(users.isActive, 1))).orderBy(users.name);
}

/** Assign (or unassign) an assessor to a client. Pass null to remove assignment. */
export async function updateSubmissionAssessor(submissionId: number, assessorId: number | null): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Use sql`null` when unassigning so Drizzle doesn't skip the field (undefined is ignored by Drizzle)
  await db.update(submissions).set({ assessorId: assessorId === null ? null : assessorId }).where(eq(submissions.id, submissionId));
}

/** Get a single referrer message by ID (for existence check before deletion). */
export async function getReferrerMessageById(messageId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.select({ id: referrerMessages.id, submissionId: referrerMessages.submissionId })
    .from(referrerMessages).where(eq(referrerMessages.id, messageId)).limit(1);
  return rows[0] ?? null;
}

// ─── Chat helpers ─────────────────────────────────────────────────────────────

/** Send a new message in a client thread. Returns the inserted message. */
export async function createClientMessage(data: InsertClientMessage): Promise<ClientMessage> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(clientMessages).values(data);
  const insertId = (result as any)[0]?.insertId ?? (result as any).insertId;
  const rows = await db.select().from(clientMessages).where(eq(clientMessages.id, insertId)).limit(1);
  return rows[0];
}

/** List messages for a client thread, newest-first with optional cursor-based pagination. */
export async function listClientMessages(submissionId: number, opts: { limit?: number; beforeId?: number } = {}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { limit = 50, beforeId } = opts;
  const conditions = [eq(clientMessages.submissionId, submissionId), eq(clientMessages.isDeleted, 0)];
  if (beforeId) conditions.push(sql`${clientMessages.id} < ${beforeId}`);
  const rows = await db.select().from(clientMessages)
    .where(and(...conditions))
    .orderBy(desc(clientMessages.createdAt))
    .limit(limit);
  return rows.reverse(); // Return in chronological order for display
}

/** Get a single client message by ID. */
export async function getClientMessageById(id: number): Promise<ClientMessage | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(clientMessages).where(eq(clientMessages.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Get messages newer than a given ID (for SSE polling). */
export async function getNewClientMessages(submissionId: number, afterId: number): Promise<ClientMessage[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(clientMessages)
    .where(and(
      eq(clientMessages.submissionId, submissionId),
      eq(clientMessages.isDeleted, 0),
      sql`${clientMessages.id} > ${afterId}`
    ))
    .orderBy(asc(clientMessages.createdAt));
}

/** Soft-delete a message (only sender or admin can delete). */
export async function deleteClientMessage(messageId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(clientMessages).set({ isDeleted: 1 }).where(eq(clientMessages.id, messageId));
}

/** Add or remove an emoji reaction on a message. */
export async function toggleMessageReaction(messageId: number, userId: number, emoji: string): Promise<ClientMessage | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.select().from(clientMessages).where(eq(clientMessages.id, messageId)).limit(1);
  if (!rows[0]) return null;
  const existing = (rows[0].reactions as Array<{ userId: number; emoji: string }>) ?? [];
  const idx = existing.findIndex(r => r.userId === userId && r.emoji === emoji);
  const updated = idx >= 0
    ? existing.filter((_, i) => i !== idx) // remove
    : [...existing, { userId, emoji }];    // add
  await db.update(clientMessages).set({ reactions: updated }).where(eq(clientMessages.id, messageId));
  const updated_rows = await db.select().from(clientMessages).where(eq(clientMessages.id, messageId)).limit(1);
  return updated_rows[0] ?? null;
}

/** Mark a thread as read up to a given message ID for a user. */
export async function markThreadRead(userId: number, submissionId: number, lastReadMessageId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(messageReads)
    .values({ userId, submissionId, lastReadMessageId })
    .onDuplicateKeyUpdate({ set: { lastReadMessageId, updatedAt: new Date() } });
}

/** Get all read watermarks for a thread (returns userId → lastReadMessageId map for read receipts). */
export async function getThreadReadWatermarks(submissionId: number): Promise<Record<number, number>> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.select({ userId: messageReads.userId, lastReadMessageId: messageReads.lastReadMessageId })
    .from(messageReads)
    .where(eq(messageReads.submissionId, submissionId));
  const map: Record<number, number> = {};
  for (const row of rows) map[row.userId] = row.lastReadMessageId;
  return map;
}

/** Get all read watermarks for an org group channel (returns userId → lastReadMessageId map). */
export async function getOrgGroupReadWatermarks(orgId: number): Promise<Record<number, number>> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.select({ userId: orgMessageReads.userId, lastReadMessageId: orgMessageReads.lastReadMessageId })
    .from(orgMessageReads)
    .where(eq(orgMessageReads.orgId, orgId));
  const map: Record<number, number> = {};
  for (const row of rows) map[row.userId] = row.lastReadMessageId;
  return map;
}

/** Get the unread count for a specific thread for a user. */
export async function getThreadUnreadCount(userId: number, submissionId: number): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const readRow = await db.select({ lastReadMessageId: messageReads.lastReadMessageId })
    .from(messageReads)
    .where(and(eq(messageReads.userId, userId), eq(messageReads.submissionId, submissionId)))
    .limit(1);
  const lastRead = readRow[0]?.lastReadMessageId ?? 0;
  const result = await db.select({ cnt: count() }).from(clientMessages)
    .where(and(
      eq(clientMessages.submissionId, submissionId),
      eq(clientMessages.isDeleted, 0),
      sql`${clientMessages.id} > ${lastRead}`,
      ne(clientMessages.senderId, userId) // don't count own messages as unread
    ));
  return Number(result[0]?.cnt ?? 0);
}

/** Get unread counts across ALL threads for a user (for the global inbox badge). Single aggregated query — no N+1. */
export async function getAllUnreadCounts(userId: number): Promise<Record<number, number>> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Single query: LEFT JOIN messageReads to get last-read position per thread,
  // then GROUP BY submissionId to count unread messages in one shot.
  const rows = await db.execute(sql`
    SELECT cm.submissionId,
           COUNT(*) AS unreadCount
    FROM clientMessages cm
    LEFT JOIN messageReads mr
      ON mr.submissionId = cm.submissionId AND mr.userId = ${userId}
    WHERE cm.isDeleted = 0
      AND cm.senderId != ${userId}
      AND cm.id > COALESCE(mr.lastReadMessageId, 0)
    GROUP BY cm.submissionId
    HAVING COUNT(*) > 0
  `) as any;

  const result: Record<number, number> = {};
  const data = Array.isArray(rows) ? (Array.isArray(rows[0]) ? rows[0] : rows) : [];
  for (const row of data as any[]) {
    result[Number(row.submissionId)] = Number(row.unreadCount);
  }
  return result;
}

/** Get the latest message per thread for the global inbox view. */
export async function getInboxThreads(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get all threads that have at least one message
  const latestPerThread = await db.execute(sql`
    SELECT cm.submissionId,
           cm.id AS lastMessageId,
           cm.content AS lastMessageContent,
           cm.senderName AS lastMessageSender,
           cm.senderId AS lastMessageSenderId,
           cm.attachmentName,
           cm.createdAt AS lastMessageAt,
           s.firstName, s.lastName, s.referenceNumber, s.stage,
           COALESCE(mr.lastReadMessageId, 0) AS lastReadMessageId,
           (SELECT COUNT(*) FROM clientMessages cm2
            WHERE cm2.submissionId = cm.submissionId
              AND cm2.isDeleted = 0
              AND cm2.id > COALESCE(mr.lastReadMessageId, 0)
              AND cm2.senderId != ${userId}) AS unreadCount
    FROM clientMessages cm
    INNER JOIN submissions s ON s.id = cm.submissionId
    LEFT JOIN messageReads mr ON mr.submissionId = cm.submissionId AND mr.userId = ${userId}
    WHERE cm.id = (
      SELECT MAX(cm3.id) FROM clientMessages cm3
      WHERE cm3.submissionId = cm.submissionId AND cm3.isDeleted = 0
    )
    ORDER BY cm.createdAt DESC
    LIMIT 100
  `);

  const rows = (Array.isArray((latestPerThread as any)[0]) ? (latestPerThread as any)[0] : latestPerThread) as any[];
  return rows;
}

// ─── Organizations ────────────────────────────────────────────────────────────

export async function listOrganizations(includeInactive = false) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(organizations).orderBy(organizations.name);
  return includeInactive ? rows : rows.filter((o) => o.isActive === 1);
}

export async function getOrganizationById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createOrganization(data: InsertOrganization) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(organizations).values(data);
  return result[0].insertId as number;
}

export async function updateOrganization(id: number, data: Partial<InsertOrganization>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(organizations).set(data).where(eq(organizations.id, id));
}

export async function listOrgMembers(orgId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).where(and(eq(users.orgId, orgId), eq(users.isActive, 1)));
}

export async function assignUserToOrg(userId: number, orgId: number | null) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(users).set({ orgId }).where(eq(users.id, userId));
}

export async function referClientToOrg(submissionId: number, orgId: number | null, note: string | null) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(submissions).set({
    referredOrgId: orgId,
    referredOrgAt: orgId ? new Date() : null,
    referredOrgNote: note,
  }).where(eq(submissions.id, submissionId));
}

// ─── Org Group Chat ───────────────────────────────────────────────────────────

export async function createOrgGroupMessage(data: InsertOrgGroupMessage) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(orgGroupMessages).values(data);
  return result[0].insertId as number;
}

/** Get a single org group message by ID. */
export async function getOrgGroupMessageById(id: number): Promise<OrgGroupMessage | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(orgGroupMessages).where(eq(orgGroupMessages.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function listOrgGroupMessages(orgId: number, limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(orgGroupMessages)
    .where(and(eq(orgGroupMessages.orgId, orgId), eq(orgGroupMessages.isDeleted, 0)))
    .orderBy(orgGroupMessages.createdAt)
    .limit(limit);
}

export async function getOrgGroupUnreadCount(userId: number, orgId: number) {
  const db = await getDb();
  if (!db) return 0;
  const readRow = await db.select().from(orgMessageReads)
    .where(and(eq(orgMessageReads.userId, userId), eq(orgMessageReads.orgId, orgId)))
    .limit(1);
  const lastReadId = readRow[0]?.lastReadMessageId ?? 0;
  const rows = await db.execute(sql`
    SELECT COUNT(*) AS cnt FROM orgGroupMessages
    WHERE orgId = ${orgId} AND isDeleted = 0 AND id > ${lastReadId} AND senderId != ${userId}
  `);
  const arr = (Array.isArray((rows as any)[0]) ? (rows as any)[0] : rows) as any[];
  return Number(arr[0]?.cnt ?? 0);
}

export async function markOrgGroupRead(userId: number, orgId: number, lastMessageId: number) {
  const db = await getDb();
  if (!db) return;
  await db.insert(orgMessageReads).values({ userId, orgId, lastReadMessageId: lastMessageId })
    .onDuplicateKeyUpdate({ set: { lastReadMessageId: lastMessageId } });
}

export async function listAllOrgGroupsWithUnread(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.execute(sql`
    SELECT o.id AS orgId, o.name AS orgName,
           COALESCE(mr.lastReadMessageId, 0) AS lastReadMessageId,
           (SELECT COUNT(*) FROM orgGroupMessages m2
            WHERE m2.orgId = o.id AND m2.isDeleted = 0
              AND m2.id > COALESCE(mr.lastReadMessageId, 0)
              AND m2.senderId != ${userId}) AS unreadCount,
           (SELECT m3.content FROM orgGroupMessages m3
            WHERE m3.orgId = o.id AND m3.isDeleted = 0
            ORDER BY m3.createdAt DESC LIMIT 1) AS lastMessageContent,
           (SELECT m3.senderName FROM orgGroupMessages m3
            WHERE m3.orgId = o.id AND m3.isDeleted = 0
            ORDER BY m3.createdAt DESC LIMIT 1) AS lastMessageSender,
           (SELECT m3.createdAt FROM orgGroupMessages m3
            WHERE m3.orgId = o.id AND m3.isDeleted = 0
            ORDER BY m3.createdAt DESC LIMIT 1) AS lastMessageAt
    FROM organizations o
    LEFT JOIN orgMessageReads mr ON mr.orgId = o.id AND mr.userId = ${userId}
    WHERE o.isActive = 1
    ORDER BY lastMessageAt DESC, o.name ASC
  `);
  return (Array.isArray((rows as any)[0]) ? (rows as any)[0] : rows) as any[];
}

// ─── Org: list clients referred to a specific org ──────────────────────────
export async function listSubmissionsByOrg(orgId: number, search?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Option A: a client is visible to all org staff if EITHER:
  //   1. The client was explicitly referred to this org (referredOrgId = orgId), OR
  //   2. The client's assigned assessor is a member of this org (assessorId IN org staff)
  // First, get all user IDs that belong to this org
  const orgStaff = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.orgId, orgId), eq(users.isActive, 1)));
  const orgStaffIds = orgStaff.map((u) => u.id);

  // Build the base visibility condition
  const visibilityCondition = orgStaffIds.length > 0
    ? or(
        eq(submissions.referredOrgId, orgId),
        inArray(submissions.assessorId, orgStaffIds),
      ) as any
    : eq(submissions.referredOrgId, orgId) as any;

  const conditions: any[] = [visibilityCondition];

  if (search && search.trim()) {
    const q = `%${search.trim()}%`;
    conditions.push(
      or(
        like(submissions.firstName, q),
        like(submissions.lastName, q),
        like(submissions.medicaidId, q),
        like(submissions.cellPhone, q),
        like(submissions.referenceNumber, q),
      ) as any,
    );
  }

  return db
    .select({
      id: submissions.id,
      firstName: submissions.firstName,
      lastName: submissions.lastName,
      stage: submissions.stage,
      status: submissions.status,
      referralNote: submissions.referredOrgNote,
      referredAt: submissions.referredOrgAt,
      createdAt: submissions.createdAt,
      assessorId: submissions.assessorId,
      referredOrgId: submissions.referredOrgId,
    })
    .from(submissions)
    .where(and(...conditions))
    .orderBy(desc(submissions.createdAt));
}
