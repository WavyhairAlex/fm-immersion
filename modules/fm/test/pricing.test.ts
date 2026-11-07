import { describe, expect, it } from 'vitest';
import type { FmPlayer } from '../src/player';
import { askingPrice, roundPrice } from '../src/pricing';

const pl = (o: Partial<FmPlayer>) => ({ id: 'x', name: 'x', value: 400_000, age: 26, stars: null, ca: null, pa: null, ...o }) as FmPlayer;

describe('prix conseillé', () => {
  it('arrondit à deux chiffres', () => {
    expect(roundPrice(437_500)).toBe(440_000);
    expect(roundPrice(1234)).toBe(1200);
  });
  it('long contrat : prix au-dessus de la valeur', () => {
    expect(askingPrice(pl({}), 30)).toMatchObject({ ask: 600_000, floor: 420_000, factors: ['longContract'] });
  });
  it('fin de contrat et vétéran : prix bradé', () => {
    expect(askingPrice(pl({ age: 33 }), 3)).toMatchObject({ ask: 170_000, factors: ['expiring', 'veteran'] });
  });
  it('jeune à gros potentiel', () => {
    expect(askingPrice(pl({ age: 20, stars: { current: 2, potential: 4.5 } }), 18)!.factors).toEqual(['midContract', 'young', 'prospect']);
    expect(askingPrice(pl({ age: 20, stars: { current: 2, potential: 4.5 } }), 18)!.ask).toBe(720_000);
  });
  it('sans valeur : rien', () => {
    expect(askingPrice(pl({ value: null }), 12)).toBeNull();
  });
});
