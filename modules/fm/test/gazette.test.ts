import { describe, expect, it } from 'vitest';
import { gazetteIssues, weekStartOf, type FmSnapshot } from '../src';

type P = { id: string; name?: string; min: number; starts: number; tg: number; tc: number; goals?: number; injury?: string; contractEnd?: string; motm?: number };

/** Instantané minimal (même forme que dans results.test.ts) avec classement et ambiance dans custom.equipe. */
function snap(date: string, given: P[], equipe: Record<string, unknown> = {}, extra: Record<string, unknown> = {}): FmSnapshot {
  const gk = given.find((p) => p.id === 'gk');
  const mates = gk ? Array.from({ length: 9 }, (_, i) => ({ ...gk, id: `f${i}`, name: `F${i}`, goals: 0, injury: undefined })) : [];
  const ps = [...given, ...mates];
  return {
    schema: 'archivix/1',
    game: 'FM27',
    club: 'FCV Dender',
    gameDate: date,
    players: ps.map((p) => ({
      id: p.id,
      name: p.name ?? `J${p.id}`,
      positions: p.id === 'gk' ? 'GB' : 'MC',
      apps: p.starts,
      goals: p.goals ?? 0,
      injury: p.injury ?? null,
      contractEnd: p.contractEnd ?? null,
    })),
    custom: {
      equipe,
      joueurs: Object.fromEntries(
        ps.map((p) => [p.id, { id: p.id, stat_Minutes: p.min, stat_StartingAppearances: p.starts, stat_SubAppearances: 0, stat_TeamGoals: p.tg, stat_TeamConceded: p.tc, stat_ManOfMatch: p.motm ?? 0 }]),
      ),
    },
    ...extra,
  } as unknown as FmSnapshot;
}

