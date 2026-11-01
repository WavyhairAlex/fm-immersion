import { describe, expect, it } from 'vitest';
import { DEFAULT_TACTIC_REFERENCE, FORMATIONS, TacticEngine, assignMax, balancePenalty, readiness, gameFormationOf, knownFormation, mergeReference, phaseXY, shapeOf, tacticReferenceSchema, zonePos } from '../src';
import { normalizePlayer } from '../src/player';

const ATTRS = ['Passing', 'FirstTouch', 'Technique', 'Composure', 'Vision', 'Decisions', 'Teamwork', 'WorkRate', 'Stamina', 'Strength', 'Pace', 'Acceleration', 'Tackling', 'Marking', 'Positioning', 'Anticipation', 'Heading', 'JumpingReach', 'Finishing', 'Movement', 'Crossing', 'Dribbling', 'Flair', 'Concentration', 'Agility', 'Aggression'];
const GK_ATTRS = ['Reflexes', 'Handling', 'OneOnOnes', 'AerialReach', 'CommandOfArea', 'Kicking', 'RushingOut'];

const p = (id: number, positions: string, base: number, boost: Record<string, number> = {}, extra: Record<string, unknown> = {}) =>
  normalizePlayer({
    id,
    name: `J${id}`,
    positions,
    attributes: Object.fromEntries([...ATTRS, ...GK_ATTRS].map((k) => [k, base + (boost[k] ?? 0)])),
    ...extra,
  });

const squad = [
  p(1, 'GB', 12, { Reflexes: 3 }),
  p(2, 'D (DG)', 11),
  p(3, 'D (C)', 12, { Tackling: 3 }),
  p(4, 'D (C)', 12, { Marking: 2 }),
  p(5, 'D (DG)', 11),
  p(6, 'MD (C)', 12, { Positioning: 3 }),
  p(7, 'MD (C), M (C)', 12, { Passing: 3, Vision: 3 }),
  p(8, 'MO (DGC)', 13, { Dribbling: 3 }),
  p(9, 'MO (DGC)', 12, { Passing: 2 }),
  p(10, 'MO (DG)', 12, { Crossing: 3 }),
  p(11, 'BT', 13, { Finishing: 3 }),
  p(12, 'BT', 9, {}, { condition: 80 }),
];

describe('moteur tactique', () => {
  const engine = new TacticEngine(DEFAULT_TACTIC_REFERENCE);

  it('valide les repères maison', () => {
    expect(() => tacticReferenceSchema.parse(DEFAULT_TACTIC_REFERENCE)).not.toThrow();
    // Chaque poste de chaque schéma trouve au moins un rôle dans chaque phase.
    for (const st of DEFAULT_TACTIC_REFERENCE.styles) for (const r of [...st.signatureRoles.ip, ...st.signatureRoles.oop]) expect(engine.roles.has(r)).toBe(true);
  });

  it('remplit le onze du 4-2-3-1 avec des joueurs naturels au poste', () => {
    const style = DEFAULT_TACTIC_REFERENCE.styles[0]!;
    const plan = engine.formationPlan('4-2-3-1', style, squad);
    expect(plan.slots).toHaveLength(11);
    expect(plan.holes).toBe(0);
    for (const sl of plan.slots) expect(sl.player?.positions).toContain(sl.pos);
    expect(plan.slots.find((s) => s.pos === 'BT')?.player?.name).toBe('J11');
    expect(plan.subs[plan.slots.findIndex((s) => s.pos === 'BT')]?.[0]?.name).toBe('J12');
  });

  it('pénalise le mauvais pied sur un côté', () => {
    const right = p(20, 'D (D)', 12, {}, { foot: 'Droit' });
    const left = p(21, 'D (D)', 12, {}, { foot: 'Gauche uniquement' });
    expect(engine.roleFit(right, 'FB', 'ip', 'DD')! - engine.roleFit(left, 'FB', 'ip', 'DD')!).toBeCloseTo(1);
  });

  it('juge l’équilibre du onze', () => {
    const plan = engine.formationPlan('4-2-3-1', DEFAULT_TACTIC_REFERENCE.styles[0]!, squad);
    const checks = engine.balance(plan, DEFAULT_TACTIC_REFERENCE.styles[0]!);
    expect(checks.map((c) => c.id)).toEqual(['width', 'creation', 'cover', 'box', 'pace', 'press', 'aerial', 'fitness']);
    expect(checks.find((c) => c.id === 'fitness')?.status).toBe('good');
  });

  it('calcule les formes avec et sans ballon', () => {
    const slots = FORMATIONS['4-4-2']!.map(([pos, x, y]) => ({ pos, x, y, ip: 'CM', oop: 'CM', player: null, fit: null }));
    expect(shapeOf(slots.filter((s) => s.pos !== 'GB').map((s) => phaseXY(s, 'oop')))).toBe('4-4-2');
    expect(zonePos(50, 12)).toBe('BT');
    expect(zonePos(10, 72)).toBe('DG');
    expect(knownFormation('4-2-3-1 DM Wide')).toBe('4-2-3-1');
    // La formation la plus utilisée de la saison n'est pas la tactique active.
    expect(gameFormationOf({ name: '4-4-2', formation: '4-2-3-1 MD MO Jeu large', formationSource: 'MostUsedFormation' })).toBe('4-4-2');
    expect(gameFormationOf({ name: 'Ma tactique', formation: '4-2-3-1 MD MO Jeu large', formationSource: 'MostUsedFormation' })).toBeNull();
    expect(gameFormationOf({ name: 'Ma tactique', formation: '4-3-3' })).toBe('4-3-3');
  });

  it('laisse un fichier local remplacer les repères maison', () => {
    const merged = mergeReference({ roles: [{ ...DEFAULT_TACTIC_REFERENCE.roles[0]!, fr: 'Gardien (local)' }], styles: [] });
    expect(merged.roles.find((r) => r.code === 'GK')?.fr).toBe('Gardien (local)');
    expect(merged.roles).toHaveLength(DEFAULT_TACTIC_REFERENCE.roles.length);
  });
});

