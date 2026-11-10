import type { BreakingNews } from '@fm-immersion/module-fm';
import { isCoachBreaking } from '@fm-immersion/module-fm';
import { invoke } from '@tauri-apps/api/core';
import { facePng } from './player-face';
import { imageToPngBytes, type EngineStatus, type Outcome } from './photos';

/**
 * Photos de situation dans les envois Discord : quelle scène pour quel événement, et comment obtenir la photo
 * (faite sur le PC par le moteur d'images, ou reprise de la bibliothèque si elle existe déjà pour cet événement).
 *
 * Réglage du joueur (gardé sur ce PC) :
 * - `off` : jamais de photo de situation, les dépêches gardent le portrait ;
 * - `manual` : la photo se fait sur son clic dans « Gazette et Discord », avant l'envoi ; l'envoi automatique part sans ;
 * - `auto` : l'envoi automatique fait la photo lui-même avant d'envoyer (deux à quatre minutes), portrait si elle échoue.
 */
export type PhotoMode = 'off' | 'manual' | 'auto';
const MODE_KEY = 'fmi.photos.mode';

export function getPhotoMode(): PhotoMode {
  try {
    const v = localStorage.getItem(MODE_KEY);
    return v === 'manual' || v === 'auto' ? v : 'off';
  } catch {
    return 'off';
  }
}

export function setPhotoMode(mode: PhotoMode) {
  try {
    if (mode === 'off') localStorage.removeItem(MODE_KEY);
    else localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* stockage indisponible : le réglage reste « off » */
  }
}

/** Qui pose : le joueur de la dépêche, le coach, ou les deux (image 1 = coach, image 2 = joueur). */
export type PhotoCast = 'player' | 'coach' | 'duo';
export type PhotoChoice = { scene: string; cast: PhotoCast };

/** Petit hachage stable : la même dépêche tire toujours la même scène. */
export function hashKey(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
}

const pick = <T>(items: readonly T[], key: string) => items[hashKey(key) % items.length]!;

/**
 * Scène d'une dépêche. Blessure : civière ou soutenu pour les longues absences, béquilles ou banc sinon (jamais avec
 * la photo du coach : ce sont des scènes de joueur). Recrue : présentation avec le coach quand il a sa photo, sinon
 * signature. Départ : signature (ailleurs). Avenir du coach : conférence ou consigne sur la touche.
 */
export function sceneForBreaking(n: Pick<BreakingNews, 'kind' | 'id' | 'date' | 'days'>, hasCoach: boolean): PhotoChoice | null {
  const key = `${n.kind}|${n.id}|${n.date.slice(0, 10)}`;
  if (isCoachBreaking(n)) return hasCoach ? { scene: pick(['conference', 'consigne'] as const, key), cast: 'coach' } : null;
  switch (n.kind) {
    case 'injury':
      return { scene: (n.days ?? 0) >= 90 ? pick(['civiere', 'soutenu'] as const, key) : pick(['bequilles', 'banc'] as const, key), cast: 'player' };
    case 'signing':
      return hasCoach ? { scene: 'duo_presse', cast: 'duo' } : { scene: 'signature', cast: 'player' };
    case 'exit':
      return { scene: 'signature', cast: 'player' };
    default:
      return null;
  }
}

/** Clé d'un événement dans la bibliothèque (la photo n'est faite qu'une fois par dépêche). */
export const breakingTag = (saveId: string, n: Pick<BreakingNews, 'kind' | 'id' | 'date'>) => `breaking|${saveId}|${n.kind}|${n.id}|${n.date.slice(0, 10)}`;

// ------------------------------------------------------------------ moteur

let readyCache: { at: number; ok: boolean } | null = null;

/** Le moteur d'images est installé sur ce PC (réponse gardée une minute). */
export async function photosReady(): Promise<boolean> {
  if (readyCache && Date.now() - readyCache.at < 60_000) return readyCache.ok;
  let ok = false;
  try {
    ok = (await invoke<EngineStatus>('photos_engine_status')).installed;
  } catch {
    ok = false;
  }
  readyCache = { at: Date.now(), ok };
  return ok;
}

export async function libraryImage(file: string): Promise<HTMLImageElement | null> {
  try {
    const bytes = await invoke<ArrayBuffer>('photos_library_read', { file });
    const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } catch {
    return null;
  }
}

/** Photo déjà faite pour cet événement, ou null. */
export async function existingPhoto(tag: string): Promise<HTMLImageElement | null> {
  try {
    const o = await invoke<Outcome | null>('photos_library_find', { tag });
    return o ? libraryImage(o.file) : null;
  } catch {
    return null;
  }
}

export type PhotoSubjects = { playerId?: string | null; coachPhoto?: string | null };

/** Visages dans l'ordre attendu par la scène (coach puis joueur pour un duo) ; null si l'un manque. */
export async function castFaces(cast: PhotoCast, s: PhotoSubjects): Promise<number[][] | null> {
  const coach = async () => (s.coachPhoto ? imageToPngBytes(s.coachPhoto) : null);
  const player = async () => {
    const b = await facePng(s.playerId);
    return b ? Array.from(b) : null;
  };
  const faces = cast === 'coach' ? [await coach()] : cast === 'player' ? [await player()] : [await coach(), await player()];
  return faces.every((f): f is number[] => !!f && f.length > 0) ? faces : null;
}

/**
 * Photo de situation d'un événement : celle de la bibliothèque si elle existe, sinon faite maintenant par le moteur
 * (quand `generate`), sinon null. Ne lève jamais : sans photo, l'image Discord garde le portrait.
 */
export async function photoForEvent(tag: string, choice: PhotoChoice | null, subjects: PhotoSubjects, generate: boolean): Promise<HTMLImageElement | null> {
  if (!choice) return null;
  const found = await existingPhoto(tag);
  if (found || !generate) return found;
  try {
    if (!(await photosReady())) return null;
    const faces = await castFaces(choice.cast, subjects);
    if (!faces) return null;
    const o = await invoke<Outcome>('photos_generate', { request: { scene: choice.scene, faces, tag } });
    return libraryImage(o.file);
  } catch (e) {
    console.warn('Photo de situation :', e);
    return null;
  }
}
