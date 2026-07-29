ALTER TABLE `submissions` ADD CONSTRAINT `idx_submissions_medicaidId` UNIQUE(`medicaidId`);--> statement-breakpoint
CREATE INDEX `idx_submissions_createdAt` ON `submissions` (`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_submissions_status` ON `submissions` (`status`);--> statement-breakpoint
CREATE INDEX `idx_submissions_stage` ON `submissions` (`stage`);--> statement-breakpoint
CREATE INDEX `idx_submissions_email` ON `submissions` (`email`);