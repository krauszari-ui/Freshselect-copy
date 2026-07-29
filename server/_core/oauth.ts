import type { Express } from "express";

/**
 * OAuth routes stub — Manus OAuth has been removed.
 * Admin login now uses internal bcrypt authentication via the
 * auth.adminLogin tRPC mutation. This file is kept so the import
 * in index.ts compiles without changes.
 */
export function registerOAuthRoutes(_app: Express) {
  // No-op: OAuth callback route removed
}
