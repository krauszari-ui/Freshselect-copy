CREATE TABLE `auditLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`actorId` int,
	`actorName` varchar(256),
	`action` varchar(64) NOT NULL,
	`clientId` int,
	`clientName` varchar(256),
	`details` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auditLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `submissions` ADD `priority` enum('low','normal','high','urgent') DEFAULT 'normal' NOT NULL;