describe('gazette de la semaine', () => {
  it('range les dates par semaine (lundi)', () => {
    expect(weekStartOf('2026-10-25')).toBe('2026-10-19'); // dimanche
    expect(weekStartOf('2026-10-26')).toBe('2026-10-26'); // lundi
  });

  const w1 = snap(
    '2026-10-18',
    [
      { id: 'gk', min: 90, starts: 1, tg: 1, tc: 1 },
      { id: 'st', name: 'Diallo', min: 90, starts: 1, tg: 1, tc: 1, goals: 1, contractEnd: '2027-06-30' },
      { id: 'mc', name: 'Peeters', min: 90, starts: 1, tg: 1, tc: 1 },
    ],
    { classementPosition: 9, confianceSupporters: 'Satisfaits' },
    { nextMatch: { opponent: 'Anderlecht', competition: 'Pro League', location: 'Domicile', inDays: 'Dans 3 jours' } },
  );
  const w2 = snap(
    '2026-10-21',
    [
      { id: 'gk', min: 180, starts: 2, tg: 4, tc: 1 },
      { id: 'st', name: 'Diallo', min: 180, starts: 2, tg: 4, tc: 1, goals: 3, contractEnd: '2029-06-30', motm: 1 },
      { id: 'nw', name: 'Mertens', min: 0, starts: 0, tg: 0, tc: 0, injury: 'Entorse de la cheville' },
    ],
    {
      classementPosition: 5,
      confianceSupporters: 'Ravis',
      // Chiffres du jeu pour le 3-0 à domicile, et rapport sur le prochain adversaire.
      dernierMatchScoreDomicile: '3',
      dernierMatchScoreExterieur: '0',
      dernierMatchPossDom: 55,
      dernierMatchPossExt: 45,
      dernierMatchTirsDom: 14,
      dernierMatchTirsExt: 6,
      dernierMatchTirsCadresDom: 7,
      dernierMatchTirsCadresExt: 2,
      dernierMatchXgDom: 2.3,
      dernierMatchXgExt: 0.4,
      dernierMatchHommeDuMatch: 'Diallo',
      dernierMatchNoteHommeDuMatch: 8.5,
      advClassement: '3e',
      advEntraineur: 'Brian Riemer',
      advFormationPref: '4-3-3',
      advButeur: 'Dolberg',
      advButs: 7,
    },
    { nextMatch: { opponent: 'Gand', competition: 'Pro League', inDays: 'Dans 4 jours', threatLevel: 'Un match difficile.' } },
  );

  const issues = gazetteIssues([
    { gameDate: w1.gameDate, data: w1 },
    { gameDate: w2.gameDate, data: w2 },
  ]);

  it('fait une gazette par semaine, la plus récente en premier', () => {
    expect(issues.map((i) => [i.number, i.weekStart])).toEqual([
      [2, '2026-10-19'],
      [1, '2026-10-12'],
    ]);
  });

  it('met la victoire à la une, avec le score et le buteur', () => {
    const h = issues[0]!.headline;
    expect(h.kind).toBe('result');
    expect(h.params).toMatchObject({ outcome: 'W', opponent: 'Anderlecht', goalsFor: 3, goalsAgainst: 0, scorers: 'Diallo (2)', best: 'Diallo', competition: 'Pro League', friendly: 0 });
  });

  it('complète le match avec les chiffres du jeu (possession, tirs, xG, note de l’homme du match)', () => {
    expect(issues[0]!.headline.params).toMatchObject({ possession: 55, possessionOpp: 45, shots: 14, shotsOpp: 6, onTarget: 7, xg: 2.3, xgOpp: 0.4, gameMotm: 'Diallo', rating: 8.5 });
  });

  it('présente le prochain adversaire d’après le rapport du jeu', () => {
    const next = issues[0]!.stories.find((s) => s.kind === 'nextMatch')!;
    expect(next.params).toMatchObject({ opponent: 'Gand', position: '3e', manager: 'Brian Riemer', formation: '4-3-3', scorer: 'Dolberg', scorerGoals: 7, threat: 'Un match difficile.' });
  });

  it('signale une série : trois victoires de suite, puis la quatrième ; un amical ne compte pas', () => {
    const base = { id: 'gk', min: 0, starts: 0, tg: 0, tc: 0 };
    const week = (date: string, n: number, extra: Record<string, unknown> = {}) =>
      snap(date, [{ ...base, min: 90 * n, starts: n, tg: 2 * n, tc: 0 }], {}, extra);
    // Un instantané par lundi ; le match de la semaine suivante est celui annoncé par le « prochain match ».
    const next = (opponent: string, competition = 'Pro League') => ({ nextMatch: { opponent, competition, inDays: 'Dans 3 jours' } });
    const hist = [
      week('2026-11-02', 0, next('A')),
      week('2026-11-09', 1, next('B')),
      week('2026-11-16', 2, next('C')),
      week('2026-11-23', 3, next('D', 'Match Amical')),
      week('2026-11-30', 4, next('E')),
      week('2026-12-07', 5),
    ].map((d) => ({ gameDate: d.gameDate, data: d }));
    const all = gazetteIssues(hist).reverse();
    const streak = (i: number) => [all[i]!.headline, ...all[i]!.stories].find((s) => s.kind === 'streak')?.params ?? null;
    expect(streak(2)).toBeNull();
    expect(streak(3)).toEqual({ outcome: 'W', count: 3 });
    // Semaine de l'amical : la série n'a pas bougé, pas de brève.
    expect(streak(4)).toBeNull();
    expect(streak(5)).toEqual({ outcome: 'W', count: 4 });
  });

  it('repère classement, doublé, arrivée, départ, blessure, prolongation, supporters et prochain match', () => {
    const kinds = issues[0]!.stories.map((s) => s.kind);
    expect(kinds).toEqual(expect.arrayContaining(['position', 'scorer', 'arrival', 'departure', 'extension', 'fans', 'nextMatch']));
    const pos = issues[0]!.stories.find((s) => s.kind === 'position')!;
    expect(pos.params).toEqual({ from: 9, to: 5 });
    expect(issues[0]!.stories.find((s) => s.kind === 'departure')!.params.name).toBe('Peeters');
    expect(issues[0]!.stories.find((s) => s.kind === 'arrival')!.params.name).toBe('Mertens');
  });

  it('regroupe les jeunes du centre de formation en une seule brève', () => {
    const base = [{ id: 'gk', min: 0, starts: 0, tg: 0, tc: 0 }];
    const a = snap('2027-03-28', base);
    const kids = [1, 2, 3, 4].map((i) => ({ id: `y${i}`, name: `Jeune ${i}`, min: 0, starts: 0, tg: 0, tc: 0 }));
    const b = snap('2027-04-01', [...base, ...kids]);
    (b.players as { id: string; age?: number }[]).forEach((p) => p.id.startsWith('y') && (p.age = 15));
    const [issue] = gazetteIssues([
      { gameDate: a.gameDate, data: a },
      { gameDate: b.gameDate, data: b },
    ]);
    const all = [issue!.headline, ...issue!.stories];
    expect(all.filter((s) => s.kind === 'arrival')).toHaveLength(0);
    expect(all.find((s) => s.kind === 'youthIntake')!.params.count).toBe(4);
  });

  it('première semaine sans historique : seulement le prochain match', () => {
    expect(issues[1]!.headline.kind).toBe('nextMatch');
  });
});
