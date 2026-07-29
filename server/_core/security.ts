/**
 * Production security middleware for FreshSelect Meals.
 *
 * Implements:
 *  - Helmet (secure HTTP headers: CSP, HSTS, X-Frame-Options, etc.)
 *  - CORS (restrict origins to known domains)
 *  - Rate limiting (global, per-route, login brute-force protection)
 *  - Body size hardening (tight limits per route type)
 *  - Request ID injection for structured logging
 */
import helmet from "helmet";
import cors from "cors";
import { rateLimit } from "express-rate-limit";
import type { Express, Request, Response, NextFunction } from "express";
import { nanoid } from "nanoid";

// ---------------------------------------------------------------------------
// Allowed origins
// ---------------------------------------------------------------------------
export const ALLOWED_ORIGINS = [
  "https://freshselectmeals.com",
  "https://www.freshselectmeals.com",
  // Vercel preview deployments
  /^https:\/\/freshselect-meals[a-z0-9-]*\.vercel\.app$/,
  // Manus dev / preview environments (multi-level subdomains like 3000-xxx.us2.manus.computer)
  /^https:\/\/[\w.-]+\.manus\.computer$/,
  /^https:\/\/[\w.-]+\.manus\.space$/,
  // Local development
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
];

// ---------------------------------------------------------------------------
// Rate limiters
// ---------------------------------------------------------------------------

/** Global limiter: 1500 req / 15 min per IP — increased to support chat polling (every 3s per active user) */
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1500,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
  skip: (req) => req.path === "/api/health",
});

/** Form submission limiter: 20 submissions / 15 min per IP */
export const submissionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many form submissions. Please wait before submitting again." },
});

/**
 * Login brute-force protection — two-tier system:
 *
 * Tier 1 (loginLimiter):  10 attempts per IP per 15 minutes → 15-minute lockout
 * Tier 2 (loginHardLimiter): 15 attempts per IP per 24 hours → 24-hour lockout
 *                             (requires waiting out the window — effectively a manual reset)
 *
 * Both limiters are applied together on each login route.
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many login attempts. Your IP has been locked out for 15 minutes. Please try again later." },
});

/** Hard cap: 15 total attempts per IP per 24 hours — locks out for the rest of the day */
export const loginHardLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 15,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Your IP has been blocked due to repeated failed login attempts. Please contact support or try again tomorrow." },
});

/** Upload limiter: 20 uploads / 15 min per IP */
export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many file uploads. Please wait before uploading again." },
});

/** Password reset limiter: 5 requests / 15 min per IP — prevents inbox flooding */
export const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many password reset requests. Please wait 15 minutes before trying again." },
});

/**
 * BUG-SEC-A FIX: Referrer code-based endpoints (myClients, myStats, myMessages, reply, etc.)
 * accept a raw code string with no authentication. Without a rate limiter an attacker could
 * brute-force short codes and enumerate PII (phone numbers, emails, client names).
 * 60 requests / 15 min per IP — generous enough for normal portal use, tight enough to
 * make brute-force of a 6-char alphanumeric code (2.2 billion combos) take years.
 */
export const referrerCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests. Please wait 15 minutes before trying again." },
});

/** Referrer portal login — Tier 1: 10 attempts / 15 minutes per IP */
export const referrerLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many login attempts. Your IP has been locked out for 15 minutes. Please try again later." },
});

/** Referrer portal login — Tier 2: 15 attempts / 24 hours per IP (hard block) */
export const referrerLoginHardLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 15,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Your IP has been blocked due to repeated failed login attempts. Please contact support or try again tomorrow." },
});

// ---------------------------------------------------------------------------
// Request ID middleware
// ---------------------------------------------------------------------------
export function requestId(req: Request, res: Response, next: NextFunction) {
  const id = nanoid(12);
  (req as Request & { id: string }).id = id;
  res.setHeader("X-Request-Id", id);
  next();
}

// ---------------------------------------------------------------------------
// Security headers via Helmet
// ---------------------------------------------------------------------------
const isDev = process.env.NODE_ENV !== "production";

export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        // 'unsafe-inline' is only permitted in dev (Vite HMR requires it).
        // In production, inline scripts are blocked — use external script files.
        ...(isDev ? ["'unsafe-inline'"] : []),
        "https://maps.googleapis.com",
        "https://maps.gstatic.com",
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'", // Required for Tailwind CSS-in-JS injected styles
        "https://fonts.googleapis.com",
      ],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: [
        "'self'",
        "data:",
        "blob:",
        "https:",
        "https://maps.googleapis.com",
        "https://maps.gstatic.com",
        "https://*.r2.dev",                  // Cloudflare R2 public bucket URLs
        "https://*.cloudflarestorage.com",   // Cloudflare R2 presigned URLs
      ],
      connectSrc: [
        "'self'",
        "https://api.resend.com",
        "https://maps.googleapis.com",
        "https://api.manus.im",              // Manus OAuth / notification APIs
        "wss:",                              // WebSocket for Vite HMR
      ],
      mediaSrc: ["'self'", "blob:"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false, // Disabled: breaks Google Maps
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  xFrameOptions: { action: "deny" },
  xContentTypeOptions: true,
  dnsPrefetchControl: { allow: false },
  permittedCrossDomainPolicies: false,
});

/**
 * Permissions-Policy header: disable browser features this app never uses.
 * Prevents malicious scripts from activating camera, microphone, geolocation, etc.
 */
export function permissionsPolicy(_req: Request, res: Response, next: NextFunction) {
  res.setHeader(
    "Permissions-Policy",
    [
      "camera=()",
      "microphone=()",
      "geolocation=()",
      "payment=()",
      "usb=()",
      "magnetometer=()",
      "gyroscope=()",
      "accelerometer=()",
    ].join(", ")
  );
  next();
}

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, curl, Postman)
    if (!origin) return callback(null, true);
    const allowed = ALLOWED_ORIGINS.some((o) =>
      typeof o === "string" ? o === origin : o.test(origin)
    );
    if (allowed) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin '${origin}' not allowed`));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
  maxAge: 86400, // 24h preflight cache
});

// ---------------------------------------------------------------------------
// Apply all security middleware to an Express app
// ---------------------------------------------------------------------------
export function applySecurityMiddleware(app: Express) {
  // Trust Vercel's proxy (needed for correct IP in rate limiters)
  app.set("trust proxy", 1);

  app.use(requestId);
  app.use(helmetMiddleware);
  app.use(permissionsPolicy);
  app.use(corsMiddleware);
  app.use(globalLimiter);
}
