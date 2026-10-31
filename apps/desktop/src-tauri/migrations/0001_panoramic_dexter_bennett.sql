CREATE TABLE `fm_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`save_id` text NOT NULL,
	`game_date` text NOT NULL,
	`club` text NOT NULL,
	`player_count` integer NOT NULL,
	`data` text NOT NULL,
	`imported_at` text NOT NULL,
	FOREIGN KEY (`save_id`) REFERENCES `saves`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `fm_snapshots_save_idx` ON `fm_snapshots` (`save_id`,`game_date`);