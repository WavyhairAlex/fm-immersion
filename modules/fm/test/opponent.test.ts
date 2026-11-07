import { describe, expect, it } from 'vitest';
import { opponentReport, strikersOf, type FmSnapshot } from '../src';

// Valeurs lues en jeu le 01/11/2026 (Herrestads AIF, étape adverse 1).
const snap = {
  nextMatch: { opponent: 'Herrestads AIF' },
  custom: {
    equipe: {
      advRapportDispo: 'False',
      advClassement: '5e',
      advEntraineur: 'Pablo Andersson',
      advFormationPref: '4-4-2',
      advMentalite: 'Équilibré',
      advPressing: 'Moins souvent',
      advMarquage: 'Individuel',
      advButeur: 'Anton Engelbrektsson',
      advButs: 11,
      advPasseur: 'Sylejman Hoxhaj',
      advPasses: 12,
      advMeilleureNoteJoueur: 'Sylejman Hoxhaj',
      advMeilleureNote: 7.108333110809326,
      advEff0Nom: 'Rickard Johansson',
      advEff0Postes: 'D (C), MD, M (C)',
      advEff0Etoiles: -1,
      advFormationsAvec: [{ ChancesCreated: 27, FormationChancesFrequency: 38, FormationType: '4-4-2', FormationUsedMinutes: 1033, FormationUsedPercentage: 100, TacticalPositions: ['SI.Bindable.DynamicReference'] }],
      advFormationsSans: [
        { ChancesCreated: 5, FormationChancesFrequency: 58, FormationType: '4-4-2', FormationUsedMinutes: 292, FormationUsedPercentage: 28.267183303833008 },
        { ChancesCreated: 30, FormationChancesFrequency: 24, FormationType: '4-4-2 2MD', FormationUsedMinutes: 741, FormationUsedPercentage: 71.73281860351562 },
      ],
    },
  },
} as unknown as FmSnapshot;

describe('rapport adverse', () => {
  it('lit le profil, les joueurs clés et ignore les étoiles inconnues', () => {
    const r = opponentReport(snap)!;
    expect(r.name).toBe('Herrestads AIF');
    expect(r.position).toBe('5e');
    expect(r.manager).toMatchObject({ formation: '4-4-2', pressing: 'Moins souvent', marking: 'Individuel' });
    expect(r.scorer).toEqual({ name: 'Anton Engelbrektsson', value: 11 });
    expect(r.rated?.value).toBeCloseTo(7.11, 2);
    expect(r.squad).toEqual([{ name: 'Rickard Johansson', positions: 'D (C), MD, M (C)', stars: null, foot: null }]);
  });

  it('donne des conseils qui répondent aux données lues', () => {
    const ids = opponentReport(snap)!.advice.map((a) => a.id + (a.name ? `:${a.name}` : ''));
    expect(ids).toEqual(['buildShort', 'rotate', 'twoStrikers', 'screened', 'leaky:24', 'markCreator:Sylejman Hoxhaj', 'watchScorer:Anton Engelbrektsson']);
  });

  it('lit les formations avec et sans ballon, la plus jouée en tête', () => {
    const f = opponentReport(snap)!.formations;
    expect(f.ip).toEqual([{ form: '4-4-2', pct: 100, minutes: 1033, chances: 27, every: 38 }]);
    expect(f.oop.map((x) => x.form)).toEqual(['4-4-2 2MD', '4-4-2']);
    expect(f.oop[0]!.chances).toBe(30);
    // Formation lue en texte JSON : même résultat.
    const s2 = { custom: { equipe: { advFormationsAvec: JSON.stringify([{ FormationType: '4-2-3-1', FormationUsedPercentage: 60 }]) } } } as unknown as FmSnapshot;
    expect(opponentReport(s2)!.formations.ip[0]!.form).toBe('4-2-3-1');
  });

  it('sans lecture adverse, pas de rapport', () => {
    expect(opponentReport({ custom: { equipe: { advRapportDispo: 'False' } } } as unknown as FmSnapshot)).toBeNull();
    expect(opponentReport({} as FmSnapshot)).toBeNull();
  });

  it('compte les attaquants', () => {
    expect(strikersOf('4-2-3-1')).toBe(1);
    expect(strikersOf('4-4-2')).toBe(2);
    expect(strikersOf(null)).toBeNull();
  });
});
