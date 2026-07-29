import "dotenv/config";
import { createRequire } from "module";
import { writeFileSync } from "fs";

// Load the db helper
const require = createRequire(import.meta.url);

// We'll call the getDailyDigestData function directly
// by importing the compiled server code
process.chdir("/home/ubuntu/freshselect-meals");

// Dynamically import the db module
const { getDailyDigestData } = await import("/home/ubuntu/freshselect-meals/server/db.ts").catch(async () => {
  // Try compiled version
  return await import("/home/ubuntu/freshselect-meals/server/db.js");
});

const today = new Date().toISOString().slice(0, 10);
console.log("Fetching digest data for:", today);

const data = await getDailyDigestData(today);

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const section = (title, rows) => rows.length === 0
  ? `<tr><td style="padding:12px 20px"><b style="color:#374151">${esc(title)}</b><br/><span style="color:#9ca3af;font-size:13px">Nothing to report.</span></td></tr>`
  : `<tr><td style="padding:12px 20px"><b style="color:#374151">${esc(title)}</b><ul style="margin:6px 0 0 0;padding-left:20px;font-size:13px;color:#374151">${rows.map(r => `<li>${r}</li>`).join("")}</ul></td></tr>`;

const newClientRows = data.newClients.map(c => `<b>${esc(c.name)}</b> — ${esc(c.referralSource ?? "Unknown source")} → <i>${esc(c.stage)}</i>`);
const stageRows = data.stageChanges.map(c => `<b>${esc(c.clientName ?? "Unknown")}</b>: ${esc(c.fromStage ?? "start")} → <b>${esc(c.toStage)}</b> <span style="color:#9ca3af">(${esc(c.actorName ?? "Staff")})</span>`);
const taskCreatedRows = data.tasksCreated.map(t => `${esc(t.title)}${t.clientName ? ` — <i>${esc(t.clientName)}</i>` : ""}`);
const taskDoneRows = data.tasksCompleted.map(t => `${esc(t.title)}${t.clientName ? ` — <i>${esc(t.clientName)}</i>` : ""}`);
const docRows = data.documentsUploaded.map(d => `${esc(d.fileName)} for <b>${esc(d.clientName ?? "Unknown")}</b> by ${esc(d.actorName ?? "Staff")}`);
const loginRows = Array.from(new Set(data.staffLogins.map(l => l.actorName ?? "Unknown"))).map(n => esc(n));

const actionRows = data.allActions.slice(-100).map(a =>
  `<tr style="border-bottom:1px solid #f3f4f6"><td style="padding:4px 8px;font-size:12px;color:#6b7280">${new Date(a.createdAt).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" })}</td><td style="padding:4px 8px;font-size:12px;color:#374151">${esc(a.actorName ?? "System")}</td><td style="padding:4px 8px;font-size:12px;color:#374151">${esc(a.action.replace(/_/g, " "))}</td><td style="padding:4px 8px;font-size:12px;color:#6b7280">${esc(a.clientName ?? "")}</td></tr>`
).join("");

const aiSummary = `Today (${data.date}), FreshSelect Meals recorded ${data.totalActions} total actions: ${data.newClients.length} new client${data.newClients.length !== 1 ? "s" : ""} added, ${data.stageChanges.length} stage change${data.stageChanges.length !== 1 ? "s" : ""}, ${data.tasksCreated.length} task${data.tasksCreated.length !== 1 ? "s" : ""} created, and ${data.documentsUploaded.length} document${data.documentsUploaded.length !== 1 ? "s" : ""} uploaded. ${loginRows.length} staff member${loginRows.length !== 1 ? "s" : ""} were active: ${loginRows.join(", ") || "none"}.`;

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>FreshSelect Meals Daily Report — ${data.date}</title></head><body style="font-family:sans-serif;background:#f9fafb;margin:0;padding:20px">
<div style="max-width:680px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
  <div style="background:#16a34a;padding:20px 24px">
    <h1 style="margin:0;color:#fff;font-size:20px">FreshSelect Meals — Daily Report [TEST PREVIEW]</h1>
    <p style="margin:4px 0 0;color:#bbf7d0;font-size:14px">${esc(data.date)} (New York time) · Sent to: a.krausz@levelupresources.org</p>
  </div>
  <div style="padding:16px 20px;background:#f0fdf4;border-bottom:1px solid #dcfce7">
    <p style="margin:0;font-size:15px;color:#166534;line-height:1.5">${esc(aiSummary)}</p>
  </div>
  <table style="width:100%;border-collapse:collapse">
    ${section(`🆕 New Clients (${data.newClients.length})`, newClientRows)}
    ${section(`🔄 Stage Changes (${data.stageChanges.length})`, stageRows)}
    ${section(`✅ Tasks Created (${data.tasksCreated.length})`, taskCreatedRows)}
    ${section(`☑️ Tasks Completed (${data.tasksCompleted.length})`, taskDoneRows)}
    ${section(`📄 Documents Uploaded (${data.documentsUploaded.length})`, docRows)}
    ${section(`👤 Staff Active (${loginRows.length})`, loginRows)}
  </table>
  ${data.allActions.length > 0 ? `
  <div style="padding:12px 20px;border-top:1px solid #e5e7eb">
    <b style="color:#374151;font-size:13px">Full Activity Log (${data.allActions.length} actions — showing last 100)</b>
    <table style="width:100%;border-collapse:collapse;margin-top:8px">
      <thead><tr style="background:#f9fafb"><th style="padding:4px 8px;font-size:11px;color:#9ca3af;text-align:left">Time (ET)</th><th style="padding:4px 8px;font-size:11px;color:#9ca3af;text-align:left">Staff</th><th style="padding:4px 8px;font-size:11px;color:#9ca3af;text-align:left">Action</th><th style="padding:4px 8px;font-size:11px;color:#9ca3af;text-align:left">Client</th></tr></thead>
      <tbody>${actionRows}</tbody>
    </table>
  </div>` : ""}
  <div style="padding:12px 20px;background:#f9fafb;border-top:1px solid #e5e7eb">
    <p style="margin:0;font-size:11px;color:#9ca3af">FreshSelect Meals automated daily digest — sent at 08:00 ET daily. Recipient: a.krausz@levelupresources.org</p>
  </div>
</div>
</body></html>`;

writeFileSync("/home/ubuntu/digest-preview.html", html);
console.log("Preview written to /home/ubuntu/digest-preview.html");
console.log(`Stats: ${data.newClients.length} new clients, ${data.stageChanges.length} stage changes, ${data.totalActions} total actions`);
