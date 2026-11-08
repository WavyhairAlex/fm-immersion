-- Un seul instantané par date de jeu et par partie. Deux imports simultanés pouvaient laisser deux lignes pour
-- le même jour : on garde la plus récente avant de poser l'index unique.
-- (Les tables pz2_/tf3_ héritées de Simloom sont gardées telles quelles.)
DELETE FROM `fm_snapshots` WHERE `rowid` NOT IN (
  SELECT MAX(`rowid`) FROM `fm_snapshots` GROUP BY `save_id`, `game_date`
);--> statement-breakpoint
DROP INDEX `fm_snapshots_save_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `fm_snapshots_save_date_idx` ON `fm_snapshots` (`save_id`,`game_date`);
