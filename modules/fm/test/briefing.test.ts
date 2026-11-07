import { describe, expect, it } from 'vitest';
import { briefing, nameList } from '../src/briefing';
import type { FmPlayer } from '../src/player';

const pl = (id: string, o: Partial<FmPlayer> = {}) => ({ id, name: `Jan ${id}`, injury: null, suspension: null, condition: 95, morale: 'Bon', ...o }) as FmPlayer;

describe("briefing de l'adjoint", () => {
  it('joint les noms', () => {
    const others = (n: number) => `${n} autres`;
    expect(nameList([pl('A')], 'et', others)).toBe('A');
    expect(nameList([pl('A'), pl('B')], 'et', others)).toBe('A et B');
    expect(nameList([pl('A'), pl('B'), pl('C'), pl('D')], 'et', others)).toBe('A, B et 2 autres');
  });
  it('met les titulaires absents en tête, puis le match et les fatigués', () => {
    const ps = [pl('A', { injury: 'Entorse' }), pl('B', { condition: 70 }), pl('C'), pl('D', { morale: 'Très mauvais' })];
    const b = briefing({ players: ps, nextMatch: { opponent: 'Senica', home: true, inDays: 2, competition: null }, starters: new Set(['A', 'B', 'C']) });
    expect(b.map((x) => x.kind)).toEqual(['absentStarters', 'nextMatch', 'tiredStarters', 'unhappy']);
    expect(b[0]!.players.map((p) => p.id)).toEqual(['A']);
  });
  it('ignore un blessé rétabli pour le match', () => {
    const ps = [pl('A', { injury: 'Coup' })];
    const b = briefing({ players: ps, nextMatch: { opponent: 'X', home: null, inDays: 5, competition: null }, starters: new Set(['A']), backForMatch: () => true });
    expect(b.map((x) => x.kind)).toEqual(['nextMatch', 'allGood']);
  });
  it('intersaison sans match : rien à signaler sinon', () => {
    expect(briefing({ players: [pl('A')], nextMatch: null, offseason: true }).map((x) => x.kind)).toEqual(['offseason']);
    expect(briefing({ players: [pl('A')], nextMatch: null }).map((x) => x.kind)).toEqual(['allGood']);
  });
});
