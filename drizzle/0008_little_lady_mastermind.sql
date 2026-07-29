CREATE TABLE `referrerMessages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`referralLinkId` int NOT NULL,
	`submissionId` int,
	`senderId` int NOT NULL,
	`message` text NOT NULL,
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `referrerMessages_id` PRIMARY KEY(`id`)
);
