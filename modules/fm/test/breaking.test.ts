import { describe, expect, it } from 'vitest';
import { breakingNews, type FmSnapshot } from '../src';

type P = { id: string; name: string; level: number; age?: number; injury?: string; injuryReturnDays?: number };
const squad = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Joueur ${i}`, level: 20 - i, age: 25 }));
const snap = (gameDate: string, players: P[], club = 'Malženice') => ({ schema: 'archivix/1', club, gameDate, players }) as unknown as FmSnapshot;
const e = (xs: FmSnapshot[]) => xs.map((data) => ({ gameDate: data.gameDate, data }));

describe('dépêches', () => {
  it("annonce la recrue et le départ d'un joueur du onze, pas ceux du banc", () => {
    const base = squad(18);
    const h = e([
      snap('2027-07-10', base),
      snap('2027-07-11', [...base.filter((p) => p.id !== 'p2' && p.id !== 'p16'), { id: 'new', name: 'Ján Bačík', level: 19.5, age: 24 }, { id: 'sub', name: 'Remplaçant', level: 1 }]),
    ]);
    const news = breakingNews(h);
    expect(news.map((n) => [n.kind, n.id, n.rank])).toEqual([
      ['signing', 'new', 2],
      ['exit', 'p2', 3],
    ]);
    expect(news[0]).toMatchObject({ date: '2027-07-11', club: 'Malženice', name: 'Ján Bačík', age: 24 });
  });

  it('ignore une promotion de jeunes du centre de formation', () => {
    const base = squad(15);
    const kids = [0, 1, 2].map((i) => ({ id: `k${i}`, name: `Jeune ${i}`, level: 30, age: 16 }));
    expect(breakingNews(e([snap('2027-03-01', base), snap('2027-03-02', [...base, ...kids])]))).toEqual([]);
  });

  it("annonce une blessure de quatre semaines ou plus d'un joueur important, une seule fois", () => {
    const base = squad(18);
    const hurt = (id: string, days: number) => base.map((p) => (p.id === id ? { ...p, injury: 'Entorse', injuryReturnDays: days } : p));
    const h = e([snap('2027-08-01', base), snap('2027-08-02', hurt('p1', 40)), snap('2027-08-03', hurt('p1', 39))]);
    expect(breakingNews(h)).toMatchObject([{ kind: 'injury', id: 'p1', rank: 2, injury: 'Entorse', days: 40, date: '2027-08-02' }]);
    expect(breakingNews(e([snap('2027-08-01', base), snap('2027-08-02', hurt('p1', 10))]))).toEqual([]);
    expect(breakingNews(e([snap('2027-08-01', base), snap('2027-08-02', hurt('p16', 60))]))).toEqual([]);
  });

  it("ne compare pas deux clubs (changement de club du coach)", () => {
    expect(breakingNews(e([snap('2027-07-10', squad(18)), snap('2027-07-20', squad(18).map((p) => ({ ...p, id: `x${p.id}` })), 'Slovan')]))).toEqual([]);
  });
});
