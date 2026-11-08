import { describe, expect, it } from 'vitest';
import { coachExits, type FmSnapshot } from '../src';

const snap = (gameDate: string, club: string, left: number | null, position: number, job?: string) =>
  ({
    schema: 'archivix/1',
    club,
    gameDate,
    players: [],
    custom: {
      equipe: {
        classementPosition: position,
        ...(job ? { securiteEmploi: job } : {}),
        ...(left == null ? {} : { calendrierChampionnatRestant: Array.from({ length: left }, () => ({})) }),
      },
    },
  }) as unknown as FmSnapshot;
const e = (xs: FmSnapshot[]) => xs.map((data) => ({ gameDate: data.gameDate, data }));

describe('hors-série du départ du coach', () => {
  it('un changement de club clôt le passage, avec ses saisons et son titre', () => {
    const h = e([
      snap('2027-04-01', 'Malženice', 3, 2),
      snap('2027-05-14', 'Malženice', 0, 1),
      snap('2027-07-10', 'Malženice', 30, 5, 'Sécurisé'),
      snap('2027-07-20', 'Slovan', 30, 3),
    ]);
    const [x, ...rest] = coachExits(h);
    expect(rest).toEqual([]);
    expect(x).toMatchObject({ club: 'Malženice', start: '2027-04-01', end: '2027-07-10', next: 'Slovan', reason: 'left', bestFinish: 1 });
    expect(x!.seasons.map((s) => [s.ended, s.position])).toEqual([
      [true, 1],
      [false, 5],
    ]);
    expect(x!.trophies).toEqual([{ season: '2027', competition: null }]);
  });

  it('sans club ensuite : départ seulement si le plugin dit le coach sans club ; emploi menacé = licenciement', () => {
    const h = e([snap('2027-08-01', 'Malženice', 20, 12), snap('2027-08-20', 'Malženice', 18, 16, 'En grand danger')]);
    expect(coachExits(h)).toEqual([]);
    expect(coachExits(h, { freeSince: '2027-08-21' })[0]).toMatchObject({ club: 'Malženice', next: null, reason: 'sacked' });
  });
});
