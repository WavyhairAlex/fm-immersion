import type { GazetteStory } from '@fm-immersion/module-fm';
import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import { figuresLine, storyText } from '../src/lib/gazette-text';

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
});
