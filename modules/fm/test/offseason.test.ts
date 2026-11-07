import { describe, expect, it } from 'vitest';
import type { Decision } from '../src/decisions';
import { nextRestart, offseasonDue, offseasonPlan } from '../src/offseason';
import type { FmPlayer } from '../src/player';
import type { FmSnapshot } from '../src/snapshot';

const snap = (gameDate: string, left?: unknown[]): FmSnapshot =>
  ({ schema: 'archivix/1', game: 'fm27', club: 'Malženice', gameDate, players: [], ...(left ? { custom: { equipe: { calendrierChampionnatRestant: left } } } : {}) }) as FmSnapshot;
const player = (id: string, wage: number | null, value: number | null = null) => ({ id, name: id, wage, value, positions: [], attributes: {} }) as unknown as FmPlayer;
const dec = (kind: Decision['kind'], action: string, p: FmPlayer[], deadline: string | null = null): Decision => ({ kind, action, players: p, deadline, why: 'x', values: {}, basis: 'computed' });

describe('intersaison', () => {
  it('prochaine reprise', () => {
    expect(nextRestart('2027-05-20', 8)).toBe('2027-08-01');
    expect(nextRestart('2027-09-02', 8)).toBe('2028-08-01');
  });
  it('proposé à la fin du championnat, ou près de la reprise sans calendrier', () => {
    expect(offseasonDue(snap('2027-05-20', []))).toBe(true);
    expect(offseasonDue(snap('2027-05-20', [{}]))).toBe(false);
    expect(offseasonDue(snap('2027-05-20'))).toBe(true);
    expect(offseasonDue(snap('2027-02-01'))).toBe(false);
  });
  it('fait les comptes des départs', () => {
    const a = player('A', 2000);
    const b = player('B', 1500, 300_000);
    const c = player('C', 800);
    const d = player('D', 900);
    const plan = offseasonPlan(
      snap('2027-05-20', []),
      [dec('contract', 'letGo', [a], '2027-06-30'), dec('contract', 'extend', [c], '2027-06-15'), dec('departure', 'sell', [b]), dec('recruit', 'recruit', [])],
      [a, b, c, d],
      { wageRoom: -500, transferBudget: 100_000 },
      8,
      new Set(['D']),
    );
    expect(plan.leaving.map((p) => p.id).sort()).toEqual(['A', 'B', 'D']);
    expect(plan.wagesFreed).toBe(4400);
    expect(plan.wageRoomAfter).toBe(3900);
    expect(plan.saleValue).toBe(300_000);
    expect(plan.contractsBy).toBe('2027-06-15');
    expect(plan.preseason).toBe('2027-07-04');
    expect(plan.recruits).toHaveLength(1);
    expect(plan.seasonOver).toBe(true);
  });
});
