import { describe, expect, it } from 'vitest';
import { parseGameRequest, playerForRequest } from '../src';

const now = Date.parse('2026-11-11T17:40:00Z');
const req = (o: Record<string, unknown> = {}) =>
  JSON.stringify({ schema: 'fmimmersion-demande/1', id: 'a1', action: 'ouvrir', nom: 'Dávid Húska', quand: '2026-11-11T17:39:30Z', ...o });

describe('demande venue de FM27', () => {
  it('lit une demande récente et valide', () => {
    expect(parseGameRequest(req(), now)).toMatchObject({ id: 'a1', action: 'ouvrir', nom: 'Dávid Húska' });
  });

  it('ignore une demande trop vieille, mal formée ou inconnue', () => {
    expect(parseGameRequest(req({ quand: '2026-11-11T17:30:00Z' }), now)).toBeNull();
    expect(parseGameRequest(req({ action: 'transferer' }), now)).toBeNull();
    expect(parseGameRequest('{', now)).toBeNull();
  });

  it('retrouve le joueur de la fiche, accents et initiale compris', () => {
    const players = [
      { id: '1', name: 'Dávid Húska' },
      { id: '2', name: 'Marek Húska' },
      { id: '3', name: 'Ján Novák' },
    ];
    expect(playerForRequest(players, 'David Huska')?.id).toBe('1');
    expect(playerForRequest(players, 'J. Novák')?.id).toBe('3');
    expect(playerForRequest(players, 'Húska')).toBeNull();
    expect(playerForRequest(players, 'Inconnu')).toBeNull();
  });
});
