/**
 * MFA service — TOTP enrollment, the login-step gate, recovery codes, and the
 * reset-approval flow. Built on the vendored TOTP in infra/mfa.ts and the
 * mfaEnrollments / mfaRecoveryCodes tables.
 *
 * Safety: the login gate is a NO-OP unless the COMPLIANCE_MFA flag is on AND the
 * user's role requires MFA AND the user has an ACTIVE enrollment. A required-but-
 * not-yet-enrolled user is allowed through (so enabling the flag can never lock
 * out an admin who hasn't set up MFA yet) — the UI prompts them to enroll.
 */
import { eq } from "drizzle-orm";
import type { User } from "../../drizzle/schema";
import { mfaEnrollments, mfaRecoveryCodes, userComplianceRoles, complianceRoles as complianceRolesTable } from "../../drizzle/schema";
import { requireDb, withTransaction } from "./db";
import { recordAuditEvent } from "./audit";
import { type Actor } from "./store";
import { generateTotpSecret, verifyTotp, totpAuthUri, generateRecoveryCodes, hashRecoveryCode } from "./infra/mfa";
import { isMfaRequired } from "./flags";
import { MFA_REQUIRED_LEGACY_ROLES, MFA_REQUIRED_COMPLIANCE_ROLES, type ComplianceRole } from "@shared/compliance/constants";

async function complianceRoleKeys(userId: number): Promise<ComplianceRole[]> {
  try {
    const db = await requireDb();
    const rows = await db.select({ key: complianceRolesTable.key }).from(userComplianceRoles)
      .innerJoin(complianceRolesTable, eq(userComplianceRoles.roleId, complianceRolesTable.id))
      .where(eq(userComplianceRoles.userId, userId));
    return rows.map((r) => r.key as ComplianceRole);
  } catch { return []; }
}

/** Does this user's role make MFA mandatory (when the flag is on)? */
export async function roleRequiresMfa(user: Pick<User, "id" | "role">): Promise<boolean> {
  if ((MFA_REQUIRED_LEGACY_ROLES as readonly string[]).includes(user.role)) return true;
  const roles = await complianceRoleKeys(user.id);
  return roles.some((r) => MFA_REQUIRED_COMPLIANCE_ROLES.includes(r));
}

async function getEnrollment(userId: number) {
  const db = await requireDb();
  const [row] = await db.select().from(mfaEnrollments).where(eq(mfaEnrollments.userId, userId));
  return row ?? null;
}

export type MfaLoginDecision = "not_required" | "required" | "ok" | "invalid";

/**
 * The login-step gate. `not_required` → proceed as normal; `required` → prompt
 * for a code (no session issued); `ok` → code valid, proceed; `invalid` → reject.
 */
export async function evaluateMfaLogin(user: Pick<User, "id" | "role">, token: string | undefined, now = Date.now()): Promise<MfaLoginDecision> {
  if (!isMfaRequired()) return "not_required";
  if (!(await roleRequiresMfa(user))) return "not_required";
  const enr = await getEnrollment(user.id);
  if (!enr || !enr.isActive || !enr.totpSecret) return "not_required"; // can't enforce what isn't set up
  if (!token) return "required";
  if (verifyTotp(enr.totpSecret, token, now)) return "ok";
  // Fall back to a single-use recovery code.
  if (await consumeRecoveryCode(user.id, token)) return "ok";
  return "invalid";
}

/** Begin enrollment: generate a secret (inactive until confirmed). */
export async function startEnrollment(actor: Actor, user: Pick<User, "id" | "email" | "name">): Promise<{ secret: string; otpauthUri: string }> {
  if (actor.actorId == null) throw new Error("ACTOR_REQUIRED");
  const secret = generateTotpSecret();
  const account = user.email ?? user.name ?? `user-${user.id}`;
  await withTransaction(async (tx) => {
    const [existing] = await tx.select().from(mfaEnrollments).where(eq(mfaEnrollments.userId, user.id));
    if (existing) {
      await tx.update(mfaEnrollments).set({ totpSecret: secret, isActive: false, method: "totp" }).where(eq(mfaEnrollments.userId, user.id));
    } else {
      await tx.insert(mfaEnrollments).values({ userId: user.id, totpSecret: secret, method: "totp", isActive: false });
    }
    await recordAuditEvent(tx, { ...actor, action: "mfa_enrollment_started", recordType: "mfaEnrollment", recordId: user.id });
  });
  return { secret, otpauthUri: totpAuthUri(secret, account) };
}

/** Confirm enrollment with a valid code; activate and issue recovery codes once. */
export async function confirmEnrollment(actor: Actor, userId: number, token: string, now = Date.now()): Promise<{ recoveryCodes: string[] }> {
  const enr = await getEnrollment(userId);
  if (!enr || !enr.totpSecret) throw new Error("MFA_NOT_STARTED");
  if (!verifyTotp(enr.totpSecret, token, now)) throw new Error("MFA_CODE_INVALID");
  const codes = generateRecoveryCodes(10);
  await withTransaction(async (tx) => {
    await tx.update(mfaEnrollments).set({ isActive: true, enrolledAt: new Date() }).where(eq(mfaEnrollments.userId, userId));
    // Replace any prior recovery codes.
    await tx.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, userId));
    for (const h of codes.hashes) await tx.insert(mfaRecoveryCodes).values({ userId, codeHash: h });
    await recordAuditEvent(tx, { ...actor, action: "mfa_enrolled", recordType: "mfaEnrollment", recordId: userId, newValue: { method: "totp", recoveryCodes: codes.hashes.length } });
  });
  return { recoveryCodes: codes.plaintext };
}

/** Consume a single-use recovery code; returns true if it was valid + unused. */
export async function consumeRecoveryCode(userId: number, code: string): Promise<boolean> {
  const db = await requireDb();
  const hash = hashRecoveryCode(code);
  const rows = await db.select().from(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, userId));
  const match = rows.find((r) => r.codeHash === hash && r.usedAt == null);
  if (!match) return false;
  await db.update(mfaRecoveryCodes).set({ usedAt: new Date() }).where(eq(mfaRecoveryCodes.id, match.id));
  return true;
}

export async function mfaStatus(user: Pick<User, "id" | "role">): Promise<{ enrolled: boolean; active: boolean; required: boolean }> {
  const enr = await getEnrollment(user.id);
  return { enrolled: !!enr, active: !!enr?.isActive, required: isMfaRequired() && (await roleRequiresMfa(user)) };
}

/** User requests an MFA reset (e.g. lost device); an admin must approve. */
export async function requestReset(actor: Actor, userId: number): Promise<void> {
  await withTransaction(async (tx) => {
    await tx.update(mfaEnrollments).set({ resetRequestedAt: new Date() }).where(eq(mfaEnrollments.userId, userId));
    await recordAuditEvent(tx, { ...actor, action: "mfa_reset_requested", recordType: "mfaEnrollment", recordId: userId });
  });
}

/** Admin approves a reset: deactivates MFA + clears the secret so the user re-enrolls. */
export async function approveReset(actor: Actor, targetUserId: number): Promise<void> {
  if (actor.actorId == null) throw new Error("ACTOR_REQUIRED");
  await withTransaction(async (tx) => {
    await tx.update(mfaEnrollments).set({ isActive: false, totpSecret: null, resetApprovedBy: actor.actorId, resetRequestedAt: null }).where(eq(mfaEnrollments.userId, targetUserId));
    await tx.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, targetUserId));
    await recordAuditEvent(tx, { ...actor, action: "mfa_reset_approved", recordType: "mfaEnrollment", recordId: targetUserId });
  });
}
