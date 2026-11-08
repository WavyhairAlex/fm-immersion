import { describe, expect, it } from 'vitest';
import { bigMatchOf, type FmSnapshot } from '../src';

const snap = (next: Record<string, unknown>, equipe: Record<string, unknown> = {}) =>
  ({
    schema: 'archivix/1',
    club: 'Malženice',
    gameDate: '2027-08-29',
    players: [
      { id: 1, name: 'Marek Fábry', goals: 6 },
      { id: 2, name: 'Adam Mojžiš', goals: 2 },
    ],
    nextMatch: { opponent: 'Matador Púchov', inDays: 'Dans 3 jours', location: 'Domicile', ...next },
    custom: { equipe: { classementPosition: 4, advClassement: '3e', advButeur: 'Ján Novák', advButs: 5, advEntraineur: 'Peter Lérant', ...equipe } },
  }) as unknown as FmSnapshot;

describe('affiche du choc', () => {
  it('coupe : affiche quelques jours avant, avec les buteurs à suivre', () => {
    const m = bigMatchOf(snap({ competition: 'Slovenský pohár' }));
    expect(m).toMatchObject({ kind: 'cup', date: '2027-09-01', inDays: 3, opponent: 'Matador Púchov', home: true, position: null });
    expect(m?.ourScorer).toEqual({ id: '1', name: 'Marek Fábry', goals: 6 });
    expect(m?.theirScorer).toEqual({ name: 'Ján Novák', goals: 5 });
    expect(m?.opponentManager).toBe('Peter Lérant');
  });

  it('championnat : contre le leader, duel direct en haut du tableau, pas un match ordinaire', () => {
    const league = { competition: '2. slovenská futbalová liga' };
    expect(bigMatchOf(snap(league, { advClassement: '1er' }))?.kind).toBe('top');
    expect(bigMatchOf(snap(league, { classementPosition: 1, advClassement: '3e' }))?.kind).toBe('top');
    expect(bigMatchOf(snap(league))).toMatchObject({ kind: 'rival', position: 4, opponentPosition: 3 });
    expect(bigMatchOf(snap(league, { advClassement: '16e' }))).toBeNull();
    expect(bigMatchOf(snap(league, { classementPosition: 8, advClassement: '6e' }))).toBeNull();
  });

  it("rien pour un amical ou un match trop lointain", () => {
    expect(bigMatchOf(snap({ competition: 'Match Amical' }))).toBeNull();
    expect(bigMatchOf(snap({ competition: 'Slovenský pohár', inDays: 'Dans 8 jours' }))).toBeNull();
  });
});
