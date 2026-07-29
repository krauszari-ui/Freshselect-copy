/**
 * seed-production.mjs
 * Seeds the production PlanetScale database with initial admin and worker accounts.
 *
 * Usage:
 *   DATABASE_URL="mysql://..." node scripts/seed-production.mjs
 */

import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL environment variable is required");
  process.exit(1);
}

async function main() {
  console.log("🔌 Connecting to PlanetScale...");
  const conn = await mysql.createConnection(DATABASE_URL);

  // ─── 1. Admin Account ─────────────────────────────────────────────
  const adminEmail = "admin@freshselectmeals.com";
  const adminPassword = "FreshSelect2026!";
  const adminHash = await bcrypt.hash(adminPassword, 10);
  const adminOpenId = `local_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;

  // Check if admin already exists
  const [existingAdmin] = await conn.query(
    "SELECT id FROM users WHERE email = ?",
    [adminEmail]
  );
  if (existingAdmin.length > 0) {
    console.log(`⚠️  Admin ${adminEmail} already exists (id: ${existingAdmin[0].id}), updating password...`);
    await conn.query(
      "UPDATE users SET passwordHash = ?, role = 'admin', loginMethod = 'local' WHERE email = ?",
      [adminHash, adminEmail]
    );
  } else {
    await conn.query(
      `INSERT INTO users (openId, name, email, loginMethod, role, passwordHash, isActive)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [adminOpenId, "FreshSelect Admin", adminEmail, "local", "admin", adminHash, 1]
    );
    console.log(`✅ Admin created: ${adminEmail}`);
  }

  // ─── 2. Worker Account ────────────────────────────────────────────
  const workerEmail = "worker@freshselectmeals.com";
  const workerPassword = "FreshSelect2026!";
  const workerHash = await bcrypt.hash(workerPassword, 10);
  const workerOpenId = `local_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;

  const [existingWorker] = await conn.query(
    "SELECT id FROM users WHERE email = ?",
    [workerEmail]
  );
  if (existingWorker.length > 0) {
    console.log(`⚠️  Worker ${workerEmail} already exists (id: ${existingWorker[0].id}), updating password...`);
    await conn.query(
      "UPDATE users SET passwordHash = ?, role = 'worker', loginMethod = 'local' WHERE email = ?",
      [workerHash, workerEmail]
    );
  } else {
    await conn.query(
      `INSERT INTO users (openId, name, email, loginMethod, role, passwordHash, isActive, permissions)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [workerOpenId, "FreshSelect Worker", workerEmail, "local", "worker", workerHash, 1,
       JSON.stringify({ canView: true, canEdit: true, canExport: false })]
    );
    console.log(`✅ Worker created: ${workerEmail}`);
  }

  // ─── 3. Worker Referral Link (START2026) ──────────────────────────
  const refCode = "START2026";
  const refPasswordHash = await bcrypt.hash(workerPassword, 10);

  const [existingRef] = await conn.query(
    "SELECT id FROM referralLinks WHERE code = ?",
    [refCode]
  );
  if (existingRef.length > 0) {
    console.log(`⚠️  Referral link ${refCode} already exists, updating...`);
    await conn.query(
      "UPDATE referralLinks SET email = ?, passwordHash = ?, referrerName = ?, isActive = 1 WHERE code = ?",
      [workerEmail, refPasswordHash, "FreshSelect Worker", refCode]
    );
  } else {
    // Get the worker's user ID for createdBy
    const [workerRow] = await conn.query("SELECT id FROM users WHERE email = ?", [workerEmail]);
    const createdBy = workerRow.length > 0 ? workerRow[0].id : null;

    await conn.query(
      `INSERT INTO referralLinks (code, referrerName, description, email, passwordHash, usageCount, isActive, createdBy)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [refCode, "FreshSelect Worker", "Initial worker referral link", workerEmail, refPasswordHash, 0, 1, createdBy]
    );
    console.log(`✅ Referral link created: ?ref=${refCode}`);
  }

  // ─── Summary ──────────────────────────────────────────────────────
  const [userCount] = await conn.query("SELECT COUNT(*) as count FROM users");
  const [refCount] = await conn.query("SELECT COUNT(*) as count FROM referralLinks");
  const [tableCount] = await conn.query("SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = DATABASE()");

  console.log("\n📊 Production Database Summary:");
  console.log(`   Tables: ${tableCount[0].count}`);
  console.log(`   Users: ${userCount[0].count}`);
  console.log(`   Referral Links: ${refCount[0].count}`);
  console.log("\n🔑 Login Credentials:");
  console.log(`   Admin:  ${adminEmail} / ${adminPassword}`);
  console.log(`   Worker: ${workerEmail} / ${workerPassword}`);
  console.log(`   Referral Code: ${refCode}`);

  await conn.end();
  console.log("\n✅ Seed complete!");
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
