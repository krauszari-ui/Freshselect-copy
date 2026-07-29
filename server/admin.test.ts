import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the db module
vi.mock("./db", () => ({
  createSubmission: vi.fn().mockResolvedValue(undefined),
  getSubmissionById: vi.fn().mockResolvedValue({
    id: 1,
    referenceNumber: "ABC123",
    firstName: "Sarah",
    lastName: "Cohen",
    email: "sarah@example.com",
    cellPhone: "718-555-1234",
    medicaidId: "AB12345C",
    supermarket: "Foodoo",
    referralSource: "sha",
    status: "new",
    stage: "referral",
    adminNotes: null,
    formData: {},
    hipaaConsentAt: new Date("2026-01-01T00:00:00Z"),
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  }),
  listSubmissions: vi.fn().mockResolvedValue({
    rows: [
      {
        id: 1,
        referenceNumber: "ABC123",
        firstName: "Sarah",
        lastName: "Cohen",
        email: "sarah@example.com",
        cellPhone: "718-555-1234",
        medicaidId: "AB12345C",
        supermarket: "Foodoo",
        referralSource: "sha",
        status: "new",
        stage: "referral",
        adminNotes: null,
        formData: {},
        hipaaConsentAt: new Date("2026-01-01T00:00:00Z"),
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      },
    ],
    total: 1,
    page: 1,
    pageSize: 15,
    totalPages: 1,
  }),
  getSubmissionStats: vi.fn().mockResolvedValue({
    total: 5,
    stages: {
      referral: 2,
      assessment: 1,
      level_one_only: 0,
      level_one_household: 0,
      level_2_active: 1,
      ineligible: 1,
      provider_attestation_required: 0,
      flagged: 0,
    },
    supermarkets: { "Foodoo Kosher": 3, "Rosemary Kosher": 2 },
  }),
  updateSubmissionStatus: vi.fn().mockResolvedValue(undefined),
  updateSubmissionStage: vi.fn().mockResolvedValue(undefined),
  updateSubmissionAssignment: vi.fn().mockResolvedValue(undefined),
  getAllSubmissions: vi.fn().mockResolvedValue([]),
  getSubmissionByRef: vi.fn().mockResolvedValue(undefined),
  listStaffUsers: vi.fn().mockResolvedValue([
    { id: 1, name: "Admin User", email: "admin@freshselect.com", role: "admin" },
    { id: 2, name: "Worker One", email: "worker@freshselect.com", role: "worker" },
  ]),
  getRecentSubmissions: vi.fn().mockResolvedValue([
    { id: 1, firstName: "Sarah", lastName: "Cohen", stage: "referral", createdAt: new Date() },
  ]),
  getRecentlyUpdated: vi.fn().mockResolvedValue([]),
  getAddedCount: vi.fn().mockResolvedValue(3),
  getTaskStats: vi.fn().mockResolvedValue({ open: 2, completed: 1, verified: 0, total: 3 }),
  listTasks: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
  getTasksBySubmission: vi.fn().mockResolvedValue([]),
  createTask: vi.fn().mockResolvedValue(1),
  updateTaskStatus: vi.fn().mockResolvedValue(undefined),
  getCaseNotesBySubmission: vi.fn().mockResolvedValue([]),
  createCaseNote: vi.fn().mockResolvedValue(1),
  getDocumentsBySubmission: vi.fn().mockResolvedValue([]),
  getLibraryDocuments: vi.fn().mockResolvedValue([
    { id: 1, fileName: "HRA Consent.pdf", category: "uncategorized", fileUrl: "https://example.com/file.pdf" },
  ]),
  createDocument: vi.fn().mockResolvedValue(1),
  deleteDocument: vi.fn().mockResolvedValue(undefined),
  getServicesBySubmission: vi.fn().mockResolvedValue([]),
  createService: vi.fn().mockResolvedValue(1),
  updateServiceStatus: vi.fn().mockResolvedValue(undefined),
  listWorkers: vi.fn().mockResolvedValue([]),
  listAllUsers: vi.fn().mockResolvedValue([]),
  setUserRole: vi.fn().mockResolvedValue(undefined),
  toggleWorkerActive: vi.fn().mockResolvedValue(undefined),
  updateWorkerPermissions: vi.fn().mockResolvedValue(undefined),
  updateSubmissionEmailSent: vi.fn().mockResolvedValue(undefined),
  updateSubmission: vi.fn().mockResolvedValue(undefined),
  updateSubmissionFields: vi.fn().mockResolvedValue(undefined),
  deleteSubmission: vi.fn().mockResolvedValue(undefined),
  listReferralLinks: vi.fn().mockResolvedValue([
    { id: 1, code: "abc123", referrerName: "John Smith", description: "Community partner", isActive: 1, usageCount: 5, createdAt: new Date() },
  ]),
  getReferralLinkByCode: vi.fn().mockResolvedValue({ id: 1, code: "abc123", referrerName: "John Smith", isActive: 1, usageCount: 5 }),
  createReferralLink: vi.fn().mockResolvedValue(1),
  updateReferralLink: vi.fn().mockResolvedValue(undefined),
  deleteReferralLink: vi.fn().mockResolvedValue(undefined),
  incrementReferralUsage: vi.fn().mockResolvedValue(undefined),
  getReferralStats: vi.fn().mockResolvedValue({ totalLinks: 3, totalReferrals: 12 }),
  getReferralLinkByEmail: vi.fn().mockResolvedValue({
    id: 1, code: "abc123", referrerName: "John Smith", isActive: 1, usageCount: 5,
    email: "john@example.com", passwordHash: "$2a$10$hashedpassword",
  }),
  getClientsByReferralCode: vi.fn().mockResolvedValue([
    { id: 1, firstName: "Sarah", lastName: "Cohen", cellPhone: "718-555-1234", email: "sarah@example.com", supermarket: "Foodoo", stage: "referral", status: "new", createdAt: new Date(), language: "English" },
  ]),
  createStageHistoryEntry: vi.fn().mockResolvedValue(undefined),
  getStageHistoryBySubmission: vi.fn().mockResolvedValue([
    { id: 1, submissionId: 1, fromStage: "referral", toStage: "assessment", changedBy: 1, changedByName: "Admin User", note: null, createdAt: new Date() },
  ]),
  bulkDeleteSubmissions: vi.fn().mockResolvedValue({ deleted: 2 }),
  createStaffUser: vi.fn().mockResolvedValue(1),
  setPasswordResetToken: vi.fn().mockResolvedValue(undefined),
  getUserByResetToken: vi.fn().mockResolvedValue(undefined),
  clearPasswordResetToken: vi.fn().mockResolvedValue(undefined),
  createReferrerMessage: vi.fn().mockResolvedValue(1),
  listReferrerMessages: vi.fn().mockResolvedValue([]),
  listReferrerMessagesBySubmission: vi.fn().mockResolvedValue([]),
  markReferrerMessageRead: vi.fn().mockResolvedValue(undefined),
  getUnreadCountByReferrer: vi.fn().mockResolvedValue(0),
  deleteReferrerMessage: vi.fn().mockResolvedValue(undefined),
  markAllReferrerMessagesRead: vi.fn().mockResolvedValue(undefined),
  createClientEmail: vi.fn().mockResolvedValue(1),
  listClientEmails: vi.fn().mockResolvedValue([]),
  deleteClientEmailById: vi.fn().mockResolvedValue(undefined),
  getUserByEmail: vi.fn().mockResolvedValue(undefined),
  logAudit: vi.fn().mockResolvedValue(undefined),
  getAuditLogs: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
}));

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "admin-user",
    email: "admin@freshselect.com",
    name: "Admin User",
    loginMethod: "local",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function createWorkerContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 2,
    openId: "worker-user",
    email: "worker@example.com",
    name: "Worker User",
    loginMethod: "local",
    role: "worker",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    // Workers need canEdit:true to call editProcedure mutations
    permissions: { canView: true, canEdit: true, canExport: true, canDelete: false, showReferralLinks: true },
  } as any;

  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function createUserContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 3,
    openId: "regular-user",
    email: "user@example.com",
    name: "Regular User",
    loginMethod: "local",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function createAnonContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ─── Dashboard Stats ───────────────────────────────────────────────────
