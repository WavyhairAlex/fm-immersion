import { describe, expect, it } from 'vitest';
import type { CareerSpell } from '../src/career';
import { lifeOutcomes, relationScenes, type LifeResult } from '../src/coach-relations';
import { sceneState } from '../src/coach-scenes';

const spell = (club: string, start: string, end: string, current: boolean, extra: Partial<CareerSpell> = {}): CareerSpell =>
  ({ club, start, end, current, reason: current ? null : 'sacked', country: 'BY', countrySource: null, seasons: [], trophies: [], awards: [], bestFinish: null, ...extra }) as unknown as CareerSpell;

const slutsk = spell('FC Slutsk', '2026-10-14', '2027-11-11', true, {
  seasons: [{ label: '2026/27', ended: true, position: 2 } as CareerSpell['seasons'][number], { label: '2027/28', ended: false, position: null } as CareerSpell['seasons'][number]],
  trophies: [{ season: '2026/27', competition: 'Kubok Belarusi' }],
  awards: [{ month: '2027-05', competition: 'CS de Biélorussie' }],
});
const results: LifeResult[] = [
  { date: '2027-05-20', outcome: 'W', opponent: 'Dynamo Brest', competition: 'Vysshaya Liga' },
  { date: '2027-08-01', outcome: 'L', opponent: 'BATE', competition: 'Vysshaya Liga' },
  { date: '2027-08-08', outcome: 'L', opponent: 'Neman', competition: 'Vysshaya Liga' },
  { date: '2027-08-15', outcome: 'L', opponent: 'Isloch', competition: 'Vysshaya Liga' },
  { date: '2027-08-22', outcome: 'L', opponent: 'Torpedo', competition: 'Vysshaya Liga' },
];
const life = { partner: { name: 'Julie' } };

describe('relationScenes', () => {
  it("tire les messages des proches de la partie : promesse, objectifs, prix, offre, série de défaites", () => {
    const sc = relationScenes([slutsk], life, '2027-11-11', results);
    expect(sc.map((s) => s.kind).sort()).toEqual(['award', 'objectives', 'offer', 'promise', 'streak'].sort());
    const offer = sc.find((s) => s.kind === 'offer')!;
    // Une offre par saison : celle du prix de mai (1er juin + 9 jours), le titre de la même saison n'en refait pas.
    expect(offer.date).toBe('2027-06-10');
    expect(offer.rival).toBe('Dynamo Brest');
    expect(offer.dilemma).toBe(true);
    // Quatre défaites d'affilée : un seul rendez-vous avec le président, au troisième match perdu.
    expect(sc.find((s) => s.kind === 'streak')!.date).toBe('2027-08-15');
    expect(sc.find((s) => s.kind === 'award')!.date).toBe('2027-06-01');
  });

  it('pas de conjoint : pas de promesse ; rien après la date de jeu', () => {
    const sc = relationScenes([slutsk], undefined, '2026-12-01', results);
    expect(sc.map((s) => s.kind)).toEqual(['objectives']);
  });

  it('une promesse revient le jour du trophée, puis en rappel si le coach repousse', () => {
    const answers = { 'promise|FC Slutsk|2026-10-14': { choice: 'promise', date: '2026-10-14' } };
    const sc = relationScenes([slutsk], { ...life, answers }, '2027-11-11', results);
    const due = sc.find((s) => s.kind === 'promiseDue')!;
    expect(due.date).toBe('2027-07-01');
    expect(due.recall).toEqual({ id: 'promise|FC Slutsk|2026-10-14', choice: 'promise', date: '2026-10-14' });
    const later = relationScenes([slutsk], { ...life, answers: { ...answers, [due.id]: { choice: 'later', date: '2027-07-01' } } }, '2027-11-11', results);
    expect(later.find((s) => s.kind === 'reminder')!.date).toBe('2027-08-05');
  });

  it("offre écoutée : la presse l'apprend, et le président la ressort après trois défaites", () => {
    const answers = { 'offer|FC Slutsk|2026': { choice: 'listen', date: '2027-06-10' } };
    const sc = relationScenes([slutsk], { answers }, '2027-11-11', results);
    expect(sc.find((s) => s.kind === 'leak')!.date).toBe('2027-06-24');
    const streak = sc.find((s) => s.kind === 'streak')!;
    expect(streak.rival).toBe('Dynamo Brest');
    expect(streak.recall?.choice).toBe('listen');
  });

  it('deux promesses non tenues : elle parle de partir', () => {
    const two = spell('FC Slutsk', '2026-10-14', '2029-08-01', true, {
      trophies: [
        { season: '2026/27', competition: 'Kubok' },
        { season: '2027/28', competition: 'Kubok' },
      ],
    });
    const next = spell('Neman', '2029-08-10', '2030-01-01', true, { trophies: [{ season: '2029/30', competition: 'Kubok' }] });
    const answers = {
      'promise|FC Slutsk|2026-10-14': { choice: 'promise', date: '2026-10-14' },
      'promiseDue|FC Slutsk|2026-10-14': { choice: 'later', date: '2027-07-01' },
      'reminder|FC Slutsk|2026-10-14': { choice: 'again', date: '2027-08-05' },
      'promise|Neman|2029-08-10': { choice: 'promise', date: '2029-08-10' },
      'promiseDue|Neman|2029-08-10': { choice: 'club', date: '2029-12-31' },
    };
    const sc = relationScenes([{ ...two, current: false }, next], { ...life, answers }, '2031-01-01', []);
    const u = sc.find((s) => s.kind === 'ultimatum');
    expect(u?.recall?.id).toBe('promiseDue|Neman|2029-08-10');
  });
});

