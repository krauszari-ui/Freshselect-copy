import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { submissions } from "../drizzle/schema";

async function main() {
  const c = await mysql.createConnection(process.env.DATABASE_URL!);
  const db = drizzle(c);

  await c.execute(
    `INSERT INTO submissions (referenceNumber, firstName, lastName, email, cellPhone, medicaidId, supermarket, status, stage, formData, hipaaConsentAt, createdAt, updatedAt)
     VALUES ('TESTDUP1', 'Test', 'User', 't@t.com', '1234567890', 'ZZ00001A', 'Foodoo Kosher', 'new', 'referral', '{}', NOW(), NOW(), NOW())`
  );

  try {
    await db.insert(submissions).values({
      referenceNumber: "TESTDUP2",
      firstName: "Test",
      lastName: "User2",
      email: "t@t.com",
      cellPhone: "1234567890",
      medicaidId: "ZZ00001A",
      supermarket: "Foodoo Kosher",
      status: "new",
      stage: "referral",
      formData: {},
      hipaaConsentAt: new Date(),
    });
  } catch (e: any) {
    console.log("code:", e.code);
    console.log("errno:", e.errno);
    console.log("cause.code:", e.cause?.code);
    console.log("cause.errno:", e.cause?.errno);
    console.log("message:", e.message?.substring(0, 120));
    console.log("all keys:", Object.keys(e));
  }

  await c.execute("DELETE FROM submissions WHERE medicaidId LIKE 'ZZ%'");
  c.end();
}

main().catch(console.error);
