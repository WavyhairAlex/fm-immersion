import { ASKED_BY, answerTones, type PressQuestion, type QuestionTopic } from '@fm-immersion/module-fm';
import i18next from 'i18next';
import { describe, expect, it } from 'vitest';
import en from '../src/i18n/en.json';
import fr from '../src/i18n/fr.json';
import { answerText, askedBy, cleanQuestion, questionKey, questionText } from '../src/lib/press';

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
  Q('congestion', {}),
  Q('titleRace', { position: 2, left: 5 }),
  Q('youthDebut', { name: 'Petit', age: 17 }),
  Q('bigWin', { opponent: 'Nitra', goalsFor: 5, goalsAgainst: 0 }),
  Q('runEnded', { count: 6 }),
  Q('fans', { status: 'Mécontents' }),
  Q('exClub', { opponent: 'Nitra' }),
  Q('contract', { name: 'Diallo', months: 4 }),
  Q('unhappy', { name: 'Diallo' }),
  Q('signing', { name: 'Diallo' }),
  Q('exit', { name: 'Diallo' }),
  Q('longInjury', { name: 'Diallo' }),
  Q('linked', { other: 'Lyon' }),
  ...['broken', 'kept', 'denied', 'again'].map((variant) => Q('followUp', { variant, quote: 'On va gagner.', pastOpponent: 'Genk' })),
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
      for (const base of QUESTIONS) {
        // Chaque sujet a un texte pour les deux rédactions qui le suivent.
        for (const outlet of ASKED_BY[base.id]) {
          const q = { ...base, outlet };
          const text = questionText(i18n.t, q, lang);
          expect(text, `${questionKey(q)}.${outlet}`).not.toContain('press.q.');
          expect(text, `${questionKey(q)}.${outlet}`).not.toMatch(/\{\{|undefined|\?e\b/);
        }
        const tones = answerTones(base);
        expect(new Set(tones).size, questionKey(base)).toBe(3);
        for (const tone of tones) {
          const a = answerText(i18n.t, base, tone, lang);
          expect(a, `${questionKey(base)}.${tone}`).not.toContain('press.a.');
          expect(a).not.toContain('{{');
          expect(i18n.t(`press.tones.${tone}`)).not.toContain('press.tones.');
        }
      }
      expect(askedBy(i18n.t, { id: 'linked', outlet: 'tabloid', reporter: 'Inès Marchal' }, 'Nitra')).toBe(lang === 'fr' ? 'Inès Marchal, Le Crampon (presse à scandale)' : 'Inès Marchal, The Studs (tabloid)');
      expect(askedBy(i18n.t, { id: 'result', outlet: 'local' }, 'Nitra')).toBe(lang === 'fr' ? "L'Écho de Nitra" : 'The Nitra Echo');
      // Rangs et forme écrits dans la langue de l'interface.
      expect(questionText(i18n.t, QUESTIONS[2]!, lang)).toContain(lang === 'fr' ? '1er contre 2e' : '1st against 2nd');
      expect(questionText(i18n.t, QUESTIONS[6]!, lang)).toContain(lang === 'fr' ? 'VVNDV' : 'WWDLW');
    });
  }
});

describe('conférence de presse dans la gazette', () => {
  it('titre la citation selon son ton et nomme la rédaction', async () => {
    const { storyText } = await import('../src/lib/gazette-text');
    const i18n = i18next.createInstance();
    await i18n.init({ lng: 'fr', resources: { fr: { translation: fr } }, interpolation: { escapeValue: false } });
    const story = { kind: 'press', weight: 45, params: { moment: 'post', opponent: 'Genk', quote: 'Ça suffit.', topic: 'result', question: 'Q', tone: 'firm', outlet: 'tabloid', reporter: 'Inès Marchal' } } as const;
    expect(storyText(i18n.t, 'Nitra', story)).toEqual({ title: 'Le coach hausse le ton', body: '« Ça suffit. », a confié le coach au Crampon après le match contre Genk.' });
    // Conférence d'avant les rédactions : titre et texte d'origine.
    expect(storyText(i18n.t, 'Nitra', { ...story, params: { ...story.params, tone: 'calm', outlet: null } }).body).toBe('« Ça suffit. »');
  });
});

describe("questions reformulées par l'IA", () => {
  // Exemples tirés de vraies conférences.
  const base = "{{name}}, 2 buts ce soir ! Il mérite un mot ?".replace('{{name}}', 'Solovyov');

  it("retire l'étiquette de rédaction, les guillemets et la formule d'adresse", () => {
    expect(cleanQuestion('[télé nationale] Solovyov a marqué 2 buts. Mérite-t-il un mot ?', base)).toBe('Solovyov a marqué 2 buts. Mérite-t-il un mot ?');
    expect(cleanQuestion("« Monsieur l'entraîneur, Solovyov a marqué 2 buts : un mot sur lui ? »", base)).toBe('Solovyov a marqué 2 buts : un mot sur lui ?');
    expect(cleanQuestion("Solovyov a marqué 2 buts, pourriez-vous nous dire, Monsieur l'entraîneur, ce que vous en pensez ?", base)).toBe(
      'Solovyov a marqué 2 buts, pourriez-vous nous dire, ce que vous en pensez ?',
    );
    expect(cleanQuestion('Solovyov a marqué 2 buts. Un mot sur lui, monsieur ?', base)).toBe('Solovyov a marqué 2 buts. Un mot sur lui ?');
  });

  it('rejette une question racontée, une rédaction inventée, un contexte inventé ou un chiffre changé', () => {
    expect(cleanQuestion("« Solovyov a marqué 2 buts, un mot ? », demande le journaliste de Télé Nationale.", base)).toBeNull();
    expect(cleanQuestion('"2 buts pour Solovyov ?", vous demandez, impatient de connaître la réaction.', base)).toBeNull();
    expect(cleanQuestion('Pour Radio Sportif : Solovyov, 2 buts, un mot ?', base)).toBeNull();
    expect(cleanQuestion('Avant ce match retour, Solovyov a marqué 2 buts. Un mot ?', base)).toBeNull();
    expect(cleanQuestion('Solovyov a marqué 3 buts. Un mot ?', base)).toBeNull();
    expect(cleanQuestion(`Solovyov a marqué 2 buts. ${'Vraiment, '.repeat(30)}un mot ?`, base)).toBeNull();
  });
});
