import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { applySecurityMiddleware, submissionLimiter, loginLimiter, loginHardLimiter, uploadLimiter, referrerLoginLimiter, referrerLoginHardLimiter, passwordResetLimiter, referrerCodeLimiter } from "./security";
import { requestLogger } from "./logger";
import { createClientEmail, getSubmissionById, createNotification } from "../db";
import { sdk } from "./sdk";
import { Webhook } from "svix";
import { Resend } from "resend";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Security middleware (helmet, CORS, rate limiting, request ID)
  applySecurityMiddleware(app);

  // Request logger
  app.use(requestLogger);

  // ─── Inbound email webhook (Resend forwards client replies here) ──────────
  // IMPORTANT: Registered BEFORE the global express.json() middleware so that
  // express.raw() captures the raw bytes Svix needs for signature verification.
  //
  // Resend sends a POST to this endpoint when a client replies to an email.
  // Payload format (email.received event):
  //   { type: "email.received", data: { email_id, from, to, subject, message_id, ... } }
  // NOTE: The webhook payload does NOT include the email body/text/html.
  //   We must call resend.emails.receiving.get(email_id) to fetch the full content.
  app.post("/api/inbound-email", express.raw({ type: "*/*" }), async (req, res) => {
    try {
      // ── Signature verification ──────────────────────────────────────────────
      // BUG-SEC4-A FIX: fail CLOSED — if the secret is not configured, reject all requests.
      // Previously: if (webhookSecret) { ... } — missing secret silently skipped verification,
      // allowing any attacker to POST fake email.received events and inject messages into
      // client records by guessing a submission ID in the To address.
      const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
      if (!webhookSecret) {
        console.error("[Inbound Email] RESEND_WEBHOOK_SECRET is not set — rejecting all webhook requests (fail closed)");
        res.status(500).json({ ok: false, error: "webhook_secret_not_configured" });
        return;
      }
      const svixId = req.headers["svix-id"] as string | undefined;
      const svixTimestamp = req.headers["svix-timestamp"] as string | undefined;
      const svixSignature = req.headers["svix-signature"] as string | undefined;
      if (!svixId || !svixTimestamp || !svixSignature) {
        console.warn("[Inbound Email] Missing Svix headers — rejecting request");
        res.status(400).json({ ok: false, error: "missing_svix_headers" });
        return;
      }
      try {
        const wh = new Webhook(webhookSecret);
        wh.verify(req.body, { "svix-id": svixId, "svix-timestamp": svixTimestamp, "svix-signature": svixSignature });
      } catch (verifyErr) {
        console.warn("[Inbound Email] Invalid webhook signature — rejecting request");
        res.status(400).json({ ok: false, error: "invalid_signature" });
        return;
      }

      // Parse the raw body
      const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body);
      const event = JSON.parse(rawBody);

      // Only handle email.received events
      if (event.type !== "email.received") {
        res.status(200).json({ ok: true, skipped: true, reason: "not_email_received" });
        return;
      }

      const data = event.data ?? {};
      const emailId: string = data.email_id ?? "";

      // ── Extract To addresses from the webhook metadata ──────────────────────
      // data.to is an array of strings like ["reply-1950042@inbound.freshselectmeals.com"]
      const rawTo: unknown = data.to;
      const toList: string[] = [];
      if (typeof rawTo === "string") toList.push(rawTo);
      else if (Array.isArray(rawTo)) {
        for (const t of rawTo) {
          if (typeof t === "string") toList.push(t);
          else if (t && typeof t === "object" && "email" in t) toList.push((t as { email: string }).email);
        }
      }

      // Try to extract submissionId and optional blastId from any of the To addresses
      // Matches: reply-{id}@..., client-{id}@..., or blast-{blastId}-{submissionId}@...
      let submissionId: number | null = null;
      let blastId: number | null = null;
      let matchedTo = "";
      for (const addr of toList) {
        // blast-specific reply-to: blast-{blastId}-{submissionId}@inbound.freshselectmeals.com
        const blastMatch = addr.match(/blast-(\d+)-(\d+)@/);
        if (blastMatch) {
          blastId = parseInt(blastMatch[1], 10);
          submissionId = parseInt(blastMatch[2], 10);
          matchedTo = addr;
          break;
        }
        // generic reply-to: reply-{submissionId}@... or client-{submissionId}@...
        const m = addr.match(/(?:reply|client)-(\d+)@/);
        if (m) { submissionId = parseInt(m[1], 10); matchedTo = addr; break; }
      }

      if (!submissionId) {
        console.log("[Inbound Email] No submission ID found in To addresses:", toList);
        res.status(200).json({ ok: true, skipped: true, reason: "no_match" });
        return;
      }

      const submission = await getSubmissionById(submissionId);
      if (!submission) {
        res.status(200).json({ ok: true, skipped: true, reason: "no_submission" });
        return;
      }

      // ── Fetch full email content via Resend API ─────────────────────────────
      // The webhook payload does NOT include body text/html — must fetch separately
      const fromEmail: string = typeof data.from === "string" ? data.from : "";
      const subject: string = data.subject ?? "(no subject)";
      let body = "";
      let resendMessageId = data.message_id ?? null;

      if (emailId) {
        try {
          const resend = new Resend(process.env.RESEND_API_KEY);
          const { data: emailContent, error } = await resend.emails.receiving.get(emailId);
          if (error) {
            console.warn("[Inbound Email] Failed to fetch email content:", error);
          } else if (emailContent) {
            // Prefer plain text; fall back to HTML stripped of tags
            body = (emailContent as { text?: string; html?: string }).text ?? "";
            if (!body && (emailContent as { html?: string }).html) {
              body = ((emailContent as { html: string }).html)
                .replace(/<[^>]+>/g, " ")
                .replace(/\s{2,}/g, " ")
                .trim();
            }
            resendMessageId = (emailContent as { message_id?: string }).message_id ?? resendMessageId;
          }
        } catch (fetchErr) {
          console.warn("[Inbound Email] Error fetching email content:", fetchErr);
        }
      }

      // Strip quoted reply history and signatures
      body = body
        .split("\n")
        .filter((line: string) => !line.trimStart().startsWith(">"))
        .join("\n")
        .replace(/\n*On .+ wrote:[\s\S]*/i, "")
        .replace(/_{5,}[\s\S]*/g, "")
        .trim();

      await createClientEmail({
        submissionId,
        direction: "inbound",
        subject,
        body,
        fromEmail,
        toEmail: matchedTo,
        resendMessageId,
        inReplyTo: data.in_reply_to ?? null,
        blastId: blastId ?? undefined,
      });

      console.log(`[Inbound Email] Stored reply from ${fromEmail} for client #${submissionId} (subject: "${subject}")`);

      // Create in-app notification for staff
      const clientName = [submission.firstName, submission.lastName].filter(Boolean).join(" ") || `Client #${submissionId}`;
      createNotification({
        type: "inbound_email",
        title: `Email reply from ${clientName}`,
        body: `Subject: ${subject}${body ? " — " + body.slice(0, 120) + (body.length > 120 ? "…" : "") : ""}`,
        link: `/admin/clients/${submissionId}`,
        submissionId,
      }).catch((e: unknown) => console.warn("[Notification] Failed to create inbound email notification:", e));

      res.status(200).json({ ok: true });

    } catch (err) {
      console.error("[Inbound Email] Error processing webhook:", err);
      // Return 500 so Resend retries the delivery — a client reply must not be silently lost
      // due to a transient DB error. Resend will retry with exponential backoff.
      // Only return 200 for expected non-error skips (no submission match, wrong event type, etc.)
      res.status(500).json({ ok: false, error: "internal_error" });
    }
  });

  // Body parser — tight limits to prevent DoS (registered AFTER the raw inbound route)
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ limit: "10mb", extended: true }));

  // OAuth callback under /api/oauth/callback
  registerStorageProxy(app);
  registerOAuthRoutes(app);

  // Health check endpoint
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", ts: Date.now() });
  });

  // ─── Scheduled QA health check endpoint ──────────────────────────────────
  // Called daily by the Manus scheduled task agent via:
  //   curl -X POST $SCHEDULED_TASK_ENDPOINT_BASE/api/scheduled/qa-health \
  //     -H "Cookie: app_session_id=$SCHEDULED_TASK_COOKIE"
  // The endpoint checks DB connectivity, counts submissions, and sends an
  // owner notification with the daily health summary.
  app.post("/api/scheduled/qa-health", async (req, res) => {
    // Require a valid session cookie (the Manus scheduled task injects
    // $SCHEDULED_TASK_COOKIE automatically). This prevents unauthenticated
    // callers from triggering DB queries and owner notifications.
    try {
      const user = await sdk.authenticateRequest(req).catch(() => null);
      if (!user) {
        res.status(401).json({ ok: false, error: "Unauthorized" });
        return;
      }
    } catch {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    try {
      const { getSubmissionStats, getTaskStats } = await import("../db");
      const { notifyOwner } = await import("./notification");

      // Run checks
      const [stats, taskStats] = await Promise.all([
        getSubmissionStats().catch(() => null),
        getTaskStats().catch(() => null),
      ]);

      const now = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
      const s = stats as any;
      const lines: string[] = [
        `Daily QA Health Check \u2014 ${now} (ET)`,
        "",
        "## Database",
        s ? `\u2705 Connected \u2014 ${s.total ?? 0} total clients` : "\u274c DB query failed",
        "",
        "## Clients by Stage",
      ];

      if (s) {
        const stages = s.stages ?? {};
        for (const [stage, count] of Object.entries(stages)) {
          lines.push(`  ${stage}: ${count}`);
        }
      }

      lines.push("", "## Tasks");
      if (taskStats) {
        const ts = taskStats as any;
        lines.push(`  Open: ${ts.open ?? 0}`);
        lines.push(`  Completed: ${ts.completed ?? 0}`);
      } else {
        lines.push("  (task stats unavailable)");
      }

      lines.push("", "## Status", "\u2705 Server is up and responding");

      const content = lines.join("\n");

      try {
        await notifyOwner({ title: "FreshSelect Daily QA Report", content });
      } catch {
        // Notification failure is non-fatal
      }

      console.log("[QA Health] Daily check completed successfully");
      res.json({ ok: true, summary: content });
    } catch (err: any) {
      console.error("[QA Health] Error:", err);
      res.status(500).json({ ok: false, error: err?.message ?? "Unknown error" });
    }
  });

  // Per-route rate limiters (applied before tRPC handler)
  app.use("/api/trpc/submission.submit", submissionLimiter);

  // Admin login: Tier 1 (10/hr) then Tier 2 (15/24hr hard block)
  app.use("/api/trpc/auth.adminLogin", loginLimiter);
  app.use("/api/trpc/auth.adminLogin", loginHardLimiter);

  // Referrer portal login: same two-tier protection (nested under admin router)
  app.use("/api/trpc/admin.referrerPortal.login", referrerLoginLimiter);
  app.use("/api/trpc/admin.referrerPortal.login", referrerLoginHardLimiter);
  // BUG-SEC-A FIX: rate-limit referrer portal code-based endpoints to prevent PII enumeration
  // by brute-forcing referral codes (myClients, myStats, myMessages, reply, etc.)
  app.use("/api/trpc/admin.referrerPortal.myClients", referrerCodeLimiter);
  app.use("/api/trpc/admin.referrerPortal.myStats", referrerCodeLimiter);
  app.use("/api/trpc/admin.referrerPortal.myMessages", referrerCodeLimiter);
  app.use("/api/trpc/admin.referrerPortal.reply", referrerCodeLimiter);
  app.use("/api/trpc/admin.referrerPortal.markAllRead", referrerCodeLimiter);
  app.use("/api/trpc/admin.referrerPortal.deleteMessage", referrerCodeLimiter);

  app.use("/api/trpc/upload.document", uploadLimiter);
  // Password reset: 5 requests / 15 min per IP — prevents inbox flooding
  app.use("/api/trpc/passwordReset.forgotPassword", passwordResetLimiter);
  // tRPC APII
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // ─── Scheduled email blast endpoint ────────────────────────────────────────
  // Called by Manus Heartbeat at the scheduled time. Sends the email blast
  // to all matching clients and marks the blast as sent.
  app.post("/api/scheduled/email-blast", async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req).catch(() => null);
      if (!user || !(user as any).isCron) {
        res.status(401).json({ ok: false, error: "Unauthorized" });
        return;
      }
    } catch {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    try {
      const { blastId } = req.body as { blastId?: number };
      if (!blastId) {
        res.status(400).json({ ok: false, error: "Missing blastId" });
        return;
      }
      const {
        updateEmailBlastStatus, getClientEmailsForBlast, getEmailBlastById,
      } = await import("../db");
      const { sendEmail } = await import("../email");
      const { deleteHeartbeatJob } = await import("./heartbeat");

      const blast = await getEmailBlastById(blastId);
      if (!blast || blast.blastStatus !== "scheduled") {
        res.json({ ok: true, skipped: true, reason: "Blast not found or not scheduled" });
        return;
      }

      // ATOMIC CLAIM: only proceed if we successfully transition scheduled->sending.
      // If two cron invocations race, only the first UPDATE that finds blastStatus='scheduled'
      // will get affectedRows=1. The second will get 0 and bail out, preventing a double-send.
      const claimed = await updateEmailBlastStatus(blastId, "sending", undefined, "scheduled");
      if (!claimed) {
        console.log(`[EmailBlast] Blast ${blastId} already claimed by another invocation — skipping`);
        res.json({ ok: true, skipped: true, reason: "Already claimed" });
        return;
      }

       const clients = await getClientEmailsForBlast(blast.filterStatus);
      let sentCount = 0;
      let failedCount = 0;
      const INBOUND_DOMAIN = process.env.RESEND_INBOUND_DOMAIN ?? "inbound.freshselectmeals.com";
      const escHtml = (s: string) => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
      for (const client of clients) {
        if (!client.email) { failedCount++; continue; }
        // Use a blast+client-specific reply-to so replies are linked to both the blast and the client
        // Format: blast-{blastId}-{submissionId}@inbound.freshselectmeals.com
        const replyTo = `blast-${blastId}-${client.id}@${INBOUND_DOMAIN}`;
        const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
          <p>Dear ${escHtml(client.firstName ?? "")} ${escHtml(client.lastName ?? "")},</p>
          <p>${escHtml(blast.body).replace(/\n/g, "<br/>")}</p>
          <p style="margin-top:24px;font-size:12px;color:#888">FreshSelect Meals &mdash; freshselectmeals.com</p>
        </div>`;
        const ok = await sendEmail({ to: client.email, subject: blast.subject, html, replyTo });
        if (ok) sentCount++; else failedCount++;
      }

      await updateEmailBlastStatus(blastId, "sent", {
        sentCount,
        failedCount,
        sentAt: new Date(),
      });

      // Clean up the one-time cron job
      if (blast.scheduleCronTaskUid) {
        await deleteHeartbeatJob(blast.scheduleCronTaskUid, "").catch(() => {});
      }

      console.log(`[EmailBlast] Blast ${blastId} sent: ${sentCount} ok, ${failedCount} failed`);
      res.json({ ok: true, sentCount, failedCount });
    } catch (err: any) {
      console.error("[EmailBlast] Error:", err);
      res.status(500).json({ ok: false, error: err?.message ?? "Unknown error" });
    }
  });

  // ─── Daily Digest endpoint ────────────────────────────────────────────────
  // Called daily by Manus Heartbeat (project-level cron, §4a).
  // Generates an LLM-summarised email of the previous day's activity and sends
  // it to a.krausz@levelupresources.org.
  // Pass ?test=true to send today's data instead of yesterday's (for previewing).
  app.post("/api/scheduled/daily-digest", async (req, res) => {
    try {
      const isTest = req.query.test === "true";
      // For test sends: allow CRON_SECRET header bypass (sandbox-triggered previews)
      const cronSecret = process.env.CRON_SECRET;
      const headerSecret = req.headers["x-cron-secret"] as string | undefined;
      const hasSecretBypass = cronSecret && headerSecret && headerSecret === cronSecret;
      if (!hasSecretBypass) {
        const user = await sdk.authenticateRequest(req).catch(() => null);
        if (!user || (!(user as any).isCron && !isTest)) {
          res.status(401).json({ ok: false, error: "cron-only" });
          return;
        }
      }
    } catch {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    try {
      const { getDailyDigestData } = await import("../db");
      const { sendEmail } = await import("../email");
      const { invokeLLM } = await import("./llm");
      const isTest = req.query.test === "true";

      // Use today for test sends, yesterday for scheduled cron runs
      const targetDate = new Date();
      if (!isTest) targetDate.setUTCDate(targetDate.getUTCDate() - 1);
      const dateStr = targetDate.toISOString().slice(0, 10);

      const data = await getDailyDigestData(dateStr);

      // Build a concise text summary for the LLM
      const summaryInput = [
        `Date: ${data.date}`,
        `New clients added: ${data.newClients.length}${data.newClients.length > 0 ? " (" + data.newClients.map(c => c.name).join(", ") + ")" : ""}`,
        `Stage changes: ${data.stageChanges.length}${data.stageChanges.length > 0 ? " (" + data.stageChanges.map(c => `${c.clientName}: ${c.fromStage ?? "start"} → ${c.toStage}`).join("; ") + ")" : ""}`,
        `Tasks created: ${data.tasksCreated.length}`,
        `Tasks completed: ${data.tasksCompleted.length}`,
        `Documents uploaded: ${data.documentsUploaded.length}`,
        `Staff logins: ${data.staffLogins.length}${data.staffLogins.length > 0 ? " (" + Array.from(new Set(data.staffLogins.map(l => l.actorName ?? "Unknown"))).join(", ") + ")" : ""}`,
        `Total audit actions: ${data.totalActions}`,
      ].join("\n");

      let aiSummary = "";
      try {
        const llmRes = await invokeLLM({
          messages: [
            { role: "system", content: "You are a concise operations assistant for FreshSelect Meals, a non-profit food assistance program. Write a 2-3 sentence plain-English summary of the day's activity for the program director. Be specific about numbers. Flag anything that might need attention (e.g. no new clients, many stage changes, tasks overdue). Do not use markdown." },
            { role: "user", content: summaryInput },
          ],
        });
        aiSummary = (llmRes as any)?.choices?.[0]?.message?.content ?? "";
      } catch (llmErr) {
        console.warn("[DailyDigest] LLM summary failed:", llmErr);
        aiSummary = "AI summary unavailable.";
      }

      // Build focused HTML email — staff activity breakdown, no raw log
      const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const fmtTime = (d: Date) => new Date(d).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" });
      const section = (title: string, rows: string[]) => rows.length === 0
        ? `<tr><td style="padding:12px 20px"><b style="color:#374151">${esc(title)}</b><br/><span style="color:#9ca3af;font-size:13px">Nothing to report.</span></td></tr>`
        : `<tr><td style="padding:12px 20px"><b style="color:#374151">${esc(title)}</b><ul style="margin:6px 0 0 0;padding-left:20px;font-size:13px;color:#374151">${rows.map(r => `<li>${r}</li>`).join("")}</ul></td></tr>`;

      const newClientRows = data.newClients.map(c =>
        `<b>${esc(c.name)}</b> — ${esc(c.referralSource ?? "Unknown source")} → <i>${esc(c.stage)}</i>`);
      const stageRows = data.stageChanges.map(c =>
        `<b>${esc(c.clientName ?? "Unknown")}</b>: ${esc(c.fromStage ?? "start")} → <b>${esc(c.toStage)}</b> <span style="color:#9ca3af">(${esc(c.actorName ?? "Staff")}, ${fmtTime(c.createdAt)})</span>`);
      const taskCreatedRows = data.tasksCreated.map(t =>
        `${esc(t.title)}${t.clientName ? ` — <i>${esc(t.clientName)}</i>` : ""}`);
      const taskDoneRows = data.tasksCompleted.map(t =>
        `${esc(t.title)}${t.clientName ? ` — <i>${esc(t.clientName)}</i>` : ""}`);
      const docRows = data.documentsUploaded.map(d =>
        `${esc(d.fileName)} for <b>${esc(d.clientName ?? "Unknown")}</b>${d.actorName ? ` by ${esc(d.actorName)}` : ""}`);

      // Per-staff breakdown — meaningful client-facing actions only
      const MEANINGFUL_ACTIONS = new Set([
        "stage_changed", "task_created", "task_completed", "task_updated", "task_deleted",
        "document_uploaded", "document_deleted", "message_sent", "note_added", "note_updated",
        "client_updated", "client_created", "referral_sent", "assessment_submitted",
        "org_message_sent", "task_assigned",
      ]);
      type StaffEntry = { action: string; clientName: string | null; createdAt: Date };
      const staffMap = new Map<string, StaffEntry[]>();
      for (const a of data.allActions) {
        if (!MEANINGFUL_ACTIONS.has(a.action)) continue;
        if (!a.actorName) continue;
        if (!staffMap.has(a.actorName)) staffMap.set(a.actorName, []);
        staffMap.get(a.actorName)!.push({ action: a.action, clientName: a.clientName, createdAt: a.createdAt });
      }
      const staffSections = Array.from(staffMap.entries()).map(([name, entries]) => {
        const rows = entries.map(e => {
          const label = e.action.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
          const client = e.clientName ? ` — <i>${esc(e.clientName)}</i>` : "";
          const time = `<span style="color:#9ca3af">${fmtTime(e.createdAt)}</span>`;
          return `${time} ${esc(label)}${client}`;
        });
        return section(`👤 ${esc(name)} (${entries.length} action${entries.length !== 1 ? "s" : ""})`, rows);
      }).join("");

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:sans-serif;background:#f9fafb;margin:0;padding:20px">
<div style="max-width:680px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
  <div style="background:#16a34a;padding:20px 24px">
    <h1 style="margin:0;color:#fff;font-size:20px">🌿 FreshSelect Meals — Daily Report</h1>
    <p style="margin:4px 0 0;color:#bbf7d0;font-size:14px">${esc(data.date)} · New York time · a.krausz@levelupresources.org</p>
  </div>
  <div style="padding:16px 20px;background:#f0fdf4;border-bottom:1px solid #dcfce7">
    <p style="margin:0;font-size:15px;color:#166534;line-height:1.6"><b>Summary:</b> ${esc(aiSummary)}</p>
  </div>
  <table style="width:100%;border-collapse:collapse">
    ${section(`🆕 New Clients (${data.newClients.length})`, newClientRows)}
    ${section(`🔄 Stage Changes (${data.stageChanges.length})`, stageRows)}
    ${section(`✅ Tasks Created (${data.tasksCreated.length})`, taskCreatedRows)}
    ${section(`☑️ Tasks Completed (${data.tasksCompleted.length})`, taskDoneRows)}
    ${section(`📄 Documents Uploaded (${data.documentsUploaded.length})`, docRows)}
  </table>
  ${staffMap.size > 0 ? `
  <div style="border-top:2px solid #16a34a;margin-top:4px">
    <div style="padding:10px 20px;background:#f0fdf4"><b style="color:#166534;font-size:14px">Staff Activity Breakdown</b></div>
    <table style="width:100%;border-collapse:collapse">${staffSections}</table>
  </div>` : ""}
  <div style="padding:12px 20px;background:#f9fafb;border-top:1px solid #e5e7eb">
    <p style="margin:0;font-size:11px;color:#9ca3af">FreshSelect Meals automated daily digest — sent at 08:00 ET daily · freshselectmeals.com</p>
  </div>
</div>
</body></html>`;
      const ok = await sendEmail({
        to: isTest ? "a.krausz@levelupresources.org" : "a.krausz@levelupresources.org",
        subject: `FreshSelect Meals Daily Report${isTest ? " [TEST]" : ""} — ${data.date}`,
        html,
      });

      console.log(`[DailyDigest] ${data.date} sent=${ok} actions=${data.totalActions}`);
      res.json({ ok, date: data.date, totalActions: data.totalActions, aiSummary });
    } catch (err: any) {
      console.error("[DailyDigest] Error:", err);
      res.status(500).json({ ok: false, error: err?.message ?? "Unknown error", stack: err?.stack, timestamp: new Date().toISOString() });
    }
  });

  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
