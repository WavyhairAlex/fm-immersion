import { describe, expect, it } from 'vitest';
import { analyseBuiltTactic, builtFromGame, mergeReference, newBuiltTactic, parseBuiltTactics, rolesAt, styleInstructions, TacticEngine, type BuiltTactic } from '../src';
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
