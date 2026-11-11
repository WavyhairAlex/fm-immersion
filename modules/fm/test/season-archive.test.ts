import { describe, expect, it } from 'vitest';
import { seasonArchives, type FmSnapshot } from '../src';

// Instantané avec les minutes cumulées d'un joueur (null = lecture sans stats).
const snap = (gameDate: string, minutes: number | null, club = 'Malženice') =>
  ({
    gameDate,
    data: {
      schema: 'archivix/1',
      club,
      gameDate,
      players: [],
      custom: { joueurs: minutes == null ? { a: { id: 1 } } : { a: { id: 1, stat_Minutes: minutes } } },
    } as unknown as FmSnapshot,
  });

describe('archives des saisons', () => {
  it('fige chaque saison sur la dernière lecture avant la remise à zéro des stats', () => {
    const h = [snap('2026-08-10', 90), snap('2027-05-20', 3000), snap('2027-06-30', 3100), snap('2027-07-15', 0), snap('2027-08-20', 180)];
    const a = seasonArchives(h);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ label: '2026/27', club: 'Malženice', gameDate: '2027-06-30' });
  });

  it("ignore les lectures sans stats et la saison en cours", () => {
    const h = [snap('2026-08-10', 90), snap('2027-05-20', 3000), snap('2027-05-21', null), snap('2027-08-20', 180)];
    expect(seasonArchives(h).map((x) => x.gameDate)).toEqual(['2027-05-20']);
    expect(seasonArchives(h.slice(0, 3))).toEqual([]);
  });

  it('un changement de club clôt la saison au club quitté', () => {
    const h = [snap('2027-01-10', 900), snap('2027-03-01', 1500), snap('2027-03-02', 1600, 'Slovan')];
    expect(seasonArchives(h)).toMatchObject([{ club: 'Malženice', gameDate: '2027-03-01', label: '2026/27' }]);
  });

  it("la plus récente d'abord", () => {
    const h = [snap('2026-05-01', 2000), snap('2026-08-01', 90), snap('2027-05-01', 2500), snap('2027-08-01', 90)];
    expect(seasonArchives(h).map((x) => x.label)).toEqual(['2026/27', '2025/26']);
  });
});
