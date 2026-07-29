import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the database module so tests don't need a real DB
const mockCreateSubmission = vi.fn().mockResolvedValue(undefined);
const mockIncrementReferralUsage = vi.fn().mockResolvedValue(undefined);
const mockGetReferralLinkByCode = vi.fn().mockResolvedValue(null);

vi.mock("./db", () => ({
  createSubmission: (...args: unknown[]) => mockCreateSubmission(...args),
  listSubmissions: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
  updateSubmissionEmailSent: vi.fn().mockResolvedValue(undefined),
  getSubmissionById: vi.fn(),
  getSubmissionStats: vi.fn(),
  listAllUsers: vi.fn(),
  listWorkers: vi.fn(),
  setUserRole: vi.fn(),
  toggleWorkerActive: vi.fn(),
  updateSubmissionStatus: vi.fn(),
  updateWorkerPermissions: vi.fn(),
  getAllSubmissions: vi.fn(),
  incrementReferralUsage: (...args: unknown[]) => mockIncrementReferralUsage(...args),
  getReferralLinkByCode: (...args: unknown[]) => mockGetReferralLinkByCode(...args),
  getSubmissionByMedicaidId: vi.fn().mockResolvedValue(undefined), // No duplicate by default
  getFilterCounts: vi.fn().mockResolvedValue({}),
  listStaffUsers: vi.fn().mockResolvedValue([]),
  listReferralLinks: vi.fn().mockResolvedValue([]),
  getSubmissionByRef: vi.fn().mockResolvedValue(undefined),
}));

// Mock the email module
const mockSendApplicantConfirmation = vi.fn().mockResolvedValue(true);
const mockSendAdminNotification = vi.fn().mockResolvedValue(true);

vi.mock("./email", () => ({
  sendApplicantConfirmation: (...args: unknown[]) => mockSendApplicantConfirmation(...args),
  sendAdminNotification: (...args: unknown[]) => mockSendAdminNotification(...args),
}));

function validInput() {
  return {
    supermarket: "Foodoo",
    firstName: "Jane",
    lastName: "Doe",
    dateOfBirth: "01/15/1990",
    medicaidId: "AB12345C",
    cellPhone: "(555) 123-4567",
    email: "jane@example.com",
    streetAddress: "123 Main St",
    city: "Brooklyn",
    state: "NY",
    zipcode: "11206",
    healthCategories: ["Pregnant"],
    employed: "No",
    spouseEmployed: "No",
    hasWic: "Yes",
    hasSnap: "Yes",
    newApplicant: "New",
    householdMembers: [{ name: "Child Doe", dateOfBirth: "03/10/2020", medicaidId: "CD67890E" }],
    mealFocus: ["breakfast", "dinner"],
    needsRefrigerator: "No",
    needsMicrowave: "No",
    needsCookingUtensils: "No",
    hipaaConsent: true,
    guardianName: "Jane Doe",
    signatureDataUrl: "data:image/png;base64,iVBORw0KGgo=",
  };
}

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as unknown as TrpcContext["res"],
  };
}

/**
 * Helper: flush the setTimeout(0) background tasks that the submit procedure schedules.
 * Uses fake timers to advance, then lets microtasks (Promises) settle.
 */
async function flushBackgroundTasks() {
  // Advance fake timers to fire the setTimeout(0) callback
  vi.advanceTimersByTime(1);
  // Let any resulting Promises (email sends, referral tracking) settle
  await vi.advanceTimersByTimeAsync(10);
}

