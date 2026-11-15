import { describe, expect, it } from 'vitest';
import { applyTaste, builtFromGame, EMPTY_TASTE, mergeReference, mustMet, newBuiltTactic, parseTaste, proposeTactics, scoreTactic, styleInstructions, TacticEngine, tacticDiff, tacticFeatures, tasteOfStyle, tasteScore, unmetDemands, SIMPLE_MAX, type Taste } from '../src';
import { normalizePlayer } from '../src/player';

const engine = new TacticEngine(mergeReference(undefined));
const ATTRS = ['Pace', 'Acceleration', 'Passing', 'Tackling', 'Finishing', 'Reflexes', 'Handling', 'WorkRate', 'Stamina', 'Teamwork', 'Heading', 'JumpingReach', 'Dribbling', 'Crossing', 'Marking', 'Positioning', 'Decisions', 'FirstTouch', 'Technique', 'Vision', 'Composure', 'Anticipation', 'Strength', 'Flair', 'Movement', 'Concentration', 'Aggression', 'NaturalFitness', 'Balance', 'Agility', 'Bravery', 'Determination', 'LongShots'];
const mk = (id: number, positions: string, v = 12, attrs: Record<string, number> = {}) =>
  normalizePlayer({ id, name: `J${id}`, positions, level: v, attributes: { ...Object.fromEntries(ATTRS.map((k) => [k, v])), ...attrs } });
const POSTS = ['GB', 'D (G)', 'D (C)', 'D (C)', 'D (D)', 'MD (C)', 'M (C)', 'M (C)', 'MO (G)', 'BT', 'MO (D)', 'GB', 'D (C)', 'D (G)', 'D (D)', 'M (C)', 'MO (C)', 'BT', 'M (G)', 'M (D)', 'MD (C)', 'D (C)'];
const squad = (attrs: Record<string, number> = {}) => POSTS.map((p, i) => mk(i + 1, p, 12, attrs));
const taste = (t: Partial<Taste>): Taste => ({ ...EMPTY_TASTE, ...t });
const style = (id: string) => engine.ref.styles.find((s) => s.id === id)!;

