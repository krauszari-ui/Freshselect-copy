ALTER TABLE `users` ADD `passwordHash` varchar(256);--> statement-breakpoint
ALTER TABLE `submissions` DROP COLUMN `clickupTaskId`;