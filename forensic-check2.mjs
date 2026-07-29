import { createConnection } from 'mysql2/promise';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) { console.error('No DATABASE_URL'); process.exit(1); }

const conn = await createConnection(dbUrl);

console.log('\n=== FORENSIC REPORT PART 2 ===\n');

// 1. Check for suspicious IPs in failed logins — foreign/unusual locations
console.log('=== A. SUSPICIOUS IP ANALYSIS ===');
const [ips] = await conn.execute(`
  SELECT 
    JSON_UNQUOTE(JSON_EXTRACT(details, '$.ip')) as ip,
    COUNT(*) as attempts,
    GROUP_CONCAT(DISTINCT action ORDER BY action) as actions,
    GROUP_CONCAT(DISTINCT actorName ORDER BY actorName SEPARATOR ', ') as actors,
    MIN(createdAt) as first,
    MAX(createdAt) as last
  FROM auditLogs
  WHERE JSON_EXTRACT(details, '$.ip') IS NOT NULL
  GROUP BY JSON_UNQUOTE(JSON_EXTRACT(details, '$.ip'))
  ORDER BY attempts DESC
  LIMIT 30
`);
console.log('Top IPs by activity:');
for (const row of ips) {
  console.log(`  IP: ${row.ip} | attempts: ${row.attempts} | actions: ${row.actions} | actors: ${row.actors} | ${row.first} → ${row.last}`);
}

// 2. Check for bulk_deleted events — who deleted what
console.log('\n=== B. BULK DELETE EVENTS ===');
const [bulkDeletes] = await conn.execute(`
  SELECT actorName, actorId, action, details, createdAt
  FROM auditLogs
  WHERE action IN ('bulk_deleted', 'client_deleted')
  ORDER BY createdAt DESC
`);
for (const row of bulkDeletes) {
  console.log(`  [${row.createdAt}] ${row.action} by="${row.actorName}" details=${JSON.stringify(row.details)}`);
}

// 3. Check referral links — any with unusually high submission counts
console.log('\n=== C. REFERRAL LINK USAGE ===');
const [referralLinks] = await conn.execute(`
  SELECT rl.id, rl.code, rl.email, rl.name, rl.isActive,
    COUNT(s.id) as submission_count,
    MAX(s.createdAt) as last_submission
  FROM referralLinks rl
  LEFT JOIN submissions s ON s.referralSource = rl.code
  GROUP BY rl.id, rl.code, rl.email, rl.name, rl.isActive
  ORDER BY submission_count DESC
`);
for (const row of referralLinks) {
  console.log(`  code="${row.code}" email="${row.email}" name="${row.name}" active=${row.isActive} submissions=${row.submission_count} last=${row.last_submission}`);
}

// 4. Check for any submissions created in bulk (many in short time window — possible scripted submission)
console.log('\n=== D. BULK SUBMISSION PATTERNS (>10 submissions in 1 hour) ===');
const [bulkSubs] = await conn.execute(`
  SELECT 
    DATE_FORMAT(createdAt, '%Y-%m-%d %H:00:00') as hour_bucket,
    COUNT(*) as count,
    MIN(createdAt) as first,
    MAX(createdAt) as last
  FROM submissions
  GROUP BY hour_bucket
  HAVING count > 10
  ORDER BY count DESC
  LIMIT 20
`);
if (bulkSubs.length === 0) {
  console.log('  No bulk submission patterns detected.');
} else {
  for (const row of bulkSubs) {
    console.log(`  Hour: ${row.hour_bucket} | count: ${row.count} | ${row.first} → ${row.last}`);
  }
}

// 5. Check for any clientEmails with unusual patterns — mass sends from non-blast sources
console.log('\n=== E. CLIENT EMAIL PATTERNS ===');
const [emailPatterns] = await conn.execute(`
  SELECT 
    direction,
    blastId IS NOT NULL as is_blast,
    COUNT(*) as count,
    MIN(createdAt) as first,
    MAX(createdAt) as last
  FROM clientEmails
  GROUP BY direction, is_blast
  ORDER BY count DESC
`);
for (const row of emailPatterns) {
  console.log(`  direction=${row.direction} is_blast=${row.is_blast} count=${row.count} ${row.first} → ${row.last}`);
}

// 6. Check for any documents uploaded by unknown/suspicious actors
console.log('\n=== F. DOCUMENT UPLOADS ===');
const [docs] = await conn.execute(`
  SELECT d.id, d.fileName, d.fileType, d.uploadedBy, d.createdAt, u.name as uploaderName, u.role as uploaderRole
  FROM documents d
  LEFT JOIN users u ON u.id = d.uploadedBy
  ORDER BY d.createdAt DESC
  LIMIT 50
`);
if (docs.length === 0) {
  console.log('  No documents found.');
} else {
  console.log(`  ${docs.length} document(s) (most recent):`);
  for (const row of docs) {
    console.log(`  [${row.createdAt}] file="${row.fileName}" type=${row.fileType} uploader="${row.uploaderName}" (role=${row.uploaderRole})`);
  }
}

// 7. Check for any users with role=user who have accessed admin paths
console.log('\n=== G. MANUS OAUTH USERS (role=user) ===');
const [oauthUsers] = await conn.execute(`
  SELECT id, name, email, role, isActive, loginMethod, lastSignedIn, createdAt
  FROM users
  WHERE role = 'user'
  ORDER BY lastSignedIn DESC
  LIMIT 20
`);
console.log(`  ${oauthUsers.length} OAuth user(s) (most recently active):`);
for (const row of oauthUsers) {
  console.log(`  id=${row.id} name="${row.name}" email="${row.email}" lastSignedIn=${row.lastSignedIn} created=${row.createdAt}`);
}

// 8. Check total submissions count and date range
console.log('\n=== H. SUBMISSION TOTALS ===');
const [subTotals] = await conn.execute(`
  SELECT 
    COUNT(*) as total,
    SUM(CASE WHEN blastStatus = 'active' OR blastStatus IS NULL THEN 1 ELSE 0 END) as active,
    MIN(createdAt) as oldest,
    MAX(createdAt) as newest
  FROM submissions
`);
console.log(`  Total submissions: ${subTotals[0].total} | oldest: ${subTotals[0].oldest} | newest: ${subTotals[0].newest}`);

// 9. Check for any inbound emails from unknown senders
console.log('\n=== I. INBOUND EMAIL SENDERS (unique) ===');
const [inboundSenders] = await conn.execute(`
  SELECT fromEmail, COUNT(*) as count, MIN(createdAt) as first, MAX(createdAt) as last
  FROM clientEmails
  WHERE direction = 'inbound'
  GROUP BY fromEmail
  ORDER BY count DESC
  LIMIT 30
`);
if (inboundSenders.length === 0) {
  console.log('  No inbound emails recorded.');
} else {
  for (const row of inboundSenders) {
    console.log(`  from="${row.fromEmail}" count=${row.count} ${row.first} → ${row.last}`);
  }
}

await conn.end();
console.log('\n=== PART 2 COMPLETE ===');
