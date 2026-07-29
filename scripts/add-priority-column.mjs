/**
 * One-time migration: add priority column to submissions table
 * Run with: node scripts/add-priority-column.mjs
 */
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }

const conn = await mysql.createConnection(url);
try {
  await conn.execute(
    "ALTER TABLE submissions ADD COLUMN `priority` ENUM('low','normal','high','urgent') NOT NULL DEFAULT 'normal'"
  );
  console.log("✅ priority column added successfully");
} catch (e) {
  if (e.code === "ER_DUP_FIELDNAME") {
    console.log("ℹ️  priority column already exists — skipping");
  } else {
    console.error("❌ Migration failed:", e.message);
    process.exit(1);
  }
} finally {
  await conn.end();
}
