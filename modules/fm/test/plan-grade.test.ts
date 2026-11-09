import { describe, expect, it } from 'vitest';
import { activeDemands, buildProject, letterOf, mergeReference, planGrade, projectCompat, styleTeamInstructions, TacticEngine } from '../src';
import { normalizePlayer } from '../src/player';

const ATTRS = ['Passing', 'FirstTouch', 'Technique', 'Composure', 'Vision', 'Decisions', 'Teamwork', 'WorkRate', 'Stamina', 'Strength', 'Pace', 'Acceleration', 'Tackling', 'Marking', 'Positioning', 'Anticipation', 'Heading', 'JumpingReach', 'Finishing', 'Movement', 'Crossing', 'Dribbling', 'Flair', 'Concentration', 'Agility', 'Aggression', 'Bravery', 'LongShots'];
const p = (id: number, positions: string, base: number, extra: Record<string, unknown> = {}) =>
  normalizePlayer({ id, name: `J${id}`, positions, age: 24, attributes: Object.fromEntries(ATTRS.map((k) => [k, base])), ...extra });
const withAttrs = (id: number, positions: string, base: number, attrs: Record<string, number>, extra: Record<string, unknown> = {}) =>
  p(id, positions, base, { attributes: { ...Object.fromEntries(ATTRS.map((k) => [k, base])), ...attrs }, ...extra });

const engine = new TacticEngine(mergeReference(undefined));
const eleven = [p(1, 'GB', 12), p(2, 'D (D)', 12), p(3, 'D (C)', 13), p(4, 'D (C)', 13), p(5, 'D (G)', 12), p(6, 'MD (C)', 13), p(7, 'M (C)', 13), p(8, 'M (C)', 13), p(9, 'MO (D)', 13), p(10, 'MO (G)', 13), p(11, 'BT', 13)];

describe('note de projet (A à E)', () => {
  it('lit les consignes d’équipe du style et en tire des exigences', () => {
    const style = engine.ref.styles.find((s) => s.id === 'gegenpress')!;
    const ti = styleTeamInstructions(style);
    expect(Object.keys(ti).length).toBeGreaterThan(0);
    expect(activeDemands(ti).length).toBeGreaterThan(0);
  });

  it('les lettres suivent le score', () => {
    expect(letterOf(95)).toBe('A');
    expect(letterOf(70)).toBe('B');
    expect(letterOf(55)).toBe('C');
    expect(letterOf(40)).toBe('D');
    expect(letterOf(10)).toBe('E');
  });

  it('un milieu infatigable passe devant un milieu nonchalant dans un projet de pressing', () => {
    const pr = buildProject(engine, eleven, { style: 'gegenpress' })!;
    const runner = withAttrs(20, 'MD (C)', 11, { WorkRate: 17, Stamina: 17, Teamwork: 16, Acceleration: 15, Aggression: 15, Decisions: 14, Anticipation: 14 }, { personality: 'Professionnel' });
    const lazy = withAttrs(21, 'MD (C)', 11, { WorkRate: 5, Stamina: 6, Teamwork: 6, Acceleration: 8, Aggression: 5, Decisions: 9, Anticipation: 9 }, { personality: 'Peu professionnel' });
    const a = projectCompat(engine, pr, runner).grade;
    const b = projectCompat(engine, pr, lazy).grade;
    expect(a.score).toBeGreaterThan(b.score);
    expect('ABCDE'.indexOf(a.letter)).toBeLessThan('ABCDE'.indexOf(b.letter));
    expect(a.demands.some((d) => d.edge > 0)).toBe(true);
    expect(b.parts.find((x) => x.id === 'mind')!.score).toBeLessThan(50);
  });

  it('sans poste du projet, E ; hors projet, jamais mieux que D', () => {
    const pr = buildProject(engine, eleven, { style: 'possession' })!;
    const wide = projectCompat(engine, pr, p(33, 'M (G)', 12));
    expect(wide.grade.letter).toBe('E');
    const g = planGrade(p(40, 'M (C)', 15, { personality: 'Professionnel' }), { gap: 2, compat: 'no', pos: 'MC', style: pr.style, ti: {} });
    expect('ABCDE'.indexOf(g.letter)).toBeGreaterThanOrEqual(3);
  });

  it('un poste non naturel pèse sur la note', () => {
    const pr = buildProject(engine, eleven, { style: 'possession' })!;
    const nat = planGrade(p(50, 'M (C)', 12), { gap: 0, compat: 'yes', pos: 'MC', style: pr.style, ti: {} });
    const off = planGrade(p(51, 'D (C)', 12, { positionRatings: { 'M (C)': 8 } }), { gap: 0, compat: 'yes', pos: 'MC', style: pr.style, ti: {} });
    expect(nat.parts.find((x) => x.id === 'position')!.score).toBe(100);
    expect(off.parts.find((x) => x.id === 'position')!.score).toBe(40);
    expect(nat.score).toBeGreaterThan(off.score);
  });
});
