CREATE TABLE `fm_challenge_certs` (
	`digest` text PRIMARY KEY NOT NULL,
	`challenge_id` text NOT NULL,
	`coach` text NOT NULL,
	`status` text NOT NULL,
	`verified` integer NOT NULL,
	`data` text NOT NULL,
	`imported_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `fm_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`save_id` text NOT NULL,
	`challenge_id` text NOT NULL,
	`params` text NOT NULL,
	`start_date` text NOT NULL,
	`unemployed_start` integer DEFAULT false NOT NULL,
	`rewinds` text NOT NULL,
	`abandoned` integer DEFAULT false NOT NULL,
	`enrolled_at` text NOT NULL,
	FOREIGN KEY (`save_id`) REFERENCES `saves`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `fm_challenges_save_idx` ON `fm_challenges` (`save_id`);
