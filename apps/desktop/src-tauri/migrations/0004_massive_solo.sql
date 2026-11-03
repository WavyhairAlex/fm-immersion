CREATE TABLE `tf3_blobs` (
	`id` text PRIMARY KEY NOT NULL,
	`save_id` text NOT NULL,
	`content_type` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`save_id`) REFERENCES `saves`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tf3_docs` (
	`save_id` text NOT NULL,
	`path` text NOT NULL,
	`data` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`save_id`, `path`),
	FOREIGN KEY (`save_id`) REFERENCES `saves`(`id`) ON UPDATE no action ON DELETE cascade
);
