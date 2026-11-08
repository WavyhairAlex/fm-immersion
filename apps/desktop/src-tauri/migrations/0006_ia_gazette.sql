CREATE TABLE `fm_gazette_writing` (
	`save_id` text NOT NULL,
	`week_start` text NOT NULL,
	`facts` text NOT NULL,
	`content` text NOT NULL,
	`model` text NOT NULL,
	`written_at` text NOT NULL,
	PRIMARY KEY(`save_id`, `week_start`),
	FOREIGN KEY (`save_id`) REFERENCES `saves`(`id`) ON UPDATE no action ON DELETE cascade
);
