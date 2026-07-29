import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }

const conn = await mysql.createConnection(url);
try {
  await conn.execute("ALTER TABLE `referrerMessages` ADD COLUMN IF NOT EXISTS `attachmentUrl` text");
  console.log("✓ Added attachmentUrl column to referrerMessages");
} catch (e) {
  if (e.code === "ER_DUP_FIELDNAME") {
    console.log("✓ attachmentUrl column already exists");
  } else {
    throw e;
  }
} finally {
  await conn.end();
}
