import { describe, expect, it } from 'vitest';
import { fadeRisk, matchTweaks, substitutionPlan, type FmPlayer, type FormationPlan } from '../src';

const pl = (id: string, attrs: Record<string, number>, extra: Partial<FmPlayer> = {}) =>
  ({ id, name: id, attributes: attrs, condition: 98, injury: null, suspension: null, ...extra }) as unknown as FmPlayer;

const slot = (pos: string, ip: string, player: FmPlayer | null) => ({ pos, x: 50, y: 50, ip, oop: ip, player, fit: 14 });

describe('feuille de match', () => {
  it('le risque de baisse physique monte avec une faible endurance et un rôle qui court', () => {
    const low = pl('a', { Stamina: 9, NaturalFitness: 12 });
    expect(fadeRisk(low, 'WB', 'WB').risk).toBeGreaterThan(fadeRisk(low, 'DLF', 'DLF').risk);
    expect(fadeRisk(pl('b', { Stamina: 16, NaturalFitness: 15 }), 'DLF', 'DLF').risk).toBe(0);
    expect(fadeRisk(pl('c', { Stamina: 16 }, { condition: 80 }), 'DLF', 'DLF').reason).toBe('condition');
  });

  it('sort les plus exposés, remplacés par le meilleur remplaçant libre du poste, jamais le gardien', () => {
    const gk = pl('gk', { Stamina: 5 });
    const tired = pl('t', { Stamina: 8 });
    const ok = pl('ok', { Stamina: 17, NaturalFitness: 16 });
    const subT = pl('subT', { Stamina: 15 });
    const subGk = pl('subGk', { Stamina: 15 });
    const plan = {
      form: '4-3-3',
      slots: [slot('GB', 'GK', gk), slot('DD', 'WB', tired), slot('BT', 'DLF', ok)],
      subs: [[subGk], [subT], []],
      score: 14,
      fit: 14,
      penalty: 0,
      holes: 0,
    } as unknown as FormationPlan;
    const subs = substitutionPlan(plan);
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({ slot: 1, minute: 60 });
    expect(subs[0]!.in.id).toBe('subT');
  });

  it('les ajustements gardent le ballon pour un style de possession', () => {
    const poss = matchTweaks('possession').find((x) => x.situation === 'losing')!;
    expect(poss.tweaks).not.toContain('longerPasses');
    expect(matchTweaks('longball').find((x) => x.situation === 'losing')!.tweaks).toContain('longerPasses');
    expect(matchTweaks('possession').find((x) => x.situation === 'lateLosing')!.tweaks).toContain('keeperUp');
  });
});
