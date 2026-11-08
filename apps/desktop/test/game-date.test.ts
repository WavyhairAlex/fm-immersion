import { describe, expect, it } from 'vitest';
import { shownGameDate } from '../src/lib/career';

describe('shownGameDate', () => {
  const snap = { gameDate: '2027-08-24', club: 'Malženice' };
  it("prend la date du jeu quand elle est plus récente que l'instantané", () => {
    expect(shownGameDate(snap, { gameDate: '2027-08-27', club: 'Malženice' })).toBe('2027-08-27');
  });
  it("garde l'instantané pour un autre club ou une date plus ancienne", () => {
    expect(shownGameDate(snap, { gameDate: '2027-08-27', club: 'Nitra' })).toBe('2027-08-24');
    expect(shownGameDate(snap, { gameDate: '2027-08-20', club: 'Malženice' })).toBe('2027-08-24');
    expect(shownGameDate(snap, null)).toBe('2027-08-24');
  });
});
