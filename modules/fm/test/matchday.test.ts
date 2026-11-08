import { describe, expect, it } from 'vitest';
import { matchdayPlan, mergeReference, planFromLineup, TacticEngine, type GameSlot } from '../src';
import { normalizePlayer } from '../src/player';

const engine = new TacticEngine(mergeReference(undefined));
const pl = (id: number, positions: string, extra: Record<string, unknown> = {}) =>
  normalizePlayer({ id, name: `J${id}`, positions, level: 10, attributes: { Passing: 10, Tackling: 10, Positioning: 10, Finishing: 10 }, ...extra });
const base = [pl(1, 'GB'), pl(2, 'D (D)'), pl(3, 'D (C)'), pl(4, 'D (C)'), pl(5, 'D (G)'), pl(6, 'MD (C)'), pl(7, 'M (C)'), pl(8, 'M (C)'), pl(9, 'MO (D)'), pl(10, 'MO (G)')];
const lineup: GameSlot[] = [...base, pl(11, 'BT')].map((p, k) => ({ index: k, playerId: p.id, playerName: p.name, pos: null, roleIP: null, roleOOP: null, custom: false, instructions: { ip: [], oop: [] } }) as unknown as GameSlot);

const run = (striker: Record<string, unknown>, bench: Record<string, unknown>, rotate: boolean) => {
  const players = [...base, pl(11, 'BT', striker), pl(12, 'BT', bench)];
  const plan = planFromLineup(engine, lineup, players, null);
  return matchdayPlan(engine, plan, players, { rotate });
};

describe('onze du prochain match', () => {
  it('repose un titulaire fatigué au profit du remplaçant frais du poste', () => {
    const r = run({ condition: 78 }, { condition: 98 }, false);
    expect(r.changes).toEqual([expect.objectContaining({ reason: 'tired' })]);
    expect(r.changes[0]!.out.id).toBe('11');
    expect(r.plan.slots[10]!.player?.id).toBe('12');
    expect(r.plan.subs[10]![0]!.id).toBe('11');
  });

  it('fait tourner dès 92 % en coupe ou calendrier chargé, pas en championnat', () => {
    expect(run({ condition: 89 }, { condition: 99 }, false).changes).toHaveLength(0);
    expect(run({ condition: 89 }, { condition: 99 }, true).changes[0]!.reason).toBe('rotation');
  });

  it('garde le titulaire si le remplaçant est lui aussi entamé', () => {
    expect(run({ condition: 80 }, { condition: 82 }, false).changes).toHaveLength(0);
  });

  it('remplace toujours un absent, même par un joueur entamé', () => {
    const r = run({ suspension: 'Carton rouge' }, { condition: 80 }, false);
    expect(r.changes[0]).toMatchObject({ reason: 'unavailable' });
    expect(r.plan.slots[10]!.player?.id).toBe('12');
  });
});