describe("admin.stats", () => {
  it("returns stats with total and stages for admin users", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.admin.stats();
    expect(result.total).toBe(5);
    expect(result.stages).toBeDefined();
    expect(result.stages.referral).toBe(2);
    expect(result.stages.assessment).toBe(1);
  });

  it("returns stats for worker users", async () => {
    const caller = appRouter.createCaller(createWorkerContext());
    const result = await caller.admin.stats();
    expect(result.total).toBe(5);
  });

  it("throws FORBIDDEN for regular users", async () => {
    const caller = appRouter.createCaller(createUserContext());
    await expect(caller.admin.stats()).rejects.toThrow("Staff access required");
  });

  it("throws UNAUTHORIZED for anonymous users", async () => {
    const caller = appRouter.createCaller(createAnonContext());
    await expect(caller.admin.stats()).rejects.toThrow();
  });
});

// ─── Task Stats ────────────────────────────────────────────────────────
describe("admin.taskStats", () => {
  it("returns open/completed/verified/total counts", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.admin.taskStats();
    expect(result.open).toBe(2);
    expect(result.completed).toBe(1);
    expect(result.verified).toBe(0);
    expect(result.total).toBe(3);
  });
});

// ─── Recent Clients ────────────────────────────────────────────────────
describe("admin.recentClients", () => {
  it("returns recent clients list with default params", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.admin.recentClients();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(0);
  });

  it("accepts custom days and limit", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.admin.recentClients({ days: 30, limit: 5 });
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── Added Count ───────────────────────────────────────────────────────
describe("admin.addedCount", () => {
  it("returns count of recently added clients", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.admin.addedCount({ days: 7 });
    expect(result).toBe(3);
  });
});

// ─── Staff List ────────────────────────────────────────────────────────
describe("admin.staffList", () => {
  it("returns list of staff users", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.admin.staffList();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(2);
    expect(result[0].name).toBe("Admin User");
  });
});

