import { describe, expect, it } from 'vitest';
import { briefing, facedAdvice, ownFormations } from '../src';
import type { FmSnapshot } from '../src/snapshot';

const f = (form: string, minutes: number, chances: number) => ({ FormationType: form, FormationUsedMinutes: minutes, FormationUsedPercentage: 0, ChancesCreated: chances, FormationChancesFrequency: Math.round(minutes / chances) });
const snap = (oppOop: string, oppIp = '4-3-3') =>
  ({
    nextMatch: { opponent: 'Slovan' },
    custom: {
      equipe: {
        advClassement: '3',
        advFormationsAvec: [f(oppIp, 900, 20)],
        advFormationsSans: [f(oppOop, 900, 20)],
        // Créées : une toutes les 50 min en moyenne, mais une toutes les 100 contre le 4-4-2.
        formationsAffronteesSans: [f('4-4-2 2MD', 600, 6), f('4-2-3-1 MD MO', 900, 24)],
        // Concédées : rien de marquant.
        formationsAffronteesAvec: [f('4-3-3 MD', 900, 9), f('4-4-2', 600, 6)],
      },
    },
  }) as unknown as FmSnapshot;

describe('formations affrontées par notre équipe', () => {
  it('regroupe par famille de schéma et calcule la moyenne', () => {
    const own = ownFormations(snap('4-4-2'))!;
    expect(own.create!.avgEvery).toBe(50);
    expect(own.create!.rows.find((r) => r.form === '4-4-2')).toMatchObject({ minutes: 600, every: 100, ratio: 2 });
    expect(ownFormations({ custom: { equipe: {} } } as unknown as FmSnapshot)).toBeNull();
  });

  it('alerte quand le prochain adversaire défend dans un schéma contre lequel on crée peu', () => {
    const a = facedAdvice(snap('4-4-2 2MD'))!;
    expect(a.kind).toBe('facedCreate');
    expect(a.values).toEqual({ form: '4-4-2', every: 100, avg: 50, minutes: 600 });
    const items = briefing({ players: [], nextMatch: { opponent: 'Slovan', home: true, inDays: 2, competition: null }, faced: a });
    expect(items.some((x) => x.kind === 'facedCreate' && x.view === 'tactic')).toBe(true);
  });

  it('rien si l’adversaire joue un schéma qui nous réussit, ou trop peu affronté', () => {
    expect(facedAdvice(snap('4-2-3-1'))).toBeNull();
    const few = snap('4-4-2');
    ((few as unknown as { custom: { equipe: Record<string, unknown> } }).custom.equipe.formationsAffronteesSans as unknown[]) = [f('4-4-2', 180, 1), f('4-2-3-1', 900, 24)];
    expect(facedAdvice(few)).toBeNull();
  });
});
