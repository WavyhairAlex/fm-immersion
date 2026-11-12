import { describe, expect, it } from 'vitest';
import {
  betterRoles,
  betterStarters,
  builtPlan,
  coverGaps,
  gamePlayerInstructions,
  instructionBudget,
  instructionKey,
  instructionLoad,
  instructionState,
  lineupAdvice,
  mergeReference,
  newBuiltTactic,
  playerInstructions,
  restedPlayers,
  ROLE_GAIN,
  STARTER_GAIN,
  TacticEngine,
  teamAdvice,
  type GameInstructions,
} from '../src';
import { normalizePlayer } from '../src/player';
import type { FmSnapshot } from '../src/snapshot';

const engine = new TacticEngine(mergeReference(undefined));
const style = engine.ref.styles.find((s) => s.id === 'possession')!;
const ATTRS = ['Pace', 'Acceleration', 'Passing', 'Tackling', 'Finishing', 'Reflexes', 'Handling', 'WorkRate', 'Stamina', 'Teamwork', 'Heading', 'JumpingReach', 'Dribbling', 'Crossing', 'Marking', 'Positioning', 'Decisions', 'FirstTouch', 'Technique', 'OffTheBall', 'Strength'];
const mk = (id: number, positions: string, v = 12, extra: Record<string, unknown> = {}, attrs: Record<string, number> = {}) =>
  normalizePlayer({ id, name: `J${id}`, positions, level: v, attributes: { ...Object.fromEntries(ATTRS.map((k) => [k, v])), ...attrs }, ...extra });

// 4-3-3 : GB, DG, DC, DC, DD, MDF, MC, MC, MOG, BT, MOD.
const XI = ['GB', 'D (G)', 'D (C)', 'D (C)', 'D (D)', 'MD (C)', 'M (C)', 'M (C)', 'MO (G)', 'BT', 'MO (D)'];
const squad = (more: ReturnType<typeof mk>[] = [], over: Record<number, ReturnType<typeof mk>> = {}) => [...XI.map((p, i) => over[i + 1] ?? mk(i + 1, p)), ...more];
const tactic = () => newBuiltTactic(engine, '4-3-3', 'a');
const game = (ti: Record<number, number>): GameInstructions => ({ ti, pi: {}, imposed: {} }) as unknown as GameInstructions;

