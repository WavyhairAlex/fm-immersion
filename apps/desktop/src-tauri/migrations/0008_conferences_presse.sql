-- Conférences de presse du coach (avant un gros match, après un match officiel), citées par la gazette.
-- Écrite à la main : drizzle-kit voudrait aussi supprimer les tables pz2_/tf3_ héritées de Simloom.
CREATE TABLE `fm_press_conferences` (
	`save_id` text NOT NULL,
	`key` text NOT NULL,
	`kind` text NOT NULL,
	`match_date` text NOT NULL,
	`club` text NOT NULL,
	`opponent` text NOT NULL,
	`competition` text,
	`questions` text NOT NULL,
	`answers` text NOT NULL,
	`answered_at` text NOT NULL,
	PRIMARY KEY(`save_id`, `key`),
	FOREIGN KEY (`save_id`) REFERENCES `saves`(`id`) ON UPDATE no action ON DELETE cascade
);
