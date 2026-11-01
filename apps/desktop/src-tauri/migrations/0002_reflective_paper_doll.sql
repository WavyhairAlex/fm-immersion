CREATE TABLE `pz2_blobs` (
	`id` text PRIMARY KEY NOT NULL,
	`save_id` text NOT NULL,
	`content_type` text NOT NULL,
	`data_url` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`save_id`) REFERENCES `saves`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `pz2_docs` (
	`save_id` text NOT NULL,
	`collection` text NOT NULL,
	`doc_id` text NOT NULL,
	`data` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`save_id`, `collection`, `doc_id`),
	FOREIGN KEY (`save_id`) REFERENCES `saves`(`id`) ON UPDATE no action ON DELETE cascade
);
