const mysql2 = require('/home/ubuntu/freshselect-meals/node_modules/.pnpm/mysql2@3.15.1/node_modules/mysql2/promise.js');

async function main() {
  const url = process.env.DATABASE_URL;
  const conn = await mysql2.createConnection(url);

  console.log('\n=== ALL ASSESSOR USERS ===');
  const [assessors] = await conn.execute(
    `SELECT id, name, email, role, isActive, createdAt FROM users WHERE role = 'assessor' ORDER BY id`
  );
  for (const a of assessors) {
    console.log(`  ID:${a.id} | Name:${a.name} | Email:${a.email} | active:${a.isActive} | joined:${a.createdAt}`);
  }

  console.log('\n=== ALL ACTIONS BY ASSESSORS IN AUDIT LOG ===');
  const [actions] = await conn.execute(`
    SELECT al.actorId, al.actorName, al.action, COUNT(*) as cnt,
           MIN(al.createdAt) as first_seen, MAX(al.createdAt) as last_seen
    FROM auditLogs al
    JOIN users u ON al.actorId = u.id
    WHERE u.role = 'assessor'
    GROUP BY al.actorId, al.actorName, al.action
    ORDER BY al.actorId, al.action
  `);
  for (const r of actions) {
    console.log(`  [${r.actorId}] ${r.actorName} | action:${r.action} | count:${r.cnt} | last:${r.last_seen}`);
  }

  console.log('\n=== ANY export/csv/download ACTIONS IN ENTIRE AUDIT LOG ===');
  const [exportActions] = await conn.execute(`
    SELECT al.actorId, al.actorName, al.action, al.createdAt, u.role
    FROM auditLogs al
    LEFT JOIN users u ON al.actorId = u.id
    WHERE al.action LIKE '%export%' OR al.action LIKE '%csv%' OR al.action LIKE '%download%'
    ORDER BY al.createdAt DESC LIMIT 50
  `);
  console.log(`  Found ${exportActions.length} export/csv/download events in audit log`);
  for (const r of exportActions) {
    console.log(`  [${r.actorId}] ${r.actorName} (${r.role}) | ${r.action} | ${r.createdAt}`);
  }

  console.log('\n=== ASSESSOR ACTIVITY SUMMARY ===');
  const [summary] = await conn.execute(`
    SELECT u.id, u.name, u.email,
      (SELECT COUNT(*) FROM auditLogs al WHERE al.actorId = u.id) as total_events,
      (SELECT MAX(al.createdAt) FROM auditLogs al WHERE al.actorId = u.id) as last_activity,
      (SELECT MIN(al.createdAt) FROM auditLogs al WHERE al.actorId = u.id AND al.action = 'login_success') as first_login
    FROM users u
    WHERE u.role = 'assessor'
    ORDER BY last_activity DESC
  `);
  for (const r of summary) {
    console.log(`  ID:${r.id} | ${r.name} | ${r.email} | events:${r.total_events} | first_login:${r.first_login} | last_activity:${r.last_activity}`);
  }

  await conn.end();
}

main().catch(console.error);
