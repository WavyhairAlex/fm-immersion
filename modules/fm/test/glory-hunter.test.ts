import { describe, expect, it } from 'vitest';
import { europeanCup, evaluateChallenge, gloryHunterState, type ChallengeFacts, type FactMatch, type FactSeason, type GhJoker } from '../src';

type Cup = { comp: string; date: string; gf: number; ga: number; opp?: string };
interface SeasonSpec {
  year: number;
  club?: string;
  league?: string;
  position?: number;
  /** Scores des matchs de championnat (un par semaine à partir d'août). */
  league_?: [number, number][];
  cups?: Cup[];
  /** Buts d'un joueur dans le 1er match de championnat. */
  hatful?: number;
}

const outcome = (gf: number, ga: number) => (gf > ga ? 'W' : gf < ga ? 'L' : 'D') as 'W' | 'D' | 'L';
const match = (date: string, comp: string, gf: number, ga: number, league: boolean, opp: string, goals = 0): FactMatch => ({
  date,
  since: date,
  n: 1,
  competition: comp,
  league,
  opponent: opp,
  outcome: outcome(gf, ga),
  w: Number(gf > ga),
  d: Number(gf === ga),
  l: Number(gf < ga),
  gf,
  ga,
  players: [{ id: 'p1', name: 'Buteur', age: 24, nat: null, started: true, minutes: 90, goals }],
});

function build(specs: SeasonSpec[], exits: ChallengeFacts['exits'] = []): ChallengeFacts {
  const seasons: FactSeason[] = [];
  const matches: FactMatch[] = [];
  for (const s of specs) {
    const league = s.league ?? 'Ligue 1 McDonald’s';
    const scores = s.league_ ?? [[2, 0], [1, 1]];
    const start = `${s.year}-07-01`;
    const end = `${s.year + 1}-05-31`;
    const ms: FactMatch[] = scores.map(([gf, ga], i) => {
      const d = new Date(Date.UTC(s.year, 7, 1 + 7 * i)).toISOString().slice(0, 10);
      return match(d, league, gf, ga, true, `Adv ${i}`, i === 0 ? (s.hatful ?? 0) : 0);
    });
    ms.push(...(s.cups ?? []).map((c, i) => match(c.date, c.comp, c.gf, c.ga, false, c.opp ?? `${c.comp} ${i}`)));
    matches.push(...ms.sort((a, b) => a.date.localeCompare(b.date)));
    seasons.push({ club: s.club ?? 'Toulouse FC', league, start, end, ended: true, position: s.position ?? 5, fixturesAtStart: scores.length, fromStart: true });
  }
  return {
    start: seasons[0]!.start,
    end: seasons.at(-1)!.end,
    unemployedStart: false,
    editorUsed: null,
    editorKnown: true,
    clubs: [...new Set(seasons.map((s) => s.club))],
    matches,
    seasons,
    rewinds: [],
    exits,
  };
}

/** Parcours en coupe gagné : deux tours, finale en fin de saison. */
const won = (comp: string, y: number): Cup[] => [
  { comp, date: `${y + 1}-02-10`, gf: 2, ga: 0 },
  { comp, date: `${y + 1}-05-25`, gf: 1, ga: 0 },
];

