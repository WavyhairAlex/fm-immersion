import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

describe('migration 0007 (un instantané par date)', () => {
  it('retire les doublons laissés par les anciennes versions, garde le plus récent, puis pose l’index unique', () => {
    const sqlite = new DatabaseSync(':memory:');
    const dir = join(__dirname, '../src-tauri/migrations');
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    for (const f of files.filter((f) => f < '0007')) sqlite.exec(readFileSync(join(dir, f), 'utf8'));
    sqlite.exec(`insert into saves (id, game_id, name, extra, created_at, updated_at) values ('s', 'fm', 'P', '{}', 'x', 'x')`);
    const ins = sqlite.prepare(`insert into fm_snapshots (id, save_id, game_date, club, player_count, data, imported_at) values (?, 's', ?, 'C', ?, '{}', 'x')`);
    ins.run('a', '2027-01-01', 1);
    ins.run('b', '2027-01-01', 2);
    ins.run('c', '2027-01-02', 3);
    for (const f of files.filter((f) => f >= '0007')) sqlite.exec(readFileSync(join(dir, f), 'utf8'));
    expect(sqlite.prepare('select id from fm_snapshots order by game_date').all().map((r) => (r as { id: string }).id)).toEqual(['b', 'c']);
    expect(() => ins.run('d', '2027-01-02', 4)).toThrow();
  });
});
