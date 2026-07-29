import mysql from 'mysql2/promise';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('No DATABASE_URL');
  process.exit(1);
}

const conn = await mysql.createConnection(url);

const statements = [
  "CREATE INDEX `idx_auditLogs_actorId` ON `auditLogs` (`actorId`)",
  "CREATE INDEX `idx_auditLogs_createdAt` ON `auditLogs` (`createdAt`)",
  "CREATE INDEX `idx_clientEmails_submissionId` ON `clientEmails` (`submissionId`)",
  "CREATE INDEX `idx_clientEmails_blastId` ON `clientEmails` (`blastId`)",
  "CREATE INDEX `idx_clientEmails_resendMessageId` ON `clientEmails` (`resendMessageId`)",
  "CREATE INDEX `idx_notificationReads_notificationId` ON `notificationReads` (`notificationId`)",
  "CREATE INDEX `idx_notificationReads_userId` ON `notificationReads` (`userId`)",
  "CREATE INDEX `idx_notifications_isRead` ON `notifications` (`isRead`)",
  "CREATE INDEX `idx_notifications_createdAt` ON `notifications` (`createdAt`)",
  "CREATE INDEX `idx_stageHistory_submissionId` ON `stageHistory` (`submissionId`)",
];

for (const sql of statements) {
  try {
    await conn.execute(sql);
    console.log('OK:', sql.split(' ')[2]);
  } catch (e) {
    if (e.code === 'ER_DUP_KEYNAME') {
      console.log('SKIP (already exists):', sql.split(' ')[2]);
    } else {
      console.error('FAIL:', sql.split(' ')[2], '-', e.message);
    }
  }
}

await conn.end();
console.log('Done.');
