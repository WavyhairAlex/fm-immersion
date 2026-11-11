import { describe, expect, it } from 'vitest';
import { attributeEffect, ENGINE_GAINS, engineTier, engineValue } from '../src';

const all = (v: number, over: Record<string, number> = {}) => ({ positions: ['DC' as const], attributes: { ...Object.fromEntries(Object.keys(ENGINE_GAINS).map((k) => [k, v])), ...over } });

describe('indice moteur (tests d’attributs FM27)', () => {
  it('reprend les paliers du tableau et interpole entre eux', () => {
    expect(attributeEffect('Pace', 12)).toBe(0);
    expect(attributeEffect('Pace', 18)).toBeCloseTo(19.4);
    expect(attributeEffect('Pace', 6)).toBeCloseTo(-26.8);
    expect(attributeEffect('Pace', 1)).toBeCloseTo(-40);
    expect(attributeEffect('Pace', 9)).toBeCloseTo(-13.4);
    expect(attributeEffect('WorkRate', 3)).toBeCloseTo(-15.7, 1);
    // Au-delà de 18, la pente du dernier palier continue.
    expect(attributeEffect('Stamina', 20)).toBeCloseTo((14 * 8) / 6);
    expect(attributeEffect('Teamwork', 15)).toBeNull();
  });

  it('un joueur à 12 partout vaut 0, un sprinteur gagne, un joueur sans volume de jeu est signalé', () => {
    expect(engineValue(all(12))!.index).toBe(0);
    const fast = engineValue(all(12, { Pace: 18, Acceleration: 17, Stamina: 16 }))!;
    expect(fast.index).toBe(40);
    expect(fast.strengths[0]!.attr).toBe('Pace');
    expect(engineTier(fast.index)).toBe('top');
    const lazy = engineValue(all(12, { WorkRate: 4 }))!;
    expect(lazy.belowMin.map((f) => f.attr)).toEqual(['WorkRate']);
    expect(lazy.weaknesses[0]!.attr).toBe('WorkRate');
  });

  it('rien pour un gardien ni sans attributs lus', () => {
    expect(engineValue({ positions: ['GB'], attributes: all(12).attributes })).toBeNull();
    expect(engineValue({ positions: ['DC'], attributes: { Pace: 15 } })).toBeNull();
  });
});
