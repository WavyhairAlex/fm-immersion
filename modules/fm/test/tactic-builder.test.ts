import { describe, expect, it } from 'vitest';
import { analyseBuiltTactic, builtFromGame, builtPlan, builtStyle, mergeReference, newBuiltTactic, parseBuiltTactics, rolesAt, styleInstructions, TacticEngine, type BuiltTactic } from '../src';
import { normalizePlayer } from '../src/player';

const engine = new TacticEngine(mergeReference(undefined));
const ids = (t: BuiltTactic) => analyseBuiltTactic(engine, t).findings.map((f) => f.id);
const set = (t: BuiltTactic, i: number, p: Partial<BuiltTactic['slots'][number]>): BuiltTactic => ({ ...t, slots: t.slots.map((s, k) => (k === i ? { ...s, ...p } : s)) });

describe('éditeur de tactique', () => {
  it('part d’un schéma avec des rôles que le jeu propose à chaque poste', () => {
    const t = newBuiltTactic(engine, '4-3-3', 'a');
    expect(t.slots).toHaveLength(11);
    expect(t.slots[8]!.pos).toBe('MOG');
    expect(t.slots[8]!.posOOP).toBe('MG');
    t.slots.forEach((s, i) => {
      expect(rolesAt(engine, t.slots, i, 'ip').map((r) => r.code)).toContain(s.ip);
      expect(rolesAt(engine, t.slots.map((x) => ({ pos: x.posOOP })), i, 'oop').map((r) => r.code)).toContain(s.oop);
    });
    expect(ids(t)).not.toContain('roleInvalid');
  });

  it('signale un rôle impossible au poste', () => {
    const t = set(newBuiltTactic(engine, '4-3-3', 'a'), 1, { ip: 'POA' });
    expect(ids(t)).toContain('roleInvalid');
  });

  it('voit un couloir ouvert quand le latéral monte et que l’ailier reste haut', () => {
    // 4-3-3 : 1 = DG, 8 = MOG. Latéral offensif avancé n'existe qu'en DL : latéral offensif (WB) en D (G).
    let t = newBuiltTactic(engine, '4-3-3', 'a');
    t = set(t, 1, { ip: 'WB', oop: 'FB' });
    t = set(t, 8, { ip: 'IF', oop: 'IOW', posOOP: 'MOG' });
    const f = analyseBuiltTactic(engine, t).findings.find((x) => x.id === 'flankExposed');
    expect(f?.params.side).toBe('L');
    // Avec un milieu défensif qui couvre la largeur, le couloir n'est plus ouvert.
    const t2 = set(t, 5, { oop: 'WCDM' });
    expect(analyseBuiltTactic(engine, t2).findings.some((x) => x.id === 'flankExposed')).toBe(false);
  });

  it('juge la défense restante et le contre-pressing', () => {
    let t = newBuiltTactic(engine, '4-3-3', 'a');
    t = set(t, 1, { ip: 'AWB' });
    expect(ids(t)).toContain('roleInvalid');
    t = set(t, 1, { ip: 'WB' });
    t = set(t, 4, { ip: 'WB' });
    t = set(t, 5, { ip: 'BBM' });
    t = { ...t, ti: { 11: 2 } };
    const f = ids(t);
    expect(f).toContain('restWeak');
    expect(f).toContain('gegenRisk');
  });

  it('repère les consignes qui ne collent pas aux rôles', () => {
    const t = { ...newBuiltTactic(engine, '4-3-3', 'a'), ti: { 16: 5 } };
    expect(ids(t)).toContain('gkToTarget');
    const t2 = set(t, 9, { ip: 'TF' });
    expect(ids(t2)).not.toContain('gkToTarget');
  });

  it('reprend les consignes d’un style et la tactique du jeu', () => {
    const st = engine.ref.styles.find((s) => s.id === 'gegenpress')!;
    const { ti, mentality } = styleInstructions(st);
    expect(ti[8]).toBe(2);
    expect(mentality).toBe('Équilibrée');
    const g = builtFromGame(engine, newBuiltTactic(engine, '4-4-2', 'x').slots.map((s) => ({ pos: s.pos, posOOP: s.posOOP, roleIP: 'Winger', roleOOP: 'OPTrackingWinger' })), 'g', 'jeu');
    expect(g!.slots[5]!.ip).toBe('W');
    expect(g!.slots[5]!.oop).toBe('TW');
  });

  it('propose le onze de l’effectif et ignore les tactiques illisibles', () => {
    const t = newBuiltTactic(engine, '4-4-2', 'a');
    const pos = ['GB', 'D (G)', 'D (C)', 'D (C)', 'D (D)', 'M (G)', 'M (C)', 'M (C)', 'M (D)', 'BT', 'BT'];
    const players = pos.map((p, i) => normalizePlayer({ id: i + 1, name: `J${i}`, positions: p, level: 12, attributes: { Pace: 12, Acceleration: 12, Passing: 12, Tackling: 12, Finishing: 12, Reflexes: 12, Handling: 12, WorkRate: 12, Stamina: 12, Heading: 12 } }));
    const a = analyseBuiltTactic(engine, t, players);
    expect(a.squad!.xi.every((x) => x.player)).toBe(true);
    expect(a.findings.some((f) => f.id === 'squadDepth')).toBe(true);
    expect(parseBuiltTactics([t, { id: 1 }, null])).toHaveLength(1);
  });
});

