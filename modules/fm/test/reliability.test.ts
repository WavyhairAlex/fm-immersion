import { describe, expect, it } from 'vitest';
import { reliability, type FmPlayer } from '../src';

const full = Object.fromEntries(['Technique', 'Passing', 'Vision', 'FirstTouch', 'Dribbling', 'Crossing', 'Finishing', 'Heading', 'LongShots', 'Marking', 'Tackling', 'Positioning', 'Pace', 'Acceleration', 'Strength', 'Stamina', 'WorkRate', 'JumpingReach', 'Composure', 'Movement', 'Decisions', 'Anticipation', 'Teamwork'].map((k) => [k, 10]));
const p = (i: number, attributes: Record<string, number> = full, pa: number | null = 120) => ({ id: String(i), positions: ['MC'], attributes, pa }) as unknown as FmPlayer;

describe('fiabilité des données (FM Notebook)', () => {
  it('élevée avec tous les attributs et un effectif complet', () => {
    expect(reliability(Array.from({ length: 18 }, (_, i) => p(i)))).toMatchObject({ level: 'high', reasons: [] });
  });
  it('baisse avec des attributs partiels, un petit effectif, sans PA, et des cibles mal connues', () => {
    const r = reliability(Array.from({ length: 12 }, (_, i) => p(i, { Pace: 12, Passing: 10, Decisions: 9, Technique: 8, Vision: 8, Teamwork: 7, Marking: 9, Tackling: 9, Stamina: 9, Strength: 9, Composure: 9, Anticipation: 9, Positioning: 9, WorkRate: 9, Acceleration: 9 }, null)), { targets: [{ knowledge: 30 }, { knowledge: 90 }] });
    expect(r.level).toBe('medium');
    expect(r.reasons.map((x) => x.id)).toEqual(['partial', 'small', 'noPa', 'targetsUnknown']);
  });
});
