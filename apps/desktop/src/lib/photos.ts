import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useEffect, useState } from 'react';

/**
 * Photos de situation : moteur d'images téléchargé sur clic du joueur (ComfyUI portable, Qwen Image Edit 2511,
 * OWLv2 ; ~34 Go), rangé dans `%LOCALAPPDATA%\app.fmimmersion.desktop\photos`. Le manifeste (adresses épinglées,
 * tailles, SHA-256) est embarqué dans l'exe : voir `src-tauri/photos-manifest.json` et `photos_remote.rs`.
 */
export type PhotosFileState = 'ready' | 'partial' | 'missing';
export type PhotosFileStatus = {
  name: string;
  component: 'comfyui' | 'qwen' | 'owlv2';
  size: number;
  onDisk: number;
  state: PhotosFileState;
};
export type PhotosStatus = {
  dir: string;
  manifestVersion: string;
  comfyuiVersion: string;
  total: number;
  onDisk: number;
  ready: boolean;
  downloading: boolean;
  files: PhotosFileStatus[];
};
export type PhotosProgress = {
  name: string;
  component: string;
  received: number;
  size: number;
  doneBytes: number;
  totalBytes: number;
};

export const PHOTOS_STATUS_KEY = ['photos', 'status'] as const;

/** État du moteur sur ce PC (fichiers complets, partiels, manquants). */
export function usePhotosStatus() {
  return useQuery({
    queryKey: PHOTOS_STATUS_KEY,
    queryFn: () => invoke<PhotosStatus>('photos_remote_status'),
  });
}

/** Avancement du téléchargement en cours (null hors téléchargement). */
export function usePhotosProgress(active: boolean) {
  const [progress, setProgress] = useState<PhotosProgress | null>(null);
  useEffect(() => {
    if (!active) {
      setProgress(null);
      return;
    }
    const off = listen<PhotosProgress>('photos-download', (e) => setProgress(e.payload));
    return () => {
      off.then((f) => f());
    };
  }, [active]);
  return progress;
}

/** Actions : télécharger ce qui manque (reprise automatique), arrêter, tout supprimer. */
export function usePhotosActions() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: PHOTOS_STATUS_KEY });
  return {
    download: async () => {
      try {
        return await invoke<PhotosStatus>('photos_remote_download');
      } finally {
        await refresh();
      }
    },
    cancel: () => invoke<void>('photos_remote_cancel'),
    remove: async () => {
      try {
        return await invoke<PhotosStatus>('photos_remote_remove');
      } finally {
        await refresh();
      }
    },
  };
}

/** « 33,7 Go » / « 850 Mo », selon la langue. */
export function formatBytes(bytes: number, locale: string): string {
  const go = bytes / 1e9;
  const unit = locale.startsWith('fr') ? ['Go', 'Mo'] : ['GB', 'MB'];
  if (go >= 1) return `${go.toLocaleString(locale, { maximumFractionDigits: 1 })} ${unit[0]}`;
  return `${Math.round(bytes / 1e6).toLocaleString(locale)} ${unit[1]}`;
}

// ------------------------------------------------------------------ moteur (ComfyUI en processus annexe)

export type EngineStatus = {
  installed: boolean;
  running: boolean;
  port: number | null;
  comfyuiVersion: string | null;
  log: string;
};
export type EngineProgress = {
  step: 'extract' | 'start' | 'generate' | 'done';
  received: number;
  total: number;
};

export const ENGINE_STATUS_KEY = ['photos', 'engine'] as const;

export function useEngineStatus() {
  return useQuery({
    queryKey: ENGINE_STATUS_KEY,
    queryFn: () => invoke<EngineStatus>('photos_engine_status'),
  });
}

/** Avancement de l'extraction ou de l'image de test (null au repos). */
export function useEngineProgress(active: boolean) {
  const [progress, setProgress] = useState<EngineProgress | null>(null);
  useEffect(() => {
    if (!active) {
      setProgress(null);
      return;
    }
    const off = listen<EngineProgress>('photos-engine', (e) => setProgress(e.payload));
    return () => {
      off.then((f) => f());
    };
  }, [active]);
  return progress;
}

export function useEngineActions() {
  const qc = useQueryClient();
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ENGINE_STATUS_KEY });
    await qc.invalidateQueries({ queryKey: PHOTOS_STATUS_KEY });
  };
  const wrap = (cmd: string) => async () => {
    try {
      return await invoke<EngineStatus>(cmd);
    } finally {
      await refresh();
    }
  };
  return {
    install: wrap('photos_engine_install'),
    start: wrap('photos_engine_start'),
    stop: wrap('photos_engine_stop'),
    /**
     * Image de test (PNG) sous forme d'adresse blob à afficher, à libérer avec URL.revokeObjectURL.
     * `face` : la photo du coach (adresse `data:` PNG) si le joueur en a une.
     */
    test: async (face: string | null): Promise<string> => {
      try {
        const bytes = await invoke<ArrayBuffer>('photos_engine_test', { face: face ? dataUrlBytes(face) : null });
        return URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
      } finally {
        await refresh();
      }
    },
  };
}

/** Octets d'une adresse `data:` (même forme que pour `fm_write_coach_photo`). */
function dataUrlBytes(url: string): number[] {
  const bin = atob(url.slice(url.indexOf(',') + 1));
  const out = new Array<number>(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
