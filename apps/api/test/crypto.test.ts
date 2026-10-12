import { describe, expect, it } from 'vitest';
import {
  generateLoginCode,
  generateSessionToken,
  hashLoginCode,
  hashSessionToken,
  safeEqualHex,
} from '../src/lib/crypto';

const SECRET = 'x'.repeat(32);

describe('codes de connexion', () => {
  it('fait toujours 6 chiffres', () => {
    for (let i = 0; i < 500; i++) expect(generateLoginCode()).toMatch(/^\d{6}$/);
  });

  it('est lié à l’adresse email', () => {
    const a = hashLoginCode(SECRET, 'a@simloom.app', '123456');
    const b = hashLoginCode(SECRET, 'b@simloom.app', '123456');
    expect(a).not.toBe(b);
    expect(safeEqualHex(a, hashLoginCode(SECRET, 'a@simloom.app', '123456'))).toBe(true);
    expect(safeEqualHex(a, b)).toBe(false);
  });
});

describe('sessions', () => {
  it('génère des jetons uniques et ne stocke que le hash', () => {
    const t1 = generateSessionToken();
    const t2 = generateSessionToken();
    expect(t1).not.toBe(t2);
    expect(hashSessionToken(t1)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSessionToken(t1)).not.toContain(t1);
  });
});
