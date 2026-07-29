/**
 * One-time maintenance script: clear stale plaintext password reset tokens.
 *
 * Background: Before BUG-SEC2-C was fixed, reset tokens were stored as plaintext hex.
 * After the fix, tokens are stored as SHA-256 hashes. Any token stored before the fix
 * is a plaintext value that will silently fail on lookup (the lookup now hashes the
 * incoming token before comparing, so plaintext stored values will never match).
 * These stale tokens should be cleared so users get a clean "no pending reset" state.
 *
 * Safe to run multiple times (idempotent — clears whatever is present).
 */

import { createConnection } from "mysql2/promise";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env from the webdev env file
const envPath = "/opt/.manus/webdev.sh.env";
let DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  try {
    const envContent = readFileSync(envPath, "utf8");
    for (const line of envContent.split("\n")) {
      const match = line.match(/^export DATABASE_URL="?([^"]+)"?/);
      if (match) {
        DATABASE_URL = match[1];
        break;
      }
    }
  } catch {
    // env file not found
  }
}

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL not found. Cannot connect to database.");
  process.exit(1);
}

const conn = await createConnection(DATABASE_URL);

try {
  // Step 1: Count stale tokens (any non-null passwordResetToken)
  const [countRows] = await conn.execute(
    "SELECT COUNT(*) as total FROM users WHERE passwordResetToken IS NOT NULL"
  );
  const total = countRows[0].total;
  console.log(`📊 Users with a pending reset token: ${total}`);

  if (total === 0) {
    console.log("✅ No stale tokens found. Nothing to clear.");
    process.exit(0);
  }

  // Step 2: Show affected users (email only, no sensitive data)
  const [affected] = await conn.execute(
    "SELECT id, email, passwordResetExpires FROM users WHERE passwordResetToken IS NOT NULL"
  );
  console.log("\nAffected users:");
  for (const row of affected) {
    const expiry = row.passwordResetExpires
      ? new Date(row.passwordResetExpires).toISOString()
      : "no expiry";
    console.log(`  - id=${row.id} email=${row.email} expires=${expiry}`);
  }

  // Step 3: Clear all stale tokens
  const [result] = await conn.execute(
    "UPDATE users SET passwordResetToken = NULL, passwordResetExpires = NULL WHERE passwordResetToken IS NOT NULL"
  );
  console.log(`\n✅ Cleared ${result.affectedRows} stale reset token(s).`);

  // Step 4: Verify
  const [verifyRows] = await conn.execute(
    "SELECT COUNT(*) as remaining FROM users WHERE passwordResetToken IS NOT NULL"
  );
  console.log(`🔍 Remaining tokens after cleanup: ${verifyRows[0].remaining}`);

} finally {
  await conn.end();
}
