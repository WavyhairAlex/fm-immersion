import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FmSnapshot, MatchResult } from '../src';

// Les résultats sont tirés des instantanés par `officialResults` (testé à part) : ici, on les donne directement.
let results: MatchResult[] = [];
vi.mock('../src/results', async (orig) => ({ ...(await orig<typeof import('../src/results')>()), officialResults: () => results }));
const { recordNews, recordKey } = await import('../src');

const day = (i: number) => new Date(Date.UTC(2027, 7, 1) + i * 7 * 86_400_000).toISOString().slice(0, 10);
const match = (i: number, gf: number, ga: number, goals: Record<string, number> = {}, opponent = `Club ${i}`): MatchResult => ({
  date: day(i),
  since: day(i),
  matches: 1,
  opponent,
  competition: 'Liga',
  friendly: false,
  home: i % 2 === 0,
  outcome: gf > ga ? 'W' : gf < ga ? 'L' : 'D',
  wins: gf > ga ? 1 : 0,
  draws: gf === ga ? 1 : 0,
  losses: gf < ga ? 1 : 0,
  goalsFor: gf,
  goalsAgainst: ga,
  xg: null,
  tactic: null,
  formation: null,
  players: Object.entries(goals).map(([id, g]) => ({ id, name: `Joueur ${id}`, goals: g })) as unknown as MatchResult['players'],
});
const history = (n: number, club = 'Malženice') =>
  Array.from({ length: n }, (_, i) => ({ gameDate: day(i), data: { schema: 'archivix/1', club, gameDate: day(i), players: [] } as unknown as FmSnapshot }));

describe('édition record', () => {
  beforeEach(() => (results = []));

  it("annonce un triplé avec son auteur et le match", () => {
    results = [match(0, 4, 1, { a: 3, b: 1 })];
    expect(recordNews(history(1))).toMatchObject([
      { kind: 'hatTrick', id: 'a', name: 'Joueur a', goals: 3, match: { opponent: 'Club 0', goalsFor: 4, goalsAgainst: 1, home: true } },
      { kind: 'bigWin' },
    ]);
  });

  it('annonce la série de victoires à 5, pas à 4 ni à 6', () => {
    results = Array.from({ length: 6 }, (_, i) => match(i, 1, 0));
    const news = recordNews(history(6));
    expect(news.map((n) => [n.kind, n.date])).toEqual([['streak', day(4)]]);
    expect(news[0]).toMatchObject({ count: 5 });
  });

  it('ne garde que la plus large victoire de la saison, à trois buts au moins', () => {
    results = [match(0, 3, 0), match(1, 2, 0), match(2, 3, 1), match(3, 5, 1), match(4, 6, 3)];
    expect(recordNews(history(5)).filter((n) => n.kind === 'bigWin').map((n) => n.date)).toEqual([day(3), day(0)]);
  });

  it('annonce la fin de la disette après quatre matchs sans victoire', () => {
    results = [match(0, 0, 1), match(1, 1, 1), match(2, 0, 2), match(3, 2, 2), match(4, 2, 1)];
    expect(recordNews(history(5))).toMatchObject([{ kind: 'runEnded', count: 4, date: day(4) }]);
    results = [match(0, 0, 1), match(1, 1, 1), match(2, 0, 2), match(3, 2, 1)];
    expect(recordNews(history(4))).toEqual([]);
  });

  it("une clé par exploit et par joueur, pour ne l'envoyer qu'une fois", () => {
    results = [match(0, 6, 0, { a: 3, b: 3 })];
    const keys = recordNews(history(1)).map(recordKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
