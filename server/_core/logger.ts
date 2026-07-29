/**
 * Structured request/response logger for FreshSelect Meals.
 *
 * Emits one JSON log line per request with:
 *  - method, path, status, duration (ms), IP, request ID
 *
 * In development the output is human-readable; in production it is JSON
 * so Vercel / Datadog / CloudWatch can parse it.
 */
import type { Request, Response, NextFunction } from "express";

const IS_DEV = process.env.NODE_ENV !== "production";

function sanitizePath(path: string): string {
  // Strip query strings from logged paths to avoid leaking PII in logs
  return path.split("?")[0];
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  const reqId = res.getHeader("X-Request-Id") as string ?? "-";

  res.on("finish", () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.ip ?? "-";

    if (IS_DEV) {
      const color = res.statusCode >= 500 ? "\x1b[31m" : res.statusCode >= 400 ? "\x1b[33m" : "\x1b[32m";
      console.log(`${color}[${level.toUpperCase()}]\x1b[0m ${req.method} ${sanitizePath(req.path)} → ${res.statusCode} (${duration}ms) [${reqId}]`);
    } else {
      console.log(JSON.stringify({
        level,
        ts: new Date().toISOString(),
        method: req.method,
        path: sanitizePath(req.path),
        status: res.statusCode,
        duration,
        ip,
        reqId,
      }));
    }
  });

  next();
}

/** Log a server-side error with context for tRPC error handler */
export function logError(message: string, error: unknown, context?: Record<string, unknown>) {
  const err = error instanceof Error ? error : new Error(String(error));
  if (IS_DEV) {
    console.error(`[ERROR] ${message}`, context ?? "", err.message);
  } else {
    console.error(JSON.stringify({
      level: "error",
      ts: new Date().toISOString(),
      message,
      error: err.message,
      stack: err.stack?.split("\n").slice(0, 5).join(" | "),
      ...context,
    }));
  }
}
