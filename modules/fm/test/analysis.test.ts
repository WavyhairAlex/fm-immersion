import { describe, expect, it } from 'vitest';
import { analyseSquad, bestEleven, normalizePlayer } from '../src';

const p = (id: number, name: string, positions: string, level: number, age: number, contractEnd = '2029-06-30') =>
  normalizePlayer({ id, name, positions, level, age, contractEnd });

const squad = [
  p(1, 'GB1', 'GB', 12, 30),
  p(2, 'DC1', 'D (C)', 13, 31, '2027-03-01'),
  p(3, 'DC2', 'D (C)', 12, 24),
  p(4, 'DD1', 'D (D)', 11, 20),
  p(5, 'DG1', 'D (G)', 11, 26),
  p(6, 'MC1', 'M (C)', 14, 27),
  p(7, 'MC2', 'M (C)', 13, 22),
  p(8, 'MD1', 'MD', 12, 29),
  p(9, 'MC3', 'M (C)', 12, 19),
  p(10, 'BT1', 'BT', 13, 25),
  p(11, 'MOG', 'MO (G)', 12, 23),
  p(12, 'MOD', 'MO (D)', 12, 21),
  p(13, 'DC3', 'D (C)', 9, 30),
  p(14, 'MC4', 'M (C)', 9, 32),
];

describe('analyse de l’effectif', () => {
  it('compose le onze par ligne', () => {
    expect(bestEleven(squad).map((x) => x.name)).toEqual(['GB1', 'DC1', 'DC2', 'DD1', 'DG1', 'MC1', 'MC2', 'MD1', 'BT1', 'MOG', 'MOD']);
  });

  it('repère lignes, profondeur et priorités', () => {
    const a = analyseSquad(squad, '2026-08-29');
    expect(a.xi).toHaveLength(11);
    expect(a.strongest).toBe('MIL');
    expect(a.weakest).toBe('DEF');
    const kinds = a.todo.map((t) => t.kind);
    expect(kinds).toContain('secondKeeper');
    expect(a.todo.find((t) => t.kind === 'extend')?.names).toEqual(['DC1']);
    expect(a.todo.find((t) => t.kind === 'payroll')?.names).toEqual(['DC3', 'MC4']);
    expect(a.todo.find((t) => t.kind === 'doublePos' && t.pos === 'DD')?.names).toEqual(['DD1']);
    expect(a.ages.map((b) => b.squad)).toEqual([3, 4, 3, 4]);
    expect(a.todo.find((t) => t.kind === 'youngXi')?.names).toEqual(['DD1', 'MOD']);
  });
});
