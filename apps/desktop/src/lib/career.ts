import { useQuery } from '@tanstack/react-query';
import { create } from 'zustand';
import { savesData } from './data';
import type { FmOtherSaveError } from './fm';

/**
 * Partie FM suivie par toute l'appli (accueil, écrans du club, gazette, défis, Discord) : choisie une fois,
 * dans la carte de carrière en haut de la barre latérale. Même clé que l'ancien choix du mode Gazette, que
 * l'envoi automatique de la gazette lit aussi : le choix fait avant la refonte est repris tel quel.
 */
export const CAREER_KEY = 'fmi.gazette.save';

const read = () => {
  try {
    return localStorage.getItem(CAREER_KEY) ?? '';
  } catch {
    return '';
  }
};

/** État de la lecture du plugin, partagé entre la barre latérale, l'en-tête et les réglages. */
export interface SyncState {
  /** Date de jeu depuis laquelle le manager est sans club (null = il entraîne un club). */
  free: string | null;
  /** Instantané d'une autre sauvegarde chargée dans FM27 : rien n'est importé sans confirmation. */
  other: FmOtherSaveError | null;
  /** Plugin installé et à jour (null = pas encore vérifié). */
  bridgeOk: boolean | null;
  /**
   * Date de jeu actuelle et club, d'après archivix-status.json. Depuis le plugin 0.5.3, ce fichier suit la date du jeu
   * toutes les 10 s, alors que l'instantané complet (1 à 2 min de lecture) garde la date du début de sa lecture.
   */
  now: { gameDate: string; club: string | null } | null;
}

/**
 * Date de jeu à afficher : celle du jeu (état du plugin) quand elle concerne le même club et n'est pas plus ancienne
 * que l'instantané, sinon celle de l'instantané. Évite d'afficher plusieurs jours de retard pendant que le joueur avance.
 */
export function shownGameDate(snapshot: { gameDate: string; club: string } | null | undefined, now: SyncState['now']): string | null {
  if (!snapshot) return now?.gameDate ?? null;
  if (now && now.club === snapshot.club && now.gameDate.slice(0, 10) > snapshot.gameDate.slice(0, 10)) return now.gameDate;
  return snapshot.gameDate;
}

interface CareerState {
  saveId: string;
  setSaveId: (id: string) => void;
  sync: SyncState;
  setSync: (patch: Partial<SyncState>) => void;
  /** Écrans où le briefing de l'adjoint laisse quelque chose à faire, pour la date de jeu `at`. */
  todo: { at: string; views: string[] };
  setTodo: (todo: { at: string; views: string[] }) => void;
  /** Messages encore ouverts du briefing de l'adjoint (déjà rédigés), repris en tête de chaque écran du club. */
  brief: { at: string; items: BriefLine[] };
  setBrief: (brief: { at: string; items: BriefLine[] }) => void;
}

/** Un message du briefing, prêt à afficher : l'écran où agir, le ton, la phrase et le libellé du bouton. */
export interface BriefLine {
  key: string;
  view: string;
  tone: 'bad' | 'warn' | 'info' | 'good';
  text: string;
  action: string;
}

/** Même date de jeu et même club : l'ancien objet est gardé. */
function sameNow(prev: SyncState['now'], next: SyncState['now'] | undefined): SyncState['now'] {
  if (next === undefined) return prev;
  return prev && next && prev.gameDate === next.gameDate && prev.club === next.club ? prev : next;
}

/** Le correctif change-t-il quelque chose à l'état de lecture ? */
function syncChanged(prev: SyncState, patch: Partial<SyncState>): boolean {
  return (Object.keys(patch) as (keyof SyncState)[]).some((k) => (k === 'now' ? sameNow(prev.now, patch.now) !== prev.now : patch[k] !== prev[k]));
}

export const useCareerStore = create<CareerState>((set) => ({
  saveId: read(),
  setSaveId: (saveId) => {
    try {
      localStorage.setItem(CAREER_KEY, saveId);
    } catch {
      /* stockage indisponible : le choix n'est pas retenu */
    }
    set({ saveId, sync: { free: null, other: null, bridgeOk: null, now: null }, todo: { at: '', views: [] }, brief: { at: '', items: [] } });
  },
  sync: { free: null, other: null, bridgeOk: null, now: null },
  // La lecture du plugin repasse toutes les 5 s : sans changement réel, l'état garde la même référence, sinon tout écran
  // abonné à `sync` (dont l'écran de la partie entier) se redessinait toutes les 5 s et l'appli saccadait.
  setSync: (patch) => set((s) => (syncChanged(s.sync, patch) ? { sync: { ...s.sync, ...patch, now: sameNow(s.sync.now, patch.now) } } : s)),
  todo: { at: '', views: [] },
  setTodo: (todo) => set({ todo }),
  brief: { at: '', items: [] },
  setBrief: (brief) => set({ brief }),
}));

/**
 * Carrière suivie : la partie choisie si elle existe encore, sinon la plus récente.
 * `saveId` est vide tant qu'aucune partie FM n'existe.
 */
export function useCareer() {
  const chosen = useCareerStore((s) => s.saveId);
  const setSaveId = useCareerStore((s) => s.setSaveId);
  const { data: saves, isLoading } = useQuery({ queryKey: ['saves'], queryFn: savesData.list });
  const fmSaves = (saves ?? []).filter((s) => s.gameId === 'fm');
  const save = fmSaves.find((s) => s.id === chosen) ?? fmSaves[0];
  return { saveId: save?.id ?? '', save, fmSaves, setSaveId, isLoading };
}