// ─── Client List ───────────────────────────────────────────────────────
describe("admin.list", () => {
  it("returns paginated submissions for admin", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.admin.list({ page: 1, pageSize: 15 });
    expect(result.rows).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.totalPages).toBe(1);
    expect(result.rows[0]?.firstName).toBe("Sarah");
  });

  it("accepts search, status, stage, and filter parameters", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.admin.list({
      search: "Sarah",
      status: "new",
      stage: "referral",
      language: "English",
      borough: "Brooklyn",
      page: 1,
    });
    expect(result.rows).toBeDefined();
  });

  it("throws FORBIDDEN for non-staff", async () => {
    const caller = appRouter.createCaller(createUserContext());
    await expect(caller.admin.list({})).rejects.toThrow("Staff access required");
  });
});

// ─── Get By ID ─────────────────────────────────────────────────────────
describe("admin.getById", () => {
  it("returns a submission by ID for admin", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.admin.getById({ id: 1 });
    expect(result.referenceNumber).toBe("ABC123");
    expect(result.firstName).toBe("Sarah");
    expect(result.status).toBe("new");
    expect(result.stage).toBe("referral");
  });

  it("throws NOT_FOUND when submission does not exist", async () => {
    const { getSubmissionById } = await import("./db");
    vi.mocked(getSubmissionById).mockResolvedValueOnce(undefined);
    const caller = appRouter.createCaller(createAdminContext());
    await expect(caller.admin.getById({ id: 9999 })).rejects.toThrow("Client not found");
  });

  it("throws FORBIDDEN for non-staff", async () => {
    const caller = appRouter.createCaller(createUserContext());
    await expect(caller.admin.getById({ id: 1 })).rejects.toThrow("Staff access required");
  });
});

// ─── Update Status ─────────────────────────────────────────────────────
describe("admin.updateStatus", () => {
  it("updates submission status for admin", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.admin.updateStatus({
      id: 1,
      status: "approved",
      adminNotes: "Verified eligibility",
    });
    expect(result.success).toBe(true);
  });

  it("accepts all valid status values", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    for (const status of ["new", "in_review", "approved", "rejected", "on_hold"] as const) {
      const result = await caller.admin.updateStatus({ id: 1, status });
      expect(result.success).toBe(true);
    }
  });

  it("throws FORBIDDEN for non-staff", async () => {
    const caller = appRouter.createCaller(createUserContext());
    await expect(
      caller.admin.updateStatus({ id: 1, status: "approved" })
    ).rejects.toThrow("Edit access required");
  });
});

