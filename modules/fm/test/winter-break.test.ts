import { describe, expect, it } from 'vitest';
import { autoPhase, detectWinterBreak } from '../src';

describe('trêve déduite du calendrier', () => {
  it('cinq semaines sans match en hiver : trêve du lendemain du dernier match à la reprise', () => {
    const wb = detectWinterBreak('2027-11-18', ['2028-02-26', '2028-03-05'], '2027-11-13');
    expect(wb).toEqual({ from: '11-14', to: '02-26' });
    expect(autoPhase('2027-11-22', 8, wb).phase).toBe('R');
    // Les quatre dernières semaines redeviennent une mini-présaison.
    expect(autoPhase('2028-02-14', 8, wb).phase).toBe('P');
  });

  it('calendrier normal, trou hors hiver ou pas de match à venir : pas de trêve', () => {
    expect(detectWinterBreak('2027-11-18', ['2027-11-21', '2027-11-28'], '2027-11-13')).toBeNull();
    expect(detectWinterBreak('2027-06-01', ['2027-08-01'], '2027-05-28')).toBeNull();
    expect(detectWinterBreak('2027-11-18', [], '2027-11-13')).toBeNull();
  });
});
