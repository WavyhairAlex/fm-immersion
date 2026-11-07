import { buildCertificate, challengeFacts } from '@fm-immersion/module-fm';
import { beforeEach, describe, expect, it } from 'vitest';
import { challengesRepo } from '../src/lib/challenges';
import { fmRepo } from '../src/lib/fm';
import { savesRepo } from '../src/lib/saves';
import { memoryDb } from './memory-db';

const snap = (gameDate: string) => ({
  schema: 'archivix/1',
  game: 'FM27',
  club: 'Toulouse FC',
  gameDate,
  players: [{ id: 1, name: 'A', positions: 'BT' }],
});

describe('défis : base locale', () => {
  let saves: ReturnType<typeof savesRepo>;
  let fm: ReturnType<typeof fmRepo>;
  let ch: ReturnType<typeof challengesRepo>;
  beforeEach(() => {
    const db = memoryDb() as never;
    saves = savesRepo(db);
    fm = fmRepo(db);
    ch = challengesRepo(db);
  });

  it('note un rechargement une seule fois, pas un jour manquant importé plus tard', async () => {
    const save = await saves.create({ gameId: 'fm', name: 'Toulouse' });
    await fm.importSnapshot(save.id, snap('2026-08-01'));
    const c = await ch.enroll(save.id, { challengeId: 'invincibles', startDate: '2026-08-01', unemployedStart: false });
    await fm.importSnapshot(save.id, snap('2026-08-08'));
    await fm.importSnapshot(save.id, snap('2026-08-15'));
    // Jour manquant rattrapé depuis l'historique du plugin : pas un retour en arrière.
    await fm.importSnapshot(save.id, snap('2026-08-10'), { force: true });
    expect((await ch.list(save.id))[0]!.rewinds).toEqual([]);
    // Sauvegarde rechargée au 8 août, puis la partie avance de nouveau.
    await fm.importSnapshot(save.id, snap('2026-08-08'));
    await fm.importSnapshot(save.id, snap('2026-08-10'));
    const [row] = await ch.list(save.id);
    expect(row!.rewinds).toHaveLength(1);
    expect(row!.rewinds[0]).toMatchObject({ to: '2026-08-08', from: '2026-08-15' });
    await ch.abandon(c.id);
    expect((await ch.list(save.id))[0]!.abandoned).toBe(true);
  });

  it('garde les certificats reçus avec le résultat de la vérification', async () => {
    const cert = await buildCertificate({
      challenge: 'u19',
      params: {},
      coach: 'Amnesix',
      appVersion: '0.1.46',
      createdAt: '2026-11-07T20:00:00Z',
      facts: challengeFacts([], { start: '2026-08-01', unemployedStart: false }),
    });
    expect((await ch.importCertificate(cert)).check.ok).toBe(true);
    expect((await ch.importCertificate({ ...cert, coach: 'Autre' })).check.ok).toBe(false);
    const rows = await ch.certificates();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ coach: 'Autre', verified: false });
    expect((await ch.importCertificate({ nope: true })).saved).toBe(false);
    await ch.removeCertificate(cert.digest);
    expect(await ch.certificates()).toEqual([]);
  });
});
