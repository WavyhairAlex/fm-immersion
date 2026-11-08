import type { GazetteIssue, GazetteStory } from '@fm-immersion/module-fm';
import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import { articleText, climateOf, editorialText, figuresLine, storyText } from '../src/lib/gazette-text';

const t = ((k: string, o?: Record<string, unknown>) => (o ? `${k} ${JSON.stringify(o)}` : k)) as unknown as TFunction;

describe('textes de la gazette', () => {
  it('met les chiffres du jeu en une ligne, seulement quand ils existent', () => {
    expect(figuresLine(t, { possession: 47, shots: 5, shotsOpp: 12, onTarget: 3, onTargetOpp: 5, xg: 1.0615, xgOpp: 0.4936 }, 'fr')).toBe(
      'gazette.figures.possession {"us":47} · gazette.figures.shots {"us":"5gazette.figures.onTarget {\\"count\\":3}","them":"12gazette.figures.onTarget {\\"count\\":5}"} · gazette.figures.xg {"us":"1,06","them":"0,49"}',
    );
    expect(figuresLine(t, { possession: null, shots: null }, 'fr')).toBeNull();
  });

  it('écrit la série et la présentation de l’adversaire', () => {
    const streak: GazetteStory = { kind: 'streak', weight: 50, params: { outcome: 'winless', count: 5 } };
    expect(storyText(t, 'Malženice', streak).title).toBe('gazette.story.streak.title_winless {"club":"Malženice","outcome":"winless","count":5}');
    const next: GazetteStory = { kind: 'nextMatch', weight: 10, params: { opponent: 'Nitra', competition: '2. liga', location: 'Domicile', inDays: null, threat: 'Serré.', position: '12e', manager: 'V. Kúkoľ', formation: '4-2-4', scorer: 'M. Klec', scorerGoals: 3 } };
    const body = storyText(t, 'Malženice', next).body;
    expect(body).toContain('2. liga · Domicile');
    expect(body).toContain('gazette.story.nextMatch.previewPosition {"position":"12e"}');
    expect(body).toContain('previewManagerFormation');
    expect(body).toContain('previewScorer {"scorer":"M. Klec","count":3}');
    expect(body.endsWith('Serré.')).toBe(true);
  });

  it('écrit un article pour un match à la une : issue, buteurs, lecture des chiffres, homme du match, série, prochain match', () => {
    const headline: GazetteStory = {
      kind: 'result',
      weight: 60,
      params: { outcome: 'W', opponent: 'Nitra', home: 1, goalsFor: 1, goalsAgainst: 0, scorers: 'Bukata', best: 'Bukata', rating: 8.05, competition: '2. liga', friendly: 0, possession: 47, xg: 1.06, xgOpp: 0.49, shots: 5, shotsOpp: 12, date: '2027-08-14' },
    };
    const issue = {
      number: 3,
      club: 'Malženice',
      weekStart: '2027-08-09',
      weekEnd: '2027-08-15',
      date: '2027-08-15',
      headline,
      stories: [
        { kind: 'streak', weight: 49, params: { outcome: 'W', count: 3 } },
        { kind: 'nextMatch', weight: 10, params: { opponent: 'Púchov', location: 'Extérieur', inDays: 'Dans 7 jours' } },
      ],
      board: null,
    } as GazetteIssue;
    const a = articleText(t, issue, 'fr')!;
    expect(a).toMatch(/gazette\.article\.open_W_\d .*"where":"gazette\.article\.atHome","comp":"gazette\.article\.inComp/);
    expect(a).toContain('gazette.article.scorers_');
    expect(a).toContain('gazette.article.stat_balanced_'); // 47 % de possession et xG favorables : match équilibré
    expect(articleText(t, { ...issue, headline: { ...headline, params: { ...headline.params, possession: 60, outcome: 'L', goalsFor: 0, goalsAgainst: 1 } } }, 'fr')).toContain('gazette.article.stat_unlucky_');
    expect(a).toContain('gazette.article.best_');
    expect(a).toContain('gazette.article.streak_W {"club":"Malženice","count":3}');
    expect(a).toContain('gazette.article.next_');
    // Même gazette, mêmes variantes.
    expect(articleText(t, issue, 'fr')).toBe(a);
    expect(articleText(t, { ...issue, headline: { kind: 'quiet', weight: 5, params: {} } }, 'fr')).toBeNull();
  });

  it('le billet suit le climat : série de défaites = crise, objectif de la direction repris quand il est lu', () => {
    const lose = (date: string): GazetteStory => ({ kind: 'result', weight: 60, params: { outcome: 'L', opponent: 'X', goalsFor: 0, goalsAgainst: 1, date, friendly: 0 } });
    const issue = {
      number: 4,
      club: 'Malženice',
      weekStart: '2027-08-16',
      weekEnd: '2027-08-22',
      date: '2027-08-22',
      headline: { kind: 'streak', weight: 60, params: { outcome: 'L', count: 4 } },
      stories: [lose('2027-08-21')],
      board: 'Terminer en première partie de tableau',
    } as GazetteIssue;
    expect(climateOf(issue)).toBe('crisis');
    const e = editorialText(t, issue, 'fr')!;
    expect(e.title).toBe('gazette.editorial.title');
    expect(e.body).toMatch(/^gazette\.editorial\.tone_crisis_\d /);
    expect(e.fans).toMatch(/^gazette\.editorial\.fans_crisis_\d /);
    expect(e.board).toBe('gazette.editorial.boardObjective_worried {"objective":"terminer en première partie de tableau"}');
    const win = { ...issue, headline: { ...lose('2027-08-21'), params: { ...lose('2027-08-21').params, outcome: 'W', goalsFor: 2 } }, stories: [{ kind: 'fans', weight: 28, params: { mood: 'Ravis' } }], board: null } as GazetteIssue;
    expect(climateOf(win)).toBe('win');
    expect(editorialText(t, win, 'fr')!.fans).toBe('gazette.editorial.fansGame {"mood":"Ravis"}');
    expect(editorialText(t, { ...issue, headline: { kind: 'quiet', weight: 5, params: {} }, stories: [] } as GazetteIssue, 'fr')).toBeNull();
  });

  it("une élimination en coupe se raconte comme telle : titre, ouverture, suite et ton du billet", () => {
    const headline: GazetteStory = {
      kind: 'result',
      weight: 80,
      params: { outcome: 'L', opponent: 'Matador Púchov', home: 0, goalsFor: 1, goalsAgainst: 3, competition: 'Slovenský pohár', compKind: 'cup', cup: 'out', legs: 1, aggFor: 1, aggAgainst: 3, rounds: 2, friendly: 0, date: '2027-08-31' },
    };
    const issue = { number: 5, club: 'Malženice', weekStart: '2027-08-30', weekEnd: '2027-09-05', date: '2027-09-01', headline, stories: [], board: null } as GazetteIssue;
    const s = storyText(t, 'Malženice', headline);
    expect(s.title).toMatch(/^gazette\.story\.result\.title_cupOut /);
    expect(s.body).toMatch(/^gazette\.story\.result\.cupOut .*"count":2/);
    const a = articleText(t, issue, 'fr')!;
    expect(a).toMatch(/^gazette\.article\.open_cupOut_\d .*"competition":"Slovenský pohár"/);
    expect(a).toContain('gazette.article.cupOutAfter_');
    expect(a).not.toContain('aggregate');
    expect(climateOf(issue)).toBe('cupOut');
    expect(editorialText(t, issue, 'fr')!.body).toMatch(/^gazette\.editorial\.tone_cupOut_\d /);
    // Aller-retour : le score cumulé est donné.
    const legs = { ...issue, headline: { ...headline, params: { ...headline.params, legs: 2, aggFor: 2, aggAgainst: 4 } } } as GazetteIssue;
    expect(articleText(t, legs, 'fr')).toContain('gazette.article.aggregate {"agg":"2-4"}');
    // Match de coupe sans issue décidée : pas de « trois points » du championnat.
    const plain = { ...issue, headline: { ...headline, params: { ...headline.params, cup: null, outcome: 'W', goalsFor: 2, goalsAgainst: 1 } } } as GazetteIssue;
    expect(articleText(t, plain, 'fr')).toMatch(/^gazette\.article\.open_WCup_\d /);
  });
});
