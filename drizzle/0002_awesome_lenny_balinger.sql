ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','worker') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `submissions` ADD `emailSentAt` timestamp;--> statement-breakpoint
ALTER TABLE `submissions` ADD `assignedTo` int;--> statement-breakpoint
ALTER TABLE `users` ADD `permissions` json;--> statement-breakpoint
ALTER TABLE `users` ADD `isActive` int DEFAULT 1 NOT NULL;