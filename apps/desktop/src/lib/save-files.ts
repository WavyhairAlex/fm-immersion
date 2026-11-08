import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { shownGameDate, useCareerStore } from './career';
import { fmData } from './data';
import type { FmSaveFile } from './fm';
import { useFmFolder } from './fm-sync';

/**
 * Suivi des sauvegardes FM27 (fichiers .fm du dossier games). L'appli ne lit que leur nom, leur taille et leur date
 * d'écriture : jamais leur contenu, et elle n'y écrit jamais.
 */

/** Jours de jeu sans sauvegarde à partir desquels la carte de carrière prévient. */
export const UNSAVED_DAYS_WARN = 7;

/** Jours entre deux dates de jeu (ISO, l'heure est ignorée). */
export function gameDaysBetween(from: string, to: string): number {
  const a = Date.parse(from.slice(0, 10));
  const b = Date.parse(to.slice(0, 10));
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

export type SaveAlert =
  /** Le fichier lié n'est plus dans le dossier games (renommé, supprimé, ou mauvais dossier). */
  | { kind: 'missing'; file: string }
  /** La partie a avancé d'au moins `UNSAVED_DAYS_WARN` jours de jeu depuis la dernière écriture du fichier. */
  | { kind: 'unsaved'; days: number }
  | null;

/**
 * Alerte de la carrière : rien tant que la liste des fichiers n'est pas lue, ni pour une carrière sans fichier lié
 * (le lien se fait sur l'écran des sauvegardes, sans insister).
 */
export function saveAlert(linked: string | undefined, files: FmSaveFile[] | undefined, savedGameDate: string | null | undefined, currentGameDate: string | null): SaveAlert {
  if (!linked || !files) return null;
  if (!files.some((f) => f.name === linked)) return { kind: 'missing', file: linked };
  if (!savedGameDate || !currentGameDate) return null;
  const days = gameDaysBetween(savedGameDate, currentGameDate);
  return days >= UNSAVED_DAYS_WARN ? { kind: 'unsaved', days } : null;
}

/** Fichiers .fm du dossier games (à côté du dossier du plugin), le plus récent d'abord, relus chaque minute. */
export function useSaveFiles(folder: string) {
  return useQuery({
    queryKey: ['fm', 'save-files', folder],
    queryFn: () => invoke<FmSaveFile[]>('fm_list_saves', { folder }),
    enabled: !!folder,
    refetchInterval: 60_000,
  });
}

/** Date de jeu au moment où le fichier lié a été écrit (d'après les instantanés importés avant). */
export function useSavedGameDate(saveId: string, file: FmSaveFile | undefined) {
  const ms = file?.modifiedMs ?? null;
  return useQuery({
    queryKey: ['fm', saveId, 'saved-game-date', ms],
    queryFn: () => fmData.gameDateAt(saveId, new Date(ms!).toISOString()),
    enabled: !!saveId && ms != null,
  });
}

/**
 * État de la sauvegarde liée à une carrière : le fichier, la date de jeu à laquelle il a été écrit, les jours de
 * jeu depuis, et l'alerte à montrer. `current` : carrière suivie (sa date de jeu vient du plugin presque en direct).
 */
export function useSaveStatus(saveId: string, current = true) {
  const folder = useFmFolder(saveId);
  const { data: files } = useSaveFiles(folder);
  const { data: settings } = useQuery({ queryKey: ['fm', saveId, 'settings'], queryFn: () => fmData.settings(saveId), enabled: !!saveId });
  const { data: snapshot } = useQuery({ queryKey: ['fm', saveId, 'latest'], queryFn: () => fmData.latest(saveId), enabled: !!saveId });
  const now = useCareerStore((s) => s.sync.now);
  const linked = settings?.fmSaveFile;
  const file = linked ? files?.find((f) => f.name === linked) : undefined;
  const { data: savedGameDate } = useSavedGameDate(saveId, file);
  const gameDate = current ? shownGameDate(snapshot, now) : (snapshot?.gameDate ?? null);
  const days = savedGameDate && gameDate ? Math.max(0, gameDaysBetween(savedGameDate, gameDate)) : null;
  return { folder, files, linked, file, snapshot, gameDate, savedGameDate: savedGameDate ?? null, days, alert: saveAlert(linked, files, savedGameDate, gameDate) };
}
