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
    // 17 ans, encore dix ans de progression : il dépasse le niveau des titulaires d'aujourd'hui.
    expect(path.viability).toBe('lasting');
    expect(slot.viability).toBe('lasting');
    expect(path.reliable).toBe(false);
  });

  it('un jeune déjà proche de son pic qui ne fait que boucher le trou est une solution de transition', () => {
    const youth = [p(21, 'BT', 10.8, { age: 23, team: 'Malženice II', contractEnd: '2030-06-30' })];
    const plan = seasonPlan(engine, squad, youth, '2027-02-14', { style: 'possession' }, [], 3)!;
    const path = plan.youth.find((y) => y.player.id === '21')!;
    expect(path.pos).toBe('BT');
    expect(path.viability).toBe('stopgap');
  });

  it('sans jeune pour le poste, le départ du titulaire fait un poste à recruter', () => {
    const plan = seasonPlan(engine, squad, [], '2027-02-14', { style: 'possession' }, [], 3)!;
    const k = plan.stages[0]!.cells.findIndex((c) => c.player?.id === '11');
    expect(plan.stages[2]!.cells[k]!.state).toBe('recruit');
    expect(plan.slots[k]!.verdict).toBe('buy');
    expect(youthCover(plan, 'BT')).toBeNull();
  });

  it('suit tout l’effectif : titulaires, doublures, rotation, départs et jeunes qui montent', () => {
    const full = [...squad, p(12, 'GB', 10), p(13, 'D (C)', 10.5), p(14, 'M (C)', 10.5), p(15, 'GB', 9)];
    const youth = [p(20, 'BT', 11, { age: 17, team: 'Malženice U19', contractEnd: '2030-06-30' }), p(22, 'M (C)', 5, { age: 16, team: 'Malženice U19' })];
    const plan = seasonPlan(engine, full, youth, '2027-02-14', { style: 'possession' }, [], 3)!;
    const row = (id: string) => plan.squad.find((r) => r.player.id === id);
    expect(row('11')!.seasons[0]!.role).toBe('starter');
    expect(row('11')!.seasons[2]!.role).toBe('gone');
    expect(row('12')!.seasons[0]!.role).toBe('backup');
    expect(row('12')!.seasons[0]!.pos).toBe('GB');
    // Troisième gardien : en rotation, il compte dans l'effectif.
    expect(row('15')!.seasons[0]!.role).toBe('rotation');
    // Le jeune buteur entre dans l'effectif ; le jeune trop faible reste à l'Académie.
    expect(row('20')!.youth).toBe(true);
    expect(row('22')).toBeUndefined();
    const s0 = plan.stages[0]!.summary;
    expect(s0.keepers).toBe(3);
    expect(s0.size).toBeGreaterThanOrEqual(15);
    expect(plan.stages[2]!.summary.departures + plan.stages[1]!.summary.departures).toBeGreaterThanOrEqual(1);
  });
});
