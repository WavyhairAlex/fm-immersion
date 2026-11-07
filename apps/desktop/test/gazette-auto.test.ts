import type { GazetteIssue, SeasonReview } from '@fm-immersion/module-fm';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('../src/lib/data', () => ({ fmData: {}, savesData: {} }));
const { gazetteToSend, seasonToSend } = await import('../src/lib/gazette-auto');

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
});
