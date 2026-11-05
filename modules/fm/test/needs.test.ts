import { describe, expect, it } from 'vitest';
import { evolutionPlan, mergeReference, recruitmentNeeds, TacticEngine } from '../src';
import { normalizePlayer } from '../src/player';

const ATTRS = ['Passing', 'FirstTouch', 'Technique', 'Composure', 'Vision', 'Decisions', 'Teamwork', 'WorkRate', 'Stamina', 'Strength', 'Pace', 'Acceleration', 'Tackling', 'Marking', 'Positioning', 'Anticipation', 'Heading', 'JumpingReach', 'Finishing', 'OffTheBall', 'Crossing', 'Dribbling', 'Flair', 'Concentration', 'Agility', 'Aggression', 'Reflexes', 'Handling', 'OneOnOnes', 'AerialReach', 'CommandOfArea', 'Kicking', 'RushingOut', 'Communication', 'Bravery', 'Balance', 'LongShots'];
const attrs = (base: number) => Object.fromEntries(ATTRS.map((k) => [k, base]));
const p = (id: number, positions: string, base: number, extra: Record<string, unknown> = {}) =>
  normalizePlayer({ id, name: `J${id}`, positions, age: 26, attributes: attrs(base), contractEnd: '2029-06-30', ...extra });

const engine = new TacticEngine(mergeReference(undefined));
// Onze complet, une doublure par ligne, mais aucune en attaque ni au but.
const squad = [
  p(1, 'GB', 14),
  p(2, 'D (D)', 14),
  p(3, 'D (C)', 14),
  p(4, 'D (C)', 14),
  p(5, 'D (G)', 14),
  p(6, 'MD (C)', 14),
  p(7, 'M (C)', 14),
  p(8, 'M (C)', 14),
  p(9, 'MO (D)', 14),
  p(10, 'MO (G)', 14),
  p(11, 'BT', 15),
  p(12, 'D (DC)', 13),
  p(13, 'M (C)', 13),
];
const DATE = '2027-02-14';
const coach = { style: 'possession' };

describe('besoins du mercato', () => {
  it('rien d’urgent sans partant ; les postes sans doublure sont signalés', () => {
    const r = recruitmentNeeds(engine, squad, DATE, coach)!;
    expect(r.needs.some((n) => n.priority === 1)).toBe(false);
    const thin = r.needs.filter((n) => n.why.includes('noBackup')).map((n) => n.pos);
    expect(thin).toContain('GB');
    expect(thin).toContain('BT');
    // Chaque besoin donne des attributs à chercher.
    expect(r.needs.every((n) => n.attrs.length > 0)).toBe(true);
  });

  it('un partant sans remplaçant au niveau passe en tête, une seule fois', () => {
    const r = recruitmentNeeds(engine, squad, DATE, coach, [], new Set(['11']))!;
    const first = r.needs[0]!;
    expect(first.priority).toBe(1);
    expect(first.pos).toBe('BT');
    expect(first.why[0]).toBe('leaving');
    expect(first.player?.id).toBe('11');
    expect(r.needs.filter((n) => n.pos === 'BT')).toHaveLength(1);
  });

  it('un titulaire âgé du projet demande sa succession', () => {
    const old = squad.map((x) => (x.id === '3' ? { ...x, age: 33 } : x));
    const r = recruitmentNeeds(engine, old, DATE, coach)!;
    const s = r.needs.find((n) => n.player?.id === '3');
    expect(s?.why).toContain('succession');
    expect(s?.priority).toBe(3);
  });
});

describe('plan d’évolution et partants', () => {
  it('le partant est là aujourd’hui et part à la première fenêtre', () => {
    const plan = evolutionPlan(engine, squad, DATE, coach, [], null, 2, new Set(['11']))!;
    expect(plan.stages[0]!.tactic.plan.slots.some((s) => s.player?.id === '11')).toBe(true);
    expect(plan.stages[1]!.left.map((x) => x.id)).toContain('11');
    expect(plan.stages[1]!.tactic.plan.slots.some((s) => s.player?.id === '11')).toBe(false);
  });
});
