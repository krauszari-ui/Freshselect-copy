ALTER TABLE `submissions` ADD `approvedBy` varchar(128);--> statement-breakpoint
ALTER TABLE `submissions` ADD `approvedAt` timestamp;--> statement-breakpoint
ALTER TABLE `submissions` ADD `rejectedBy` varchar(128);--> statement-breakpoint
ALTER TABLE `submissions` ADD `rejectedAt` timestamp;--> statement-breakpoint
ALTER TABLE `submissions` ADD `rejectionReason` text;