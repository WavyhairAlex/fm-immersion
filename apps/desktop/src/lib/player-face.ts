import { invoke } from '@tauri-apps/api/core';

/**
 * Photos des joueurs et du staff (identifiant FM) : facepack installé par le joueur dans le dossier `graphics` de
 * FM27, ou portrait photoréaliste noté par le plugin des visages. Rien n'est téléchargé : Rust lit le fichier sur
 * le PC. Les octets et les URL sont gardés en mémoire par identifiant pour toute la session.
 */
const PNG = [0x89, 0x50, 0x4e, 0x47];
const bytesCache = new Map<string, Promise<Uint8Array | null>>();
const urlCache = new Map<string, Promise<string | null>>();

/** Octets de l'image (PNG ou JPG du facepack), ou null. */
export function faceBytes(id: string | number | null | undefined): Promise<Uint8Array | null> {
  if (id == null || id === '') return Promise.resolve(null);
  const key = String(id);
  let p = bytesCache.get(key);
  if (!p) {
    p = (async () => {
      try {
        const folder = await invoke<string | null>('fm_default_folder');
        if (!folder) return null;
        const bytes = await invoke<ArrayBuffer>('fm_face', { folder, id: key });
        return bytes && bytes.byteLength > 0 ? new Uint8Array(bytes) : null;
      } catch {
        return null;
      }
    })();
    bytesCache.set(key, p);
  }
  return p;
}

/** Octets seulement s'il s'agit d'un PNG (ce que Discord accepte en pièce jointe). */
export async function facePng(id: string | number | null | undefined): Promise<Uint8Array | null> {
  const b = await faceBytes(id);
  return b && PNG.every((v, i) => b[i] === v) ? b : null;
}

/** URL affichable (`blob:`) de la photo, ou null. */
export function faceUrl(id: string | number | null | undefined): Promise<string | null> {
  if (id == null || id === '') return Promise.resolve(null);
  const key = String(id);
  let p = urlCache.get(key);
  if (!p) {
    p = faceBytes(key).then((b) => (b ? URL.createObjectURL(new Blob([b as BlobPart])) : null));
    urlCache.set(key, p);
  }
  return p;
}

/** Image décodée (pour dessiner sur un canvas : une de la gazette, tableau du direct), ou null. */
export async function loadFace(id: string | number | null | undefined): Promise<HTMLImageElement | null> {
  try {
    const url = await faceUrl(id);
    if (!url) return null;
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } catch {
    return null;
  }
}
