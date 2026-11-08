import { beforeEach, describe, expect, it } from 'vitest';
import { fmRepo } from '../src/lib/fm';
import { saveAlert, gameDaysBetween, UNSAVED_DAYS_WARN } from '../src/lib/save-files';
import { savesRepo } from '../src/lib/saves';
import { memoryDb } from './memory-db';

const file = (name: string) => ({ name, modifiedMs: 1, bytes: 1 });

describe('suivi des sauvegardes', () => {
  it('compte les jours de jeu sans tenir compte de l’heure', () => {
    expect(gameDaysBetween('2027-02-14T18:00:00', '2027-02-21')).toBe(7);
    expect(gameDaysBetween('2027-02-28', '2027-03-01')).toBe(1);
    expect(gameDaysBetween('pas une date', '2027-03-01')).toBe(0);
  });

  it('prévient d’un fichier lié introuvable ou d’une partie pas sauvegardée depuis une semaine de jeu', () => {
    const files = [file('Malženice.fm')];
    expect(saveAlert(undefined, files, null, '2027-03-01')).toBeNull();
    expect(saveAlert('Malženice.fm', undefined, null, '2027-03-01')).toBeNull();
    expect(saveAlert('Ancienne.fm', files, null, '2027-03-01')).toEqual({ kind: 'missing', file: 'Ancienne.fm' });
    expect(saveAlert('Malženice.fm', files, '2027-02-25', '2027-03-01')).toBeNull();
    expect(saveAlert('Malženice.fm', files, '2027-02-20', '2027-03-01')).toEqual({ kind: 'unsaved', days: 9 });
    expect(saveAlert('Malženice.fm', files, '2027-02-22', '2027-03-01')).toEqual({ kind: 'unsaved', days: UNSAVED_DAYS_WARN });
    expect(saveAlert('Malženice.fm', files, null, '2027-03-01')).toBeNull();
  });

  describe('base locale', () => {
    let saves: ReturnType<typeof savesRepo>;
    let fm: ReturnType<typeof fmRepo>;
    beforeEach(() => {
      const db = memoryDb() as never;
      saves = savesRepo(db);
      fm = fmRepo(db);
    });

    it('ne lie un fichier .fm qu’à une seule carrière', async () => {
      const a = await saves.create({ gameId: 'fm', name: 'A' });
      const b = await saves.create({ gameId: 'fm', name: 'B' });
      await fm.linkSave(a.id, 'Malženice.fm');
      await fm.linkSave(b.id, 'Malženice.fm');
      expect((await fm.settings(a.id)).fmSaveFile).toBeUndefined();
      expect((await fm.settings(b.id)).fmSaveFile).toBe('Malženice.fm');
      await fm.linkSave(b.id, null);
      expect((await fm.settings(b.id)).fmSaveFile).toBeUndefined();
    });

    it('retrouve la date de jeu au moment de la sauvegarde d’après les instantanés importés avant', async () => {
      const s = await saves.create({ gameId: 'fm', name: 'A' });
      const snap = (gameDate: string) => ({ schema: 'archivix/1', game: 'FM27', club: 'Malženice', gameDate, players: [{ id: 1, name: 'X', positions: 'BT' }] });
      await fm.importSnapshot(s.id, snap('2027-02-14'));
      const between = new Date().toISOString();
      await new Promise((r) => setTimeout(r, 5));
      await fm.importSnapshot(s.id, snap('2027-02-21'));
      expect(await fm.gameDateAt(s.id, '2000-01-01T00:00:00.000Z')).toBeNull();
      expect(await fm.gameDateAt(s.id, between)).toBe('2027-02-14');
      expect(await fm.gameDateAt(s.id, new Date(Date.now() + 1000).toISOString())).toBe('2027-02-21');
    });
  });
});
