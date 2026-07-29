import { createConnection } from "mysql2/promise";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error("DATABASE_URL not set"); process.exit(1); }
const url = new URL(DATABASE_URL);
const sslConfig = url.hostname.includes("localhost") || url.hostname.includes("127.0.0.1")
  ? undefined : { rejectUnauthorized: true };
const connection = await createConnection({
  host: url.hostname,
  port: parseInt(url.port || "3306"),
  user: url.username,
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1),
  ssl: sslConfig,
});
console.log("Connected. Running migration 0009...");
await connection.execute(`
  CREATE TABLE IF NOT EXISTS \`clientEmails\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`submissionId\` int NOT NULL,
    \`direction\` varchar(16) NOT NULL,
    \`subject\` varchar(512) NOT NULL,
    \`body\` text NOT NULL,
    \`fromEmail\` varchar(256) NOT NULL,
    \`toEmail\` varchar(256) NOT NULL,
    \`attachmentUrls\` text,
    \`resendMessageId\` varchar(256),
    \`inReplyTo\` varchar(256),
    \`sentBy\` int,
    \`sentAt\` timestamp NOT NULL DEFAULT (now()),
    CONSTRAINT \`clientEmails_id\` PRIMARY KEY(\`id\`)
  )
`);
console.log("✓ clientEmails table created");
// Modify referrerMessages.senderId to allow NULL
try {
  await connection.execute(`ALTER TABLE \`referrerMessages\` MODIFY COLUMN \`senderId\` int`);
  console.log("✓ referrerMessages.senderId made nullable");
} catch (e) { console.log("  senderId already nullable or error:", e.message); }
// Add direction column to referrerMessages
try {
  await connection.execute(`ALTER TABLE \`referrerMessages\` ADD COLUMN \`direction\` varchar(16) NOT NULL DEFAULT 'admin'`);
  console.log("✓ referrerMessages.direction column added");
} catch (e) { console.log("  direction column already exists or error:", e.message); }
await connection.end();
console.log("Migration 0009 complete.");
