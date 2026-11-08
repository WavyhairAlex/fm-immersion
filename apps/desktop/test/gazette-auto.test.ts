import type { BigMatch, BreakingNews, CoachExit, GazetteIssue, SeasonReview } from '@fm-immersion/module-fm';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('../src/lib/data', () => ({ fmData: {}, savesData: {} }));
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});
const { breakingToSend, farewellToSend, isBigMatchSent, markBigMatchSent, gazetteToSend, seasonToSend } = await import('../src/lib/gazette-auto');

const issue = (weekStart: string) => ({ weekStart }) as GazetteIssue;

describe('gazette automatique', () => {
  it('envoie la dernière semaine terminée, une seule fois', () => {
    const issues = [issue('2027-04-26'), issue('2027-04-19'), issue('2027-04-12')];
    expect(gazetteToSend([issue('2027-04-26')], 's', null)).toBeNull(); // semaine en cours seulement
    expect(gazetteToSend(issues, 's', null)).toBe(1);
    expect(gazetteToSend(issues, 's', 's|2027-04-12')).toBe(1);
    expect(gazetteToSend(issues, 's', 's|2027-04-19')).toBeNull();
    expect(gazetteToSend(issues, 'autre', 's|2027-04-19')).toBe(1);
  });

  it('envoie le bilan de la saison une fois, peu après la fin du championnat', () => {
    const r = { end: '2027-05-14' } as SeasonReview;
    expect(seasonToSend([r], '2027-05-15', () => false)).toBe(r);
    expect(seasonToSend([r], '2027-05-15', () => true)).toBeNull();
    expect(seasonToSend([r], '2027-09-01', () => false)).toBeNull();
    expect(seasonToSend([], '2027-05-15', () => false)).toBeNull();
  });

  it('envoie le hors-série du départ une fois, peu après le départ', () => {
    const x = { club: 'Malženice', end: '2027-09-01' } as CoachExit;
    expect(farewellToSend([x], '2027-09-01', () => false)).toBe(x);
    expect(farewellToSend([x], '2027-09-20', () => false)).toBe(x);
    expect(farewellToSend([x], '2027-09-20', () => true)).toBeNull();
    expect(farewellToSend([x], '2027-12-01', () => false)).toBeNull();
    expect(farewellToSend([], '2027-09-01', () => false)).toBeNull();
  });

  it('envoie les dépêches récentes pas encore parties, trois au plus, de la plus ancienne à la plus récente', () => {
    const n = (id: string, date: string) => ({ id, date }) as BreakingNews;
    const news = [n('d', '2027-09-01'), n('c', '2027-08-31'), n('b', '2027-08-30'), n('a', '2027-08-29'), n('old', '2027-07-01')];
    expect(breakingToSend(news, '2027-09-01', () => false).map((x) => x.id)).toEqual(['b', 'c', 'd']);
    expect(breakingToSend(news, '2027-09-01', (x) => x.id === 'd').map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(breakingToSend(news, '2027-12-01', () => false)).toEqual([]);
    expect(breakingToSend(news, undefined, () => false)).toEqual([]);
  });

  it("affiche du choc envoyée une fois, même si la date du match bouge d'un jour", () => {
    const m = { opponent: 'Matador Púchov', competition: 'Slovenský pohár', date: '2027-09-01' } as BigMatch;
    expect(isBigMatchSent('s', m)).toBe(false);
    markBigMatchSent('s', m);
    expect(isBigMatchSent('s', { ...m, date: '2027-08-31' })).toBe(true);
    expect(isBigMatchSent('s', { ...m, date: '2028-03-01' })).toBe(false);
    expect(isBigMatchSent('autre', m)).toBe(false);
  });
});