describe("submission.submit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockCreateSubmission.mockResolvedValue(undefined);
    mockIncrementReferralUsage.mockResolvedValue(undefined);
    mockSendApplicantConfirmation.mockResolvedValue(true);
    mockSendAdminNotification.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("accepts valid input and returns a reference number", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.submission.submit(validInput());

    expect(result.success).toBe(true);
    expect(result.referenceNumber).toBeDefined();
    expect(result.referenceNumber.length).toBe(6);
  });

  it("saves submission to local database", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await caller.submission.submit(validInput());

    expect(mockCreateSubmission).toHaveBeenCalledTimes(1);
    const savedData = mockCreateSubmission.mock.calls[0][0];
    expect(savedData.firstName).toBe("Jane");
    expect(savedData.lastName).toBe("Doe");
    expect(savedData.email).toBe("jane@example.com");
    expect(savedData.medicaidId).toBe("AB12345C");
    expect(savedData.supermarket).toBe("Foodoo");
    expect(savedData.status).toBe("new");
    expect(savedData.stage).toBe("referral");
    expect(savedData.formData).toBeDefined();
  });

  it("sends confirmation emails after submission", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await caller.submission.submit(validInput());

    // Flush the setTimeout(0) background tasks
    await flushBackgroundTasks();

    expect(mockSendApplicantConfirmation).toHaveBeenCalledTimes(1);
    expect(mockSendAdminNotification).toHaveBeenCalledTimes(1);

    const emailPayload = mockSendApplicantConfirmation.mock.calls[0][0];
    expect(emailPayload.firstName).toBe("Jane");
    expect(emailPayload.email).toBe("jane@example.com");
    expect(emailPayload.referenceNumber).toBeDefined();
  });

  it("tracks referral usage when ref is provided", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await caller.submission.submit({ ...validInput(), ref: "community_center" });

    // Flush the setTimeout(0) background tasks
    await flushBackgroundTasks();

    expect(mockIncrementReferralUsage).toHaveBeenCalledTimes(1);
    expect(mockIncrementReferralUsage).toHaveBeenCalledWith("community_center");
  });

  it("does not track referral when no ref is provided", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await caller.submission.submit(validInput());

    await flushBackgroundTasks();

    expect(mockIncrementReferralUsage).not.toHaveBeenCalled();
  });

  it("stores referral source in database when ref is provided", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await caller.submission.submit({ ...validInput(), ref: "sha" });

    const savedData = mockCreateSubmission.mock.calls[0][0];
    expect(savedData.referralSource).toBe("sha");
  });

  it("stores null referral source when no ref is provided", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await caller.submission.submit(validInput());

    const savedData = mockCreateSubmission.mock.calls[0][0];
    expect(savedData.referralSource).toBeNull();
  });

  it("accepts zero household members", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const input = { ...validInput(), householdMembers: [] };
    const result = await caller.submission.submit(input);

    expect(result.success).toBe(true);
    expect(result.referenceNumber).toBeDefined();
  });

  it("accepts household members with relationship field", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const input = {
      ...validInput(),
      householdMembers: [
        { name: "John Doe", dateOfBirth: "03/10/2015", medicaidId: "CD67890E", relationship: "Child" },
        { name: "Bob Doe", dateOfBirth: "05/20/1988", medicaidId: "EF12345G", relationship: "Husband" },
      ],
    };
    const result = await caller.submission.submit(input);

    expect(result.success).toBe(true);
    const savedData = mockCreateSubmission.mock.calls[0][0];
    expect(savedData.formData.householdMembers).toHaveLength(2);
    expect(savedData.formData.householdMembers[0].relationship).toBe("Child");
    expect(savedData.formData.householdMembers[1].relationship).toBe("Husband");
  });

  it("includes due date when Pregnant is selected", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const input = { ...validInput(), healthCategories: ["Pregnant"], dueDate: "2026-08-15" };
    const result = await caller.submission.submit(input);

    expect(result.success).toBe(true);
    const savedData = mockCreateSubmission.mock.calls[0][0];
    expect(savedData.formData.dueDate).toBe("2026-08-15");
  });

  it("includes miscarriage date when Had a Miscarriage is selected", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const input = { ...validInput(), healthCategories: ["Had a Miscarriage"], miscarriageDate: "2026-01-10" };
    const result = await caller.submission.submit(input);

    expect(result.success).toBe(true);
    const savedData = mockCreateSubmission.mock.calls[0][0];
    expect(savedData.formData.miscarriageDate).toBe("2026-01-10");
  });

  it("includes infant info when Postpartum is selected", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const input = {
      ...validInput(),
      healthCategories: ["Postpartum (Within the last 12 months)"],
      infantName: "Baby Doe",
      infantDateOfBirth: "2026-02-01",
      infantMedicaidId: "XY98765Z",
    };
    const result = await caller.submission.submit(input);

    expect(result.success).toBe(true);
    const savedData = mockCreateSubmission.mock.calls[0][0];
    expect(savedData.formData.infantName).toBe("Baby Doe");
    expect(savedData.formData.infantDateOfBirth).toBe("2026-02-01");
    expect(savedData.formData.infantMedicaidId).toBe("XY98765Z");
  });

  it("includes screening questions in form data", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const input = {
      ...validInput(),
      screeningQuestions: {
        livingSituation: "Renting",
        utilityShutoff: "Yes",
        receivesSnap: "Yes",
        receivesWic: "No",
        hasChronicIllness: "No",
        otherHealthIssues: "No",
        medicationsRequireRefrigeration: "No",
        breastmilkRefrigeration: "No",
      },
    };
    const result = await caller.submission.submit(input);

    expect(result.success).toBe(true);
    const savedData = mockCreateSubmission.mock.calls[0][0];
    expect(savedData.formData.screeningQuestions.livingSituation).toBe("Renting");
    expect(savedData.formData.screeningQuestions.hasChronicIllness).toBe("No");
  });

  it("stores HIPAA consent timestamp", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const before = new Date();
    await caller.submission.submit(validInput());
    const after = new Date();

    const savedData = mockCreateSubmission.mock.calls[0][0];
    expect(savedData.hipaaConsentAt).toBeDefined();
    expect(savedData.hipaaConsentAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(savedData.hipaaConsentAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it("rejects submission when HIPAA consent is false", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const input = { ...validInput(), hipaaConsent: false };
    await expect(caller.submission.submit(input)).rejects.toThrow();
  });

  it("rejects invalid Medicaid ID format", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const input = { ...validInput(), medicaidId: "12345" };
    await expect(caller.submission.submit(input)).rejects.toThrow();
  });

  it("rejects invalid email format", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const input = { ...validInput(), email: "not-an-email" };
    await expect(caller.submission.submit(input)).rejects.toThrow();
  });

  it("rejects missing required fields", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const input = { ...validInput(), firstName: "" };
    await expect(caller.submission.submit(input)).rejects.toThrow();
  });

  it("succeeds even when email sending fails (non-blocking)", async () => {
    mockSendApplicantConfirmation.mockRejectedValueOnce(new Error("Email service down"));
    mockSendAdminNotification.mockRejectedValueOnce(new Error("Email service down"));

    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.submission.submit(validInput());
    expect(result.success).toBe(true);
    expect(result.referenceNumber).toBeTruthy();

    // Flush background tasks so rejected promises are handled before test ends
    await flushBackgroundTasks();
  });

  it("succeeds even when referral tracking fails (non-blocking)", async () => {
    mockIncrementReferralUsage.mockRejectedValueOnce(new Error("DB error"));

    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.submission.submit({ ...validInput(), ref: "test_ref" });
    expect(result.success).toBe(true);
    expect(result.referenceNumber).toBeTruthy();

    // Flush background tasks so rejected promises are handled before test ends
    await flushBackgroundTasks();
  });

  it("fails when database save fails", async () => {
    mockCreateSubmission.mockRejectedValueOnce(new Error("DB connection lost"));

    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.submission.submit(validInput())).rejects.toThrow("Failed to save application");
  });

  it("sets borough from city field", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await caller.submission.submit(validInput());

    const savedData = mockCreateSubmission.mock.calls[0][0];
    expect(savedData.borough).toBe("Brooklyn");
  });

  it("includes meal preferences in form data", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const input = {
      ...validInput(),
      mealFocus: ["breakfast", "lunch"],
      breakfastItems: "Eggs and toast",
      lunchItems: "Salad and soup",
    };
    const result = await caller.submission.submit(input);

    expect(result.success).toBe(true);
    const savedData = mockCreateSubmission.mock.calls[0][0];
    expect(savedData.formData.mealFocus).toEqual(["breakfast", "lunch"]);
    expect(savedData.formData.breakfastItems).toBe("Eggs and toast");
    expect(savedData.formData.lunchItems).toBe("Salad and soup");
  });

  it("includes appliance needs in form data", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const input = {
      ...validInput(),
      needsRefrigerator: "Yes",
      needsMicrowave: "Yes",
      needsCookingUtensils: "No",
    };
    const result = await caller.submission.submit(input);

    expect(result.success).toBe(true);
    const savedData = mockCreateSubmission.mock.calls[0][0];
    expect(savedData.formData.needsRefrigerator).toBe("Yes");
    expect(savedData.formData.needsMicrowave).toBe("Yes");
    expect(savedData.formData.needsCookingUtensils).toBe("No");
  });

  it("accepts optional hasWic and hasSnap fields with defaults", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const input = { ...validInput() };
    delete (input as any).hasWic;
    delete (input as any).hasSnap;

    const result = await caller.submission.submit(input);
    expect(result.success).toBe(true);
  });
});
