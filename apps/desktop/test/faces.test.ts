import { describe, expect, it } from 'vitest';
import { packDate, pcState, v2Count } from '../src/lib/faces';

describe('visages, mode joueur', () => {
  it('date courte du pack à partir de sa version', () => {
    expect(packDate('2026-11-08 15:04:50', 'fr')).toBe('08/11');
    expect(packDate('v2-beta', 'fr')).toBe('v2-beta');
    expect(packDate(null, 'fr')).toBe('?');
  });

  it('compte les portraits V2 et résume l’état du PC', () => {
    expect(v2Count({ version: null, a2b: 2668, d2: 1054, v1: 10278, crc: 1, size: 1, sha256: null, url: null })).toBe(3722);
    expect(pcState('photorealCustom', true)).toBe('update');
    expect(pcState('original', false)).toBe('none');
  });
});
