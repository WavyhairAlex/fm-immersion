import { describe, expect, it } from 'vitest';
import { compatReport, type Compat } from '../src/lib/game-compat';

const UPDATE = Date.parse('2026-11-10T08:00:00Z');
const base = (over: Partial<Compat> = {}): Compat => ({
  gameFound: true,
  build: { key: `404308480-${UPDATE}`, moduleSize: 404308480, moduleModified: UPDATE, steamBuild: '123' },
  memory: 'known',
  log: { modified: UPDATE + 3_600_000, unity: '6000.3.18f1', plugins: [{ name: 'Archivix Bridge', version: '0.5.9' }], started: true, errors: [] },
  ...over,
});
const opts = { seenKey: `404308480-${UPDATE}`, bridgeInstalled: '0.5.9', bepinex: true, facesMismatch: false };
const ids = (r: ReturnType<typeof compatReport>) => r?.items.map((i) => `${i.id}:${i.level}`);

describe('bilan de compatibilité de FM27', () => {
  it('tout va bien sur une version connue', () => {
    const r = compatReport(base(), opts)!;
    expect(r.updated).toBe(false);
    expect(r.level).toBe('ok');
    expect(ids(r)).toEqual(['bridge:ok', 'memory:ok']);
  });

  it('premier lancement : la version actuelle sert de référence, rien de « nouveau »', () => {
    expect(compatReport(base(), { ...opts, seenKey: null })!.updated).toBe(false);
  });

  it('jeu mis à jour mais pas encore relancé : demande de lancer FM27', () => {
    const r = compatReport(base({ log: { ...base().log!, modified: UPDATE - 1000 } }), { ...opts, seenKey: 'ancienne' })!;
    expect(r.updated).toBe(true);
    expect(r.launchedSince).toBe(false);
    expect(ids(r)).toEqual(['updated:warn', 'launch:warn', 'memory:ok']);
  });

  it('plugin absent du journal après la mise à jour', () => {
    const r = compatReport(base({ log: { ...base().log!, plugins: [] } }), opts)!;
    expect(r.level).toBe('bad');
    expect(r.items.find((i) => i.id === 'bridge')).toMatchObject({ level: 'bad', to: '/reglages' });
  });

  it('BepInEx bloqué, erreurs du plugin, lecture mémoire et visages', () => {
    const r = compatReport(
      base({ memory: 'broken', log: { ...base().log!, started: false, errors: ['[Error  :Archivix Bridge] boum', '[Error  :Autre] rien'] } }),
      { ...opts, facesMismatch: true },
    )!;
    expect(ids(r)).toEqual(['bepinex:bad', 'bridge:ok', 'bridgeErrors:warn', 'memory:bad', 'faces:bad']);
    expect(r.items.find((i) => i.id === 'bridgeErrors')!.params).toMatchObject({ count: 1 });
  });

  it('nouvelle version dont les motifs sont retrouvés : à confirmer', () => {
    expect(compatReport(base({ memory: 'patterns' }), opts)!.level).toBe('warn');
  });

  it('sans plugin installé ni BepInEx : seulement la lecture mémoire', () => {
    expect(ids(compatReport(base(), { ...opts, bridgeInstalled: null, bepinex: false }))).toEqual(['memory:ok']);
  });

  it('jeu introuvable : pas de bilan', () => {
    expect(compatReport(base({ gameFound: false }), opts)).toBeNull();
  });
});
