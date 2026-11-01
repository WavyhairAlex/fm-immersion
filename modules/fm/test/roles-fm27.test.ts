import { describe, expect, it } from 'vitest';
import { DEFAULT_TACTIC_REFERENCE, TacticEngine, slotContexts, type PosCode } from '../src';
import { matchRole } from '../src/lineup';

const engine = new TacticEngine(DEFAULT_TACTIC_REFERENCE);

/** Codes du jeu proposés à chaque poste, sans contexte de créneau (table relevée dans game_plugin.dll). */
const GAME: Record<string, { ip: string[]; oop: string[] }> = {
  GB: { ip: ['Goalkeeper', 'BallPlayingGoalkeeper', 'NoNonsenseGoalkeeper'], oop: ['OPGoalkeeper', 'OPSweeperKeeper', 'OPLineKeeper'] },
  DD: { ip: ['FullBack', 'WingBack', 'InsideWingBack', 'InsideFullBack', 'PlaymakingWingBack'], oop: ['OPFullBack', 'OPPressingFullBack', 'OPHoldingFullBack'] },
  DC: {
    ip: ['CentreBack', 'AdvancedCentreBack', 'BallPlayingCentreBack', 'NoNonsenseCentreBack', 'WideCentreBack', 'OverlappingCentreBack'],
    oop: ['OPCentreBack', 'OPStoppingCentreBack', 'OPCoveringCentreBack', 'OPWideCentreBack', 'OPStoppingWideCentreBack', 'OPCoveringWideCentreBack'],
  },
  DLG: { ip: ['WingBack', 'AdvancedWingBack', 'InsideWingBack', 'PlaymakingWingBack'], oop: ['OPWingBack', 'OPPressingWingBack', 'OPHoldingWingBack'] },
  MDF: {
    ip: ['DefensiveMidfielder', 'DeepLyingPlaymaker', 'BoxToBoxMidfielder', 'HalfBack', 'BoxToBoxPlaymaker'],
    oop: ['OPDefensiveMidfielder', 'OPDroppingDefensiveMidfielder', 'OPPressingDefensiveMidfielder', 'OPScreeningDefensiveMidfielder', 'OPWideCoverDefensiveMidfielder'],
  },
  MD: { ip: ['WideMidfielder', 'Winger', 'PlaymakingWinger', 'InsideWinger'], oop: ['OPWideMidfielder', 'OPTrackingWideMidfielder', 'OPWideOutletWideMidfielder'] },
  MC: {
    ip: ['CentralMidfielder', 'AttackingMidfielder', 'AdvancedPlaymaker', 'WideCentralMidfielder', 'ChannelMidfielder', 'MidfieldPlaymaker'],
    oop: ['OPCentralMidfielder', 'OPPressingCentralMidfielder', 'OPScreeningCentralMidfielder', 'OPWideCoverCentralMidfielder'],
  },
  MOG: { ip: ['Winger', 'InsideForward', 'PlaymakingWinger', 'WideForward', 'InsideWinger'], oop: ['OPWinger', 'OPTrackingWinger', 'OPInsideOutletWinger', 'OPWideOutletWinger'] },
  MOC: {
    ip: ['AttackingMidfielder', 'AdvancedPlaymaker', 'FreeRole', 'SecondStriker', 'ChannelMidfielder'],
    oop: ['OPAttackingMidfielder', 'OPTrackingAttackingMidfielder', 'OPCentralOutletAttackingMidfielder', 'OPSplittingOutletAttackingMidfielder'],
  },
  BT: {
    ip: ['DeepLyingForward', 'CentreForward', 'TargetForward', 'Poacher', 'ChannelForward', 'FalseNine'],
    oop: ['OPCentreForward', 'OPTrackingCentreForward', 'OPCentralOutletCentreForward', 'OPSplittingOutletCentreForward'],
  },
};

const at = (pos: PosCode, ph: 'ip' | 'oop', ctx?: { wide: boolean; cbs: number }) =>
  engine.ref.roles.filter((r) => engine.availableAt(r, pos, ph, ctx)).map((r) => r.game?.[ph]);

describe('rôles FM27 par poste', () => {
  it('propose à chaque poste exactement les rôles du jeu', () => {
    for (const [pos, g] of Object.entries(GAME)) {
      expect(at(pos as PosCode, 'ip').sort(), `${pos} avec ballon`).toEqual([...g.ip].sort());
      expect(at(pos as PosCode, 'oop').sort(), `${pos} sans ballon`).toEqual([...g.oop].sort());
    }
  });

  it('réserve certains rôles aux créneaux excentrés', () => {
    expect(at('BT', 'oop', { wide: false, cbs: 4 })).not.toContain('OPSplittingOutletCentreForward');
    expect(at('BT', 'oop', { wide: true, cbs: 4 })).toContain('OPSplittingOutletCentreForward');
    expect(at('MDF', 'ip', { wide: false, cbs: 4 })).not.toContain('BoxToBoxMidfielder');
    expect(at('DC', 'ip', { wide: true, cbs: 2 })).not.toContain('WideCentreBack');
    expect(at('DC', 'ip', { wide: true, cbs: 3 })).toContain('WideCentreBack');
  });

  it('repère les créneaux excentrés du schéma', () => {
    const ctx = slotContexts([
      { pos: 'DC', x: 25 },
      { pos: 'DC', x: 50 },
      { pos: 'DC', x: 75 },
      { pos: 'MDF', x: 50 },
      { pos: 'MG', x: 15 },
    ]);
    expect(ctx.map((c) => c.wide)).toEqual([true, false, true, false, false]);
    expect(ctx[0]!.cbs).toBe(3);
  });

  it('reconnaît les codes du jeu', () => {
    expect(matchRole(engine, 'BoxToBoxMidfielder', 'MDF', 'ip')?.code).toBe('BBM');
    expect(matchRole(engine, 'OPWinger', 'MOG', 'oop')?.code).toBe('W');
    expect(matchRole(engine, 'OPCentralOutletCentreForward', 'BT', 'oop')?.code).toBe('COCF');
  });
});