// ─── Update Stage ──────────────────────────────────────────────────────
describe("admin.updateStage", () => {
  it("updates submission stage", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.admin.updateStage({ id: 1, stage: "assessment" });
    expect(result.success).toBe(true);
  });

  it("accepts all valid stage values", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const stages = ["referral", "assessment", "level_one_only", "level_one_household", "level_2_active", "ineligible", "provider_attestation_required", "flagged"] as const;
    for (const stage of stages) {
      const result = await caller.admin.updateStage({ id: 1, stage });
      expect(result.success).toBe(true);
    }
  });

  it("logs a stage history entry when stage is updated", async () => {
    const { createStageHistoryEntry } = await import("./db");
    const caller = appRouter.createCaller(createAdminContext());
    await caller.admin.updateStage({ id: 1, stage: "assessment" });
    expect(createStageHistoryEntry).toHaveBeenCalledWith(expect.objectContaining({
      submissionId: 1,
      toStage: "assessment",
    }));
  });
});

// ─── Stage History ─────────────────────────────────────────────────────
describe("admin.stageHistory", () => {
  it("returns stage history for a client", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.admin.stageHistory({ id: 1 });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect((result as any[])[0]).toMatchObject({ submissionId: 1, toStage: "assessment" });
  });

  it("throws FORBIDDEN for non-staff", async () => {
    const caller = appRouter.createCaller(createUserContext());
    await expect(caller.admin.stageHistory({ id: 1 })).rejects.toThrow("Staff access required");
  });
});

// ─── Tasks CRUD ────────────────────────────────────────────────────────
describe("admin.tasks", () => {
  it("lists tasks with filters", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.admin.tasks.list({});
    expect(result).toBeDefined();
  });

  it("returns task stats", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.admin.tasks.stats();
    expect(result.open).toBe(2);
    expect(result.total).toBe(3);
  });

  it("creates a task", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.admin.tasks.create({
      submissionId: 1,
      title: "Follow up with client",
      description: "Follow up with client",
      area: "intake_rep",
    });
    expect(result.success).toBe(true);
    expect(result.id).toBe(1);
  });

  it("updates task status", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.admin.tasks.updateStatus({ id: 1, status: "completed" });
    expect(result.success).toBe(true);
  });

  it("gets tasks by client", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.admin.tasks.byClient({ submissionId: 1 });
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── Case Notes ────────────────────────────────────────────────────────
describe("admin.notes", () => {
  it("gets notes by client", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.admin.notes.byClient({ submissionId: 1 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("creates a case note", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.admin.notes.create({
      submissionId: 1,
      content: "Client called to follow up on referral status.",
    });
    expect(result.success).toBe(true);
    expect(result.id).toBe(1);
  });
});

// ─── Documents ─────────────────────────────────────────────────────────
describe("admin.documents", () => {
  it("gets documents by client", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.admin.documents.byClient({ submissionId: 1 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("gets library documents", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.admin.documents.library();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1);
    expect(result[0].fileName).toBe("HRA Consent.pdf");
  });

  it("gets library documents filtered by category", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.admin.documents.library({ category: "forms" });
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── Services ──────────────────────────────────────────────────────────
describe("admin.services", () => {
  it("gets services by client", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.admin.services.byClient({ submissionId: 1 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("creates a service", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.admin.services.create({
      submissionId: 1,
      name: "Meal Delivery",
      description: "Weekly meal delivery service",
    });
    expect(result.success).toBe(true);
    expect(result.id).toBe(1);
  });

  it("updates service status", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.admin.services.updateStatus({ id: 1, status: "completed" });
    expect(result.success).toBe(true);
  });
});

// ─── Export CSV ─────────────────────────────────────────────────────────
describe("admin.exportCsv", () => {
  it("exports CSV for admin", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.admin.exportCsv({});
    expect(result.csv).toBeDefined();
    expect(typeof result.csv).toBe("string");
    expect(result.count).toBeDefined();
  });
});

// ─── Update Client ────────────────────────────────────────────────────
describe("admin.updateClient", () => {
  it("updates client data for admin", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.admin.updateClient({
      id: 1,
      firstName: "Sarah Updated",
      lastName: "Cohen",
      email: "sarah.updated@example.com",
    });
    expect(result.success).toBe(true);
  });

  it("throws FORBIDDEN for non-staff", async () => {
    const caller = appRouter.createCaller(createUserContext());
    await expect(
      caller.admin.updateClient({ id: 1, firstName: "Hacker" })
    ).rejects.toThrow("Edit access required");
  });
});

// ─── Delete Client ────────────────────────────────────────────────────
describe("admin.deleteClient", () => {
  it("deletes a client for admin", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.admin.deleteClient({ id: 1 });
    expect(result.success).toBe(true);
  });

  it("throws FORBIDDEN for non-admin users", async () => {
    const caller = appRouter.createCaller(createUserContext());
    await expect(
      caller.admin.deleteClient({ id: 1 })
    ).rejects.toThrow();
  });

  it("throws FORBIDDEN for worker users", async () => {
    const caller = appRouter.createCaller(createWorkerContext());
    await expect(
      caller.admin.deleteClient({ id: 1 })
    ).rejects.toThrow("Admin access required");
  });
});

// ─── Referral Links ───────────────────────────────────────────────────
describe("admin.referrals", () => {
  it("lists all referral links", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.admin.referrals.list();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1);
    expect(result[0].referrerName).toBe("John Smith");
  });

  it("creates a referral link", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.admin.referrals.create({
      code: "newcode",
      referrerName: "Jane Doe",
      description: "New partner",
    });
    expect(result.success).toBe(true);
    expect(result.id).toBe(1);
  });

  it("updates a referral link", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.admin.referrals.update({
      id: 1,
      referrerName: "Updated Name",
      isActive: 0,
    });
    expect(result.success).toBe(true);
  });

  it("deletes a referral link", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.admin.referrals.delete({ id: 1 });
    expect(result.success).toBe(true);
  });

  it("returns referral stats", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.admin.referrals.stats();
    expect(result.totalLinks).toBe(3);
    expect(result.totalReferrals).toBe(12);
  });

  it("throws FORBIDDEN for non-staff", async () => {
    const caller = appRouter.createCaller(createUserContext());
    await expect(caller.admin.referrals.list()).rejects.toThrow("Staff access required");
  });

  it("creates a referral link with portal login", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.admin.referrals.create({
      code: "withlogin",
      referrerName: "Portal User",
      email: "portal@example.com",
      password: "password123",
    });
    expect(result.success).toBe(true);
  });
});

