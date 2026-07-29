ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','worker','super_admin','viewer') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `submissions` ADD `neighborhood` varchar(64);--> statement-breakpoint
ALTER TABLE `submissions` ADD `additionalMembersCount` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `users` ADD `passwordResetToken` varchar(128);--> statement-breakpoint
ALTER TABLE `users` ADD `passwordResetExpires` timestamp;