describe('forme du jour', () => {
  it('fait passer devant le joueur frais et de bon moral à niveau proche', () => {
    const engine = new TacticEngine(DEFAULT_TACTIC_REFERENCE);
    const style = DEFAULT_TACTIC_REFERENCE.styles[0]!;
    const tired = p(1, 'BT', 14, {}, { condition: 70, morale: 'Médiocre' });
    const fresh = p(2, 'BT', 13.5, {}, { condition: 100, morale: 'Très bon' });
    const st = engine.formationPlan('4-3-3', style, [tired, fresh]).slots.find((s) => s.pos === 'BT')!;
    expect(st.player?.id).toBe(fresh.id);
    const healthy = p(3, 'BT', 14, {}, { condition: 100, morale: 'Bon' });
    expect(engine.formationPlan('4-3-3', style, [healthy, fresh]).slots.find((s) => s.pos === 'BT')!.player?.id).toBe(healthy.id);
  });
});

describe('rôle qui améliore l’équipe', () => {
  it('ne laisse pas un droitier en ailier intérieur à droite quand un rôle du même pied lui va mieux', () => {
    const engine = new TacticEngine(DEFAULT_TACTIC_REFERENCE);
    const style = DEFAULT_TACTIC_REFERENCE.styles.find((s) => s.id === 'possession')!;
    const right = p(1, 'MO (D)', 13, {}, { foot: 'Droit uniquement' });
    const team = ['GB', 'D (G)', 'D (C)', 'D (C)', 'D (D)', 'MD', 'M (C)', 'M (C)', 'MO (G)', 'BT'].map((pos, i) => p(30 + i, pos, 12));
    const sl = engine.formationPlan('4-3-3', style, [right, ...team]).slots.find((s) => s.pos === 'MOD')!;
    expect(sl.player?.id).toBe(right.id);
    expect(engine.roleFit(right, sl.ip, 'ip', 'MOD')).toBeGreaterThanOrEqual(engine.roleFit(right, 'IW', 'ip', 'MOD')!);
    expect(sl.ip).not.toBe('IW');
  });
});

describe('note d’équipe', () => {
  const engine = new TacticEngine(DEFAULT_TACTIC_REFERENCE);
  const style = DEFAULT_TACTIC_REFERENCE.styles.find((s) => s.id === 'possession')!;

  it('attribue les postes pour le meilleur onze, pas poste par poste', () => {
    // Le tri glouton mettrait le premier en (0,0) et laisserait le second créneau vide.
    expect(assignMax([[10, 9], [8, null]])).toEqual([1, 0]);
    expect(assignMax([[null], [5]])).toEqual([-1, 0]);
    // A joue MD ou MC ; B seulement MD. Le meilleur onze met B en MD et A en MC, et laisse D (faible) dehors.
    const others = ['GB', 'D (G)', 'D (C)', 'D (C)', 'D (D)', 'MO (G)', 'MO (D)', 'BT'].map((pos, i) => p(40 + i, pos, 12));
    const A = p(1, 'MD, M (C)', 15);
    const B = p(2, 'MD', 13);
    const C = p(3, 'M (C)', 12);
    const D = p(4, 'M (C)', 8);
    const plan = engine.formationPlan('4-3-3', style, [A, B, C, D, ...others]);
    const xi = plan.slots.map((s) => s.player?.id);
    expect(xi).toContain(B.id);
    expect(xi).not.toContain(D.id);
    expect(plan.slots.find((s) => s.pos === 'MDF')!.player?.id).toBe(B.id);
  });

  it('compte l’équilibre et la forme du jour dans la note', () => {
    const plan = engine.formationPlan('4-2-3-1', style, squad);
    const pen = balancePenalty(engine.balance(plan, style));
    expect(plan.penalty).toBeCloseTo(pen);
    const form = plan.slots.reduce((a, s) => a + (s.player ? readiness(s.player) : 0), 0) / plan.slots.length;
    expect(plan.score).toBeCloseTo(plan.fit + form - plan.penalty);
    expect(balancePenalty([{ id: 'cover', status: 'bad', params: {} }])).toBeGreaterThan(balancePenalty([{ id: 'creation', status: 'warn', params: {} }]));
  });
});
