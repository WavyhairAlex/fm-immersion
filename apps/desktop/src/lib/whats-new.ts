import notes from '../i18n/whats-new.json';

/**
 * « Quoi de neuf » : une note par version, écrite pour les joueurs (pas pour les développeurs), dans
 * `src/i18n/whats-new.json`, la plus récente en tête. Après une mise à jour, l'appli montre une fois les notes
 * des versions que le joueur n'a pas encore vues ; l'historique complet reste sur l'écran /nouveautes.
 * Le test `whats-new.test.ts` refuse une version de package.json sans sa note.
 */
export interface WhatsNewEntry {
  version: string;
  /** Date de sortie, AAAA-MM-JJ. */
  date: string;
  fr: string[];
  en: string[];
}

export const WHATS_NEW: WhatsNewEntry[] = notes;

/** Dernière version dont le joueur a vu les nouveautés. */
export const SEEN_KEY = 'fmi.whatsNew.seen';

/** Au plus autant de versions dans la fenêtre : au-delà, le lien vers l'historique suffit. */
export const MAX_SHOWN = 8;

/** Compare deux numéros « 0.1.113 » : négatif si a est plus ancien que b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/**
 * Notes à montrer au démarrage. `seen` = dernière version vue (null : la clé n'existe pas encore).
 * - Version vue à jour : rien.
 * - Clé absente sur une appli déjà utilisée (`usedBefore`, mise à jour depuis une version d'avant cette fenêtre) :
 *   les dernières nouveautés, pour qu'il ne rate pas celles-ci.
 * - Clé absente sur une première installation : rien (il découvre l'appli, pas une mise à jour).
 */
export function entriesToShow(seen: string | null, current: string, usedBefore: boolean, all: WhatsNewEntry[] = WHATS_NEW): WhatsNewEntry[] {
  const upTo = all.filter((e) => compareVersions(e.version, current) <= 0);
  if (seen == null) return usedBefore ? upTo.slice(0, 3) : [];
  return upTo.filter((e) => compareVersions(e.version, seen) > 0).slice(0, MAX_SHOWN);
}

/** Texte d'une note dans la langue de l'interface (le français par défaut). */
export const entryLines = (e: WhatsNewEntry, lang: string) => (lang.startsWith('en') ? e.en : e.fr);

export function readSeen(): { seen: string | null; usedBefore: boolean } {
  try {
    const seen = localStorage.getItem(SEEN_KEY);
    let usedBefore = false;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('fmi.') && k !== SEEN_KEY) usedBefore = true;
    }
    return { seen, usedBefore };
  } catch {
    // Stockage indisponible : on ne montre rien plutôt que la fenêtre à chaque lancement.
    return { seen: null, usedBefore: false };
  }
}

export function markSeen(version: string) {
  try {
    localStorage.setItem(SEEN_KEY, version);
  } catch {
    /* stockage indisponible */
  }
}
