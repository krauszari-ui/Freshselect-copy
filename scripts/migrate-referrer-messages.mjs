import { createConnection } from "mysql2/promise";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const url = new URL(DATABASE_URL);
const connection = await createConnection({
  host: url.hostname,
  port: parseInt(url.port || "3306"),
  user: url.username,
  password: url.password,
  database: url.pathname.slice(1),
  ssl: url.hostname.includes("localhost") ? undefined : { rejectUnauthorized: true },
});

try {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS \`referrerMessages\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`referralLinkId\` int NOT NULL,
      \`submissionId\` int,
      \`senderId\` int NOT NULL,
      \`message\` text NOT NULL,
      \`readAt\` timestamp,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      CONSTRAINT \`referrerMessages_id\` PRIMARY KEY(\`id\`)
    )
  `);
  console.log("✓ referrerMessages table created (or already exists)");
} catch (err) {
  console.error("Migration failed:", err.message);
  process.exit(1);
} finally {
  await connection.end();
}
