CREATE INDEX `idx_auditLogs_actorId` ON `auditLogs` (`actorId`);--> statement-breakpoint
CREATE INDEX `idx_auditLogs_createdAt` ON `auditLogs` (`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_clientEmails_submissionId` ON `clientEmails` (`submissionId`);--> statement-breakpoint
CREATE INDEX `idx_clientEmails_blastId` ON `clientEmails` (`blastId`);--> statement-breakpoint
CREATE INDEX `idx_clientEmails_resendMessageId` ON `clientEmails` (`resendMessageId`);--> statement-breakpoint
CREATE INDEX `idx_notificationReads_notificationId` ON `notificationReads` (`notificationId`);--> statement-breakpoint
CREATE INDEX `idx_notificationReads_userId` ON `notificationReads` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_notifications_isRead` ON `notifications` (`isRead`);--> statement-breakpoint
CREATE INDEX `idx_notifications_createdAt` ON `notifications` (`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_stageHistory_submissionId` ON `stageHistory` (`submissionId`);