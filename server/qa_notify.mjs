/**
 * qa_notify.mjs — sends the QA report via the Manus notification API.
 * Mirrors the logic in server/_core/notification.ts exactly.
 *
 * Usage: node server/qa_notify.mjs "<title>" "<markdown_content>"
 */
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env if present (dev); in production env vars are injected directly
try {
  const envPath = path.join(__dirname, "..", ".env");
  const lines = readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {
  // No .env file — rely on injected env vars
}

const title   = process.argv[2] ?? "Daily QA Report";
const content = process.argv[3] ?? "(no content)";

const forgeApiUrl = process.env.BUILT_IN_FORGE_API_URL;
const forgeApiKey = process.env.BUILT_IN_FORGE_API_KEY;

if (!forgeApiUrl || !forgeApiKey) {
  console.error("[qa_notify] BUILT_IN_FORGE_API_URL or BUILT_IN_FORGE_API_KEY not set — skipping notification.");
  process.exit(0);
}

// Mirror buildEndpointUrl from notification.ts
const normalizedBase = forgeApiUrl.endsWith("/") ? forgeApiUrl : `${forgeApiUrl}/`;
const endpoint = new URL("webdevtoken.v1.WebDevService/SendNotification", normalizedBase).toString();

try {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${forgeApiKey}`,
      "content-type": "application/json",
      "connect-protocol-version": "1",
    },
    body: JSON.stringify({ title, content }),
  });

  if (res.ok) {
    console.log("[qa_notify] ✅ Notification sent successfully.");
  } else {
    const text = await res.text().catch(() => "");
    console.error(`[qa_notify] ❌ Failed: ${res.status} ${res.statusText}${text ? ` — ${text}` : ""}`);
  }
} catch (err) {
  console.error("[qa_notify] ❌ Error:", err.message);
}
