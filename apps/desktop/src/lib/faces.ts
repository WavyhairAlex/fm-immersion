import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';

/** Manifeste d'un pack V2 (release « v2-progression » ou atelier local), tel que renvoyé par Rust. */
export type PackManifest = {
  version: string | null;
  a2b: number | null;
  d2: number | null;
  v1: number | null;
  crc: number;
  size: number;
  sha256: string | null;
  url: string | null;
};
export type PackOffer = {
  manifest: PackManifest;
  source: 'remote' | 'local';
  path: string | null;
};
export type RemoteCheck = {
  remote: PackManifest | null;
  remoteError: string | null;
  local: PackManifest | null;
  installedVersion: string | null;
  installedCrc: number | null;
  offer: PackOffer | null;
};

/** Clés partagées avec le plugin et l'écran Visages : les dossiers ne sont demandés qu'une fois. */
export const GAME_DIR_KEY = 'fmi.gameDir';
export const WORKSHOP_KEY = 'fmi.faces.workshop';

export const readKey = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
export const writeKey = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* stockage indisponible : la valeur sera redemandée */
  }
};

/** Dossiers du jeu et de l'atelier : réglage mémorisé, sinon détection automatique. */
export function useFacesDirs() {
  const { data: defaultDir } = useQuery({
    queryKey: ['fm', 'bridge', 'default-dir'],
    queryFn: () => invoke<string | null>('fm_bridge_default_game_dir'),
  });
  const { data: defaultWorkshop } = useQuery({
    queryKey: ['faces', 'workshop-default'],
    queryFn: () => invoke<string | null>('faces_default_workshop'),
  });
  return {
    gameDir: readKey(GAME_DIR_KEY) || defaultDir || '',
    workshop: readKey(WORKSHOP_KEY) || defaultWorkshop || '',
  };
}

/**
 * Nouveau pack de visages V2 à proposer (publié sur GitHub au fil des lots, ou construit dans l'atelier local).
 * Le manifeste est lu une fois à l'ouverture de l'appli, puis toutes les heures.
 */
export function useFacesUpdate(gameDir: string, workshop: string) {
  return useQuery({
    queryKey: ['faces', 'remote', gameDir, workshop],
    queryFn: () =>
      invoke<RemoteCheck>('faces_remote_check', {
        gameDir,
        workshopDir: workshop || null,
      }),
    enabled: !!gameDir,
    staleTime: 60 * 60_000,
    refetchInterval: 60 * 60_000,
    retry: false,
  });
}

/** Nombre de portraits V2 d'un pack (base qualité + autres lots). */
export const v2Count = (m: PackManifest) => (m.a2b ?? 0) + (m.d2 ?? 0);

/** État du pack sur le PC du joueur, en une étiquette : rien d'installé, à jour, mise à jour disponible… */
export function pcState(state: string, offer: boolean): 'noGame' | 'none' | 'upToDate' | 'update' | 'unknown' {
  if (state === 'noGame') return 'noGame';
  if (state === 'photorealV1' || state === 'photorealCustom') return offer ? 'update' : 'upToDate';
  if (state === 'unknown') return 'unknown';
  return offer ? 'update' : 'none';
}

/** Date courte d'un pack (« 08/11 ») à partir de sa version « AAAA-MM-JJ hh:mm:ss » ; sinon la version telle quelle. */
export function packDate(version: string | null | undefined, lang: string): string {
  if (!version) return '?';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(version);
  if (!m) return version;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString(lang, { day: '2-digit', month: '2-digit' });
}
