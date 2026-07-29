import mysql from "mysql2/promise";

const conn = await mysql.createConnection(process.env.DATABASE_URL);
try {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS \`stageHistory\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`submissionId\` int NOT NULL,
      \`fromStage\` varchar(64),
      \`toStage\` varchar(64) NOT NULL,
      \`changedBy\` int,
      \`changedByName\` varchar(256),
      \`note\` text,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      CONSTRAINT \`stageHistory_id\` PRIMARY KEY(\`id\`)
    )
  `);
  console.log("✅ stageHistory table created (or already exists)");
} catch (err) {
  console.error("Migration failed:", err.message);
  process.exit(1);
} finally {
  await conn.end();
}