describe('lifeOutcomes et jauges', () => {
  it("objectif vérifié au classement : top 3 tenu (2e), titre manqué ; titres et prix font monter l'estime", () => {
    const kept = lifeOutcomes([slutsk], { answers: { 'objectives|FC Slutsk|2026-10-14': { choice: 'top3', date: '2026-10-16' } } }, '2027-11-11');
    expect(kept.map((o) => [o.kind, o.delta])).toEqual([
      ['award', 3],
      ['trophy', 8],
      ['objectiveKept', 15],
    ]);
    const missed = lifeOutcomes([slutsk], { answers: { 'objectives|FC Slutsk|2026-10-14': { choice: 'title', date: '2026-10-16' } } }, '2027-11-11');
    expect(missed.at(-1)!.kind).toBe('objectiveMissed');
  });

  it("jauges des proches : effets des réponses et des faits du jeu, l'adjoint et le président repartent à chaque club", () => {
    const old = spell('Vänersborgs IF', '2026-08-29', '2026-10-04', false, { trophies: [{ season: '2026', competition: 'X' }] });
    const answers = {
      'objectives|FC Slutsk|2026-10-14': { choice: 'top3', date: '2026-10-16' },
      'objectives|Vänersborgs IF|2026-08-29': { choice: 'title', date: '2026-08-30' },
      'award|FC Slutsk|2027-05': { choice: 'players', date: '2027-06-01' },
      'offer|FC Slutsk|2026': { choice: 'refuse', date: '2027-06-10' },
      'promise|FC Slutsk|2026-10-14': { choice: 'promise', date: '2026-10-14' },
    };
    const st = sceneState([old, slutsk], { ...life, answers }, '2027-11-11', { results });
    // Président de Slutsk : 60 + 2 (top 3) + 3 (prix) + 8 (Coupe) + 15 (objectif tenu) ; rien de Vänersborgs.
    expect(st.gauges.esteem).toBe(88);
    // Adjoint : +8 (mérite aux joueurs) +8 (refus de l'offre).
    expect(st.gauges.trust).toBe(76);
    expect(st.gauges.patience).toBe(54);
    expect(st.gauges.press).toBe(66);
    expect(st.gauges.harmony).toBe(60 + 5 + 6);
    expect(st.history.esteem.map((h) => h.value)).toEqual([60, 62, 65, 73, 88]);
    expect(st.memories.representative?.choice.key).toBe('refuse');
    // La promesse du week-end attend son trophée... déjà gagné : le rappel est en attente, la promesse reste ouverte.
    expect(st.promises.map((p) => p.kind)).toEqual(['trophyWeekend']);
    expect(st.pending.some((s) => s.kind === 'promiseDue')).toBe(true);
    // L'objectif vérifié au classement n'est plus une promesse ouverte.
    expect(st.promises.some((p) => p.kind === 'top3')).toBe(false);
  });
});
