import { describe, expect, it } from 'vitest';
import { loanedOutIds, loans, shortlist } from '../src';
import type { FmSnapshot } from '../src/snapshot';

const snap = {
  schema: 'archivix/1', game: 'FM27', club: 'Malženice', gameDate: '2027-02-16', players: [],
  shortlist: [
    { id: 1, name: 'Prêté', positionsText: 'M (C)', apps: 12, goals: 2, avgRating: 7.1, club: 'Senica', sources: ['pretes'] },
    { id: 2, name: 'Prêté muet', positionsText: 'BT', apps: 1, club: 'Malženice', sources: ['pretes'] },
    { id: 3, name: 'Cible', positionsText: 'D (C)', club: 'Trnava', sources: ['selection'] },
    { id: 4, name: 'Les deux', positionsText: 'GB', club: 'Žilina', sources: ['pretes', 'cibles'] },
  ],
} as unknown as FmSnapshot;

describe('joueurs prêtés lus comme une liste du jeu', () => {
  it('donne club d’accueil, matchs et verdict', () => {
    const l = loans(snap);
    expect(l.map((x) => x.player.name)).toEqual(['Prêté', 'Prêté muet', 'Les deux']);
    expect(l[0]).toMatchObject({ club: 'Senica', apps: 12, rating: 7.1, verdict: 'shines' });
    expect(l[1]).toMatchObject({ club: null, verdict: 'idle' });
  });
  it('les sort des cibles et de l’effectif', () => {
    expect(shortlist(snap).map((t) => t.name)).toEqual(['Cible', 'Les deux']);
    expect(shortlist(snap).find((t) => t.name === 'Les deux')!.sources).toEqual(['cibles']);
    expect([...loanedOutIds(snap)].sort()).toEqual(['1', '2', '4']);
  });
});
