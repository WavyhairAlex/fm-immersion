import { describe, expect, it } from 'vitest';
import { analyzeResults, resultBetween, type FmSnapshot } from '../src';

type P = { id: string; min: number; starts: number; subs?: number; tg: number; tc: number; won?: number; lost?: number; xg?: number; apps?: number; avg?: number; goals?: number };

/** Instantané minimal : cumuls de saison par joueur dans custom.joueurs (comme chemins.json). */
function snap(date: string, ps: P[], extra: Record<string, unknown> = {}): FmSnapshot {
  return {
    schema: 'archivix/1',
    game: 'FM27',
    club: 'Malženice',
    gameDate: date,
    players: ps.map((p) => ({ id: p.id, name: `J${p.id}`, positions: p.id === 'gk' ? 'GB' : 'MC', apps: p.apps ?? p.starts + (p.subs ?? 0), avgRating: p.avg ?? null, goals: p.goals ?? 0 })),
    custom: {
      joueurs: Object.fromEntries(
        ps.map((p) => [
          p.id,
          {
            id: p.id,
            stat_Minutes: p.min,
            stat_StartingAppearances: p.starts,
            stat_SubAppearances: p.subs ?? 0,
            stat_TeamGoals: p.tg,
            stat_TeamConceded: p.tc,
            stat_GamesWon: p.won ?? 0,
            stat_GamesLost: p.lost ?? 0,
            stat_ExpectedGoals: p.xg ?? 0,
          },
        ]),
      ),
    },
    ...extra,
  } as unknown as FmSnapshot;
}

describe('résultats entre deux instantanés', () => {
  const before = snap('2027-02-14', [
    { id: 'gk', min: 900, starts: 10, tg: 12, tc: 10, apps: 10, avg: 6.8 },
    { id: 'a', min: 800, starts: 9, tg: 11, tc: 9, xg: 3, apps: 9, avg: 7.0, goals: 4 },
    { id: 'b', min: 100, starts: 1, subs: 2, tg: 1, tc: 2, apps: 3, avg: 6.5 },
  ], { nextMatch: { opponent: 'Senica', inDays: 2, location: 'Domicile', competition: '2. liga' }, tactic: { name: 'Possession 4-3-3' } });

  it('retrouve le score, le résultat, l’adversaire et la note du match', () => {
    const after = snap('2027-02-17', [
      { id: 'gk', min: 990, starts: 11, tg: 14, tc: 11, won: 1, apps: 11, avg: 6.8 },
      { id: 'a', min: 870, starts: 10, tg: 13, tc: 10, xg: 3.9, won: 1, apps: 10, avg: 7.1, goals: 5 },
      { id: 'b', min: 120, starts: 1, subs: 3, tg: 1, tc: 2, xg: 0.2, apps: 4, avg: 6.5 },
    ], { tactic: { name: 'Possession 4-3-3' } });
    const r = resultBetween(before, after)!;
    expect(r).toMatchObject({ matches: 1, outcome: 'W', goalsFor: 2, goalsAgainst: 1, opponent: 'Senica', home: true, tactic: 'Possession 4-3-3' });
    expect(r.xg).toBeCloseTo(1.1);
    const a = r.players.find((p) => p.id === 'a')!;
    expect(a).toMatchObject({ started: true, minutes: 70, goals: 1 });
    expect(a.rating).toBeCloseTo(8.0);
    expect(r.players.find((p) => p.id === 'b')!.started).toBe(false);
  });

  it('pas de match entre deux instantanés : rien', () => {
    expect(resultBetween(before, before)).toBeNull();
  });

  it('nouvelle saison (cumuls remis à zéro) : rien', () => {
    const reset = snap('2027-07-20', [
      { id: 'gk', min: 90, starts: 1, tg: 1, tc: 0, won: 1 },
      { id: 'a', min: 90, starts: 1, tg: 1, tc: 0, won: 1 },
    ]);
    expect(resultBetween(before, reset)).toBeNull();
  });

  it('plusieurs matchs regroupés : bilan de la période seulement', () => {
    const after = snap('2027-02-24', [
      { id: 'gk', min: 1170, starts: 13, tg: 15, tc: 13, won: 1, lost: 1 },
      { id: 'a', min: 1000, starts: 11, tg: 13, tc: 11 },
      { id: 'b', min: 100, starts: 1, subs: 2, tg: 1, tc: 2 },
    ]);
    const r = resultBetween(before, after)!;
    expect(r).toMatchObject({ matches: 3, outcome: null, wins: 1, losses: 1, draws: 1, goalsFor: 3, goalsAgainst: 3, opponent: null });
  });
});

describe('ce qui marche ou pas', () => {
  /** Une saison fictive : 8 matchs, `a` titulaire dans les 4 premiers (gagnés), absent ensuite (perdus). */
  function season() {
    const h: { gameDate: string; data: FmSnapshot }[] = [];
    let gkTg = 0, gkTc = 0, aMin = 0, aStarts = 0;
    const push = (i: number) =>
      h.push({
        gameDate: `2027-03-${String(i + 1).padStart(2, '0')}`,
        data: snap(`2027-03-${String(i + 1).padStart(2, '0')}`, [
          { id: 'gk', min: 90 * i, starts: i, tg: gkTg, tc: gkTc },
          { id: 'a', min: aMin, starts: aStarts, tg: 0, tc: 0 },
        ], { tactic: { name: i <= 4 ? 'Possession 4-3-3' : 'Direct 4-4-2' } }),
      });
    push(0);
    for (let i = 1; i <= 8; i++) {
      if (i <= 4) { gkTg += 2; aMin += 90; aStarts++; } else gkTc += 1;
      push(i);
    }
    return h;
  }

  it('bilan par tactique, impact des joueurs et forme', () => {
    const an = analyzeResults(season());
    expect(an.record).toMatchObject({ matches: 8, wins: 4, losses: 4, points: 12, goalsFor: 8, goalsAgainst: 4 });
    expect(an.form).toEqual(['W', 'L', 'L', 'L', 'L']);
    const poss = an.byTactic.find((t) => t.key === 'Possession 4-3-3')!;
    expect(poss.ppm).toBe(3);
    expect(an.insights.find((i) => i.kind === 'tacticBest')!.params.name).toBe('Possession 4-3-3');
    const a = an.players.find((p) => p.id === 'a')!;
    expect(a).toMatchObject({ starts: 4, ppmWith: 3, ppmWithout: 0, impact: 3 });
    expect(an.insights.some((i) => i.kind === 'playerPlus' && i.params.name === 'Ja')).toBe(true);
    expect(an.results[0]!.date).toBe('2027-03-09');
  });
});
