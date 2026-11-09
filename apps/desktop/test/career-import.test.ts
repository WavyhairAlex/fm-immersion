import { beforeEach, describe, expect, it } from 'vitest';
import { fmRepo, FmOtherSaveError } from '../src/lib/fm';
import { savesRepo } from '../src/lib/saves';
import { memoryDb } from './memory-db';

const snap = (gameDate: string, club: string) => ({ schema: 'archivix/1', game: 'FM27', club, gameDate, players: [{ id: 1, name: 'A', positions: 'BT' }] });

describe('Ma carrière : import des jours d’un ancien club', () => {
  let saves: ReturnType<typeof savesRepo>;
  let fm: ReturnType<typeof fmRepo>;
  beforeEach(() => {
    const db = memoryDb() as never;
    saves = savesRepo(db);
    fm = fmRepo(db);
  });

  it('un jour plus ancien d’un autre club ne change pas le club suivi par la partie', async () => {
    const save = await saves.create({ gameId: 'fm', name: 'Carrière' });
    await fm.importSnapshot(save.id, snap('2026-11-24', 'Malženice'));
    await fm.importSnapshot(save.id, snap('2026-09-01', 'Vänersborgs IF'), { force: true });
    expect((await fm.settings(save.id)).fmClub).toBe('Malženice');
    // Le jour suivant de Malženice s'importe toujours sans confirmation.
    await expect(fm.importSnapshot(save.id, snap('2026-11-25', 'Malženice'))).resolves.toBeTruthy();
    // Un autre club à une date récente reste une autre sauvegarde à confirmer.
    await expect(fm.importSnapshot(save.id, snap('2026-11-26', 'FCV Dender'))).rejects.toBeInstanceOf(FmOtherSaveError);
  });
});
