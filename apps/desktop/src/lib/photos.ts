import { useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";

/**
 * Photos de situation : moteur d'images téléchargé sur clic du joueur (ComfyUI portable, Qwen Image Edit 2511,
 * OWLv2 ; ~34 Go), rangé dans `%LOCALAPPDATA%\app.fmimmersion.desktop\photos`. Le manifeste (adresses épinglées,
 * tailles, SHA-256) est embarqué dans l'exe : voir `src-tauri/photos-manifest.json` et `photos_remote.rs`.
 */
export type PhotosFileState = "ready" | "partial" | "missing";
export type PhotosFileStatus = {
  name: string;
  component: "comfyui" | "qwen" | "owlv2";
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

export const PHOTOS_STATUS_KEY = ["photos", "status"] as const;

/** État du moteur sur ce PC (fichiers complets, partiels, manquants). */
export function usePhotosStatus() {
  return useQuery({
    queryKey: PHOTOS_STATUS_KEY,
    queryFn: () => invoke<PhotosStatus>("photos_remote_status"),
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
    const off = listen<PhotosProgress>("photos-download", (e) =>
      setProgress(e.payload),
    );
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
        return await invoke<PhotosStatus>("photos_remote_download");
      } finally {
        await refresh();
      }
    },
    cancel: () => invoke<void>("photos_remote_cancel"),
    remove: async () => {
      try {
        return await invoke<PhotosStatus>("photos_remote_remove");
      } finally {
        await refresh();
      }
    },
  };
}

/** « 33,7 Go » / « 850 Mo », selon la langue. */
export function formatBytes(bytes: number, locale: string): string {
  const go = bytes / 1e9;
  const unit = locale.startsWith("fr") ? ["Go", "Mo"] : ["GB", "MB"];
  if (go >= 1)
    return `${go.toLocaleString(locale, { maximumFractionDigits: 1 })} ${unit[0]}`;
  return `${Math.round(bytes / 1e6).toLocaleString(locale)} ${unit[1]}`;
}
