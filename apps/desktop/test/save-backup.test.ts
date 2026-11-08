import { describe, expect, it } from 'vitest';
import { backupDue, backupLabel } from '../src/lib/save-backup';

const file = (modifiedMs: number) => ({ name: 'Malženice.fm', modifiedMs, bytes: 1 });

describe('copies de secours', () => {
  it('nomme la copie avec la date d’écriture de la sauvegarde, à l’heure locale', () => {
    expect(backupLabel(new Date(2026, 10, 8, 9, 5).getTime())).toBe('2026-11-08 09h05');
  });

  it('copie seulement une sauvegarde liée, changée depuis la dernière copie et posée depuis une minute', () => {
    const t = 1_000_000_000;
    const on = { fmBackups: true, fmSaveFile: 'Malženice.fm' };
    expect(backupDue({ fmSaveFile: 'Malženice.fm' }, [file(t)], t + 120_000)).toBeNull();
    expect(backupDue(on, [], t + 120_000)).toBeNull();
    expect(backupDue(on, [file(t)], t + 10_000)).toBeNull();
    expect(backupDue({ ...on, fmBackupDone: t }, [file(t)], t + 120_000)).toBeNull();
    expect(backupDue({ ...on, fmBackupDone: t - 1 }, [file(t)], t + 120_000)?.name).toBe('Malženice.fm');
  });
});
