ALTER TABLE `submissions` ADD `stageUpdatedAt` timestamp;--> statement-breakpoint
ALTER TABLE `tasks` ADD `title` varchar(256) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `priority` enum('low','normal','high','urgent') DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `dueDate` timestamp;--> statement-breakpoint
ALTER TABLE `tasks` ADD `sourceMessageId` int;--> statement-breakpoint
ALTER TABLE `tasks` ADD `sourceMessageType` varchar(32);