import { describe, expect, it } from 'vitest';
import { mergeReference, playerInstructions, roleLocks, TacticEngine, type Slot } from '../src';
import { normalizePlayer } from '../src/player';

const engine = new TacticEngine(mergeReference(undefined));
const style = engine.ref.styles.find((s) => s.id === 'possession')!;
// Gros volume de course : il « devrait » presser plus.
const presser = (positions: string) =>
  normalizePlayer({ id: 1, name: 'Pontus Edh', positions, level: 10, attributes: { WorkRate: 15, Stamina: 15, Aggression: 15, Passing: 10, Decisions: 10, Tackling: 10, Marking: 10, Strength: 10, Bravery: 10 } });
const slot = (pos: Slot['pos'], ip: string, oop: string, positions: string): Slot => ({ pos, x: 50, y: 60, ip, oop, player: presser(positions), fit: null });

describe('consignes individuelles', () => {
  it('lit les verrous de pressing des rôles', () => {
    expect(roleLocks(engine.roles.get('SCRDM')).press).toBe('less');
    expect(roleLocks(engine.roles.get('COCF')).press).toBe('less');
    expect(roleLocks(engine.roles.get('HFB')).press).toBe('less');
    expect(roleLocks(engine.roles.get('PRSDM')).press).toBe('more');
    expect(roleLocks(engine.roles.get('DM')).press).toBeNull();
    expect(roleLocks(engine.roles.get('CCB')).blocked).toContain('markTighter');
    // Repères locaux aux codes du jeu : le nom anglais suffit.
    expect(roleLocks({ ...engine.roles.get('SCRDM')!, code: 'OPScreeningDefensiveMidfielder' }).press).toBe('less');
  });

  it('ne propose jamais « presser plus » à un rôle de couverture, mais le rôle qui le permet', () => {
    const adv = playerInstructions(engine, slot('MDF', 'DM', 'SCRDM', 'MD (C)'), style);
    expect(adv.list.map((x) => x.id)).not.toContain('pressMore');
    expect(adv.switches).toEqual([{ phase: 'oop', from: 'SCRDM', to: 'PRSDM', unlocks: 'pressMore' }]);
    // Même joueur dans un rôle libre sans ballon : la consigne est proposée.
    const free = playerInstructions(engine, slot('MDF', 'DM', 'DM', 'MD (C)'), style);
    expect(free.list.map((x) => x.id)).toContain('pressMore');
    expect(free.switches).toEqual([]);
  });

  it('juge le pressing sur le rôle sans ballon, pas sur le rôle avec ballon', () => {
    const adv = playerInstructions(engine, slot('BT', 'POA', 'COCF', 'BT'), style);
    expect(adv.list.map((x) => x.id)).not.toContain('pressMore');
    expect(adv.switches[0]?.from).toBe('COCF');
  });
});
