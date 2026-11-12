import { describe, expect, it } from 'vitest';
import { playerSeasons, type FmSnapshot } from '../src';

// Instantané avec les stats cumulées du joueur 1 (minutes, titularisations, homme du match).
const snap = (gameDate: string, minutes: number, starts: number, potm = 0) => ({
  gameDate,
  data: {
    schema: 'archivix/1',
    club: 'Malženice',
    gameDate,
    players: [],
    custom: { joueurs: { a: { id: 1, stat_Minutes: minutes, stat_StartingAppearances: starts, stat_SubAppearances: 1, stat_ManOfMatch: potm } } },
  } as unknown as FmSnapshot,
});

describe('saisons d’un joueur', () => {
  it('saison en cours puis saisons archivées, la plus récente d’abord', () => {
    const h = [snap('2026-08-10', 90, 1), snap('2027-06-30', 2700, 30, 4), snap('2027-07-15', 0, 0), snap('2027-08-20', 180, 2)];
    const s = playerSeasons(h, '1');
    expect(s).toHaveLength(2);
    expect(s[0]).toMatchObject({ current: true, minutes: 180, starts: 2, apps: 3 });
    expect(s[1]).toMatchObject({ current: false, label: '2026/27', minutes: 2700, apps: 31, potm: 4, club: 'Malženice' });
  });

  it('rien pour un joueur absent', () => {
    expect(playerSeasons([snap('2027-08-20', 180, 2)], '99')).toEqual([]);
  });
});
