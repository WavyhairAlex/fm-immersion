import { describe, expect, it } from 'vitest';
import { competitionRules, DEFAULT_RULES, isFriendly, plannedSubs, ruleChecks, type FmPlayer, type FormationPlan } from '../src';

const pl = (id: string, age: number) => ({ id, name: id, age, attributes: {} }) as unknown as FmPlayer;
const plan = (ages: number[]) => ({ slots: ages.map((a, i) => ({ pos: 'MC', player: pl(`p${i}`, a) })), subs: [] }) as unknown as FormationPlan;

describe('règles de compétition', () => {
  it('2. liga slovaque : moins de 21 ans exigé, 5 hors UE au plus', () => {
    const r = competitionRules('2. liga');
    expect(r).toMatchObject({ subs: 5, nonEuMax: 5, u21Xi: 1, u21Squad: 1 });
    expect(competitionRules('Coupe inconnue')).toBe(DEFAULT_RULES);
  });

  it('garde 2 changements de marge', () => {
    expect(plannedSubs({ ...DEFAULT_RULES, subs: 5 })).toBe(3);
    expect(plannedSubs({ ...DEFAULT_RULES, subs: 3 })).toBe(1);
  });

  it('signale un onze sans moins de 21 ans', () => {
    const r = competitionRules('2. liga');
    const bad = ruleChecks(plan(Array(11).fill(25)), r, []);
    expect(bad.find((c) => c.id === 'u21Xi')).toMatchObject({ status: 'bad', have: 0 });
    const ok = ruleChecks(plan([19, ...Array(10).fill(25)]), r, []);
    expect(ok.find((c) => c.id === 'u21Xi')?.status).toBe('ok');
    expect(ok.find((c) => c.id === 'nonEu')?.status).toBe('unknown');
  });
});

describe('nom de la 2. liga dans FM27', () => {
  it('reconnaît « 2. slovenská futbalová liga »', () => {
    expect(competitionRules('2. slovenská futbalová liga').u21Xi).toBe(1);
  });
});

describe('matchs amicaux', () => {
  it('reconnaît « Match Amical » et ses variantes, pas le championnat', () => {
    expect(isFriendly('Match Amical')).toBe(true);
    expect(isFriendly('Friendly')).toBe(true);
    expect(isFriendly('2. liga')).toBe(false);
    expect(isFriendly(null)).toBe(false);
  });
});
