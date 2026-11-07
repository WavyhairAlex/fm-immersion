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
    { classementPosition: 5, confianceSupporters: 'Ravis' },
    { nextMatch: { opponent: 'Gand', competition: 'Pro League', inDays: 'Dans 4 jours' } },
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
    expect(h.params).toMatchObject({ outcome: 'W', opponent: 'Anderlecht', goalsFor: 3, goalsAgainst: 0, scorers: 'Diallo (2)', best: 'Diallo' });
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
