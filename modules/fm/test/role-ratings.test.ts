import { describe, expect, it } from 'vitest';
import { DEFAULT_TACTIC_REFERENCE, familiarityPenalty, gameRoleRating, ROLE_RATINGS_FM27, roleThreshold, TacticEngine } from '../src';
import { normalizePlayer } from '../src/player';

const all = (v: number, over: Record<string, number> = {}) => {
  const names = new Set(Object.values(ROLE_RATINGS_FM27).flatMap((r) => [...r.k, ...(r.s ?? []), ...(r.x ?? [])]));
  return { ...Object.fromEntries([...names].map((n) => [n, v])), ...over };
};

describe('note de rôle FM27', () => {
  it('chaque rôle des repères a sa note du jeu (79 rôles)', () => {
    for (const r of DEFAULT_TACTIC_REFERENCE.roles) {
      if (r.game?.ip) expect(ROLE_RATINGS_FM27[r.game.ip], r.code).toBeDefined();
      if (r.game?.oop) expect(ROLE_RATINGS_FM27[r.game.oop], r.code).toBeDefined();
    }
  });

  it('les attributs à éviter font baisser la note (Défenseur central strict et bonnes passes)', () => {
    const fine = normalizePlayer({ id: 1, name: 'A', positions: 'D (C)', attributes: all(12, { Passing: 5, Composure: 5 }) });
    const slick = normalizePlayer({ id: 2, name: 'B', positions: 'D (C)', attributes: all(12, { Passing: 18, Composure: 18 }) });
    expect(gameRoleRating(fine, 'NoNonsenseCentreBack')!).toBeGreaterThan(gameRoleRating(slick, 'NoNonsenseCentreBack')!);
    // Au contraire, l'axial à l'aise au pied les veut.
    expect(gameRoleRating(slick, 'BallPlayingCentreBack')!).toBeGreaterThan(gameRoleRating(fine, 'BallPlayingCentreBack')!);
  });

  it('pénalité de familiarité du jeu', () => {
    expect(familiarityPenalty(20)).toBe(0);
    expect(familiarityPenalty(15)).toBeCloseTo(0.05);
    expect(familiarityPenalty(14)).toBeCloseTo(0.15);
    expect(familiarityPenalty(11)).toBeCloseTo(0.36);
    const p = normalizePlayer({ id: 3, name: 'C', positions: 'D (C), D (D)', positionRatings: { 'D (C)': 20, 'D (D)': 11 }, attributes: all(12) } as never);
    expect(p.familiarity).toEqual({ DC: 20, DD: 11 });
    expect(gameRoleRating(p, 'FullBack', 'DD')!).toBeCloseTo(gameRoleRating(p, 'FullBack')! * 0.64);
  });

  it('le moteur tactique utilise la note du jeu et connaît les rôles à seuil', () => {
    const engine = new TacticEngine(DEFAULT_TACTIC_REFERENCE);
    const p = normalizePlayer({ id: 4, name: 'D', positions: 'D (C)', attributes: all(12, { Passing: 18, Composure: 18 }) });
    expect(engine.roleFit(p, 'BPCB', 'ip', 'DC')).toBeCloseTo(gameRoleRating(p, 'BallPlayingCentreBack', 'DC')!);
    expect(roleThreshold('WideForward')).toBe(100);
    // Capacité actuelle inconnue : rôle à seuil compté un quart de moins.
    expect(engine.roleFit(p, 'WF', 'ip')).toBeCloseTo(gameRoleRating(p, 'WideForward')! * 0.75);
    expect(roleThreshold('CentreBack')).toBeNull();
  });
});
