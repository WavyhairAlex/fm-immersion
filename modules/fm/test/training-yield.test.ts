import { describe, expect, it } from 'vitest';
import { trainingYield, yieldBaseline, yieldDaysMissing, type FmPlayer, type SquadAt } from '../src';

const player = (id: string, age: number, attributes: Record<string, number>) => ({ id, name: id, age, positions: ['MC'], attributes }) as unknown as FmPlayer;
const at = (gameDate: string, players: FmPlayer[]): SquadAt => ({ gameDate, players });

describe('rendement mesuré de l’entraînement', () => {
  const base = at('2027-03-01', [player('a', 19, { Pace: 12, Passing: 10, Reflexes: 5 }), player('b', 31, { Pace: 14, Passing: 15 }), player('c', 25, { Pace: 10 })]);
  const now = at('2027-03-29', [player('a', 19, { Pace: 14, Passing: 11, Reflexes: 5 }), player('b', 31, { Pace: 13, Passing: 15 }), player('d', 20, { Pace: 9 })]);

  it('compare les attributs connus aux deux dates, joueur par joueur', () => {
    const y = trainingYield([base, at('2027-03-15', []), now])!;
    expect(y.days).toBe(28);
    expect(y.players).toBe(2); // c parti, d arrivé
    expect(y.perPlayer).toBe(1); // a : +3, b : -1
    expect(y.perMonth).toBe(1);
    expect(y.up.map((g) => g.player.id)).toEqual(['a']);
    expect(y.up[0]!.top).toEqual({ key: 'Pace', delta: 2 });
    expect(y.down.map((g) => g.player.id)).toEqual(['b']);
    expect(y.attrs[0]).toEqual({ key: 'Pace', delta: 1 });
    expect(y.groups.physical).toBe(0.5);
    expect(y.groups.technical).toBe(0.5);
    expect(y.young).toBe(3);
    expect(y.senior).toBe(-1);
    expect(y.expectedPerMonth).toBeGreaterThan(0); // un jeune qui monte, un vétéran qui baisse un peu
    expect(y.verdict).toBe('flat');
  });

  it('juge bon ou mauvais d’après les points par joueur et par 28 jours', () => {
    const up = at('2027-03-15', [player('a', 19, { Pace: 14, Passing: 11 }), player('b', 31, { Pace: 14, Passing: 15 })]);
    expect(trainingYield([base, up])!.verdict).toBe('good'); // +1,5 par joueur en 14 jours → +3 par mois
    const down = at('2027-03-15', [player('a', 19, { Pace: 11, Passing: 10 }), player('b', 31, { Pace: 13, Passing: 14 })]);
    expect(trainingYield([base, down])!.verdict).toBe('bad');
  });

  it('prend pour référence le plus ancien instantané de la fenêtre, à 14 jours au moins', () => {
    const h = [at('2027-01-01', []), at('2027-02-20', []), at('2027-03-10', []), at('2027-03-20', []), at('2027-03-29', [])];
    expect(yieldBaseline(h)!.gameDate).toBe('2027-03-10');
    expect(yieldBaseline(h.slice(0, 2))!.gameDate).toBe('2027-01-01');
    expect(yieldBaseline([h[0]!])).toBeNull();
  });

  it('refuse de conclure sur moins de 14 jours et dit ce qui manque', () => {
    const soon = at('2027-03-08', base.players);
    expect(trainingYield([base, soon])).toBeNull();
    expect(yieldDaysMissing([base, soon])).toBe(7);
    expect(yieldDaysMissing([base, now])).toBe(0);
    expect(yieldDaysMissing([])).toBe(14);
  });
});
