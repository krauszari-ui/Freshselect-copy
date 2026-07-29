export const ENV = {
  /** Used as the JWT audience claim */
  appId: process.env.VITE_APP_ID ?? "freshselect-meals",
  /** Secret used to sign / verify session JWTs — must be set in production */
  cookieSecret: process.env.JWT_SECRET ?? "",
  /** MySQL / TiDB connection string */
  databaseUrl: process.env.DATABASE_URL ?? "",
  /** Production flag */
  isProduction: process.env.NODE_ENV === "production",

  // ── Email (Resend) ──────────────────────────────────────────────────────────
  /** Resend API key for transactional email */
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  /**
   * From address for outbound emails.
   * Set RESEND_FROM_EMAIL = "FreshSelect Meals <noreply@freshselectmeals.com>"
   * after verifying freshselectmeals.com in the Resend dashboard.
   */
  resendFromEmail:
    process.env.RESEND_FROM_EMAIL ??
    "FreshSelect Meals <onboarding@resend.dev>",

  // ── File Storage (Cloudflare R2) ────────────────────────────────────────────
  r2AccountId: process.env.R2_ACCOUNT_ID ?? "",
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  r2BucketName: process.env.R2_BUCKET_NAME ?? "freshselect-documents",
  /** Optional: public CDN URL for the R2 bucket (e.g. https://docs.freshselectmeals.com) */
  r2PublicUrl: process.env.R2_PUBLIC_URL ?? "",

  // ── Cron security ─────────────────────────────────────────────────────────
  /** Secret token required to invoke /api/cron/send-blasts.
   * Set CRON_SECRET in Vercel env vars. Vercel automatically sends this as
   * Authorization: Bearer <secret> for cron jobs when configured. */
  cronSecret: process.env.CRON_SECRET ?? "",

  // ── Manus Forge (local dev fallback only — not needed in production) ────────
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};
