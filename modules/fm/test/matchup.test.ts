import { describe, expect, it } from 'vitest';
import { CHANGE_FORM, formationFamily, matchupOf, mergeReference, rankForMatch, type FormationPlan, type OpponentReport } from '../src';

const styles = mergeReference(undefined).styles;
const style = styles[0]!;
// Herrestads AIF, lu le 01/11/2026 : 4-4-2 avec ballon, 4-4-2 2MD sans ballon, pressing rare.
const opp = {
  manager: { formation: '4-4-2', pressing: 'Moins souvent', mentality: 'Équilibré' },
  formations: {
    ip: [{ form: '4-4-2', pct: 100, minutes: 1033, chances: 27, every: 38 }],
    oop: [{ form: '4-4-2 2MD', pct: 72, minutes: 741, chances: 30, every: 24 }],
  },
} as unknown as OpponentReport;

describe("tactique du match (affrontement)", () => {
  it('contre deux attaquants, deux milieux défensifs valent mieux qu’un', () => {
    const a = matchupOf('4-2-3-1', style, opp);
    const b = matchupOf('4-3-3', style, opp);
    expect(a.reasons.map((r) => r.id)).toContain('coverStrikers');
    expect(a.bonus).toBeGreaterThan(b.bonus);
  });

  it('utilise les formations affrontées quand le jeu les donne', () => {
    const measured = {
      ...opp,
      formations: {
        ...opp.formations,
        faced: [
          { form: '4-2-3-1 MD MO', pct: 30, minutes: 300, chances: 20, every: 15 },
          { form: '4-4-2', pct: 70, minutes: 700, chances: 20, every: 35 },
        ],
      },
    } as unknown as OpponentReport;
    const r = matchupOf('4-2-3-1', style, measured).reasons.find((x) => x.id === 'concedesMore');
    expect(r?.every).toBe(15);
    expect(r!.value).toBeGreaterThan(0);
    // Moins de 270 min observées : rien de mesuré.
    expect(matchupOf('4-3-3', style, measured).reasons.some((x) => x.id.startsWith('concedes'))).toBe(false);
  });

  it('une base, des ajustements : pas de changement de schéma sans faille mesurée', () => {
    const plans = (scores: Record<string, number>) => Object.entries(scores).map(([form, score]) => ({ form, score }) as unknown as FormationPlan);
    const ranked = [{ style, plans: plans({ '4-3-3': 15, '4-2-3-1': 14.9 }) }];
    const base = { style: style.id, form: '4-3-3' };
    // Sans base, le 4-2-3-1 passe devant grâce au profil adverse ; avec la base, il n'est même pas proposé.
    expect(rankForMatch(ranked, opp)[0]!.form).toBe('4-2-3-1');
    const kept = rankForMatch(ranked, opp, base);
    expect(kept.map((m) => m.form)).toEqual(['4-3-3']);
    // Faille mesurée contre le 4-2-3-1 : proposé, coût du changement déduit.
    const measured = { ...opp, formations: { ...opp.formations, faced: [
      { form: '4-2-3-1', pct: 30, minutes: 300, chances: 20, every: 15 },
      { form: '4-4-2', pct: 70, minutes: 700, chances: 20, every: 35 },
    ] } } as unknown as OpponentReport;
    const m = rankForMatch(ranked, measured, base).find((x) => x.form === '4-2-3-1')!;
    expect(m.reasons.map((r) => r.id)).toContain('changeForm');
    expect(m.bonus).toBeCloseTo(matchupOf('4-2-3-1', style, measured).bonus - CHANGE_FORM, 5);
  });

  it('famille de formation', () => {
    expect(formationFamily('4-2-3-1 MD MO Jeu large')).toBe('4-2-3-1');
    expect(formationFamily('4-4-2 2MD')).toBe('4-4-2');
  });
});