describe('duos et jauges', () => {
  it('voit deux milieux qui montent ensemble et un flanc en surnombre', () => {
    let t = newBuiltTactic(engine, '4-4-2', 'a');
    t = set(t, 6, { ip: 'BBM' });
    t = set(t, 7, { ip: 'CHM' });
    t = set(t, 1, { ip: 'WB' });
    t = set(t, 5, { ip: 'W' });
    const a = analyseBuiltTactic(engine, t);
    expect(a.partnerships.find((p) => p.zone === 'mid')?.status).toBe('imbalanced');
    expect(a.partnerships.find((p) => p.zone === 'flankL')?.status).toBe('overloading');
    expect(a.scores.solidity).toBeLessThan(analyseBuiltTactic(engine, newBuiltTactic(engine, '4-4-2', 'b')).scores.solidity);
    expect(a.risk).toBeGreaterThanOrEqual(0);
  });
});

describe('ailiers qui redescendent', () => {
  it('compte l’ailier redescendu au milieu comme une aide sur son flanc', () => {
    let t = newBuiltTactic(engine, '4-3-3', 'a');
    t = set(t, 1, { ip: 'WB', oop: 'FB' });
    // Ailier gauche resté en MO sans ballon : le flanc est juste.
    t = set(t, 8, { ip: 'IF', posOOP: 'MOG', oop: 'W' });
    expect(analyseBuiltTactic(engine, t).findings.some((f) => f.id === 'flankThin' && f.params.side === 'L')).toBe(true);
    // Redescendu en M (G) : il double le latéral.
    t = set(t, 8, { posOOP: 'MG', oop: 'WM' });
    const f = analyseBuiltTactic(engine, t).findings;
    expect(f.some((x) => x.id === 'flankThin' && x.params.side === 'L')).toBe(false);
    expect(f.find((x) => x.id === 'flankDoubled' && x.params.side === 'L')?.params.drop).toBe(true);
  });
});

