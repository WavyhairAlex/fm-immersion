import { saves } from '@simloom/db';
import { carryRoleStars, fmSnapshotSchema, mergeTargets, type FmSnapshot, type TargetRecord } from '@simloom/module-fm';
import { fmSnapshots, fmTargets } from '@simloom/module-fm/schema';
import { and, asc, desc, eq } from 'drizzle-orm';
import type { Db } from './db';

/** Réglages FM rangés dans saves.extra. */
export interface FmSaveSettings {
  fmFolder?: string;
}

/**
 * Instantanés Football Manager d'une partie. Un seul instantané par date de jeu :
 * réimporter le même jour remplace le précédent, une nouvelle date l'ajoute à l'historique.
 */
export function fmRepo(db: Db) {
  return {
    async latest(saveId: string) {
      const [row] = await db
        .select()
        .from(fmSnapshots)
        .where(eq(fmSnapshots.saveId, saveId))
        .orderBy(desc(fmSnapshots.gameDate))
        .limit(1);
      return row ?? null;
    },

    async history(saveId: string) {
      return db
        .select({ gameDate: fmSnapshots.gameDate, playerCount: fmSnapshots.playerCount })
        .from(fmSnapshots)
        .where(eq(fmSnapshots.saveId, saveId))
        .orderBy(desc(fmSnapshots.gameDate));
    },

    /** Tous les instantanés de la partie, du plus ancien au plus récent, pour les courbes et projections. */
    async all(saveId: string) {
      return db
        .select({ gameDate: fmSnapshots.gameDate, data: fmSnapshots.data })
        .from(fmSnapshots)
        .where(eq(fmSnapshots.saveId, saveId))
        .orderBy(asc(fmSnapshots.gameDate));
    },

    /** Valide le JSON du plugin puis l'enregistre. Lève une erreur zod si le fichier n'est pas reconnu. */
    async importSnapshot(saveId: string, raw: unknown): Promise<FmSnapshot> {
      // Les étoiles des rôles sont lues un poste à la fois : on garde les tables lues avant.
      const prev = await this.latest(saveId);
      const snap = carryRoleStars(fmSnapshotSchema.parse(raw), prev?.data);
      const values = { saveId, gameDate: snap.gameDate, club: snap.club, playerCount: snap.players.length, data: snap };
      await db
        .delete(fmSnapshots)
        .where(and(eq(fmSnapshots.saveId, saveId), eq(fmSnapshots.gameDate, snap.gameDate)));
      await db.insert(fmSnapshots).values(values);
      await this.saveTargets(saveId, snap);
      await db.update(saves).set({ updatedAt: new Date().toISOString() }).where(eq(saves.id, saveId));
      return snap;
    },

    /** Cibles du mercato gardées pour la partie (y compris celles que le jeu ne liste plus). */
    async targets(saveId: string): Promise<TargetRecord[]> {
      const rows = await db.select().from(fmTargets).where(eq(fmTargets.saveId, saveId)).orderBy(desc(fmTargets.lastSeen));
      return rows.map(({ saveId: _s, updatedAt: _u, ...r }) => r);
    },

    /** Ajoute ou met à jour les cibles lues dans l'instantané (rien si le plugin ne les a pas lues). */
    async saveTargets(saveId: string, snap: FmSnapshot) {
      const changes = mergeTargets(await this.targets(saveId), snap);
      if (!changes?.length) return;
      const now = new Date().toISOString();
      for (const c of changes) {
        const row = { ...c, saveId, updatedAt: now };
        await db
          .insert(fmTargets)
          .values(row)
          .onConflictDoUpdate({
            target: [fmTargets.saveId, fmTargets.playerId],
            set: { name: row.name, club: row.club, firstSeen: row.firstSeen, lastSeen: row.lastSeen, inList: row.inList, data: row.data, updatedAt: now },
          });
      }
    },

    /** Écarte une cible (ou la remet) dans Simloom, sans rien changer dans le jeu. */
    async dismissTarget(saveId: string, playerId: string, dismissed: boolean) {
      await db
        .update(fmTargets)
        .set({ dismissed, updatedAt: new Date().toISOString() })
        .where(and(eq(fmTargets.saveId, saveId), eq(fmTargets.playerId, playerId)));
    },

    async settings(saveId: string): Promise<FmSaveSettings> {
      const [row] = await db.select({ extra: saves.extra }).from(saves).where(eq(saves.id, saveId));
      return (row?.extra ?? {}) as FmSaveSettings;
    },

    async setFolder(saveId: string, fmFolder: string) {
      const current = await this.settings(saveId);
      await db.update(saves).set({ extra: { ...current, fmFolder } }).where(eq(saves.id, saveId));
    },
  };
}
