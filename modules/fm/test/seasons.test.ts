import { describe, expect, it } from 'vitest';
import { mergeReference, seasonLabel, seasonPlan, TacticEngine, youthCover } from '../src';
import { normalizePlayer } from '../src/player';

const ATTRS = ['Passing', 'FirstTouch', 'Technique', 'Composure', 'Vision', 'Decisions', 'Teamwork', 'WorkRate', 'Stamina', 'Strength', 'Pace', 'Acceleration', 'Tackling', 'Marking', 'Positioning', 'Anticipation', 'Heading', 'JumpingReach', 'Finishing', 'Movement', 'Crossing', 'Dribbling', 'Flair', 'Concentration', 'Agility', 'Aggression', 'Reflexes', 'Handling', 'OneOnOnes', 'AerialReach', 'CommandOfArea', 'Kicking', 'RushingOut'];
const p = (id: number, positions: string, base: number, extra: Record<string, unknown> = {}) =>
  normalizePlayer({ id, name: `J${id}`, positions, age: 26, contractEnd: '2031-06-30', attributes: Object.fromEntries(ATTRS.map((k) => [k, base])), ...extra });

const engine = new TacticEngine(mergeReference(undefined));
const squad = [
  p(1, 'GB', 12),
  p(2, 'D (D)', 11),
  p(3, 'D (C)', 12),
  p(4, 'D (C)', 12),
  p(5, 'D (G)', 11),
  p(6, 'MD (C)', 12),
  p(7, 'M (C)', 12),
  p(8, 'M (C)', 12),
  p(9, 'MO (D)', 12),
  p(10, 'MO (G)', 12),
  // Avant-centre de 34 ans en fin de contrat.
  p(11, 'BT', 13, { age: 34, contractEnd: '2027-06-30' }),
];

describe('effectif saison par saison', () => {
  it('nomme les saisons', () => {
    expect(seasonLabel('2027-02-14')).toBe('2026/27');
    expect(seasonLabel('2027-08-01')).toBe('2027/28');
    expect(seasonLabel('2027-03-01', 1)).toBe('2027');
  });

  it('compte les jeunes du centre : l’espoir prend la place du titulaire qui part, sans achat', () => {
    const youth = [p(20, 'BT', 11, { age: 17, team: 'Malženice U19', contractEnd: '2030-06-30', stars: { current: 2, potential: 4.5 } })];
    const plan = seasonPlan(engine, squad, youth, '2027-02-14', { style: 'possession' }, [], 3)!;
    expect(plan.stages.map((s) => s.label)).toEqual(['2026/27', '2027/28', '2028/29']);
    const k = plan.stages[0]!.cells.findIndex((c) => c.player?.id === '11');
    expect(k).toBeGreaterThanOrEqual(0);
    // Le titulaire part avant ou pendant la saison suivante (prolongé d'un an au plus) ; le jeune tient ensuite le poste.
    const later = plan.stages[2]!.cells[k]!;
    expect(later.player?.id).toBe('20');
    expect(later.state).toBe('youth');
    expect(later.team).toBe('Malženice U19');
    const slot = plan.slots[k]!;
    expect(slot.verdict).toBe('youth');
    expect(slot.youth?.id).toBe('20');
    expect(youthCover(plan, 'BT')?.youth?.id).toBe('20');
    expect(plan.youthHeld).toBeGreaterThanOrEqual(1);
    const path = plan.youth.find((y) => y.player.id === '20')!;
    expect(path.pos).toBe('BT');
    expect(path.from).toBe(slot.from);
  });

  it('sans jeune pour le poste, le départ du titulaire fait un poste à recruter', () => {
    const plan = seasonPlan(engine, squad, [], '2027-02-14', { style: 'possession' }, [], 3)!;
    const k = plan.stages[0]!.cells.findIndex((c) => c.player?.id === '11');
    expect(plan.stages[2]!.cells[k]!.state).toBe('recruit');
    expect(plan.slots[k]!.verdict).toBe('buy');
    expect(youthCover(plan, 'BT')).toBeNull();
  });
});
