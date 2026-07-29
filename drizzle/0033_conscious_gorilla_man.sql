CREATE TABLE `orgGroupMessages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`senderId` int NOT NULL,
	`senderName` varchar(256) NOT NULL,
	`senderRole` varchar(64) NOT NULL,
	`senderOrgName` varchar(256),
	`content` text NOT NULL,
	`attachmentUrl` text,
	`attachmentName` varchar(512),
	`attachmentType` varchar(128),
	`reactions` json,
	`isDeleted` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `orgGroupMessages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orgMessageReads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`orgId` int NOT NULL,
	`lastReadMessageId` int NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `orgMessageReads_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_orgMessageReads_userId_orgId` UNIQUE(`userId`,`orgId`)
);
--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(256) NOT NULL,
	`contactEmail` varchar(320),
	`contactPhone` varchar(64),
	`notes` text,
	`isActive` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `organizations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `submissions` ADD `referredOrgId` int;--> statement-breakpoint
ALTER TABLE `submissions` ADD `referredOrgAt` timestamp;--> statement-breakpoint
ALTER TABLE `submissions` ADD `referredOrgNote` text;--> statement-breakpoint
ALTER TABLE `users` ADD `orgId` int;--> statement-breakpoint
CREATE INDEX `idx_orgGroupMessages_orgId` ON `orgGroupMessages` (`orgId`);--> statement-breakpoint
CREATE INDEX `idx_orgGroupMessages_senderId` ON `orgGroupMessages` (`senderId`);--> statement-breakpoint
CREATE INDEX `idx_orgGroupMessages_createdAt` ON `orgGroupMessages` (`createdAt`);