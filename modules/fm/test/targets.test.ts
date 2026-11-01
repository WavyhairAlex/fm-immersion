import { describe, expect, it } from 'vitest';
import { mergeTargets, shortlist, storedTargets, type TargetRecord } from '../src/targets';
import type { FmSnapshot } from '../src/snapshot';

const snap = (gameDate: string, shortlist?: unknown[]): FmSnapshot => ({ schema: 'archivix/1', game: 'FM27', club: 'V', gameDate, players: [], ...(shortlist ? { shortlist } : {}) });
const cible = {
  id: 2001,
  name: 'Lucas Berg',
  age: 20,
  positionsText: 'M (C), MO (C)',
  club: 'IK Oddevold',
  attributes: { Passing: { min: 12, max: 15 }, Vision: 13 },
  scout: { knowledge: 72, scoutCurrentStars: { MinValue: 8, MaxValue: 10 }, scoutPotentialStars: { MinValue: 14, MaxValue: 16 }, recommendationText: 'Bonne recrue', minValue: 20000, maxValue: 45000 },
  sources: ['listeSuivi', 'cibles'],
};

describe('cibles du mercato', () => {
  it("normalise une cible du plugin comme un joueur de l'effectif, avec l'avis du recrutement", () => {
    const [t] = shortlist(snap('2026-09-01', [cible]));
    expect(t).toMatchObject({ id: 't2001', name: 'Lucas Berg', club: 'IK Oddevold', positions: ['MC', 'MOC'], sources: ['listeSuivi', 'cibles'] });
    expect(t!.attributes).toEqual({ Passing: 13.5, Vision: 13 });
    expect(t!.scout).toMatchObject({ knowledge: 72, recommendation: 'Bonne recrue', value: { min: 20000, max: 45000, mid: 32500 } });
    expect(t!.stars).toEqual({ current: 2.5, potential: 4 });
  });

  it("n'écrit rien quand l'instantané n'a pas de cibles", () => {
    expect(mergeTargets([], snap('2026-09-01'))).toBeNull();
  });

  it('suit les entrées, les sorties de liste, et ignore un instantané plus ancien', () => {
    const first = mergeTargets([], snap('2026-09-01', [cible]))!;
    expect(first.map((r) => [r.playerId, r.firstSeen, r.lastSeen, r.inList])).toEqual([['2001', '2026-09-01', '2026-09-01', true]]);
    const known: TargetRecord[] = first.map((r) => ({ ...r, dismissed: true }));

    const later = mergeTargets(known, snap('2026-09-10', [{ ...cible, club: 'GAIS' }]))!;
    expect(later[0]).toMatchObject({ firstSeen: '2026-09-01', lastSeen: '2026-09-10', club: 'GAIS', dismissed: true });

    const gone = mergeTargets(later, snap('2026-09-12', []))!;
    expect(gone[0]).toMatchObject({ inList: false, lastSeen: '2026-09-10' });

    expect(mergeTargets(later, snap('2026-09-05', []))).toEqual([]);
    expect(storedTargets(gone)[0]).toMatchObject({ id: 't2001', inList: false, dismissed: true, club: 'GAIS' });
  });
});
