import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";

// Utility function
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

export type SessionPayload = {
  openId: string;
  appId: string;
  name: string;
};

const CRON_OPEN_ID_PREFIX = "cron_";

export type AuthenticatedUser = User & {
  taskUid?: string;
  isCron?: boolean;
};

function buildCronUser(openId: string, name: string): AuthenticatedUser {
  const now = new Date();
  return {
    id: -1,
    openId,
    name: name || "Manus Scheduled Task",
    email: null,
    loginMethod: null,
    role: "user" as const,
    permissions: null,
    passwordHash: null,
    passwordResetToken: null,
    passwordResetExpires: null,
    orgId: null,
    isActive: 1,
    failedLoginAttempts: 0,
    lockedUntil: null,
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    isCron: true,
  } as AuthenticatedUser;
}

class SDKServer {
  private parseCookies(cookieHeader: string | undefined) {
    if (!cookieHeader) return new Map<string, string>();
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }

  private getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }

  async createSessionToken(
    openId: string,
    options: { expiresInMs?: number; name?: string } = {}
  ): Promise<string> {
    return this.signSession(
      { openId, appId: ENV.appId, name: options.name || "" },
      options
    );
  }

  async signSession(
    payload: SessionPayload,
    options: { expiresInMs?: number } = {}
  ): Promise<string> {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);
    const secretKey = this.getSessionSecret();

    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(expirationSeconds)
      .sign(secretKey);
  }

  async verifySession(
    cookieValue: string | undefined | null
  ): Promise<{ openId: string; appId: string; name: string } | null> {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }

    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"],
      });
      const { openId, appId, name } = payload as Record<string, unknown>;

      if (
        !isNonEmptyString(openId) ||
        !isNonEmptyString(appId) ||
        !isNonEmptyString(name)
      ) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }

      return { openId, appId, name };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }

  async authenticateRequest(req: Request): Promise<AuthenticatedUser> {
    const cookies = this.parseCookies(req.headers.cookie);
    const sessionCookie = cookies.get(COOKIE_NAME);
    const session = await this.verifySession(sessionCookie);

    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }

    // Cron short-circuit: heartbeat jobs use a cron_ openId prefix
    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      return buildCronUser(session.openId, session.name);
    }

    const user = await db.getUserByOpenId(session.openId);

    if (!user) {
      throw ForbiddenError("User not found");
    }

    // BUG-SEC3-A FIX: reject deactivated accounts on every authenticated request.
    // Without this, a fired employee's 1-year JWT cookie stays valid indefinitely.
    if (user.isActive === 0) {
      throw ForbiddenError("Account has been deactivated");
    }

    // Update last sign-in timestamp (non-blocking)
    db.upsertUser({ openId: user.openId, lastSignedIn: new Date() }).catch(
      (err) => console.warn("[Auth] Failed to update lastSignedIn:", err)
    );

    return user;
  }
}

export const sdk = new SDKServer();