describe('avis de l’adjoint sur un onze', () => {
  it('ne conseille un autre rôle que pour un gain net, sans creuser un déséquilibre', () => {
    const plan = builtPlan(engine, tactic(), squad());
    const rows = betterRoles(engine, plan);
    expect(rows.length).toBeLessThanOrEqual(4);
    for (const r of rows) {
      expect(r.toFit - r.fromFit).toBeGreaterThanOrEqual(ROLE_GAIN);
      expect(r.to).not.toBe(r.from);
    }
    // Un seul conseil par joueur et par phase.
    expect(new Set(rows.map((r) => `${r.slot}|${r.phase}`)).size).toBe(rows.length);
  });

  it('signale un remplaçant nettement meilleur que le titulaire du jeu', () => {
    const players = squad([mk(20, 'BT', 16)]);
    const plan = builtPlan(engine, tactic(), players.slice(0, 11));
    const rows = betterStarters(engine, plan, players);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.better.id).toBe('20');
    expect(plan.slots[rows[0]!.slot]!.pos).toBe('BT');
    expect(rows[0]!.gain).toBeGreaterThanOrEqual(STARTER_GAIN);
    // Le même joueur à court de forme : l'écart fond, et un écart trop mince n'est pas signalé.
    expect(betterStarters(engine, plan, squad([mk(20, 'BT', 12.5)]))).toHaveLength(0);
  });

  it('explique un joueur mieux noté laissé sur le banc pour sa forme', () => {
    const tired = mk(20, 'BT', 14, { sharpness: 50, condition: 95 });
    const players = squad([tired]);
    const plan = builtPlan(engine, tactic(), players.slice(0, 11));
    const rows = restedPlayers(engine, plan, players);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ reason: 'sharpness', value: 50 });
    expect(rows[0]!.better.id).toBe('20');
    // En pleine forme, il n'y a rien à expliquer.
    expect(restedPlayers(engine, plan, squad([mk(20, 'BT', 14)]))).toHaveLength(0);
  });

  it('propose de faire glisser un titulaire à un poste sans doublure, puis la réserve', () => {
    // Le latéral droit joue aussi à gauche, et a une doublure à droite ; personne d'autre à gauche.
    const dd = mk(5, 'D (DG)');
    const players = squad([mk(20, 'D (D)'), mk(21, 'GB'), mk(22, 'D (C)'), mk(23, 'MD (C)'), mk(24, 'M (C)'), mk(25, 'MO (DG)'), mk(26, 'BT')], { 5: dd });
    const youth = normalizePlayer({ ...mk(40, 'D (G)', 9), team: 'U19' } as never);
    const t = tactic();
    const plan = builtPlan(engine, t, players, [{ ...mk(40, 'D (G)', 9), team: 'U19' }]);
    void youth;
    const dg = plan.slots.findIndex((s) => s.pos === 'DG');
    const gaps = coverGaps(engine, plan, players);
    const row = gaps.find((g) => g.slot === dg);
    expect(row).toBeDefined();
    expect(row!.shift?.player.id).toBe('5');
    expect(row!.shift?.replacement.id).toBe('20');
    expect(row!.reserve?.id).toBe('40');
    // Les postes doublés par l'équipe première ne sont pas listés.
    expect(gaps.every((g) => !plan.subs[g.slot]?.[0] || !!plan.subs[g.slot]![0]!.team)).toBe(true);
  });

  it('adapte l’avis à l’origine du onze', () => {
    const players = squad([mk(20, 'BT', 16)]);
    const plan = builtPlan(engine, tactic(), players.slice(0, 11));
    expect(lineupAdvice(engine, plan, players, 'game').starters).toHaveLength(1);
    expect(lineupAdvice(engine, plan, players, 'game').rested).toHaveLength(0);
    expect(lineupAdvice(engine, plan, players, 'built').starters).toHaveLength(0);
    expect(lineupAdvice(engine, plan, players, 'suggested').roles).toHaveLength(0);
  });
});

describe('consignes d’équipe conseillées pour le onze', () => {
  const plan = (over: Record<number, ReturnType<typeof mk>> = {}) => builtPlan(engine, tactic(), squad([], over));
  const row = (a: ReturnType<typeof teamAdvice>, code: string) => a.rows.find((r) => r.def.code === code);

  it('baisse une ligne haute quand la défense est lente', () => {
    const slow = { 2: mk(2, 'D (G)', 12, {}, { Pace: 8, Acceleration: 8 }), 3: mk(3, 'D (C)', 12, {}, { Pace: 8, Acceleration: 8 }), 4: mk(4, 'D (C)', 12, {}, { Pace: 8, Acceleration: 8 }), 5: mk(5, 'D (D)', 12, {}, { Pace: 8, Acceleration: 8 }) };
    const a = teamAdvice(plan(slow), style, game({ 9: 3 }), 'game');
    expect(row(a, 'DefensiveLine')).toMatchObject({ option: 2, styleOption: 3, reason: 'slowLine', game: 3 });
    expect(a.differs).toBe(1);
    // Défense au niveau du onze : la ligne haute du joueur est gardée.
    const b = teamAdvice(plan(), style, game({ 9: 3 }), 'game');
    expect(row(b, 'DefensiveLine')).toMatchObject({ option: 3, reason: null });
    expect(b.differs).toBe(0);
  });

  it('signale un bloc étiré : pressing haut et ligne basse', () => {
    const a = teamAdvice(plan(), style, game({ 8: 2, 9: 1 }), 'game');
    expect(row(a, 'DefensiveLine')).toMatchObject({ option: 2, reason: 'stretched', game: 1 });
    expect(a.read).toBe(true);
    expect(a.count.game).toBe(2);
  });

  it('calme le pressing d’un onze sans volume de jeu', () => {
    const lazy = Object.fromEntries(XI.map((p, i) => [i + 1, mk(i + 1, p, 12, {}, { WorkRate: 8, Stamina: 8, Teamwork: 8 })]));
    const a = teamAdvice(plan(lazy), style, game({ 8: 2, 10: 3, 11: 2, 23: 1 }), 'game');
    expect(row(a, 'PressingTrigger')).toMatchObject({ option: 2, reason: 'lowPress' });
    expect(row(a, 'DefensiveTransition')).toMatchObject({ option: 1, reason: 'lowPress' });
    expect(row(a, 'LineOfEngagement')).toMatchObject({ option: 1, reason: 'lowPressBlock' });
    // Sans pressing haut, « empêcher les relances courtes » n'existe plus.
    expect(row(a, 'PreventShortGKDistribution')).toMatchObject({ option: 0, reason: 'noHighBlock' });
  });

  it('part des consignes du style quand le jeu n’a pas été lu', () => {
    const a = teamAdvice(plan(), style);
    expect(a.read).toBe(false);
    expect(a.count.game).toBeNull();
    expect(a.rows.every((r) => r.game == null)).toBe(true);
    expect(a.count.advised).toBeGreaterThan(0);
  });
});

