import { saves } from '@simloom/db';
import { addBaseTarget, carryRoleStars, fmSnapshotSchema, fmStatusSchema, type DbPlayer, type FmStatus, mergeTargets, type FmSnapshot, type TargetRecord } from '@simloom/module-fm';
import { fmSnapshots, fmTargets } from '@simloom/module-fm/schema';
import { and, asc, desc, eq } from 'drizzle-orm';
import type { Db } from './db';

/** Réglages FM rangés dans saves.extra. */
export interface FmSaveSettings {
  fmFolder?: string;
  /** Sauvegarde FM27 liée à la partie (nom du fichier .fm dans le dossier games). */
  fmSaveFile?: string;
  /** Club suivi par la partie : un instantané d'un autre club vient d'une autre sauvegarde. */
  fmClub?: string;
  /** Date de jeu depuis laquelle le manager est sans club (lue dans l'état écrit par le plugin). */
  fmFreeSince?: string;
}

/** Fichier .fm listé par Rust (métadonnées seulement). */
export interface FmSaveFile {
  name: string;
  modifiedMs: number | null;
  bytes: number;
}

/**
 * Le plugin écrit un seul instantané pour la sauvegarde chargée dans FM27 : celui d'une autre
 * sauvegarde ne doit pas se mélanger à cette partie. On la reconnaît à son club.
 */
export class FmOtherSaveError extends Error {
  constructor(
    readonly club: string,
    readonly expected: string,
  ) {
    super(`instantané de ${club}, la partie suit ${expected}`);
    this.name = 'FmOtherSaveError';
  }
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

    /**
     * Valide le JSON du plugin puis l'enregistre. Lève une erreur zod si le fichier n'est pas reconnu,
     * et `FmOtherSaveError` s'il vient d'un autre club que celui de la partie (sauf `force`, après un
     * changement de club dans la même carrière : le nouveau club devient celui de la partie).
     */
    async importSnapshot(saveId: string, raw: unknown, opts: { force?: boolean } = {}): Promise<FmSnapshot> {
      const parsed = fmSnapshotSchema.parse(raw);
      const settings = await this.settings(saveId);
      // Les étoiles des rôles sont lues un poste à la fois : on garde les tables lues avant.
      const prev = await this.latest(saveId);
      const expected = settings.fmClub ?? prev?.club;
      // Après une période sans club dans cette carrière, le nouveau club est accepté sans confirmation.
      const newJob = !!settings.fmFreeSince && parsed.gameDate >= settings.fmFreeSince;
      if (expected && parsed.club !== expected && !opts.force && !newJob) throw new FmOtherSaveError(parsed.club, expected);
      // Un ancien instantané (d'avant le départ) ne met pas fin à la période sans club.
      if (settings.fmClub !== parsed.club || newJob) await this.updateSettings(saveId, { fmClub: parsed.club, ...(newJob ? { fmFreeSince: undefined } : {}) });
      const snap = carryRoleStars(parsed, prev?.club === parsed.club ? prev?.data : undefined);
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

    /** Ajoute aux cibles un joueur trouvé dans la base du jeu (recherche en lecture directe). */
    async addBaseTarget(saveId: string, p: DbPlayer, gameDate: string) {
      const c = addBaseTarget(await this.targets(saveId), p, gameDate);
      const now = new Date().toISOString();
      const row = { ...c, saveId, updatedAt: now };
      await db
        .insert(fmTargets)
        .values(row)
        .onConflictDoUpdate({
          target: [fmTargets.saveId, fmTargets.playerId],
          set: { name: row.name, club: row.club, firstSeen: row.firstSeen, lastSeen: row.lastSeen, inList: true, dismissed: false, data: row.data, updatedAt: now },
        });
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

    /**
     * Note l'état du manager écrit par le plugin. Sans club : la partie le retient (date de départ),
     * seulement si cet état est postérieur au dernier instantané (sinon il vient d'une autre sauvegarde).
     */
    async noteStatus(saveId: string, raw: unknown): Promise<FmStatus> {
      const status = fmStatusSchema.parse(raw);
      if (status.club) return status;
      const [settings, prev] = await Promise.all([this.settings(saveId), this.latest(saveId)]);
      if (!settings.fmFreeSince && (!prev || status.gameDate >= prev.gameDate)) await this.updateSettings(saveId, { fmFreeSince: status.gameDate });
      return status;
    },

    async updateSettings(saveId: string, patch: Partial<FmSaveSettings>) {
      const next: Record<string, unknown> = { ...(await this.settings(saveId)), ...patch };
      for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
      await db.update(saves).set({ extra: next }).where(eq(saves.id, saveId));
    },

    setFolder(saveId: string, fmFolder: string) {
      return this.updateSettings(saveId, { fmFolder });
    },

    /** Lie la partie à une sauvegarde FM27 (ou défait le lien avec `null`). */
    linkSave(saveId: string, fmSaveFile: string | null) {
      return this.updateSettings(saveId, { fmSaveFile: fmSaveFile ?? undefined });
    },
  };
}
