import { describe, expect, it } from 'vitest';
import { briefIsDone, briefKey, briefing, nameList, pruneBriefDone } from '../src/briefing';
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
  it('coche un message tant qu\'il ne change pas, une semaine au plus', () => {
    const ps = [pl('B', { condition: 70 }), pl('C', { condition: 60 })];
    const mk = (starters: string[]) =>
      briefing({ players: ps, nextMatch: { opponent: 'Senica', home: true, inDays: 2, competition: null }, starters: new Set(starters) }).find((x) => x.kind === 'tiredStarters')!;
    const tired = mk(['B', 'C']);
    const done = { [briefKey(tired)]: '2026-09-01' };
    expect(briefIsDone(done, tired, '2026-09-03')).toBe(true);
    expect(briefIsDone(done, tired, '2026-09-09')).toBe(false);
    // Un autre joueur fatigué : nouveau message, à traiter.
    expect(briefIsDone(done, mk(['B']), '2026-09-03')).toBe(false);
    expect(Object.keys(pruneBriefDone({ ...done, 'old::': '2026-08-01' }, '2026-09-03'))).toEqual([briefKey(tired)]);
  });
});
