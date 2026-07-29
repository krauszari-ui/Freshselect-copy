ALTER TABLE `clientMessages` ADD `replyToId` int;--> statement-breakpoint
ALTER TABLE `clientMessages` ADD `replyToSenderName` varchar(256);--> statement-breakpoint
ALTER TABLE `clientMessages` ADD `replyToContent` varchar(300);--> statement-breakpoint
ALTER TABLE `orgGroupMessages` ADD `replyToId` int;--> statement-breakpoint
ALTER TABLE `orgGroupMessages` ADD `replyToSenderName` varchar(256);--> statement-breakpoint
ALTER TABLE `orgGroupMessages` ADD `replyToContent` varchar(300);