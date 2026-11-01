import { createContext, useContext } from 'react';

/**
 * Réglages d'écran retenus sur ce PC (localStorage), rangés par partie : deux carrières FM
 * n'ont ni la même checklist d'entraînement, ni le même style choisi.
 *
 * Avant le lien partie ↔ sauvegarde, ces réglages étaient communs à toutes les parties.
 * La plus ancienne partie FM les reprend (`inheritsLegacy`) tant qu'elle n'a rien enregistré à son nom.
 */
export interface FmSaveScope {
  saveId: string;
  inheritsLegacy: boolean;
}

export const FmSaveScopeContext = createContext<FmSaveScope>({ saveId: '', inheritsLegacy: true });

export const useFmSaveScope = () => useContext(FmSaveScopeContext);

export const scopedKey = (base: string, saveId: string) => (saveId ? `${base}@${saveId}` : base);

/** Lit la valeur JSON de la partie, ou l'ancienne valeur commune si la partie en hérite. */
export function readScoped<T>(base: string, scope: FmSaveScope, fallback: T, legacyKey = base): T {
  try {
    const own = localStorage.getItem(scopedKey(base, scope.saveId));
    const raw = own ?? (scope.inheritsLegacy ? localStorage.getItem(legacyKey) : null);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeScoped(base: string, scope: FmSaveScope, value: unknown) {
  try {
    localStorage.setItem(scopedKey(base, scope.saveId), JSON.stringify(value));
  } catch {
    /* stockage indisponible : le réglage n'est pas retenu */
  }
}
