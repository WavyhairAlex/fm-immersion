import { beforeEach, describe, expect, it } from 'vitest';
import { fmRepo } from '../src/lib/fm';
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
});
