import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';

/** État du jeu et du plugin vu par l'appli (commande `fm_bridge_status`). */
export type BridgeStatus = { gameFound: boolean; bepinex: boolean; running: boolean; installedVersion: string | null };

export const GAME_DIR_KEY = 'fmi.gameDir';

/** Dossier de FM27 : celui retenu dans les réglages du plugin, sinon celui trouvé sur le PC. */
export function useGameDir(): string {
  const { data: found } = useQuery({ queryKey: ['fm', 'bridge', 'default-dir'], queryFn: () => invoke<string | null>('fm_bridge_default_game_dir') });
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(GAME_DIR_KEY);
  } catch {
    /* stockage indisponible */
  }
  return saved || found || '';
}

/** FM27 lancé ou non, suivi toutes les 15 s pour la barre d'état (une liste des processus, rien dans le jeu). */
export function useGameStatus() {
  const gameDir = useGameDir();
  const { data } = useQuery({
    queryKey: ['fm', 'bridge', 'status', gameDir],
    queryFn: () => invoke<BridgeStatus>('fm_bridge_status', { gameDir }),
    enabled: !!gameDir,
    refetchInterval: 15_000,
  });
  return { gameDir, status: data ?? null };
}
