CREATE TABLE `clientEmails` (
	`id` int AUTO_INCREMENT NOT NULL,
	`submissionId` int NOT NULL,
	`direction` varchar(16) NOT NULL,
	`subject` varchar(512) NOT NULL,
	`body` text NOT NULL,
	`fromEmail` varchar(256) NOT NULL,
	`toEmail` varchar(256) NOT NULL,
	`attachmentUrls` text,
	`resendMessageId` varchar(256),
	`inReplyTo` varchar(256),
	`sentBy` int,
	`sentAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `clientEmails_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `referrerMessages` MODIFY COLUMN `senderId` int;--> statement-breakpoint
ALTER TABLE `referrerMessages` ADD `direction` varchar(16) DEFAULT 'admin' NOT NULL;