describe('ma tactique idéale', () => {
  it('lit le style d’une tactique dans ses consignes', () => {
    const poss = styleInstructions(style('possession'));
    const f = tacticFeatures({ ti: poss.ti, mentality: poss.mentality ?? 'Équilibrée' });
    expect(f.direct).toBeLessThan(0);
    expect(f.tempo).toBeLessThan(0);
    expect(f.line).toBe(2);
    expect(tasteOfStyle(style('possession'))).toMatchObject({ ball: 'keep', defend: 'high' });
    expect(tasteOfStyle(style('longball'))).toMatchObject({ ball: 'long', defend: 'mid' });
    expect(tasteOfStyle(style('ultra-def'))).toMatchObject({ defend: 'low', risk: 'cautious' });
    expect(tasteOfStyle(style('wings')).attack).toBe('wide');
  });

  it('note 100 la tactique qui applique toutes les réponses, et bien moins son contraire', () => {
    const t = taste({ ball: 'fast', attack: 'centre', defend: 'high', risk: 'positive' });
    const base = newBuiltTactic(engine, '4-2-3-1', 'a');
    const a = applyTaste(base, t);
    expect(tasteScore({ ...base, ti: a.ti, mentality: a.mentality }, t).score).toBe(100);
    const low = styleInstructions(style('ultra-def'));
    expect(tasteScore({ ...base, ti: low.ti, mentality: low.mentality! }, t).score).toBeLessThan(40);
    expect(tasteScore(base, EMPTY_TASTE).score).toBeNull();
  });

  it('garde une tactique simple sous la limite de consignes et retire celles réservées au pressing haut', () => {
    const poss = styleInstructions(style('possession'));
    const a = applyTaste({ ti: poss.ti, mentality: 'Positive' }, taste({ defend: 'mid', tuning: 'simple' }));
    expect(tacticFeatures({ ti: a.ti, mentality: a.mentality }).count).toBeLessThanOrEqual(SIMPLE_MAX);
    expect(a.ti[23]).toBeUndefined();
    expect(a.ti[8]).toBe(1);
  });

  it('vérifie les souhaits sur les postes et les rôles', () => {
    const t = newBuiltTactic(engine, '4-2-3-1', 'a');
    expect(mustMet(t.slots, 'back4')).toBe(true);
    expect(mustMet(t.slots, 'back3')).toBe(false);
    expect(mustMet(t.slots, 'ten')).toBe(true);
    expect(mustMet(t.slots, 'twoStrikers')).toBe(false);
    expect(mustMet(newBuiltTactic(engine, '4-4-2', 'b').slots, 'twoStrikers')).toBe(true);
  });

  it('repère ce que l’effectif tient mal', () => {
    // Groupe sans endurance ni volume de course : le pressing haut est son point faible.
    const weak = squad({ Stamina: 6, WorkRate: 6, Aggression: 6, Teamwork: 6 });
    const high = applyTaste(newBuiltTactic(engine, '4-3-3', 'a'), taste({ defend: 'high' }));
    expect(unmetDemands(engine, high, weak).map((d) => d.id)).toContain('press');
    expect(unmetDemands(engine, high, squad())).toHaveLength(0);
  });

  it('sans réponse, ne rend que la tactique la plus adaptée à l’effectif', () => {
    const out = proposeTactics({ engine, players: squad(), taste: EMPTY_TASTE }).proposals;
    expect(out).toHaveLength(1);
    expect(out[0]!.kind).toBe('squad');
    expect(out[0]!.scores.taste).toBeNull();
  });

  it('propose trois tactiques complètes : fidèle, compromis conseillé, effectif', () => {
    const t = taste({ ball: 'fast', attack: 'centre', defend: 'high', risk: 'positive', musts: ['back4', 'ten', 'insideWingers'], tuning: 'simple' });
    const out = proposeTactics({ engine, players: squad(), taste: t }).proposals;
    expect(out.map((p) => p.kind)).toEqual(['taste', 'balance', 'squad']);
    expect(out.filter((p) => p.recommended).map((p) => p.kind)).toEqual(['balance']);
    for (const p of out) {
      expect(p.tactic.slots).toHaveLength(11);
      expect(p.plan.slots.every((s) => s.ip && s.oop)).toBe(true);
      expect(p.scores.squad).toBeGreaterThan(0);
      expect(p.scores.meta).not.toBeNull();
    }
    const faithful = out[0]!;
    expect(faithful.scores.taste).toBeGreaterThanOrEqual(90);
    for (const m of t.musts) expect(mustMet(faithful.tactic.slots, m)).toBe(true);
    expect(faithful.scores.taste!).toBeGreaterThanOrEqual(out[2]!.scores.taste!);
  });

  it('assouplit le pressing dans le compromis quand l’effectif ne suit pas', () => {
    const weak = squad({ Stamina: 6, WorkRate: 6, Aggression: 6, Teamwork: 6 });
    const out = proposeTactics({ engine, players: weak, taste: taste({ ball: 'fast', defend: 'high', risk: 'positive' }) }).proposals;
    const [faithful, balance] = out;
    expect(tacticFeatures(faithful!.tactic).line).toBe(2);
    expect(faithful!.demands.map((d) => d.id)).toContain('press');
    expect(tacticFeatures(balance!.tactic).line).toBe(1);
    expect(balance!.notes.some((n) => n.id === 'relaxed' && n.params.axis === 'defend')).toBe(true);
    expect(balance!.scores.squad).toBeGreaterThan(faithful!.scores.squad);
    expect(balance!.scores.taste!).toBeLessThan(faithful!.scores.taste!);
  });

  it('compte les changements par rapport à la tactique du jeu', () => {
    const game = newBuiltTactic(engine, '4-3-3', 'g');
    const same = { ...game, slots: game.slots.map((s, i) => (i === 9 ? { ...s, ip: 'TF' } : s)), mentality: 'Positive' };
    expect(tacticDiff(same, game)).toEqual({ sameShape: true, roles: 1, instructions: 1 });
    expect(tacticDiff(newBuiltTactic(engine, '4-4-2', 'x'), game).sameShape).toBe(false);
    const res = proposeTactics({ engine, players: squad(), taste: taste({ defend: 'mid' }), game });
    // Point de départ « ma tactique du jeu » : le compromis garde ses rôles, seules les consignes des réponses changent.
    expect(res.proposals[1]!.diff).toMatchObject({ sameShape: true, roles: 0 });
    expect(res.game!.scores.taste).toBe(100);
    // Repère commun : la meilleure tactique montrée vaut 100 pour l'effectif (avant exigences mal tenues).
    expect(Math.max(...res.proposals.map((p) => p.scores.squad), res.game!.scores.squad)).toBe(100);
    expect(scoreTactic(engine, game, squad(), [], taste({ defend: 'mid' })).scores.taste).toBe(100);
    expect(builtFromGame).toBeTypeOf('function');
  });

  it('relit des réponses abîmées sans planter', () => {
    expect(parseTaste({ ball: 'nope' })).toEqual(EMPTY_TASTE);
    expect(parseTaste({ ball: 'keep', musts: ['ten'] }).musts).toEqual(['ten']);
  });
});