describe('consignes individuelles face au jeu', () => {
  it('compare une consigne conseillée à celles réglées dans FM27', () => {
    const key = instructionKey('dribbleMore')!;
    expect(key).toContain(':');
    expect(instructionState('dribbleMore', [key]).state).toBe('done');
    const group = key.split(':')[0]!;
    expect(instructionState('dribbleMore', [`${group}:Dribblez moins`])).toEqual({ state: 'conflict', other: `${group}:Dribblez moins` });
    expect(instructionState('dribbleMore', ['Tackling:Taclez plus durement']).state).toBe('todo');
  });

  it('ne conseille que des consignes qui existent dans FM27', () => {
    for (const sl of builtPlan(engine, tactic(), squad()).slots) {
      for (const x of playerInstructions(engine, sl, style, [], 3).list) expect(instructionKey(x.id)).not.toBeNull();
    }
  });

  it('relie les consignes lues à chaque joueur par son rang dans la compo', () => {
    const snap = { custom: { tactique: { ci_1_2: 14, ciModif_1_2: 'True', ci_0_8: 3, ciModif_0_8: 'False' } }, lineup: [{ index: 0, playerId: 7 }, { index: 1, playerId: 9 }] };
    const m = gamePlayerInstructions(snap);
    expect(m.get('9')!.mine).toEqual(['DribblingFrequency:Dribblez moins']);
    expect(m.get('7')!.mine).toEqual([]);
    expect(m.get('7')!.imposed).toHaveLength(1);
    expect(gamePlayerInstructions({ lineup: [{ index: 0, playerId: 7 }] }).size).toBe(0);
  });

  it('conseille la largeur du jeu offensif : espaces pour un attaquant vif, touche pour un bon centreur', () => {
    const fast = mk(10, 'BT', 12, {}, { OffTheBall: 16, Acceleration: 16, Stamina: 15 });
    const crosser = mk(11, 'MO (D)', 12, { rightFoot: 20, leftFoot: 8 }, { Crossing: 16 });
    const plan = builtPlan(engine, tactic(), squad([], { 10: fast, 11: crosser }));
    const ids = (pos: string) => playerInstructions(engine, plan.slots.find((s) => s.pos === pos)!, style, plan.slots, 3).list.map((x) => x.id);
    const all = [...ids('BT'), ...ids('MOD')];
    expect(all.some((x) => x === 'moveChannels' || x === 'stayWider')).toBe(true);
    expect(instructionKey('moveChannels')).toBe('AttackingWidth:Prenez les espaces');
    expect(instructionKey('stayWider')).toBe('AttackingWidth:Restez excentrés');
    expect(instructionKey('sitNarrower')).toBe("AttackingWidth:Restez plus dans l'axe");
  });

  it('règle le nombre de consignes sur la compréhension tactique du jeu', () => {
    expect(instructionBudget(style, 1, 70)).toBe(3);
    expect(instructionBudget(style, 20, 45)).toBe(2);
    expect(instructionBudget(style, 20, 38)).toBe(1);
    const snap = { effectiveness: { complexityParts: { teamInstructionComplexity: { MinValue: 50, MaxValue: 52 }, playerInstructionComplexity: 70 }, components: { tacticalUnderstanding: { min: 38, max: 38 } } } } as unknown as FmSnapshot;
    expect(instructionLoad(snap)).toEqual({ team: 51, player: 70, understanding: 38 });
    expect(instructionLoad(null)).toEqual({ team: null, player: null, understanding: null });
  });
});
