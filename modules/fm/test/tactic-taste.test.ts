import { describe, expect, it } from 'vitest';
import { addPlayerInstructions, analyseBuiltTactic, applyTaste, IP_TRAITS, OOP_TRAITS, rolesAt, builtFromGame, optimiseTactic, tacticQuality, EMPTY_TASTE, mergeReference, mustMet, newBuiltTactic, parseTaste, proposeTactics, scoreTactic, styleInstructions, TacticEngine, tacticChanges, tacticDiff, tacticFeatures, tasteOfStyle, tasteScore, unmetDemands, SIMPLE_MAX, type Taste } from '../src';
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
    // Le détail donne les gestes à faire dans le jeu : le rôle à changer, à quel poste, et la mentalité.
    const ch = tacticChanges({ ...same, ti: { ...same.ti, 21: 3 } }, game);
    expect(ch.roles).toEqual([{ slot: 9, pos: game.slots[9]!.pos, phase: 'ip', from: game.slots[9]!.ip, to: 'TF' }]);
    expect(ch.mentality).toEqual({ from: game.mentality, to: 'Positive' });
    expect(ch.instructions.map((c) => [c.def.code, c.from, c.to])).toEqual([['Tempo', 2, 3]]);
    expect(tacticChanges(newBuiltTactic(engine, '4-4-2', 'x'), game)).toMatchObject({ sameShape: false, roles: [] });
    expect(tacticDiff(newBuiltTactic(engine, '4-4-2', 'x'), game).sameShape).toBe(false);
    const res = proposeTactics({ engine, players: squad(), taste: taste({ defend: 'mid' }), game });
    // Point de départ « ma tactique du jeu » : le compromis garde son schéma et ne change que les rôles qui montent la qualité.
    expect(res.proposals[1]!.diff).toMatchObject({ sameShape: true });
    expect(res.proposals[1]!.diff!.roles).toBeLessThanOrEqual(6);
    expect(res.proposals[1]!.scores.quality).toBeGreaterThanOrEqual(res.game!.scores.quality);
    expect(res.game!.scores.taste).toBe(100);
    // Repère commun : la meilleure tactique montrée vaut 100 pour l'effectif (avant exigences mal tenues).
    expect(Math.max(...res.proposals.map((p) => p.scores.squad), res.game!.scores.squad)).toBe(100);
    expect(scoreTactic(engine, game, squad(), [], taste({ defend: 'mid' })).scores.taste).toBe(100);
    expect(builtFromGame).toBeTypeOf('function');
  });

  it('règle une tactique pour monter sa note de qualité, sans déplacer les postes ni casser les goûts', () => {
    // Deux latéraux et un milieu qui montent tous : défense restante trop juste.
    let t = newBuiltTactic(engine, '4-3-3', 'a');
    t = { ...t, slots: t.slots.map((s, i) => (i === 1 || i === 4 ? { ...s, ip: 'WB' } : i === 5 ? { ...s, ip: 'BBM' } : s)) };
    const before = tacticQuality(analyseBuiltTactic(engine, t, squad()));
    const o = optimiseTactic(engine, t, squad());
    expect(o.before).toBe(before);
    expect(o.after).toBeGreaterThan(before);
    expect(o.tactic.slots.map((s) => s.pos)).toEqual(t.slots.map((s) => s.pos));
    expect(o.roles).toBeGreaterThan(0);
    // Contrainte : aucun rôle avec ballon ne bouge, donc rien ne change de ce côté.
    const fixed = optimiseTactic(engine, t, squad(), { accept: (x) => x.slots.every((s, i) => s.ip === t.slots[i]!.ip) });
    expect(fixed.tactic.slots.map((s) => s.ip)).toEqual(t.slots.map((s) => s.ip));
    // Les propositions sortent déjà réglées : la qualité de chacune vaut au moins celle du schéma de départ brut.
    const out = proposeTactics({ engine, players: squad(), taste: taste({ ball: 'fast', defend: 'high', musts: ['insideWingers'] }) }).proposals;
    for (const p of out) expect(p.scores.quality).toBeGreaterThanOrEqual(60);
    expect(mustMet(out[0]!.tactic.slots, 'insideWingers')).toBe(true);
    expect(tacticFeatures(out[0]!.tactic).line).toBe(2);
  });

  it('répare un rôle impossible au poste et trouve une sentinelle dans un schéma sans milieu défensif', () => {
    // 4-4-1-1 : ailier sans ballon en milieu latéral (rôle qui n'existe pas à ce poste), aucun milieu qui reste en place.
    let t = newBuiltTactic(engine, '4-4-1-1', 'a');
    t = { ...t, slots: t.slots.map((s) => (s.pos === 'MG' || s.pos === 'MD' ? { ...s, oop: 'W' } : s)) };
    const before = analyseBuiltTactic(engine, t, squad());
    expect(before.findings.some((f) => f.id === 'roleInvalid')).toBe(true);
    expect(before.findings.some((f) => f.id === 'noPivot')).toBe(true);
    const o = optimiseTactic(engine, t, squad());
    const after = analyseBuiltTactic(engine, o.tactic, squad());
    expect(after.findings.some((f) => f.id === 'roleInvalid')).toBe(false);
    expect(after.findings.some((f) => f.id === 'noPivot')).toBe(false);
    // La sentinelle vient de la consigne individuelle « moins de courses » donnée à un milieu axial.
    expect(o.tactic.slots.some((s) => s.pos === 'MC' && s.pi.includes('ForwardRuns:Effectuez moins de courses'))).toBe(true);
    expect(o.after).toBeGreaterThan(o.before);
  });

  it('ne génère aucun rôle impossible, quel que soit le style et le schéma', () => {
    for (const st of engine.ref.styles)
      for (const form of ['4-4-2', '4-4-1-1', '4-3-3', '3-5-2', '5-4-1', '4-2-3-1']) {
        const plan = engine.formationPlan(form, st, squad());
        plan.slots.forEach((s, i) => {
          expect(rolesAt(engine, plan.slots, i, 'ip').some((r) => r.code === s.ip), `${form} ${st.id} ${s.pos} ${s.ip}`).toBe(true);
          expect(rolesAt(engine, plan.slots.map((x) => ({ pos: x.posOOP ?? x.pos })), i, 'oop').some((r) => r.code === s.oop), `${form} ${st.id} ${s.pos} ${s.oop}`).toBe(true);
        });
      }
  });

  it('prend la réserve pour un poste que l’équipe première ne couvre pas', () => {
    const t = newBuiltTactic(engine, '4-3-3', 'a');
    const noKeeper = squad().filter((p) => !p.positions.includes('GB'));
    expect(analyseBuiltTactic(engine, t, noKeeper).findings.some((f) => f.id === 'squadHoles')).toBe(true);
    expect(analyseBuiltTactic(engine, t, noKeeper, [mk(99, 'GB')]).findings.some((f) => f.id === 'squadHoles')).toBe(false);
  });

  it('garde la tactique du jeu dans le compromis et ne montre jamais deux fois la même carte', () => {
    const game = { ...newBuiltTactic(engine, '4-2-3-1', 'game'), name: 'Jeu' };
    for (const t of [taste({ ball: 'keep', attack: 'wide', defend: 'high', risk: 'cautious', tuning: 'worked' }), taste({ ball: 'keep', attack: 'centre', defend: 'low', risk: 'cautious', tuning: 'simple', start: 'blank' })]) {
      const out = proposeTactics({ engine, players: squad(), taste: t, game }).proposals;
      const key = (p: (typeof out)[number]) => JSON.stringify([p.tactic.slots.map((s) => [s.pos, s.ip, s.oop]), p.tactic.ti, p.tactic.mentality]);
      expect(new Set(out.map(key)).size).toBe(3);
      const balance = out[1]!;
      if (balance.diff?.sameShape) expect(balance.diff.roles).toBeLessThanOrEqual(8);
    }
  });

  it('ajoute des consignes individuelles conseillées sans baisser la qualité ni dépasser la limite par joueur', () => {
    const base = newBuiltTactic(engine, '4-3-3', 'a');
    const q0 = tacticQuality(analyseBuiltTactic(engine, base, squad()));
    const out = addPlayerInstructions(engine, base, squad(), [], 2);
    expect(out.added).toBe(out.tactic.slots.reduce((n, s) => n + (s.pi ?? []).length, 0));
    expect(out.tactic.slots.every((s) => (s.pi ?? []).length <= 2)).toBe(true);
    expect(tacticQuality(analyseBuiltTactic(engine, out.tactic, squad()))).toBeGreaterThanOrEqual(q0);
    expect(addPlayerInstructions(engine, base, squad(), [], 3, 4).added).toBeLessThanOrEqual(4);
    // Une réponse sur le réglage en met dans les propositions, avec la note qui le dit.
    const props = proposeTactics({ engine, players: squad(), taste: taste({ ball: 'fast', defend: 'high', tuning: 'worked' }) }).proposals;
    for (const p of props) {
      const n = p.tactic.slots.reduce((k, s) => k + (s.pi ?? []).length, 0);
      expect(p.notes.some((x) => x.id === 'playerInstructions')).toBe(n > 0);
    }
  });

  it('corrige la tactique du jeu même quand son schéma n’est pas un des modèles', () => {
    const b = newBuiltTactic(engine, '4-4-2', 'g');
    const i = b.slots.findIndex((s) => s.pos === 'MG');
    const slots = b.slots.map((s, k) => (k === i ? { ...s, pos: 'MOG' as const, ip: 'IF' } : s));
    const game = { ...b, slots, name: 'Jeu' };
    const res = proposeTactics({ engine, players: squad(), taste: taste({ defend: 'mid', start: 'game' }), game });
    const balance = res.proposals.find((p) => p.kind === 'balance')!;
    expect(balance.diff).toMatchObject({ sameShape: true });
    expect(balance.scores.quality).toBeGreaterThanOrEqual(res.game!.scores.quality);
  });

  it('connaît le comportement de tous les rôles du repère', () => {
    for (const r of engine.ref.roles) {
      if (r.phase !== 'oop') expect(IP_TRAITS[r.code], r.code).toBeDefined();
      if (r.phase !== 'ip') expect(OOP_TRAITS[r.code], r.code).toBeDefined();
    }
  });

  it('en simple, garde les consignes qui pèsent le plus dans les goûts (le bloc bas ne saute pas)', () => {
    const t = taste({ ball: 'keep', attack: 'wide', defend: 'low', risk: 'cautious', tuning: 'simple' });
    const poss = styleInstructions(style('longball'));
    const a = applyTaste({ ti: poss.ti, mentality: poss.mentality ?? 'Équilibrée' }, t);
    expect(tacticFeatures(a).count).toBeLessThanOrEqual(SIMPLE_MAX);
    expect(tasteScore({ ...newBuiltTactic(engine, '4-3-3', 'a'), ti: a.ti, mentality: a.mentality }, t).score).toBe(100);
  });

  it('relit des réponses abîmées sans planter', () => {
    expect(parseTaste({ ball: 'nope' })).toEqual(EMPTY_TASTE);
    expect(parseTaste({ ball: 'keep', musts: ['ten'] }).musts).toEqual(['ten']);
  });
});
