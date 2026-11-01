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
    expect(r.squad).toEqual([{ name: 'Rickard Johansson', positions: 'D (C), MD, M (C)', stars: null }]);
  });

  it('donne des conseils qui répondent aux données lues', () => {
    const ids = opponentReport(snap)!.advice.map((a) => a.id + (a.name ? `:${a.name}` : ''));
    expect(ids).toEqual(['buildShort', 'rotate', 'twoStrikers', 'betweenLines', 'markCreator:Sylejman Hoxhaj', 'watchScorer:Anton Engelbrektsson']);
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
