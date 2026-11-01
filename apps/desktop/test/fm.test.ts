import { beforeEach, describe, expect, it } from 'vitest';
import { FmOtherSaveError, fmRepo } from '../src/lib/fm';
import { savesRepo } from '../src/lib/saves';
import { memoryDb } from './memory-db';

const snap = (gameDate: string, names: string[]) => ({
  schema: 'archivix/1',
  game: 'FM27',
  club: 'Vänersborgs IF',
  gameDate,
  players: names.map((name, i) => ({ id: i + 1, name, positions: 'BT' })),
});

describe('instantanés Football Manager', () => {
  let saves: ReturnType<typeof savesRepo>;
  let fm: ReturnType<typeof fmRepo>;
  beforeEach(() => {
    const db = memoryDb() as never;
    saves = savesRepo(db);
    fm = fmRepo(db);
  });

  it("garde un instantané par date de jeu et renvoie le plus récent", async () => {
    const save = await saves.create({ gameId: 'fm', name: 'Vänersborg' });
    await fm.importSnapshot(save.id, snap('2026-08-29', ['A']));
    await fm.importSnapshot(save.id, snap('2026-09-05', ['A', 'B']));
    await fm.importSnapshot(save.id, snap('2026-09-05', ['A', 'B', 'C']));

    expect((await fm.history(save.id)).map((h) => [h.gameDate, h.playerCount])).toEqual([
      ['2026-09-05', 3],
      ['2026-08-29', 1],
    ]);
    const latest = await fm.latest(save.id);
    expect(latest?.data.players.map((p) => p.name)).toEqual(['A', 'B', 'C']);
    expect((await fm.all(save.id)).map((h) => [h.gameDate, h.data.players.length])).toEqual([
      ['2026-08-29', 1],
      ['2026-09-05', 3],
    ]);
  });

  it('refuse un fichier inconnu sans rien enregistrer', async () => {
    const save = await saves.create({ gameId: 'fm', name: 'X' });
    await expect(fm.importSnapshot(save.id, { schema: 'autre' })).rejects.toThrow();
    expect(await fm.latest(save.id)).toBeNull();
  });

  it('mémorise le dossier du plugin dans la partie', async () => {
    const save = await saves.create({ gameId: 'fm', name: 'X' });
    await fm.setFolder(save.id, 'D:\\Sports Interactive\\Football Manager 27\\archivix');
    expect(await fm.settings(save.id)).toEqual({ fmFolder: 'D:\\Sports Interactive\\Football Manager 27\\archivix' });
  });

  it('garde les cibles du mercato d\'un instantané à l\'autre', async () => {
    const save = await saves.create({ gameId: 'fm', name: 'V' });
    const cible = (id: number, name: string, club: string) => ({ id, name, club, positions: 'M (C)', attributes: { Passing: { min: 11, max: 14 } }, scout: { knowledge: 60 }, sources: ['listeSuivi'] });
    await fm.importSnapshot(save.id, { ...snap('2026-09-01', ['A']), shortlist: [cible(10, 'Cible Un', 'IFK'), cible(11, 'Cible Deux', 'GAIS')] });
    // Instantané sans bloc de cibles (lecture désactivée) : la base ne bouge pas.
    await fm.importSnapshot(save.id, snap('2026-09-02', ['A']));
    expect((await fm.targets(save.id)).filter((t) => t.inList)).toHaveLength(2);

    await fm.importSnapshot(save.id, { ...snap('2026-09-08', ['A']), shortlist: [cible(11, 'Cible Deux', 'Örgryte')] });
    const rows = await fm.targets(save.id);
    const deux = rows.find((t) => t.playerId === '11')!;
    expect([deux.club, deux.firstSeen, deux.lastSeen, deux.inList]).toEqual(['Örgryte', '2026-09-01', '2026-09-08', true]);
    const un = rows.find((t) => t.playerId === '10')!;
    expect([un.inList, un.lastSeen]).toEqual([false, '2026-09-01']);

    await fm.dismissTarget(save.id, '10', true);
    expect((await fm.targets(save.id)).find((t) => t.playerId === '10')?.dismissed).toBe(true);
  });

  it("lie la partie à une sauvegarde FM27 et défait le lien", async () => {
    const save = await saves.create({ gameId: 'fm', name: 'V' });
    await fm.setFolder(save.id, 'D:\\FM\\archivix');
    await fm.linkSave(save.id, 'Vänersborgs.fm');
    expect(await fm.settings(save.id)).toEqual({ fmFolder: 'D:\\FM\\archivix', fmSaveFile: 'Vänersborgs.fm' });
    await fm.linkSave(save.id, null);
    expect(await fm.settings(save.id)).toEqual({ fmFolder: 'D:\\FM\\archivix' });
  });

  it("refuse l'instantané d'une autre sauvegarde (autre club), sauf confirmation", async () => {
    const save = await saves.create({ gameId: 'fm', name: 'V' });
    await fm.importSnapshot(save.id, snap('2026-08-29', ['A']));
    expect((await fm.settings(save.id)).fmClub).toBe('Vänersborgs IF');

    const autre = { ...snap('2031-03-01', ['Z']), club: 'IFK Göteborg' };
    const err = await fm.importSnapshot(save.id, autre).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FmOtherSaveError);
    expect([(err as FmOtherSaveError).club, (err as FmOtherSaveError).expected]).toEqual(['IFK Göteborg', 'Vänersborgs IF']);
    expect((await fm.latest(save.id))?.club).toBe('Vänersborgs IF');

    // Changement de club dans la même carrière : confirmé, le nouveau club devient celui de la partie.
    await fm.importSnapshot(save.id, autre, { force: true });
    expect((await fm.settings(save.id)).fmClub).toBe('IFK Göteborg');
    await fm.importSnapshot(save.id, { ...autre, gameDate: '2031-03-02' });
    expect((await fm.history(save.id)).length).toBe(3);
  });

  it('reprend le club des instantanés déjà importés avant le lien', async () => {
    const save = await saves.create({ gameId: 'fm', name: 'V' });
    await fm.importSnapshot(save.id, snap('2026-08-29', ['A']));
    await fm.updateSettings(save.id, { fmClub: undefined });
    await expect(fm.importSnapshot(save.id, { ...snap('2026-09-01', ['A']), club: 'GAIS' })).rejects.toBeInstanceOf(FmOtherSaveError);
  });

  it('reprend tout seul le nouveau club après une période sans club', async () => {
    const save = await saves.create({ gameId: 'fm', name: 'V' });
    await fm.importSnapshot(save.id, snap('2026-11-01', ['A']));
    // État d'une autre sauvegarde, plus ancien que la partie : ignoré.
    await fm.noteStatus(save.id, { schema: 'archivix-status/1', gameDate: '2025-01-01', club: null });
    expect((await fm.settings(save.id)).fmFreeSince).toBeUndefined();

    await fm.noteStatus(save.id, { schema: 'archivix-status/1', gameDate: '2026-11-20', club: null });
    expect((await fm.settings(save.id)).fmFreeSince).toBe('2026-11-20');
    // L'ancien instantané relu au démarrage ne met pas fin à la période sans club.
    await fm.importSnapshot(save.id, snap('2026-11-01', ['A']));
    expect((await fm.settings(save.id)).fmFreeSince).toBe('2026-11-20');

    await fm.importSnapshot(save.id, { ...snap('2026-12-05', ['N']), club: 'Örgryte IS' });
    const st = await fm.settings(save.id);
    expect([st.fmClub, st.fmFreeSince]).toEqual(['Örgryte IS', undefined]);
  });
});
