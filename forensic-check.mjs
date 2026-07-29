import { createConnection } from 'mysql2/promise';
import { readFileSync } from 'fs';

// Load env
const envFile = '/home/ubuntu/.user_env';
let dbUrl;
try {
  const lines = readFileSync(envFile, 'utf8').split('\n');
  for (const line of lines) {
    if (line.startsWith('DATABASE_URL=')) {
      dbUrl = line.replace('DATABASE_URL=', '').replace(/^['"]|['"]$/g, '').trim();
    }
  }
} catch {}

if (!dbUrl) {
  // Try process env
  dbUrl = process.env.DATABASE_URL;
}

if (!dbUrl) {
  console.error('No DATABASE_URL found');
  process.exit(1);
}

const conn = await createConnection(dbUrl);

console.log('\n========================================');
console.log('FRESHSELECT MEALS — FORENSIC REPORT');
console.log('Generated:', new Date().toISOString());
console.log('========================================\n');

// ─── 1. Failed login attempts ────────────────────────────────────────────────
console.log('=== 1. FAILED LOGIN ATTEMPTS ===');
const [failedLogins] = await conn.execute(`
  SELECT actorName, action, details, createdAt
  FROM auditLogs
  WHERE action = 'login_failed'
  ORDER BY createdAt DESC
  LIMIT 100
`);
if (failedLogins.length === 0) {
  console.log('  No failed login attempts recorded.\n');
} else {
  console.log(`  ${failedLogins.length} failed login attempt(s) found:`);
  for (const row of failedLogins) {
    console.log(`  [${row.createdAt}] actor="${row.actorName}" details=${JSON.stringify(row.details)}`);
  }
  console.log();
}

// ─── 2. All login events (last 90 days) ─────────────────────────────────────
console.log('=== 2. SUCCESSFUL LOGINS (last 90 days) ===');
const [logins] = await conn.execute(`
  SELECT actorId, actorName, action, details, sessionId, createdAt
  FROM auditLogs
  WHERE action = 'login_success'
    AND createdAt >= DATE_SUB(NOW(), INTERVAL 90 DAY)
  ORDER BY createdAt DESC
  LIMIT 200
`);
console.log(`  ${logins.length} successful login(s) in last 90 days:`);
for (const row of logins) {
  console.log(`  [${row.createdAt}] actor="${row.actorName}" (id=${row.actorId}) session=${row.sessionId} details=${JSON.stringify(row.details)}`);
}
console.log();

// ─── 3. Bulk data access — large page_view counts per session ───────────────
console.log('=== 3. HIGH-VOLUME DATA ACCESS (sessions with >50 page views) ===');
const [bulkAccess] = await conn.execute(`
  SELECT sessionId, actorName, actorId,
    COUNT(*) as total_events,
    SUM(CASE WHEN action = 'page_view' THEN 1 ELSE 0 END) as page_views,
    MIN(createdAt) as session_start,
    MAX(createdAt) as session_end
  FROM auditLogs
  WHERE sessionId IS NOT NULL
  GROUP BY sessionId, actorName, actorId
  HAVING page_views > 50
  ORDER BY page_views DESC
  LIMIT 20
`);
if (bulkAccess.length === 0) {
  console.log('  No unusually high-volume sessions detected.\n');
} else {
  console.log(`  ${bulkAccess.length} high-volume session(s) found:`);
  for (const row of bulkAccess) {
    console.log(`  session=${row.sessionId} actor="${row.actorName}" (id=${row.actorId}) page_views=${row.page_views} total=${row.total_events} from=${row.session_start} to=${row.session_end}`);
  }
  console.log();
}

// ─── 4. Document downloads ───────────────────────────────────────────────────
console.log('=== 4. DOCUMENT DOWNLOAD EVENTS ===');
const [docDownloads] = await conn.execute(`
  SELECT actorName, actorId, clientName, clientId, details, createdAt
  FROM auditLogs
  WHERE action IN ('document_downloaded', 'document_viewed', 'document_accessed')
  ORDER BY createdAt DESC
  LIMIT 100
`);
if (docDownloads.length === 0) {
  console.log('  No document download events recorded.\n');
} else {
  console.log(`  ${docDownloads.length} document access event(s):`);
  for (const row of docDownloads) {
    console.log(`  [${row.createdAt}] actor="${row.actorName}" client="${row.clientName}" details=${JSON.stringify(row.details)}`);
  }
  console.log();
}

// ─── 5. Password reset events ────────────────────────────────────────────────
console.log('=== 5. PASSWORD RESET EVENTS ===');
const [pwResets] = await conn.execute(`
  SELECT actorName, actorId, action, details, createdAt
  FROM auditLogs
  WHERE action IN ('password_reset_requested', 'password_reset_completed')
  ORDER BY createdAt DESC
  LIMIT 50
`);
if (pwResets.length === 0) {
  console.log('  No password reset events recorded.\n');
} else {
  for (const row of pwResets) {
    console.log(`  [${row.createdAt}] ${row.action} actor="${row.actorName}" details=${JSON.stringify(row.details)}`);
  }
  console.log();
}

// ─── 6. Staff account changes ────────────────────────────────────────────────
console.log('=== 6. STAFF ACCOUNT CHANGES (created/updated/deleted) ===');
const [staffChanges] = await conn.execute(`
  SELECT actorName, actorId, action, clientName, details, createdAt
  FROM auditLogs
  WHERE action IN ('staff_created', 'staff_updated', 'staff_deleted', 'staff_deactivated', 'staff_activated', 'role_changed')
  ORDER BY createdAt DESC
  LIMIT 50
`);
if (staffChanges.length === 0) {
  console.log('  No staff account change events recorded.\n');
} else {
  for (const row of staffChanges) {
    console.log(`  [${row.createdAt}] ${row.action} by="${row.actorName}" target="${row.clientName}" details=${JSON.stringify(row.details)}`);
  }
  console.log();
}

// ─── 7. Current staff accounts ───────────────────────────────────────────────
console.log('=== 7. ALL CURRENT STAFF ACCOUNTS ===');
const [staffAccounts] = await conn.execute(`
  SELECT id, name, email, role, isActive, loginMethod, lastSignedIn, createdAt
  FROM users
  WHERE role IN ('super_admin', 'admin', 'worker', 'viewer', 'assessor')
  ORDER BY createdAt ASC
`);
console.log(`  ${staffAccounts.length} staff account(s):`);
for (const row of staffAccounts) {
  console.log(`  [${row.createdAt}] id=${row.id} name="${row.name}" email="${row.email}" role=${row.role} active=${row.isActive} lastSignedIn=${row.lastSignedIn}`);
}
console.log();

// ─── 8. Referrer portal logins ───────────────────────────────────────────────
console.log('=== 8. REFERRER PORTAL LOGINS ===');
const [referrerLogins] = await conn.execute(`
  SELECT actorName, actorId, action, details, createdAt
  FROM auditLogs
  WHERE action IN ('referrer_login', 'referrer_login_failed')
  ORDER BY createdAt DESC
  LIMIT 100
`);
if (referrerLogins.length === 0) {
  console.log('  No referrer portal login events recorded.\n');
} else {
  for (const row of referrerLogins) {
    console.log(`  [${row.createdAt}] ${row.action} actor="${row.actorName}" details=${JSON.stringify(row.details)}`);
  }
  console.log();
}

// ─── 9. Submission data access by non-admin ──────────────────────────────────
console.log('=== 9. TOTAL AUDIT LOG EVENTS BY ACTION TYPE ===');
const [actionSummary] = await conn.execute(`
  SELECT action, COUNT(*) as count, MIN(createdAt) as first, MAX(createdAt) as last
  FROM auditLogs
  GROUP BY action
  ORDER BY count DESC
`);
for (const row of actionSummary) {
  console.log(`  ${row.action}: ${row.count} events (${row.first} → ${row.last})`);
}
console.log();

// ─── 10. Recent unusual actions (last 7 days) ────────────────────────────────
console.log('=== 10. ALL EVENTS IN LAST 7 DAYS ===');
const [recentEvents] = await conn.execute(`
  SELECT actorName, actorId, action, clientName, clientId, details, createdAt
  FROM auditLogs
  WHERE createdAt >= DATE_SUB(NOW(), INTERVAL 7 DAY)
  ORDER BY createdAt DESC
  LIMIT 500
`);
console.log(`  ${recentEvents.length} event(s) in last 7 days:`);
for (const row of recentEvents) {
  console.log(`  [${row.createdAt}] ${row.action} actor="${row.actorName}" client="${row.clientName}" details=${JSON.stringify(row.details)}`);
}
console.log();

// ─── 11. Check for any unknown/unexpected users ──────────────────────────────
console.log('=== 11. ALL USER ACCOUNTS (including public/Manus OAuth) ===');
const [allUsers] = await conn.execute(`
  SELECT id, name, email, role, isActive, loginMethod, lastSignedIn, createdAt
  FROM users
  ORDER BY createdAt DESC
  LIMIT 50
`);
console.log(`  ${allUsers.length} user account(s) (most recent first):`);
for (const row of allUsers) {
  console.log(`  [${row.createdAt}] id=${row.id} name="${row.name}" email="${row.email}" role=${row.role} active=${row.isActive} method=${row.loginMethod} lastSignedIn=${row.lastSignedIn}`);
}
console.log();

await conn.end();
console.log('========================================');
console.log('FORENSIC INVESTIGATION COMPLETE');
console.log('========================================');
