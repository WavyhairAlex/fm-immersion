import { describe, expect, it } from 'vitest';
import { buildProject, mercatoAdvice, mergeReference, projectCompat, TacticEngine } from '../src';
import { normalizePlayer } from '../src/player';

const ATTRS = ['Passing', 'FirstTouch', 'Technique', 'Composure', 'Vision', 'Decisions', 'Teamwork', 'WorkRate', 'Stamina', 'Strength', 'Pace', 'Acceleration', 'Tackling', 'Marking', 'Positioning', 'Anticipation', 'Heading', 'JumpingReach', 'Finishing', 'Movement', 'Crossing', 'Dribbling', 'Flair', 'Concentration', 'Agility', 'Aggression', 'Reflexes', 'Handling', 'OneOnOnes', 'AerialReach', 'CommandOfArea', 'Kicking', 'RushingOut'];
const p = (id: number, positions: string, base: number, extra: Record<string, unknown> = {}) =>
  normalizePlayer({ id, name: `J${id}`, positions, age: 26, contractEnd: '2029-06-30', value: 100_000, wage: 1000, attributes: Object.fromEntries(ATTRS.map((k) => [k, base])), ...extra });

const engine = new TacticEngine(mergeReference(undefined));
const eleven = [
  p(1, 'GB', 12),
  p(2, 'D (D)', 12),
  p(3, 'D (C)', 13),
  p(4, 'D (C)', 13),
  p(5, 'D (G)', 12),
  p(6, 'MD (C)', 13),
  p(7, 'M (C)', 13),
  p(8, 'M (C)', 13),
  p(9, 'MO (D)', 13),
  p(10, 'MO (G)', 13),
  p(11, 'BT', 13),
];
const DATE = '2026-11-24';

describe('mercato : départs et jeunes', () => {
  it('garde les titulaires et les doublures, fait partir les joueurs en trop', () => {
    const squad = [...eleven, p(12, 'D (C)', 11), p(13, 'D (C)', 10.5), p(14, 'D (C)', 10), p(15, 'D (C)', 6, { age: 29 }), p(16, 'GB', 10), p(17, 'GB', 9)];
    const r = mercatoAdvice(engine, squad, DATE, { style: 'possession' })!;
    const v = (id: number) => r.advice.find((a) => a.player.id === String(id))!;
    expect(v(3).now.tier).toBe(0);
    expect(['core', 'replace']).toContain(v(3).verdict);
    // Deux DC dans le schéma : deux doublures, le cinquième est en trop.
    expect(v(12).verdict).toBe('backup');
    expect(v(15).verdict).toBe('sell');
    expect(v(15).reasons.some((x) => x.id === 'surplus')).toBe(true);
    // Deux doublures au but.
    expect(v(16).verdict).toBe('backup');
    expect(v(17).verdict).toBe('backup');
    expect(r.income).toBe(r.byVerdict.sell.reduce((s, a) => s + (a.player.value ?? 0), 0));
  });

  it('laisse partir en fin de contrat plutôt que vendre quand il reste moins de six mois', () => {
    const squad = [...eleven, p(12, 'D (C)', 11), p(13, 'D (C)', 10.5), p(14, 'D (C)', 6, { contractEnd: '2027-03-31' })];
    const r = mercatoAdvice(engine, squad, DATE, { style: 'possession' })!;
    expect(r.advice.find((a) => a.player.id === '14')!.verdict).toBe('release');
  });

  it('repère les jeunes qui valent le coup : prêt s’ils sont bloqués, prolongation si le contrat finit', () => {
    const squad = [
      ...eleven,
      p(12, 'M (C)', 12),
      p(13, 'M (C)', 11.5),
      p(14, 'M (C)', 11),
      p(20, 'M (C)', 9, { age: 20, stars: { current: 1, potential: 4 } }),
      p(21, 'M (C)', 8, { age: 17, stars: { current: 0.5, potential: 3.5 } }),
      p(22, 'M (C)', 7, { age: 20, stars: { current: 0.5, potential: 1.5 } }),
      p(23, 'BT', 9, { age: 19, contractEnd: '2027-06-30', stars: { current: 1, potential: 4.5 } }),
    ];
    const r = mercatoAdvice(engine, squad, DATE, { style: 'possession' })!;
    const v = (id: number) => r.advice.find((a) => a.player.id === String(id))!;
    expect(v(20).prospect).toBe(true);
    expect(v(20).verdict).toBe('loan');
    // À 17 ans, il progresse avec les jeunes du club.
    expect(v(21).verdict).toBe('develop');
    expect(v(21).reasons.some((x) => x.id === 'youthTeam')).toBe(true);
    expect(v(22).prospect).toBe(false);
    expect(v(22).verdict).toBe('sell');
    expect(v(23).verdict).toBe('extend');
    // Les jeunes prometteurs passent en tête de liste.
    expect(r.youth[0]!.prospect).toBe(true);
    expect(r.youth.at(-1)!.player.id).toBe('22');
  });

  it('ne conseille rien sans attributs', () => {
    expect(mercatoAdvice(engine, [normalizePlayer({ id: 1, name: 'X', positions: 'BT' })], DATE)).toBeNull();
  });
});

describe('compatibilité avec le projet de jeu', () => {
  it('juge le profil, pas le niveau : un faible fait pour le style reste compatible', () => {
    const pr = buildProject(engine, eleven, { style: 'possession' })!;
    // Milieu technique faible : profil de possession.
    const tech = p(30, 'M (C)', 8, { attributes: { ...Object.fromEntries(ATTRS.map((k) => [k, 6])), Passing: 12, FirstTouch: 12, Technique: 12, Vision: 12, Decisions: 12, Composure: 12, Teamwork: 12 } });
    // Milieu tout en impact : physique et récupération, aucune technique.
    const brute = p(31, 'M (C)', 8, { attributes: { ...Object.fromEntries(ATTRS.map((k) => [k, 4])), Tackling: 18, Aggression: 18, Strength: 18, Stamina: 18, WorkRate: 18, Marking: 18, Positioning: 16, Heading: 18, JumpingReach: 18 } });
    const a = projectCompat(engine, pr, tech);
    const b = projectCompat(engine, pr, brute);
    expect(a.gap!).toBeLessThan(b.gap!);
    expect(a.compat).not.toBe('no');
    // Pivot tout en puissance, sans technique : hors projet.
    expect(projectCompat(engine, pr, p(34, 'BT', 6, { attributes: { ...Object.fromEntries(ATTRS.map((k) => [k, 6])), Strength: 18, Heading: 18, JumpingReach: 18, Finishing: 14 } })).compat).toBe('no');
    // Aucun poste du schéma du projet (milieu gauche dans un 4-3-3) : hors projet.
    const wide = projectCompat(engine, pr, p(33, 'M (G)', 12));
    expect(wide.noPosition).toBe(true);
    expect(wide.compat).toBe('no');
    const advice = mercatoAdvice(engine, [...eleven, tech, brute], DATE, { style: 'possession' })!;
    const off = advice.advice.filter((x) => x.compat?.compat === 'no');
    for (const x of off) {
      expect(x.prospect).toBe(false);
      expect(x.verdict).not.toBe('extend');
      expect(x.reasons.some((r) => r.id === 'offProject')).toBe(true);
    }
  });
});
