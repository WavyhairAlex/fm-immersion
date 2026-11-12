import { describe, expect, it } from 'vitest';
import { registrationCheck, registrationRules, signingBlock, regStatus, type FmPlayer, type RegStatus } from '../src';

const pl = (id: string, age: number) => ({ id, age }) as unknown as FmPlayer;
const st = (homeGrown: RegStatus['homeGrown'], eu: boolean | null = true): RegStatus => ({ eu, homeGrown, estimated: false });

describe('liste d\'inscription (règles de FM Notebook)', () => {
  it('reconnaît les grands championnats, générique ailleurs', () => {
    expect(registrationRules('Premier League').key).toBe('EN');
    expect(registrationRules('LaLiga EA Sports').key).toBe('ES');
    expect(registrationRules('Niké liga').key).toBe('generic');
  });
  it('la liste se réduit quand il manque des formés localement, les moins de 21 ans sont à part', () => {
    const players = [...Array.from({ length: 20 }, (_, i) => pl(`s${i}`, 25)), pl('j', 19)];
    // 5 formés localement sur 20 seniors : 17 + 5 = 22 places.
    const c = registrationCheck(players, (p) => st(Number(p.id.slice(1)) < 5 ? 'nation' : false), registrationRules('Premier League'));
    expect(c).toMatchObject({ seniors: 20, u21: 1, homeGrown: 5, maxSeniors: 22, free: 2, issues: ['hgShort'] });
  });
  it('bloque une recrue hors UE au-delà du plafond espagnol, jamais un moins de 21 ans', () => {
    const players = Array.from({ length: 10 }, (_, i) => pl(`s${i}`, 25));
    const c = registrationCheck(players, (p) => st('nation', Number(p.id.slice(1)) >= 3), registrationRules('LaLiga'));
    expect(c.nonEu).toBe(3);
    expect(signingBlock(c, st(false, false), 24)).toBe('nonEu');
    expect(signingBlock(c, st(false, false), 20)).toBeNull();
  });
  it('déduit l\'UE et la formation de la nationalité sans lecture du jeu', () => {
    expect(regStatus({ id: '1', nationality: 'brésilien' }, new Map(), 'ES')).toMatchObject({ eu: false, homeGrown: false, estimated: true });
    expect(regStatus({ id: '1', nationality: 'brésilien, portugais' }, new Map(), 'ES').eu).toBe(true);
  });
});
