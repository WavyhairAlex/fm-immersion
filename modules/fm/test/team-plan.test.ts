import { describe, expect, it } from 'vitest';
import { teamPlan, type Project, type Target, type TacticEngine } from '../src';

// Moteur factice : la note d'un joueur dans un rôle est sa propriété `n`.
const engine = { roleFit: (p: { n: number }) => p.n } as unknown as TacticEngine;
const slot = (pos: string, fit: number) => ({ pos, ip: 'r', oop: 'r', x: 0, y: 0, player: { id: `s${pos}`, name: pos, n: fit }, fit, status: 'ready', tone: 'good' });
const tgt = (id: string, pos: string, n: number, value: number | null = 1000, wage: number | null = null) => ({ id, name: id, positions: [pos], attributes: { a: 1 }, n, value, wage, scout: null }) as unknown as Target;
const project = { slots: [slot('GB', 10), slot('DC', 12), slot('BT', 14), slot('MC', 13)] } as unknown as Project;

describe('teamPlan (formule FM Notebook)', () => {
  it('prend les plus gros gains jusqu\'à passer la barre', () => {
    const p = teamPlan(engine, project, [tgt('a', 'GB', 14), tgt('b', 'DC', 13), tgt('c', 'BT', 15)], 13);
    expect(p.xiAvg).toBe(12.25);
    expect(p.upgrades.map((u) => u.player.id)).toEqual(['a', 'b', 'c']);
    expect(p.toTarget.map((u) => u.player.id)).toEqual(['a']);
    expect(p.toTarget.at(-1)!.after).toBeCloseTo(13.25);
    expect(p.reachable).toBeCloseTo(13.75);
    expect(p.reached).toBe(true);
  });
  it('cumule le budget : deux recrues ne peuvent pas dépasser l\'argent disponible', () => {
    const p = teamPlan(engine, project, [tgt('a', 'GB', 14, 800), tgt('b', 'DC', 13, 800)], 13, { budget: 1000, wageRoom: null });
    expect(p.upgrades.map((u) => u.player.id)).toEqual(['a']);
    expect(p.tooDear.map((u) => u.player.id)).toEqual(['b']);
    expect(p.spent).toBe(800);
  });
  it('ne compte jamais une cible sans prix comme abordable', () => {
    const p = teamPlan(engine, project, [tgt('a', 'GB', 14, null)], 13, { budget: 1000, wageRoom: null });
    expect(p.upgrades).toEqual([]);
    expect(p.unpriced.map((u) => u.player.id)).toEqual(['a']);
    expect(p.reached).toBe(false);
  });
  it('respecte la marge salariale', () => {
    const p = teamPlan(engine, project, [tgt('a', 'GB', 14, 1, 5000), tgt('b', 'GB', 13, 1, 500)], 12, { budget: null, wageRoom: 1000 });
    expect(p.upgrades.map((u) => u.player.id)).toEqual(['b']);
    expect(p.floor).toBe(10);
  });
});
