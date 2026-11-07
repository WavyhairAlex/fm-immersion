import { describe, expect, it } from 'vitest';
import { seasonEndedBetween, seasonReviews, type FmSnapshot } from '../src';

const snap = (gameDate: string, left: number | null, position: number, players: FmSnapshot['players'] = []) =>
  ({
    schema: 'archivix/1',
    club: 'Malženice',
    gameDate,
    players,
    custom: { equipe: { classementPosition: position, ...(left == null ? {} : { calendrierChampionnatRestant: Array.from({ length: left }, () => ({})) }) } },
  }) as unknown as FmSnapshot;

describe('bilan de la saison', () => {
  it('la saison finit quand il ne reste plus de match de championnat', () => {
    expect(seasonEndedBetween(snap('2027-05-08', 1, 4), snap('2027-05-14', 0, 4))).toBe(true);
    expect(seasonEndedBetween(snap('2027-05-14', 0, 4), snap('2027-05-15', 0, 4))).toBe(false);
    expect(seasonEndedBetween(snap('2027-05-08', null, 4), snap('2027-05-14', 0, 4))).toBe(false);
  });

  it('un bilan par saison terminée, avec la place finale et son évolution', () => {
    const h = [snap('2027-04-01', 3, 6), snap('2027-04-10', 2, 5), snap('2027-05-08', 1, 4), snap('2027-05-14', 0, 4), snap('2027-05-20', 0, 4)];
    const [r] = seasonReviews(h.map((data) => ({ gameDate: data.gameDate, data })));
    expect(r).toMatchObject({ club: 'Malženice', start: '2027-04-01', end: '2027-05-14', label: '2027', position: 4 });
    expect(r!.positions.map((p) => p.position)).toEqual([6, 5, 4]);
    expect(seasonReviews(h.slice(0, 3).map((data) => ({ gameDate: data.gameDate, data })))).toEqual([]);
  });
});
