import { describe, expect, it } from 'vitest';
import { analyzeResults, matchResults, resultBetween, type FmSnapshot } from '../src';

type P = { id: string; min: number; starts: number; subs?: number; tg: number; tc: number; won?: number; lost?: number; xg?: number; apps?: number; avg?: number; goals?: number };

/** Instantané minimal : cumuls de saison par joueur dans custom.joueurs (comme chemins.json). */
function snap(date: string, given: P[], extra: Record<string, unknown> = {}): FmSnapshot {
  // Neuf coéquipiers qui jouent comme le gardien : un match de l'équipe première compte 11 titularisations.
  const gk = given.find((p) => p.id === 'gk');
  const ps = gk ? [...given, ...Array.from({ length: 9 }, (_, i) => ({ ...gk, id: `f${i}`, xg: 0, goals: 0, avg: undefined }))] : given;
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
      { id: 'b', min: 120, starts: 1, subs: 3, tg: 1, tc: 2, xg: 0.2, won: 1, apps: 4, avg: 6.5 },
    ], { tactic: { name: 'Possession 4-3-3' } });
    const r = resultBetween(before, after)!;
    expect(r).toMatchObject({ matches: 1, outcome: 'W', goalsFor: 2, goalsAgainst: 1, opponent: 'Senica', home: true, tactic: 'Possession 4-3-3' });
    expect(r.xg).toBeCloseTo(1.1);
    const a = r.players.find((p) => p.id === 'a')!;
    expect(a).toMatchObject({ started: true, minutes: 70, goals: 1 });
    expect(a.rating).toBeCloseTo(8.0);
    expect(r.players.find((p) => p.id === 'b')!.started).toBe(false);
  });

  it('lecture incomplète du plugin (aucun cumul) : le match est quand même compté, score du « dernier match » du jeu', () => {
    const eq = (h: number, a: number, adv: string) => ({ custom: { equipe: { dernierMatchScoreDomicile: h, dernierMatchScoreExterieur: a, dernierAdvNom: adv } } });
    const b = { ...before, custom: { ...(before as unknown as { custom: object }).custom, ...eq(0, 2, 'Trnava').custom } } as FmSnapshot;
    const holed = { ...snap('2027-02-17', []), ...eq(2, 1, 'Senica'), nextMatch: null } as unknown as FmSnapshot;
    const list = matchResults([
      { gameDate: '2027-02-14', data: b },
      { gameDate: '2027-02-17', data: holed },
    ]);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ matches: 1, outcome: 'W', goalsFor: 2, goalsAgainst: 1, opponent: 'Senica', home: true, players: [] });
  });

  it('buteur connu le lendemain : le jeu met à jour les buts un jour après les cumuls du match', () => {
    const day = (goals: number) =>
      snap('2027-02-17', [
        { id: 'gk', min: 990, starts: 11, tg: 14, tc: 11, won: 1, apps: 11, avg: 6.8 },
        { id: 'a', min: 870, starts: 10, tg: 13, tc: 10, xg: 3.9, won: 1, apps: 10, avg: 7.1, goals },
        { id: 'b', min: 120, starts: 1, subs: 3, tg: 1, tc: 2, xg: 0.2, apps: 4, avg: 6.5 },
      ]);
    const next = { ...day(6), gameDate: '2027-02-18' } as FmSnapshot;
    const h = [before, day(4), next].map((data) => ({ gameDate: data.gameDate, data }));
    const [r] = matchResults(h);
    expect(r!.players.find((p) => p.id === 'a')!.goals).toBe(2);
    // Sans instantané le lendemain : on garde ce qu'on sait.
    expect(matchResults(h.slice(0, 2))[0]!.players.find((p) => p.id === 'a')!.goals).toBe(0);
  });

  it('un seul joueur qui bouge (réserve, recrue) ou un changement de club : pas un match', () => {
    const reserve = snap('2027-02-15', [
      { id: 'gk', min: 900, starts: 10, tg: 12, tc: 10, apps: 10, avg: 6.8 },
      { id: 'a', min: 800, starts: 9, tg: 11, tc: 9, xg: 3, apps: 9, avg: 7.0, goals: 4 },
      { id: 'b', min: 190, starts: 2, subs: 2, tg: 1, tc: 2, apps: 4, avg: 6.5 },
    ]);
    expect(resultBetween(before, reserve)).toBeNull();
    const other = { ...before, club: 'Vänersborgs IF', gameDate: '2027-02-17' } as FmSnapshot;
    expect(resultBetween(other, before)).toBeNull();
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

describe('données réelles du plugin (partie de Malženice, 08/11/2026)', () => {
  const before = snap('2027-08-20', [
    { id: 'gk', min: 450, starts: 5, tg: 4, tc: 5, won: 2, lost: 2, apps: 5 },
    { id: 'a', min: 197, starts: 2, subs: 1, tg: 1, tc: 0, won: 1, lost: 2, apps: 3 },
    { id: 'r', min: 90, starts: 1, tg: 0, tc: 0, apps: 1 },
  ], { nextMatch: { opponent: 'Nitra', inDays: 'Dans 2 jours', location: 'Domicile', competition: '2. liga' }, tactic: { name: '4-4-2' } });

  it('un joueur de la réserve qui joue le même jour ne compte pas dans le match (buts, xG, titulaires)', () => {
    // Nitra 3-0 : Frimpong (r) joue 90 minutes avec la réserve (nul 0-0) et y marque.
    const after = snap('2027-08-22', [
      { id: 'gk', min: 540, starts: 6, tg: 7, tc: 5, won: 3, lost: 2, xg: 0.04, apps: 6 },
      { id: 'a', min: 287, starts: 3, subs: 1, tg: 4, tc: 0, won: 2, lost: 2, xg: 0.66, apps: 4, goals: 2 },
      { id: 'r', min: 180, starts: 2, tg: 0, tc: 0, xg: 1.19, apps: 2, goals: 1 },
    ], { tactic: { name: '4-4-2' } });
    const r = resultBetween(before, after)!;
    expect(r).toMatchObject({ matches: 1, outcome: 'W', goalsFor: 3, goalsAgainst: 0, opponent: 'Nitra', played: '2027-08-22' });
    expect(r.players.map((p) => p.id)).not.toContain('r');
    expect(r.xg).toBeCloseTo(0.7);
  });

  it('les buts de la réserve ne changent pas le score (coupe perdue 1-3, pas 2-3)', () => {
    // Drobný (r) gagne 2-0 avec la réserve le jour où l'équipe première perd 1-3 à Púchov.
    const after = snap('2027-09-01', [
      { id: 'gk', min: 540, starts: 6, tg: 5, tc: 8, won: 2, lost: 3, apps: 6 },
      { id: 'a', min: 242, starts: 2, subs: 2, tg: 2, tc: 0, won: 1, lost: 3, apps: 4, goals: 1 },
      { id: 'r', min: 165, starts: 2, tg: 2, tc: 0, won: 1, apps: 2 },
    ]);
    const r = resultBetween(before, after)!;
    expect(r).toMatchObject({ outcome: 'L', goalsFor: 1, goalsAgainst: 3 });
    expect(r.players.filter((p) => p.started)).toHaveLength(10);
  });

  it('stats de match pas encore lues dans l’instantané précédent : pas une période de matchs nuls', () => {
    const empty = { ...before, gameDate: '2027-02-07', custom: { joueurs: Object.fromEntries(before.players.map((p) => [p.id, { id: p.id }])) } } as FmSnapshot;
    expect(resultBetween(empty, snap('2027-02-14', [{ id: 'gk', min: 1800, starts: 20, tg: 15, tc: 19, apps: 20 }]))).toBeNull();
  });

  it('tactique : nom lu à part, sinon celle d’avant le match ; jamais la « formation la plus utilisée »', () => {
    const after = (extra: Record<string, unknown>) =>
      snap('2027-08-22', [
        { id: 'gk', min: 540, starts: 6, tg: 7, tc: 5, won: 3, lost: 2, apps: 6 },
        { id: 'a', min: 287, starts: 3, subs: 1, tg: 4, tc: 0, won: 2, lost: 2, apps: 4 },
      ], extra);
    const unread = { name: null, formation: 'Personnalisée', formationSource: 'MostUsedFormation' };
    const custom = (s: FmSnapshot, nom: string) => ({ ...s, custom: { ...(s.custom as object), tactique: { nomTactique: nom } } }) as FmSnapshot;
    expect(resultBetween(before, custom(after({ tactic: unread }), '4-2-3-1 Pressing'))).toMatchObject({ tactic: '4-2-3-1 Pressing', formation: '4-2-3-1 Pressing' });
    expect(resultBetween(before, after({ tactic: unread }))).toMatchObject({ tactic: '4-4-2', formation: '4-4-2' });
    expect(resultBetween({ ...before, tactic: unread } as FmSnapshot, after({ tactic: unread }))).toMatchObject({ tactic: null, formation: null });
  });
});

describe('ce qui marche ou pas', () => {
  /** Une saison fictive : 8 matchs, `a` titulaire dans les 4 premiers (gagnés), absent ensuite (perdus). */
  function season() {
    const h: { gameDate: string; data: FmSnapshot }[] = [];
    let gkTg = 0, gkTc = 0, aMin = 0, aStarts = 0, aTg = 0;
    const push = (i: number) =>
      h.push({
        gameDate: `2027-03-${String(i + 1).padStart(2, '0')}`,
        data: snap(`2027-03-${String(i + 1).padStart(2, '0')}`, [
          { id: 'gk', min: 90 * i, starts: i, tg: gkTg, tc: gkTc },
          { id: 'a', min: aMin, starts: aStarts, tg: aTg, tc: 0 },
        ], { tactic: { name: i <= 4 ? 'Possession 4-3-3' : 'Direct 4-4-2' } }),
      });
    push(0);
    for (let i = 1; i <= 8; i++) {
      if (i <= 4) { gkTg += 2; aTg += 2; aMin += 90; aStarts++; } else gkTc += 1;
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

describe('blessés rétablis pour le match', () => {
  it('un blessé rétabli avant le match compte, pas celui qui manque encore', async () => {
    const { backForMatch, forNextMatch, unavailable, nextMatchInDays } = await import('../src');
    const base = { injury: 'Torsion du genou', suspension: null } as const;
    const [a, b] = forNextMatch([{ ...base, injuryDays: 7 }, { ...base, injuryDays: 27 }] as never, 10);
    expect(backForMatch(a!)).toBe(true);
    expect(unavailable(a!)).toBe(false);
    expect(unavailable(b!)).toBe(true);
    expect(unavailable({ ...a!, suspension: 'Suspendu' })).toBe(true);
    expect(nextMatchInDays({ gameDate: '2027-03-21', nextMatch: { next5: [{ DisplayValue: 'Dans 10 jours' }] } })).toBe(10);
  });
});
