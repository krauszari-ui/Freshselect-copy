CREATE TABLE `emailBlasts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(256) NOT NULL,
	`subject` varchar(512) NOT NULL,
	`body` text NOT NULL,
	`filterStatus` varchar(64),
	`scheduledAt` timestamp NOT NULL,
	`scheduleCronTaskUid` varchar(65),
	`blastStatus` enum('scheduled','sending','sent','cancelled','failed') NOT NULL DEFAULT 'scheduled',
	`sentCount` int DEFAULT 0,
	`failedCount` int DEFAULT 0,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`sentAt` timestamp,
	CONSTRAINT `emailBlasts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `failedLoginAttempts` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `lockedUntil` timestamp;