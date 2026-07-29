import { createConnection } from "mysql2/promise";
import bcrypt from "bcryptjs";
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

const email = "a.krausz@levelupresources.org";
const name = "A. Krausz";
const password = "hatzlacha";
const role = "super_admin";

async function main() {
  const conn = await createConnection(DATABASE_URL);
  try {
    // Check if user already exists
    const [rows] = await conn.execute("SELECT id, role FROM users WHERE email = ?", [email]);
    const existing = rows[0];

    const passwordHash = await bcrypt.hash(password, 12);

    if (existing) {
      // Update existing user to super_admin
      await conn.execute(
        "UPDATE users SET role = ?, passwordHash = ?, isActive = 1, name = ? WHERE email = ?",
        [role, passwordHash, name, email]
      );
      console.log(`✅ Updated existing user ${email} to super_admin`);
    } else {
      // Create new super_admin user
      await conn.execute(
        "INSERT INTO users (openId, email, name, passwordHash, role, loginMethod, isActive, createdAt, updatedAt, lastSignedIn) VALUES (?, ?, ?, ?, ?, 'password', 1, NOW(), NOW(), NOW())",
        [`staff_${Date.now()}`, email, name, passwordHash, role]
      );
      console.log(`✅ Created super_admin account: ${email}`);
    }

    console.log(`\n📋 Login details:`);
    console.log(`   Email:    ${email}`);
    console.log(`   Password: ${password}`);
    console.log(`   Role:     ${role}`);
    console.log(`\n⚠️  Please change the password after first login via Forgot Password.`);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
