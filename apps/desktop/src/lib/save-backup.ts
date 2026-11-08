import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useEffect } from 'react';
import { create } from 'zustand';
import { useCareer } from './career';
import { fmData } from './data';
import type { FmSaveFile, FmSaveSettings } from './fm';

/**
 * Copies de secours des sauvegardes FM27. Rust lit le fichier .fm et le copie dans `fm-immersion-secours\<nom>\`,
 * à côté du dossier games ; rien n'est jamais écrit dans games. Le joueur restaure lui-même, FM27 fermé.
 */

export const BACKUP_KEEP_DEFAULT = 3;
export const BACKUP_KEEP_CHOICES = [1, 2, 3, 5, 10];
/** FM27 écrit une sauvegarde en plusieurs secondes : on attend qu'elle n'ait plus bougé depuis une minute. */
const SETTLE_MS = 60_000;
const TICK_MS = 60_000;

export interface BackupFile {
  name: string;
  modifiedMs: number | null;
  bytes: number;
}

/** Étiquette du nom de la copie : date d'écriture de la sauvegarde, à l'heure du joueur (« 2026-11-08 19h45 »). */
export function backupLabel(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}h${p(d.getMinutes())}`;
}

/** Une copie automatique est à faire : option cochée, sauvegarde liée présente, changée depuis la dernière copie et posée. */
export function backupDue(settings: FmSaveSettings, files: FmSaveFile[], now: number): FmSaveFile | null {
  if (!settings.fmBackups || !settings.fmSaveFile) return null;
  const file = files.find((f) => f.name === settings.fmSaveFile);
  if (!file || file.modifiedMs == null) return null;
  if (file.modifiedMs === settings.fmBackupDone || now - file.modifiedMs < SETTLE_MS) return null;
  return file;
}

/** Dernière erreur de copie par carrière (disque plein, dossier illisible…), montrée sur l'écran des sauvegardes. */
export const useBackupErrors = create<{ errors: Record<string, string>; set: (saveId: string, e: string | null) => void }>((set) => ({
  errors: {},
  set: (saveId, e) =>
    set((s) => {
      const errors = { ...s.errors };
      if (e) errors[saveId] = e;
      else delete errors[saveId];
      return { errors };
    }),
}));

/** Copie la sauvegarde liée à une carrière et retient sa date d'écriture. */
export async function makeBackup(saveId: string, folder: string, file: FmSaveFile, keep: number) {
  const made = await invoke<BackupFile>('fm_backup_make', { folder, name: file.name, label: backupLabel(file.modifiedMs ?? Date.now()), keep });
  if (file.modifiedMs != null) await fmData.updateSettings(saveId, { fmBackupDone: file.modifiedMs });
  return made;
}

export function useBackups(folder: string, name: string | undefined) {
  return useQuery({
    queryKey: ['fm', 'backups', folder, name],
    queryFn: () => invoke<BackupFile[]>('fm_backup_list', { folder, name }),
    enabled: !!folder && !!name,
  });
}

/**
 * Monté une fois pour toute l'appli : chaque minute, une copie de la sauvegarde liée des carrières qui l'ont
 * demandé, dès que FM27 l'a réécrite. Une copie à la fois.
 */
export function useAutoBackups() {
  const qc = useQueryClient();
  const { fmSaves } = useCareer();
  const ids = fmSaves.map((s) => s.id).join('|');
  const { data: defaultFolder } = useQuery({ queryKey: ['fm', 'default-folder'], queryFn: () => invoke<string | null>('fm_default_folder') });
  useEffect(() => {
    if (!ids) return;
    let stop = false;
    let busy = false;
    const tick = async () => {
      if (busy) return;
      busy = true;
      try {
        for (const id of ids.split('|')) {
          if (stop) return;
          const settings = await fmData.settings(id);
          const folder = settings.fmFolder ?? defaultFolder ?? '';
          if (!settings.fmBackups || !settings.fmSaveFile || !folder) continue;
          const files = await invoke<FmSaveFile[]>('fm_list_saves', { folder }).catch(() => [] as FmSaveFile[]);
          const file = backupDue(settings, files, Date.now());
          if (!file) continue;
          try {
            await makeBackup(id, folder, file, settings.fmBackupKeep ?? BACKUP_KEEP_DEFAULT);
            useBackupErrors.getState().set(id, null);
            qc.invalidateQueries({ queryKey: ['fm', 'backups', folder, file.name] });
            qc.invalidateQueries({ queryKey: ['fm', id, 'settings'] });
          } catch (e) {
            // Sauvegarde encore en cours d'écriture : nouvel essai à la minute suivante, sans alerte.
            const msg = String(e);
            if (!msg.includes("cours d'écriture")) useBackupErrors.getState().set(id, msg);
          }
        }
      } finally {
        busy = false;
      }
    };
    void tick();
    const t = setInterval(() => void tick(), TICK_MS);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [ids, defaultFolder, qc]);
}
