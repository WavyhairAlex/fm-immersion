import { describe, expect, it } from 'vitest';
import { attributeEffect, ENGINE_GAINS, engineGroups, engineTier, engineValue, positionWeights } from '../src';

const all = (v: number, over: Record<string, number> = {}) => ({ positions: ['MC' as const], attributes: { ...Object.fromEntries(Object.keys(ENGINE_GAINS).map((k) => [k, v])), ...over } });

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

  it('pèse les attributs selon le poste (mesures de Purity), sans changer l’échelle', () => {
    // Milieu central : pas de mesure propre, poids de toute l'équipe.
    expect(Object.values(positionWeights(['MC'])).every((w) => w === 1)).toBe(true);
    // La détente compte surtout en défense centrale et en attaque, peu sur les côtés.
    expect(positionWeights(['DC']).JumpingReach).toBeGreaterThan(1.5);
    expect(positionWeights(['BT']).JumpingReach).toBeGreaterThan(1.2);
    expect(positionWeights(['DLG']).JumpingReach).toBeLessThan(0.6);
    // L'endurance compte surtout pour un latéral ou un piston, la finition pour un attaquant.
    expect(positionWeights(['DD']).Stamina).toBeGreaterThan(1.3);
    expect(positionWeights(['BT']).Finishing).toBeGreaterThan(1.4);
    // Poids moyen de 1 par poste et bornés.
    for (const pos of ['BT', 'MOC', 'DLG', 'DC', 'MDF'] as const) {
      const w = Object.values(positionWeights([pos]));
      expect(w.every((x) => x >= 0.25 && x <= 2)).toBe(true);
    }
    // Les autres attributs ne changent pas.
    expect(positionWeights(['DC']).Passing).toBeUndefined();
    const jumper = (pos: 'DC' | 'DLG') => engineValue({ positions: [pos], attributes: all(12, { JumpingReach: 18 }).attributes })!.index;
    expect(jumper('DC')).toBeGreaterThan(jumper('DLG'));
    // Plusieurs postes : moyenne des familles ; le poste visé l'emporte sur les postes du joueur.
    expect(engineGroups(['DC', 'MDF', 'MC'])).toEqual(['CB', 'DM', 'team']);
    expect(positionWeights(['DC', 'DLG']).JumpingReach).toBeCloseTo((positionWeights(['DC']).JumpingReach! + positionWeights(['DLG']).JumpingReach!) / 2);
    const p = { positions: ['DLG' as const], attributes: all(12, { JumpingReach: 18 }).attributes };
    expect(engineValue(p, 'DC')!.index).toBe(jumper('DC'));
    expect(engineValue(p, 'DC')!.groups).toEqual(['CB']);
  });

  it('donne une note méta sur 20 : un joueur à X partout vaut X', () => {
    for (const v of [6, 12, 15, 18]) expect(engineValue(all(v))!.meta).toBeCloseTo(v, 1);
    expect(engineValue({ positions: ['DC'], attributes: all(14).attributes })!.meta).toBeCloseTo(14, 1);
    // Un sprinteur à 12 ailleurs pèse comme un joueur nettement au-dessus de 12 partout.
    const fast = engineValue(all(12, { Pace: 18, Acceleration: 17, Stamina: 16 }))!;
    expect(fast.meta).toBeGreaterThan(13.5);
    expect(fast.meta).toBeLessThan(16);
    // Un technicien lent à 17 en technique pèse moins qu'un joueur à 12 partout.
    expect(engineValue(all(12, { Technique: 17, Vision: 17, Passing: 17, Pace: 7, Acceleration: 8 }))!.meta).toBeLessThan(12);
    // Bornée entre 1 et 20.
    expect(engineValue(all(20, { Pace: 20 }))!.meta).toBeLessThanOrEqual(20);
    expect(engineValue(all(1))!.meta).toBeGreaterThanOrEqual(1);
  });
});
