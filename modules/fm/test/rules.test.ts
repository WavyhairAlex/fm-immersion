import { describe, expect, it } from 'vitest';
import { competitionKind, competitionRules, competitionWeight, DEFAULT_RULES, isCongested, isFriendly, plannedSubs, ruleChecks, eligibilityOf, homeGrownOf, type FmSnapshot, type FmPlayer, type FormationPlan } from '../src';

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

describe('importance des compétitions', () => {
  it('reconnaît la nature d’une compétition à son nom', () => {
    expect(competitionKind('2. liga')).toBe('league');
    expect(competitionKind('Ligue 1 McDonald’s')).toBe('league');
    expect(competitionKind('Slovnaft Cup')).toBe('cup');
    expect(competitionKind('Coupe de France')).toBe('cup');
    expect(competitionKind('UEFA Conference League')).toBe('europe');
    expect(competitionKind('Match Amical')).toBe('friendly');
    expect(competitionKind(null)).toBe('other');
  });

  it('coupe et amical : faire tourner ; championnat prioritaire sauf calendrier chargé', () => {
    expect(competitionWeight('Slovnaft Cup')).toMatchObject({ importance: 'normal', rotate: true, reason: 'cup' });
    expect(competitionWeight('Match Amical')).toMatchObject({ importance: 'low', rotate: true, reason: 'friendly' });
    expect(competitionWeight('2. liga')).toMatchObject({ importance: 'high', rotate: false, reason: null });
    expect(competitionWeight('2. liga', { congested: true })).toMatchObject({ importance: 'high', rotate: true, reason: 'congested' });
  });

  it('calendrier chargé : deux matchs à venir à 3 jours ou moins', () => {
    const fx = [{ date: '2027-08-01' }, { date: '2027-08-07' }, { date: '2027-08-10' }];
    expect(isCongested(fx, '2027-07-30')).toBe(false);
    expect(isCongested(fx, '2027-08-05')).toBe(true);
    expect(isCongested(fx, '2027-08-09')).toBe(false);
  });
});

describe('admissibilité lue dans le jeu', () => {
  const pl = (id: string, age: number) => ({ id, name: id, age, positions: ['MC'], attributes: {} }) as unknown as FmPlayer;
  const plan = (ps: FmPlayer[]) => ({ slots: ps.map((player) => ({ pos: 'MC', player })), subs: [] }) as unknown as FormationPlan;
  const snap = (rows: Record<string, Record<string, unknown>>) => ({ players: [], custom: { joueurs: rows } }) as unknown as FmSnapshot;

  it('lit estUE et formeAuPays par joueur', () => {
    const e = eligibilityOf(snap({ a: { id: 'a', estUE: 'True', formeAuPays: 'Formé au club' }, b: { id: 'b', estUE: 'False', formeAuPays: 'Non formé au pays' }, c: { id: 'c', risqueBlessureGlobal: 3 } }));
    expect(e.get('a')).toEqual({ eu: true, homeGrown: true, club: true });
    expect(e.get('b')).toEqual({ eu: false, homeGrown: false, club: false });
    expect(e.has('c')).toBe(false);
    expect(homeGrownOf('Formé au pays')).toBe(true);
    expect(homeGrownOf('Pas formé au pays')).toBe(false);
    expect(homeGrownOf(null)).toBeNull();
  });

  it('compte les hors UE et les jeunes formés au pays quand tout est lu', () => {
    const r = competitionRules('2. liga');
    const xi = [pl('y', 19), ...Array.from({ length: 10 }, (_, i) => pl(`p${i}`, 25))];
    const rows: Record<string, Record<string, unknown>> = {};
    for (const p of xi) rows[p.id as string] = { id: p.id, estUE: p.id === 'p0' || p.id === 'p1' ? 'False' : 'True', formeAuPays: p.id === 'y' ? 'Formé au pays' : 'Formé à l’étranger' };
    const checks = ruleChecks(plan(xi), r, [], eligibilityOf(snap(rows)));
    expect(checks.find((c) => c.id === 'nonEu')).toMatchObject({ status: 'ok', have: 2, verified: true });
    expect(checks.find((c) => c.id === 'u21Xi')).toMatchObject({ status: 'ok', have: 1, verified: true });
    // Le jeune n'est pas formé au pays : la règle n'est plus respectée.
    rows.y!.formeAuPays = 'Formé à l’étranger';
    const bad = ruleChecks(plan(xi), r, [], eligibilityOf(snap(rows)));
    expect(bad.find((c) => c.id === 'u21Xi')).toMatchObject({ status: 'bad', have: 0, verified: true });
    // Un joueur sans lecture : retour à l'âge seul, hors UE inconnu.
    delete rows.p3;
    const partial = ruleChecks(plan(xi), r, [], eligibilityOf(snap(rows)));
    expect(partial.find((c) => c.id === 'nonEu')).toMatchObject({ status: 'unknown', verified: false });
    expect(partial.find((c) => c.id === 'u21Xi')).toMatchObject({ status: 'ok', verified: false });
  });
});
