import { beforeEach, describe, expect, it } from 'vitest';
import { savesRepo } from '../src/lib/saves';
import { memoryDb } from './memory-db';

describe('parties', () => {
  let repo: ReturnType<typeof savesRepo>;
  beforeEach(() => {
    repo = savesRepo(memoryDb() as never);
  });

  it('crée, liste, renomme et supprime une partie', async () => {
    const created = await repo.create({ gameId: 'fm', name: '  Toulouse 2026 ', gameVersion: '1.0' });
    expect(created).toMatchObject({ gameId: 'fm', name: 'Toulouse 2026', gameVersion: '1.0', extra: {} });
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);

    expect(await repo.list()).toHaveLength(1);

    const renamed = await repo.update(created.id, { name: 'Europe 1900' });
    expect(renamed?.name).toBe('Europe 1900');
    expect(renamed!.updatedAt >= created.updatedAt).toBe(true);

    await repo.remove(created.id);
    expect(await repo.list()).toHaveLength(0);
  });

  it('refuse un jeu inconnu ou un nom vide', async () => {
    await expect(repo.create({ gameId: 'sims' as never, name: 'x' })).rejects.toThrow();
    await expect(repo.create({ gameId: 'fm', name: '   ' })).rejects.toThrow();
  });
});
