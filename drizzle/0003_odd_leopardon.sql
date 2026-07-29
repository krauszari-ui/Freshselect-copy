CREATE TABLE `caseNotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`submissionId` int NOT NULL,
	`content` text NOT NULL,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `caseNotes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`submissionId` int,
	`name` varchar(256) NOT NULL,
	`category` enum('provider_attestation','consent','supporting_documentation','id_document','medicaid_card','birth_certificate','marriage_license','forms','uncategorized') NOT NULL DEFAULT 'uncategorized',
	`url` varchar(1024) NOT NULL,
	`fileKey` varchar(512) NOT NULL,
	`mimeType` varchar(128),
	`fileSize` int,
	`uploadedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `services` (
	`id` int AUTO_INCREMENT NOT NULL,
	`submissionId` int NOT NULL,
	`name` varchar(256) NOT NULL,
	`description` text,
	`startDate` timestamp,
	`endDate` timestamp,
	`status` enum('active','completed','cancelled') NOT NULL DEFAULT 'active',
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `services_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`submissionId` int NOT NULL,
	`description` text NOT NULL,
	`area` enum('intake_rep','assigned_worker') NOT NULL DEFAULT 'intake_rep',
	`assignedTo` int,
	`status` enum('open','completed','verified') NOT NULL DEFAULT 'open',
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`completedAt` timestamp,
	CONSTRAINT `tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `submissions` ADD `stage` enum('referral','assessment','level_one_only','level_one_household','level_2_active','ineligible','provider_attestation_required','flagged') DEFAULT 'referral' NOT NULL;--> statement-breakpoint
ALTER TABLE `submissions` ADD `intakeRep` int;--> statement-breakpoint
ALTER TABLE `submissions` ADD `language` varchar(32) DEFAULT 'English';--> statement-breakpoint
ALTER TABLE `submissions` ADD `borough` varchar(64);--> statement-breakpoint
ALTER TABLE `submissions` ADD `program` varchar(64);