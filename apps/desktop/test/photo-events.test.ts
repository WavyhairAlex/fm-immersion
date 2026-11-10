import { describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});
const { breakingTag, getPhotoMode, hashKey, sceneForBreaking, setPhotoMode } = await import('../src/lib/photo-events');

describe('photos de situation dans les dépêches', () => {
  it('réglage à trois positions, « off » par défaut', () => {
    expect(getPhotoMode()).toBe('off');
    setPhotoMode('auto');
    expect(getPhotoMode()).toBe('auto');
    setPhotoMode('manual');
    expect(getPhotoMode()).toBe('manual');
    setPhotoMode('off');
    expect(getPhotoMode()).toBe('off');
  });

  it('choisit une scène stable selon la dépêche', () => {
    const inj = { kind: 'injury' as const, id: 'p1', date: '2027-03-02', days: 120 };
    const a = sceneForBreaking(inj, true);
    expect(a).toEqual(sceneForBreaking(inj, false));
    expect(['civiere', 'soutenu']).toContain(a!.scene);
    expect(a!.cast).toBe('player');
    const short = sceneForBreaking({ ...inj, days: 30 }, true);
    expect(['bequilles', 'banc']).toContain(short!.scene);
    expect(sceneForBreaking({ kind: 'signing', id: 'p2', date: '2027-03-02', days: null }, true)).toEqual({ scene: 'duo_presse', cast: 'duo' });
    expect(sceneForBreaking({ kind: 'signing', id: 'p2', date: '2027-03-02', days: null }, false)).toEqual({ scene: 'signature', cast: 'player' });
    expect(sceneForBreaking({ kind: 'exit', id: 'p3', date: '2027-03-02', days: null }, true)).toEqual({ scene: 'signature', cast: 'player' });
    const coach = sceneForBreaking({ kind: 'offer', id: 'coach|x', date: '2027-03-02', days: null }, true);
    expect(['conference', 'consigne']).toContain(coach!.scene);
    expect(coach!.cast).toBe('coach');
    expect(sceneForBreaking({ kind: 'offer', id: 'coach|x', date: '2027-03-02', days: null }, false)).toBeNull();
  });

  it('clé stable par dépêche et hachage déterministe', () => {
    expect(breakingTag('s', { kind: 'injury', id: 'p1', date: '2027-03-02T10:00:00' })).toBe('breaking|s|injury|p1|2027-03-02');
    expect(hashKey('abc')).toBe(hashKey('abc'));
    expect(hashKey('abc')).not.toBe(hashKey('abd'));
  });
});