// ─── Referrer Portal ─────────────────────────────────────────────────
describe("admin.referrerPortal", () => {
  it("returns clients for a valid referral code", async () => {
    const caller = appRouter.createCaller(createAnonContext());
    const result = await caller.admin.referrerPortal.myClients({ code: "abc123" });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1);
    expect(result[0].firstName).toBe("Sarah");
  });

  it("returns stats for a valid referral code", async () => {
    const caller = appRouter.createCaller(createAnonContext());
    const result = await caller.admin.referrerPortal.myStats({ code: "abc123" });
    expect(result.totalClients).toBe(1);
    expect(result.referrerName).toBe("John Smith");
  });
});

// ─── Update Admin Notes ───────────────────────────────────────────────
describe("admin.updateAdminNotes", () => {
  it("saves admin notes for a client (staff)", async () => {
    const caller = appRouter.createCaller(createWorkerContext());
    const result = await caller.admin.updateAdminNotes({
      id: 1,
      adminNotes: "Client called to confirm delivery address. Notes updated.",
    });
    expect(result.success).toBe(true);
  });

  it("saves admin notes for a client (admin)", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.admin.updateAdminNotes({
      id: 1,
      adminNotes: "Approved after eligibility check.",
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty string to clear notes", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.admin.updateAdminNotes({ id: 1, adminNotes: "" });
    expect(result.success).toBe(true);
  });

  it("throws FORBIDDEN for non-staff", async () => {
    const caller = appRouter.createCaller(createUserContext());
    await expect(
      caller.admin.updateAdminNotes({ id: 1, adminNotes: "Hacked" })
    ).rejects.toThrow("Edit access required");
  });
});