describe('consignes individuelles', () => {
  it('propose les 17 consignes du jeu avec les verrous du rôle et du poste, une option par groupe', async () => {
    const { piOptions, setPi, piStale, normalizePi } = await import('../src');
    let t = newBuiltTactic(engine, '4-3-3', 'a');
    // Milieu défensif de couverture : pressing « Moins souvent » imposé.
    t = set(t, 5, { oop: 'SCRDM' });
    const o = piOptions(engine, t, 5);
    expect(o.ip.length + o.oop.length).toBe(17);
    const press = o.oop.find((x) => x.def.group === 'TriggerPress')!;
    expect(press.state).toBe('imposed');
    expect(press.imposed).toBe('Moins souvent');
    // Gardien : la plupart des groupes avec ballon sont verrouillés.
    const gk = piOptions(engine, t, 0).ip;
    expect(gk.find((x) => x.def.group === 'Shooting')?.state).toBe('locked');
    expect(gk.find((x) => x.def.group === 'PassingStrategy')?.options).toEqual(['Plus courtes', 'Plus directes']);
    expect(setPi(['PassingStrategy:Plus courtes'], 'PassingStrategy', 'Plus directes')).toEqual(['PassingStrategy:Plus directes']);
    expect(setPi(['PassingStrategy:Plus courtes'], 'PassingStrategy', null)).toEqual([]);
    expect(normalizePi(['shortPass', 'directPass', 'pressMore'])).toEqual(['PassingStrategy:Plus directes', 'TriggerPress:Plus souvent']);
    // Consigne choisie puis rôle changé : signalée.
    t = set(t, 5, { oop: 'DM', pi: ['TriggerPress:Plus souvent'] });
    expect(piStale(engine, t, 5)).toEqual([]);
    t = set(t, 5, { oop: 'SCRDM' });
    expect(piStale(engine, t, 5)).toEqual(['TriggerPress:Plus souvent']);
    expect(ids(t)).toContain('piStale');
  });

  it('tient compte de « moins de courses » pour la défense restante', () => {
    let t = newBuiltTactic(engine, '4-3-3', 'a');
    t = set(t, 1, { ip: 'WB' });
    t = set(t, 4, { ip: 'WB' });
    const before = analyseBuiltTactic(engine, t).scores.solidity;
    t = set(t, 4, { pi: ['holdPosition'] });
    expect(analyseBuiltTactic(engine, t).scores.solidity).toBeGreaterThan(before);
  });
});

describe('Repères locaux anciens', () => {
  it('un ancien fichier local ne retire pas un rôle sans ballon de FM27 de son poste', () => {
    const old = { roles: [{ code: 'TWM', fr: 'x', en: 'x', phase: 'ip' as const, positions: ['AML'], group: 'WG', weights: { workRate: 3 } }], styles: [] };
    const e = new TacticEngine(mergeReference(old as never));
    const t = newBuiltTactic(e, '4-3-3', 'a');
    const i = t.slots.findIndex((s) => s.pos === 'MOG');
    const codes = rolesAt(e, t.slots.map((s) => ({ pos: s.posOOP })), i, 'oop').map((r) => r.code);
    expect(codes).toEqual(expect.arrayContaining(['WM', 'TWM', 'WOM']));
  });

  it('garde la mission de FM27 quand un ancien fichier local n’en donne pas', () => {
    const old = { roles: ['IF', 'F9', 'CHM'].map((code) => ({ code, fr: code, en: code, phase: 'ip' as const, positions: ['ST'], group: 'ST', weights: {} })), styles: [] };
    const e = new TacticEngine(mergeReference(old as never));
    expect(['IF', 'F9', 'CHM'].map((c) => e.roles.get(c)?.duty)).toEqual(['a', 'a', 'a']);
    let t = newBuiltTactic(e, '4-3-3', 'a');
    t = set(t, 8, { ip: 'IF' });
    expect(analyseBuiltTactic(e, t).findings.find((f) => f.id === 'fewAttack')?.params.count ?? 99).not.toBe(0);
  });
});

describe('Tactique construite dans Le onze', () => {
  it('garde postes et rôles choisis et place un joueur à chaque poste', () => {
    const pos = ['GB', 'D (G)', 'D (C)', 'D (C)', 'D (D)', 'MD (C)', 'M (C)', 'M (C)', 'MO (G)', 'BT', 'MO (D)', 'D (C)', 'M (C)'];
    const players = pos.map((p, i) => normalizePlayer({ id: i + 1, name: `J${i}`, positions: p, level: 12, attributes: { Pace: 12, Acceleration: 12, Passing: 12, Tackling: 12, Finishing: 12, Reflexes: 12, Handling: 12, WorkRate: 12, Stamina: 12, Heading: 12 } }));
    const t = newBuiltTactic(engine, '4-3-3', 'a', 'Ma 4-3-3');
    t.slots[8] = { ...t.slots[8]!, ip: 'IF', oop: 'TWM' };
    const plan = builtPlan(engine, t, players);
    expect(plan.form).toBe('4-3-3');
    expect(plan.slots[8]).toMatchObject({ pos: 'MOG', ip: 'IF', oop: 'TWM' });
    expect(plan.holes).toBe(0);
    expect(new Set(plan.slots.map((s) => s.player?.id)).size).toBe(11);
    expect(plan.subs.some((s) => s.length > 0)).toBe(true);
    expect(builtStyle(t)).toMatchObject({ id: 'built:a', name: 'Ma 4-3-3' });
  });
});
