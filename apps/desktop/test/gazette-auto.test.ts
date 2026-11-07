import type { GazetteIssue } from '@fm-immersion/module-fm';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('../src/lib/data', () => ({ fmData: {}, savesData: {} }));
const { gazetteToSend } = await import('../src/lib/gazette-auto');

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
});
