import { describe, expect, it } from 'vitest';
import { setPieceTakers, takerScore, type FmPlayer } from '../src';

const p = (id: string, pos: string, attributes: Record<string, number>) => ({ id, name: id, positions: [pos], attributes }) as unknown as FmPlayer;

describe('tireurs et capitaine (FM Notebook)', () => {
  it('pondère l\'attribut de la tâche (×3) et ignore un joueur sans lui', () => {
    expect(takerScore(p('a', 'BT', { PenaltyTaking: 16, Composure: 10, Finishing: 13 }), 'penalties')).toBeCloseTo((48 + 15 + 13) / 5.5, 5);
    expect(takerScore(p('b', 'BT', { Composure: 20 }), 'penalties')).toBeNull();
  });
  it('choisit un titulaire et un remplaçant, jamais le gardien pour les corners', () => {
    const picks = setPieceTakers([p('gb', 'GB', { Corners: 20, Leadership: 18 }), p('x', 'MC', { Corners: 14, Leadership: 8 }), p('y', 'MD', { Corners: 16, Leadership: 12 })]);
    const corners = picks.find((t) => t.role === 'corners')!;
    expect([corners.first?.player.id, corners.second?.player.id]).toEqual(['y', 'x']);
    expect(picks.find((t) => t.role === 'captain')!.first?.player.id).toBe('gb');
  });
});
