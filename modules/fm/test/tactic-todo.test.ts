import { describe, expect, it } from 'vitest';
import { instructionKey, tacticTodo, type PlayerInstruction, type PlayerPiState, type TeamAdvice } from '../src';
import { normalizePlayer } from '../src/player';

const player = (id: number) => normalizePlayer({ id, name: `J${id}`, positions: 'M (C)', level: 12, attributes: { Passing: 12 } });
const pi = (id: PlayerInstruction['id'], why = id as string): PlayerInstruction => ({ id, phase: 'ip', weight: 2, why, vals: {} });
const key = (id: PlayerInstruction['id']) => instructionKey(id)!;
const state = (o: Partial<PlayerPiState> & { player: PlayerPiState['player'] }): PlayerPiState => ({ list: [], supported: [], game: { mine: [], imposed: [] }, ...o });
const team = (rows: { reason: string | null; option: number; game: number | null }[]) => ({ rows: rows.map((r, i) => ({ def: { id: i }, styleOption: r.game, vals: {}, ...r })) }) as unknown as TeamAdvice;

describe('liste « À changer dans FM27 »', () => {
  it('ne garde des consignes d’équipe que les corrections pas encore réglées dans le jeu', () => {
    const items = tacticTodo({ team: team([{ reason: 'pressFails', option: 2, game: 3 }, { reason: 'stretched', option: 2, game: 2 }, { reason: null, option: 1, game: 3 }]), lineup: null, players: [], budget: 2 });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'team', row: { reason: 'pressFails' } });
  });

  it('signale une consigne réglée à l’inverse, sans la redemander au retrait', () => {
    const p = player(1);
    const dribbleLess = key('dribbleLess');
    const items = tacticTodo({ team: null, lineup: null, budget: 1, players: [state({ player: p, list: [pi('dribbleMore')], supported: [pi('dribbleMore')], game: { mine: [dribbleLess, key('markTighter')], imposed: [] } })] });
    expect(items.map((x) => x.kind)).toEqual(['piChange', 'piRemove']);
    expect(items[0]).toMatchObject({ other: dribbleLess });
    expect(items[1]).toMatchObject({ count: 2, budget: 1, keys: [key('markTighter')] });
  });

  it('ne touche pas à une consigne imposée par le rôle, ni à ce qui n’a pas été lu', () => {
    const p = player(1);
    expect(tacticTodo({ team: null, lineup: null, budget: 2, players: [state({ player: p, list: [pi('dribbleMore')], game: { mine: [], imposed: [key('dribbleLess')] } })] })).toEqual([]);
    expect(tacticTodo({ team: null, lineup: null, budget: 2, players: [state({ player: p, list: [pi('dribbleMore')], game: null })] })).toEqual([]);
  });

  it('n’ajoute que les consignes appuyées par les stats, tant qu’il reste de la place', () => {
    const p = player(1);
    const list = [pi('shootLess', 'statShootLess'), pi('riskMore')];
    expect(tacticTodo({ team: null, lineup: null, budget: 2, players: [state({ player: p, list })] }).map((x) => x.kind)).toEqual(['piAdd']);
    expect(tacticTodo({ team: null, lineup: null, budget: 1, players: [state({ player: p, list, supported: [pi('holdBall')], game: { mine: [key('holdBall')], imposed: [] } })] })).toEqual([]);
  });

  it('classe : consignes d’équipe, titulaires, consignes individuelles, rôles', () => {
    const p = player(1);
    const lineup = { starters: [{ slot: 0 }], roles: [{ slot: 1 }], rested: [], cover: [] } as never;
    const items = tacticTodo({ team: team([{ reason: 'sterile', option: 3, game: 2 }]), lineup, budget: 2, players: [state({ player: p, list: [pi('shootLess', 'statShootLess')] })] });
    expect(items.map((x) => x.kind)).toEqual(['team', 'starter', 'piAdd', 'role']);
  });
});
