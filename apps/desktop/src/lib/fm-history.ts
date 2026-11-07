import { invoke } from '@tauri-apps/api/core';
import { fmData } from './data';

export type FmHistoryFile = { gameDate: string; club: string | null; bytes: number };

/** Jours importés par passage : assez pour rattraper une semaine de jeu d'un coup, sans bloquer l'écran des heures. */
export const HISTORY_BATCH = 30;

/**
 * Historique automatique : le plugin garde un instantané par jour de jeu (`archivix-AAAA-MM-JJ.json`), même quand
 * FM Immersion est fermé. À chaque passage, les jours de notre club absents de la partie sont importés, du plus
 * ancien au plus récent, par lots : l'historique (matchs et leurs chiffres, courbes, gazettes) se construit tout
 * seul, sans bouton. Les jours d'un autre club restent à importer à la main (reprise de carrière).
 * Renvoie le nombre de jours importés.
 */
export async function importMissingHistory(saveId: string, folder: string, club: string | null, limit = HISTORY_BATCH): Promise<number> {
  if (!club) return 0;
  const files = await invoke<FmHistoryFile[]>('fm_history_list', { folder });
  const have = new Set((await fmData.history(saveId)).map((h) => h.gameDate.slice(0, 10)));
  const missing = files.filter((f) => f.club === club && !have.has(f.gameDate)).slice(0, limit);
  let imported = 0;
  for (const f of missing) {
    try {
      const raw = JSON.parse(await invoke<string>('fm_history_read', { folder, gameDate: f.gameDate })) as { players?: { name?: string }[] };
      // Un fichier sans aucun nom de joueur (lecture ratée dans le jeu) est ignoré.
      if (!raw.players?.some((p) => p.name)) continue;
      await fmData.importSnapshot(saveId, raw, { force: true });
      imported++;
    } catch {
      /* fichier en cours d'écriture ou illisible : nouvel essai au prochain passage */
    }
  }
  return imported;
}
