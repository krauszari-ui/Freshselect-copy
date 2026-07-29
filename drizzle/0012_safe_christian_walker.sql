CREATE TABLE `stageHistory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`submissionId` int NOT NULL,
	`fromStage` varchar(64),
	`toStage` varchar(64) NOT NULL,
	`changedBy` int,
	`changedByName` varchar(256),
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stageHistory_id` PRIMARY KEY(`id`)
);
