import { invoke } from '@tauri-apps/api/core';

/**
 * Photo d'un joueur (identifiant FM) prise dans le facepack que le joueur a installé dans le dossier `graphics`
 * de FM27, ou null. Rien n'est téléchargé : Rust lit le fichier sur le PC.
 */
export async function loadFace(id: string | number | null | undefined): Promise<HTMLImageElement | null> {
  if (id == null || id === '') return null;
  try {
    const folder = await invoke<string | null>('fm_default_folder');
    if (!folder) return null;
    const bytes = await invoke<ArrayBuffer>('fm_face', { folder, id: String(id) });
    if (!bytes || bytes.byteLength === 0) return null;
    const url = URL.createObjectURL(new Blob([bytes]));
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } catch {
    return null;
  }
}
