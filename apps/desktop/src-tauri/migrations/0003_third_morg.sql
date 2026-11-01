CREATE TABLE `fm_targets` (
	`save_id` text NOT NULL,
	`player_id` text NOT NULL,
	`name` text NOT NULL,
	`club` text,
	`first_seen` text NOT NULL,
	`last_seen` text NOT NULL,
	`in_list` integer DEFAULT true NOT NULL,
	`dismissed` integer DEFAULT false NOT NULL,
	`data` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`save_id`, `player_id`),
	FOREIGN KEY (`save_id`) REFERENCES `saves`(`id`) ON UPDATE no action ON DELETE cascade
);
