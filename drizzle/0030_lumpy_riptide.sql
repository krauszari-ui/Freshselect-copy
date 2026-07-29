ALTER TABLE `submissions` ADD `notInterested` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `submissions` ADD `notInterestedAt` timestamp;--> statement-breakpoint
ALTER TABLE `submissions` ADD `notInterestedBy` int;