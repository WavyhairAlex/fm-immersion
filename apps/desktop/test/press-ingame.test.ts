import type { PressConference } from '@fm-immersion/module-fm';
import i18next from 'i18next';
import { describe, expect, it } from 'vitest';
import fr from '../src/i18n/fr.json';
import { inGameConference, parseInGameAnswer } from '../src/lib/press-ingame';

const C: PressConference = {
  key: 'post|Dender|Genk|2026-08-15',
  kind: 'post',
  date: '2026-08-15',
  club: 'Dender',
  opponent: 'Genk',
  competition: 'Pro League',
  questions: [
    { id: 'result', params: { outcome: 'W', opponent: 'Genk', goalsFor: 2, goalsAgainst: 1, competition: 'Pro League', home: 1 }, outlet: 'local', reporter: 'Claire Moreau' },
    { id: 'injuries', params: { count: 3 }, outlet: 'radio', reporter: 'Marc Delattre' },
  ],
};

describe('conférence de presse dans FM27', () => {
  it('rédige la conférence pour le plugin, dans la langue du joueur', async () => {
    const i18n = i18next.createInstance();
    await i18n.init({ lng: 'fr', resources: { fr: { translation: fr } }, interpolation: { escapeValue: false } });
    const c = inGameConference(i18n.t, C, 'Dender', ['Question 1 ?', 'Question 2 ?'], 'fr');
    expect(c.format).toBe('fmi-presse/1');
    expect(c.key).toBe(C.key);
    expect(c.title).toContain('Genk');
    expect(c.subtitle).toContain('Pro League');
    expect(c.questions).toHaveLength(2);
    expect(c.questions[0]!.by).toContain('Claire Moreau');
    expect(c.questions[0]!.text).toBe('Question 1 ?');
    for (const q of c.questions) {
      expect(q.answers).toHaveLength(3);
      for (const a of q.answers) expect(a.label && a.text && !a.text.includes('press.')).toBeTruthy();
    }
    expect(Object.values(c.ui).every((s) => s && !s.startsWith('press.'))).toBe(true);
  });

  it('ne garde que les réponses de cette conférence, vérifiées', () => {
    const raw = JSON.stringify({
      key: C.key,
      declined: false,
      answers: [
        { question: 'result', tone: 'humble', text: '  On a   souffert. ' },
        { question: 'result', tone: 'firm', text: 'doublon' },
        { question: 'inconnu', tone: 'firm', text: 'hors sujet' },
        { question: 'injuries', tone: 'pas-un-ton', text: 'x'.repeat(500) },
      ],
    });
    const out = parseInGameAnswer(raw, C)!;
    expect(out).toEqual([
      { question: 'result', tone: 'humble', text: 'On a souffert.' },
      { question: 'injuries', tone: null, text: 'x'.repeat(400) },
    ]);
    expect(parseInGameAnswer(JSON.stringify({ key: 'autre', answers: [] }), C)).toBeNull();
    expect(parseInGameAnswer('pas du json', C)).toBeNull();
    expect(parseInGameAnswer(JSON.stringify({ key: C.key, declined: true }), C)).toEqual([]);
  });
});
