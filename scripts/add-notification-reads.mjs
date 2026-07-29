import mysql from "mysql2/promise";
import { config } from "dotenv";
config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

await conn.execute(`
  CREATE TABLE IF NOT EXISTS \`notificationReads\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`notificationId\` int NOT NULL,
    \`userId\` int NOT NULL,
    \`readAt\` timestamp NOT NULL DEFAULT (now()),
    CONSTRAINT \`notificationReads_id\` PRIMARY KEY(\`id\`)
  )
`);

// Add unique index to prevent duplicate read entries per user per notification
try {
  await conn.execute(`
    ALTER TABLE \`notificationReads\`
    ADD UNIQUE KEY \`notificationReads_notif_user\` (\`notificationId\`, \`userId\`)
  `);
  console.log("Unique index created");
} catch (e) {
  if (e.code === "ER_DUP_KEYNAME") {
    console.log("Unique index already exists, skipping");
  } else {
    throw e;
  }
}

console.log("notificationReads table created successfully");
await conn.end();
