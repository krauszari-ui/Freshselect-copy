CREATE TABLE `referralLinks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(64) NOT NULL,
	`referrerName` varchar(256) NOT NULL,
	`description` text,
	`usageCount` int NOT NULL DEFAULT 0,
	`isActive` int NOT NULL DEFAULT 1,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `referralLinks_id` PRIMARY KEY(`id`),
	CONSTRAINT `referralLinks_code_unique` UNIQUE(`code`)
);
