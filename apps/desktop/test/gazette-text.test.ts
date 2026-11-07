import type { GazetteIssue, GazetteStory } from '@fm-immersion/module-fm';
import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import { articleText, figuresLine, storyText } from '../src/lib/gazette-text';

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
});
