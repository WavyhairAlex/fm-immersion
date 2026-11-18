import type { GazetteIssue } from '@fm-immersion/module-fm';
import i18next from 'i18next';
import { describe, expect, it } from 'vitest';
import en from '../src/i18n/en.json';
import fr from '../src/i18n/fr.json';
import { inGameToday } from '../src/lib/today-ingame';

const story = (title: string) => ({ kind: 'custom', params: { title } }) as unknown as GazetteIssue['headline'];

describe('panneau « Aujourd’hui » dans FM27', () => {
  it('rédige le briefing et la une pour le plugin, bornés pour tenir à l’écran', async () => {
    const i18n = i18next.createInstance();
    await i18n.init({ lng: 'fr', resources: { fr: { translation: fr }, en: { translation: en } }, interpolation: { escapeValue: false } });
    const brief = Array.from({ length: 12 }, (_, i) => ({ key: `k${i}`, view: 'squad', tone: 'warn' as const, text: `Message ${i}`, action: 'Voir' }));
    const headline = story('Une');
    const issue = {
      number: 7,
      club: 'Dender',
      headline,
      stories: [headline, story('A'), story('B'), story('C'), story('D')],
      written: { title: 'Dender renverse Genk', article: 'x'.repeat(1000) },
    } as unknown as GazetteIssue;
    const d = inGameToday(i18n.t, { saveId: 's1', gameDate: '2026-08-15', club: 'Dender', brief, issue }, 'fr');
    expect(d.format).toBe('fmi-aujourdhui/1');
    expect(d.key).toBe('s1|2026-08-15|7');
    expect(d.sub).toContain('Dender');
    expect(d.sub).toContain('2026');
    expect(d.brief.items).toHaveLength(8);
    expect(d.brief.items[0]).toEqual({ tone: 'warn', text: 'Message 0' });
    expect(d.gazette?.title).toBe('Dender renverse Genk');
    expect(d.gazette?.label).toContain('7');
    expect(d.gazette!.lede.length).toBeLessThanOrEqual(320);
    expect(d.gazette?.others).toHaveLength(3);
    for (const s of [d.heading, d.brief.title, d.brief.empty, d.ui.close, d.ui.hint, d.gazette!.also]) expect(s).not.toMatch(/^(ingameToday|fm|layout)\./);
  });

  it('sans gazette ni message, le panneau le dit simplement', async () => {
    const i18n = i18next.createInstance();
    await i18n.init({ lng: 'en', resources: { en: { translation: en } }, interpolation: { escapeValue: false } });
    const d = inGameToday(i18n.t, { saveId: 's1', gameDate: '2026-08-15', club: '', brief: [], issue: null }, 'en');
    expect(d.gazette).toBeNull();
    expect(d.brief.items).toEqual([]);
    expect(d.brief.empty).toBe('Nothing urgent today, boss.');
    expect(d.key).toBe('s1|2026-08-15|0');
  });
});
