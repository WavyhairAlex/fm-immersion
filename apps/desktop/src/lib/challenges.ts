import {
  challengeFacts,
  isRewind,
  resultsBetween,
  verifyCertificate,
  type ChallengeCertificate,
  type ChallengeId,
  type FmSnapshot,
  type Rewind,
} from '@fm-immersion/module-fm';
import { fmChallengeCerts, fmChallenges, fmSnapshots, type FmChallengeRow } from '@fm-immersion/module-fm/schema';
import { and, asc, desc, eq } from 'drizzle-orm';
import type { Db } from './db';

/**
 * Défis communautaires : inscriptions d'une partie, retours en arrière vus à l'import, certificats reçus.
 * Les règles et la vérification sont dans `modules/fm/src/challenges.ts` ; ici, seulement la base locale.
 */
export function challengesRepo(db: Db) {
  return {
    async list(saveId: string): Promise<FmChallengeRow[]> {
      return db.select().from(fmChallenges).where(eq(fmChallenges.saveId, saveId)).orderBy(asc(fmChallenges.enrolledAt));
    },

    async enroll(saveId: string, input: { challengeId: ChallengeId; startDate: string; unemployedStart: boolean; params?: { nationality?: string } }) {
      const [row] = await db
        .insert(fmChallenges)
        .values({ saveId, challengeId: input.challengeId, startDate: input.startDate, unemployedStart: input.unemployedStart, params: input.params ?? {}, rewinds: [] })
        .returning();
      return row!;
    },

    async abandon(id: string) {
      await db.update(fmChallenges).set({ abandoned: true }).where(eq(fmChallenges.id, id));
    },

    /**
     * Appelé par l'import d'un instantané, avant d'écrire : si la partie revient à une date déjà vue alors qu'une plus
     * récente était connue (sauvegarde rechargée), chaque défi en cours le note avec les résultats connus jusque-là.
     */
    async noteImport(saveId: string, incoming: string) {
      const active = (await this.list(saveId)).filter((c) => !c.abandoned && incoming >= c.startDate);
      if (!active.length) return 0;
      const [latest] = await db
        .select({ gameDate: fmSnapshots.gameDate })
        .from(fmSnapshots)
        .where(eq(fmSnapshots.saveId, saveId))
        .orderBy(desc(fmSnapshots.gameDate))
        .limit(1);
      const [same] = await db
        .select({ id: fmSnapshots.id })
        .from(fmSnapshots)
        .where(and(eq(fmSnapshots.saveId, saveId), eq(fmSnapshots.gameDate, incoming)));
      const todo = active.filter((c) => isRewind(latest?.gameDate ?? null, incoming, !!same, c.rewinds));
      if (!todo.length) return 0;
      const history = (await db
        .select({ gameDate: fmSnapshots.gameDate, data: fmSnapshots.data })
        .from(fmSnapshots)
        .where(eq(fmSnapshots.saveId, saveId))
        .orderBy(asc(fmSnapshots.gameDate))) as { gameDate: string; data: FmSnapshot }[];
      const rewind: Rewind = { to: incoming, from: latest!.gameDate, seenAt: new Date().toISOString(), results: resultsBetween(history, incoming, latest!.gameDate) };
      for (const c of todo) await db.update(fmChallenges).set({ rewinds: [...c.rewinds, rewind] }).where(eq(fmChallenges.id, c.id));
      return todo.length;
    },

    /** Certificats gardés pour le classement, les mieux classés d'abord par l'interface. */
    async certificates() {
      return db.select().from(fmChallengeCerts).orderBy(desc(fmChallengeCerts.importedAt));
    },

    /** Vérifie puis garde un certificat (le même fichier importé deux fois remplace le premier). */
    async importCertificate(raw: unknown) {
      const check = await verifyCertificate(raw);
      if (check.problems.includes('format')) return { check, saved: false };
      const cert = raw as ChallengeCertificate;
      const row = { digest: cert.digest, challengeId: cert.challenge, coach: String(cert.coach ?? '').slice(0, 40), status: cert.status, verified: check.ok, data: cert };
      await db
        .insert(fmChallengeCerts)
        .values(row)
        .onConflictDoUpdate({ target: fmChallengeCerts.digest, set: { status: row.status, verified: row.verified, data: row.data, coach: row.coach } });
      return { check, saved: true };
    },

    async removeCertificate(digest: string) {
      await db.delete(fmChallengeCerts).where(eq(fmChallengeCerts.digest, digest));
    },
  };
}

/** Faits d'une inscription, prêts pour `evaluateChallenge` ou un certificat. */
export const factsFor = (c: FmChallengeRow, history: { gameDate: string; data: FmSnapshot }[]) =>
  challengeFacts(history, { start: c.startDate, unemployedStart: c.unemployedStart, rewinds: c.rewinds });
