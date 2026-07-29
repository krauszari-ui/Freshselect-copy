CREATE TABLE `clientMessages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`submissionId` int NOT NULL,
	`senderId` int NOT NULL,
	`senderName` varchar(256) NOT NULL,
	`senderRole` varchar(64) NOT NULL,
	`content` text NOT NULL,
	`attachmentUrl` text,
	`attachmentName` varchar(512),
	`attachmentType` varchar(128),
	`reactions` json,
	`isDeleted` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `clientMessages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `messageReads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`submissionId` int NOT NULL,
	`lastReadMessageId` int NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `messageReads_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_messageReads_userId_submissionId` UNIQUE(`userId`,`submissionId`)
);
--> statement-breakpoint
CREATE INDEX `idx_clientMessages_submissionId` ON `clientMessages` (`submissionId`);--> statement-breakpoint
CREATE INDEX `idx_clientMessages_senderId` ON `clientMessages` (`senderId`);--> statement-breakpoint
CREATE INDEX `idx_clientMessages_createdAt` ON `clientMessages` (`createdAt`);