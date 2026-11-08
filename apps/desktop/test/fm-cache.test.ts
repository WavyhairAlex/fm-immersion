import { describe, expect, it } from 'vitest';
import { upsertHistory } from '../src/lib/fm-cache';

const row = (gameDate: string, n: number) => ({ gameDate, data: { players: Array(n) } as never });

describe('historique en cache', () => {
  it('remplace le jour déjà présent et range un nouveau jour à sa place', () => {
    const rows = [row('2027-01-01', 1), row('2027-01-03', 1)];
    expect(upsertHistory(rows, row('2027-01-03', 2)).map((r) => [r.gameDate, (r.data as { players: unknown[] }).players.length])).toEqual([
      ['2027-01-01', 1],
      ['2027-01-03', 2],
    ]);
    expect(upsertHistory(rows, row('2027-01-02', 1)).map((r) => r.gameDate)).toEqual(['2027-01-01', '2027-01-02', '2027-01-03']);
  });
});
