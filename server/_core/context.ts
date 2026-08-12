import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { parse as parseCookieHeader } from "cookie";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { areSessionsEnforced } from "../compliance/flags";
import { enforceSession } from "../compliance/sessionService";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

const SESSION_ID_COOKIE = "admin_session_id";

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  // ── Server-side session enforcement (compliance) ──────────────────────────
  // Additive layer on top of the JWT: when COMPLIANCE_SESSIONS is on, a session
  // that has been revoked, has passed its absolute expiry, or has been idle too
  // long is treated as logged-out (user → null) even though the JWT is still
  // cryptographically valid. Only applies when the session cookie is present
  // (recorded sessions always carry it), and FAILS OPEN on any infra error so a
  // monitoring gap can never lock every admin out.
  if (user && areSessionsEnforced()) {
    try {
      const sessionId = parseCookieHeader(opts.req.headers.cookie ?? "")[SESSION_ID_COOKIE];
      if (sessionId) {
        const check = await enforceSession(sessionId);
        if (!check.ok) user = null;
      }
    } catch {
      // Fail open — never deny access because the session store is unreachable.
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
