import { describe, expect, it } from 'vitest';
import { formationFamily, matchupOf, mergeReference, type OpponentReport } from '../src';

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
    // Moins de 180 min observées : rien de mesuré.
    expect(matchupOf('4-3-3', style, measured).reasons.some((x) => x.id.startsWith('concedes'))).toBe(false);
  });

  it('famille de formation', () => {
    expect(formationFamily('4-2-3-1 MD MO Jeu large')).toBe('4-2-3-1');
    expect(formationFamily('4-4-2 2MD')).toBe('4-4-2');
  });
});
