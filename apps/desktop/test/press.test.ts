import { ANSWER_TONES, type PressQuestion, type QuestionTopic } from '@fm-immersion/module-fm';
import i18next from 'i18next';
import { describe, expect, it } from 'vitest';
import en from '../src/i18n/en.json';
import fr from '../src/i18n/fr.json';
import { answerText, questionKey, questionText } from '../src/lib/press';

/** Une question de chaque sorte, avec toutes ses variantes (enjeu, issue, série). */
const Q = (id: QuestionTopic, params: PressQuestion['params']): PressQuestion => ({ id, params });
const QUESTIONS: PressQuestion[] = [
  ...['cup', 'europe', 'top', 'rival'].map((kind) => Q('stakes', { kind, opponent: 'Nitra', competition: 'Coupe', position: 1, opponentPosition: 2, home: 1 })),
  Q('theirScorer', { opponent: 'Nitra', name: 'Klec', goals: 7 }),
  Q('injuries', { count: 4 }),
  Q('form', { form: 'WWDLW', wins: 3, games: 5 }),
  Q('ourScorer', { name: 'Diallo', goals: 6 }),
  ...['W', 'D', 'L'].flatMap((outcome) => [
    Q('result', { outcome, opponent: 'Nitra', goalsFor: 2, goalsAgainst: 1, competition: '2. liga', home: 0 }),
    Q('cup', { outcome, opponent: 'Nitra', competition: 'Coupe' }),
  ]),
  Q('hero', { name: 'Diallo', goals: 3 }),
  ...['W', 'L', 'winless', 'unbeaten'].map((outcome) => Q('streak', { outcome, count: 5 })),
  Q('pressure', { status: 'Insécurisé' }),
];

describe('conférence de presse : textes', () => {
  it('choisit la variante selon l’enjeu ou l’issue', () => {
    expect(questionKey(QUESTIONS[0]!)).toBe('stakes_cup');
    expect(questionKey({ id: 'result', params: { outcome: 'L' } })).toBe('result_L');
    expect(questionKey({ id: 'hero', params: {} })).toBe('hero');
  });

  for (const [lang, res] of [['fr', fr], ['en', en]] as const) {
    it(`a une question et trois réponses pour chaque cas (${lang})`, async () => {
      const i18n = i18next.createInstance();
      await i18n.init({ lng: lang, resources: { [lang]: { translation: res } }, interpolation: { escapeValue: false } });
      for (const q of QUESTIONS) {
        const text = questionText(i18n.t, q, lang);
        expect(text, questionKey(q)).not.toContain('press.q.');
        expect(text, questionKey(q)).not.toMatch(/\{\{|undefined|\?e\b/);
        for (const tone of ANSWER_TONES) {
          const a = answerText(i18n.t, q, tone, lang);
          expect(a, `${questionKey(q)}.${tone}`).not.toContain('press.a.');
          expect(a).not.toContain('{{');
        }
      }
      // Rangs et forme écrits dans la langue de l'interface.
      expect(questionText(i18n.t, QUESTIONS[2]!, lang)).toContain(lang === 'fr' ? '1er contre 2e' : '1st against 2nd');
      expect(questionText(i18n.t, QUESTIONS[6]!, lang)).toContain(lang === 'fr' ? 'VVNDV' : 'WWDLW');
    });
  }
});
