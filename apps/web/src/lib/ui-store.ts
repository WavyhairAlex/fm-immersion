import { create } from 'zustand';

/** État d'interface local (pas de données serveur ici : elles passent par TanStack Query). */
interface UiState {
  createSaveOpen: boolean;
  setCreateSaveOpen: (open: boolean) => void;
}

export const useUi = create<UiState>((set) => ({
  createSaveOpen: false,
  setCreateSaveOpen: (createSaveOpen) => set({ createSaveOpen }),
}));
