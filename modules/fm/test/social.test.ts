import { describe, expect, it } from 'vitest';
import { clubTag, moodOf, socialFeed, socialFeedOf, type BreakingNews, type FmSnapshot, type MatchResult, type PressHeld, type SocialFacts } from '../src';

const res = (date: string, opponent: string, f: number, a: number, competition = 'Vyšejšaja Liha', scorer?: string) =>
  ({
    date,
    since: date,
    matches: 1,
    competition,
    opponent,
    friendly: false,
    home: true,
    goalsFor: f,
    goalsAgainst: a,
    outcome: f > a ? 'W' : f < a ? 'L' : 'D',
    wins: +(f > a),
    draws: +(f === a),
    losses: +(f < a),
    xg: null,
    tactic: null,
    formation: null,
    players: scorer ? [{ id: 's', name: scorer, line: null, minutes: 90, started: true, rating: 8.1, goals: f, potm: true, stats: {} }] : [],
  }) as unknown as MatchResult;

const facts = (over: Partial<SocialFacts>): SocialFacts => ({
  club: 'Football Club Slutsk-2024',
  coach: 'Sébastien Menard',
  today: '2028-04-01',
  results: [],
  trophies: [],
  news: [],
  press: [],
  ...over,
});

describe('Le Fil (réseaux sociaux)', () => {
  it('nom court du club pour les hashtags', () => {
    expect(clubTag('Football Club Slutsk-2024')).toBe('Slutsk');
    expect(clubTag('Olympique de Marseille')).toBe('Marseille');
    expect(clubTag('Arsenal')).toBe('Arsenal');
  });

  it("l'humeur suit les points des cinq derniers matchs, un trophée la remonte", () => {
    const wins = ['A', 'B', 'C', 'D', 'E'].map((o, i) => res(`2028-03-0${i + 1}`, o, 2, 0));
    const losses = ['A', 'B', 'C', 'D', 'E'].map((o, i) => res(`2028-03-0${i + 1}`, o, 0, 2));
    expect(moodOf(wins)).toBe(2);
    expect(moodOf(losses)).toBe(-2);
    expect(moodOf(losses, true)).toBe(-1);
    expect(moodOf([])).toBe(0);
  });

  it('une victoire fait parler le club et les supporters, avec le score et le buteur', () => {
    const feed = socialFeedOf(facts({ results: [res('2028-03-30', 'Dinamo Minsk', 3, 1, 'Vyšejšaja Liha', 'Ivan Petrov')] }));
    expect(feed.tag).toBe('Slutsk');
    expect(feed.coach).toBe('Menard');
    const authors = feed.posts.map((p) => p.author);
    expect(authors).toContain('club');
    expect(authors).toContain('ultra');
    const club = feed.posts.find((p) => p.author === 'club')!;
    expect(club).toMatchObject({ topic: 'win', date: '2028-03-30', vars: { score: '3-1', opponent: 'Dinamo Minsk', scorer: 'Ivan Petrov' }, tags: ['club'] });
  });

  it('une série sans victoire lance #NomOut à partir de cinq matchs', () => {
    const run = ['A', 'B', 'C', 'D', 'E'].map((o, i) => res(`2028-03-${10 + i * 3}`, o, 0, 1));
    const feed = socialFeedOf(facts({ results: run }));
    const bad = feed.posts.filter((p) => p.topic === 'badRun');
    expect(bad.map((p) => p.vars.count)).toEqual([5, 3]);
    expect(bad[0]!.tags).toEqual(['coachOut']);
    expect(bad[1]!.tags).toEqual([]);
    expect(feed.mood).toBe(-2);
  });

  it('un trophée fait la fête, avant le reste de la journée', () => {
    const feed = socialFeedOf(
      facts({ results: [res('2028-02-27', 'Dinamo Minsk', 2, 1, 'Supierkubok Belarusi')], trophies: [{ date: '2028-02-27', competition: 'Supierkubok Belarusi' }], today: '2028-03-01' }),
    );
    const day = feed.posts.filter((p) => p.date === '2028-02-27');
    expect(day.length).toBeLessThanOrEqual(6);
    expect(day[0]!.topic).toBe('trophy');
    expect(day.filter((p) => p.topic === 'trophy').every((p) => p.tags.includes('champions'))).toBe(true);
  });

  it('les rumeurs sur le coach passent par l’insider ; le ton de la conférence fait réagir', () => {
    const news: BreakingNews[] = [
      { kind: 'linked', date: '2028-03-20', club: 'Football Club Slutsk-2024', id: 'coach|x', name: 'Sébastien Menard', age: null, position: null, rank: 0, injury: null, days: null, other: 'BATE Borisov' },
    ];
    const press: PressHeld[] = [
      { kind: 'pre', matchDate: '2028-03-25', opponent: 'BATE Borisov', questions: [], answers: [{ question: 'linked' as never, tone: 'confident', text: 'Nous allons gagner ce match, je le sais.' }] },
    ];
    const feed = socialFeedOf(facts({ news, press }));
    expect(feed.posts.find((p) => p.author === 'insider')).toMatchObject({ topic: 'coachLinked', vars: { other: 'BATE Borisov' } });
    const reporter = feed.posts.find((p) => p.author === 'reporter')!;
    expect(reporter.topic).toBe('pressBold');
    expect(String(reporter.vars.quote)).toContain('gagner');
  });

  it('ne garde que les 45 derniers jours, au plus six messages par jour, ids stables', () => {
    const old = res('2028-01-01', 'Vieux', 1, 0);
    const feed = socialFeedOf(facts({ results: [old, res('2028-03-30', 'A', 5, 0)] }));
    expect(feed.posts.every((p) => p.date >= '2028-02-15')).toBe(true);
    const again = socialFeedOf(facts({ results: [old, res('2028-03-30', 'A', 5, 0)] }));
    expect(again.posts.map((p) => [p.id, p.seed, p.likes])).toEqual(feed.posts.map((p) => [p.id, p.seed, p.likes]));
  });

  it('depuis les relevés : une recrue du onze fait réagir le club', () => {
    const squad = Array.from({ length: 15 }, (_, i) => ({ id: `p${i}`, name: `Joueur ${i}`, level: 20 - i, age: 25 }));
    const snap = (gameDate: string, players: typeof squad) => ({ schema: 'archivix/1', club: 'Football Club Slutsk-2024', gameDate, players }) as unknown as FmSnapshot;
    const h = [snap('2028-03-01', squad), snap('2028-03-02', [...squad, { id: 'new', name: 'Ján Bačík', level: 19.5, age: 24 }])].map((data) => ({ gameDate: data.gameDate, data }));
    const feed = socialFeed(h);
    expect(feed.posts.filter((p) => p.topic === 'signing').map((p) => p.author).sort()).toEqual(['club', 'insider', 'ultra']);
    expect(socialFeed([]).posts).toEqual([]);
  });
});
