import { describe, expect, it, vi } from 'vitest';

const files = [
  { gameDate: '2027-08-10', club: 'Malženice', bytes: 10 },
  { gameDate: '2027-08-12', club: 'Malženice', bytes: 10 },
  { gameDate: '2027-08-13', club: 'Nitra', bytes: 10 },
  { gameDate: '2027-08-14', club: 'Malženice', bytes: 10 },
  { gameDate: '2027-08-15', club: 'Malženice', bytes: 10 },
];
const content: Record<string, unknown> = {
  '2027-08-12': { club: 'Malženice', gameDate: '2027-08-12', players: [{ name: 'A' }] },
  '2027-08-14': { club: 'Malženice', gameDate: '2027-08-14', players: [] }, // lecture ratée dans le jeu
  '2027-08-15': { club: 'Malženice', gameDate: '2027-08-15', players: [{ name: 'B' }] },
};
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args: Record<string, unknown>) => {
    if (cmd === 'fm_history_list') return files;
    if (cmd === 'fm_history_read') return JSON.stringify(content[args.gameDate as string]);
    throw new Error(cmd);
  }),
}));
const imported: string[] = [];
vi.mock('../src/lib/data', () => ({
  fmData: {
    history: async () => [{ gameDate: '2027-08-10', playerCount: 20 }],
    importSnapshot: async (_s: string, raw: { gameDate: string }) => {
      imported.push(raw.gameDate);
      return raw;
    },
  },
  savesData: {},
}));
const { importMissingHistory } = await import('../src/lib/fm-history');

describe('historique automatique depuis les fichiers datés du plugin', () => {
  it('importe les jours manquants de notre club, du plus ancien au plus récent, et saute les autres clubs et les fichiers vides', async () => {
    expect(await importMissingHistory('s', 'D:\\archivix', 'Malženice')).toBe(2);
    expect(imported).toEqual(['2027-08-12', '2027-08-15']);
    expect(await importMissingHistory('s', 'D:\\archivix', null)).toBe(0);
  });

  it('respecte la taille du lot', async () => {
    imported.length = 0;
    expect(await importMissingHistory('s', 'D:\\archivix', 'Malženice', 1)).toBe(1);
    expect(imported).toEqual(['2027-08-12']);
  });
});
