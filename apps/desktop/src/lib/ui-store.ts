import type { Target } from '@fm-immersion/module-fm';
import { create } from 'zustand';

/** État d'interface local (pas de données serveur ici : elles passent par TanStack Query). */
interface UiState {
  createSaveOpen: boolean;
  setCreateSaveOpen: (open: boolean) => void;
  /** Recherche rapide (Ctrl+K) ouverte. */
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  /** Fiche joueur demandée par la recherche rapide : l'écran du club l'ouvre puis remet à null. */
  openPlayer: string | null;
  setOpenPlayer: (id: string | null) => void;
  /**
   * Joueur d'un autre club demandé depuis FM27 (bouton de sa fiche dans le jeu), lu dans la base du jeu ou dans les
   * cibles suivies : la fiche joueur l'affiche à côté de l'effectif.
   */
  externalPlayer: Target | null;
  setExternalPlayer: (p: Target | null) => void;
}

export const useUi = create<UiState>((set) => ({
  createSaveOpen: false,
  setCreateSaveOpen: (createSaveOpen) => set({ createSaveOpen }),
  searchOpen: false,
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  openPlayer: null,
  setOpenPlayer: (openPlayer) => set({ openPlayer }),
  externalPlayer: null,
  setExternalPlayer: (externalPlayer) => set({ externalPlayer }),
}));