describe('Glory Hunter', () => {
  it('reconnaît les coupes d’Europe', () => {
    expect(europeanCup('Ligue des champions de l’UEFA')).toBe('ucl');
    expect(europeanCup('UEFA Europa League')).toBe('uel');
    expect(europeanCup('Ligue Europa Conférence')).toBe('uecl');
    expect(europeanCup('Ligue des champions de l’AFC')).toBeNull();
    expect(europeanCup('Supercoupe de l’UEFA')).toBeNull();
  });

  it('compte les trophées du défi et le triplé', () => {
    const f = build([{ year: 2026, position: 1, cups: [...won('Coupe de France', 2026), ...won('Ligue des champions', 2026)] }]);
    const s = gloryHunterState(f);
    expect(s.trophies.map((t) => t.id).sort()).toEqual(['cupFra', 'leagueFra', 'ucl']);
    expect(s.bonuses.map((b) => b.id)).toEqual(expect.arrayContaining(['treble', 'uclWin', 'invincibles']));
    // Triplé, Ligue des champions, invincibles : trois saisons de plus.
    expect(s.allowed).toBe(18);
    const r = evaluateChallenge('glory-hunter', f);
    expect(r.status).toBe('running');
    expect(r.headline).toBe('3/15');
  });

  it('ne compte pas une coupe perdue en finale, et note la finale de C1 perdue', () => {
    const f = build([
      {
        year: 2026,
        league_: [[1, 0], [0, 1]],
        cups: [
          { comp: 'Ligue des champions', date: '2027-03-01', gf: 2, ga: 0 },
          { comp: 'Ligue des champions', date: '2027-05-30', gf: 0, ga: 1 },
        ],
      },
    ]);
    const s = gloryHunterState(f);
    expect(s.trophies).toEqual([]);
    expect(s.maluses.map((m) => m.id)).toEqual(['uclFinalLost']);
    expect(s.allowed).toBe(14);
  });

  it('applique les malus : humiliation, 5 défaites de suite, limogeage, disette', () => {
    const bad: [number, number][] = [[0, 6], [0, 1], [1, 2], [0, 3], [0, 1]];
    const f = build(
      [{ year: 2026, league_: bad }, { year: 2027 }, { year: 2028, league_: [[0, 1]] }],
      [{ date: '2029-05-31', club: 'Toulouse FC', sacked: true }],
    );
    const s = gloryHunterState(f);
    expect(s.maluses.map((m) => m.id).sort()).toEqual(['drought', 'fiveLosses', 'humiliation', 'sacked']);
    // Quatre malus, et la saison 2027/28 sans défaite rend une saison.
    expect(s.allowed).toBe(12);
  });

  it('titres de suite dans deux pays, et titre ailleurs en Europe', () => {
    const f = build([
      { year: 2026, position: 1, league: 'Eredivisie', league_: [[1, 0], [0, 2]] },
      { year: 2027, position: 1, league: 'Premier League', league_: [[1, 0], [0, 2]] },
    ]);
    const s = gloryHunterState(f);
    expect(s.trophies.map((t) => t.id)).toEqual(['leagueEng']);
    expect(s.bonuses.map((b) => b.id).sort()).toEqual(['backToBack', 'gapYear']);
  });

  it('cinq buts d’un joueur et 100 points', () => {
    const f = build([{ year: 2026, hatful: 5, league_: Array.from({ length: 34 }, () => [2, 0] as [number, number]) }]);
    const ids = gloryHunterState(f).bonuses.map((b) => b.id);
    expect(ids).toEqual(expect.arrayContaining(['fiveGoals', 'hundred', 'invincibles', 'streak15']));
  });

  it('quitte ou double : ×2 si réussi, perdu pour toujours sinon', () => {
    const specs: SeasonSpec[] = [{ year: 2026, league_: [[1, 0], [0, 2]] }, { year: 2027 }];
    const miss: GhJoker[] = [{ kind: 'double', bonus: 'invincibles', declaredAt: '2026-07-15' }];
    const a = gloryHunterState(build(specs), { jokers: miss });
    // Raté en 2026/27, donc la saison invaincue de 2027/28 ne compte plus.
    expect(a.frozen).toEqual(['invincibles']);
    expect(a.bonuses).toEqual([]);
    expect(a.doublesLeft).toBe(1);

    const hit: GhJoker[] = [{ kind: 'double', bonus: 'invincibles', declaredAt: '2027-07-15' }];
    const b = gloryHunterState(build(specs), { jokers: hit });
    expect(b.bonuses).toEqual([{ id: 'invincibles', season: '2027/28', value: 2 }]);
    expect(b.allowed).toBe(17);
  });

  it('préparation : ni trophée ni malus cette saison-là', () => {
    const f = build([{ year: 2026, position: 1, league_: [[0, 5], [1, 0]] }]);
    const s = gloryHunterState(f, { jokers: [{ kind: 'preseason', declaredAt: '2026-07-02' }] });
    expect(s.trophies).toEqual([]);
    expect(s.maluses).toEqual([]);
    expect(s.preseasonsLeft).toBe(0);
  });

  it('horloge écoulée : défi perdu', () => {
    const specs: SeasonSpec[] = Array.from({ length: 16 }, (_, i) => ({ year: 2026 + i, league_: [[1, 0], [0, 1]] as [number, number][], position: i % 3 === 0 ? 1 : 4 }));
    const r = evaluateChallenge('glory-hunter', build(specs));
    expect(r.status).toBe('failed');
  });
});
