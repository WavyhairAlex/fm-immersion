import type { FmSnapshot } from './snapshot';
import { addDays } from './training';

/** Un match du calendrier, au format attendu par l'Entraînement et l'onglet Calendrier. */
export interface SnapshotFixture {
  date: string;
  opponent: string | null;
  competition: string | null;
  home: boolean | null;
}

/**
 * Nombre de jours avant le match d'après le texte du jeu (« Dans 95 jours », « Demain », « Aujourd'hui »,
 * « In 3 days », « Tomorrow », « Today »). `null` si le texte n'est pas reconnu.
 */
export function daysUntil(text: unknown): number | null {
  if (typeof text !== 'string') return null;
  const t = text.trim().toLowerCase();
  if (!t) return null;
  if (/aujourd|today|ce jour/.test(t)) return 0;
  if (/apr[eè]s-demain|day after tomorrow/.test(t)) return 2;
  if (/demain|tomorrow/.test(t)) return 1;
  const m = t.match(/(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  if (/semaine|week/.test(t)) return n * 7;
  if (/jour|day/.test(t)) return n;
  return null;
}

/** Domicile / extérieur d'après `NextMatchLocationString` (« Domicile », « Extérieur », « Home », « Away »). */
function homeFrom(text: unknown): boolean | null {
  if (typeof text !== 'string') return null;
  const t = text.toLowerCase();
  if (/domicile|home/.test(t)) return true;
  if (/ext[eé]rieur|away/.test(t)) return false;
  return null;
}

/**
 * Calendrier de l'instantané. Le plugin ne lit pas encore de liste de matchs datés (`fixtures`) ;
 * on la reconstitue à partir de ce qu'il lit déjà : les 5 prochains matchs du club (`Next5Fixtures`,
 * texte « Dans N jours » relatif à la date du jeu) et le nom de chaque adversaire. La compétition et le
 * lieu ne sont connus que pour le prochain match. Une vraie liste `fixtures` reste prioritaire.
 */
export function snapshotFixtures(snap: Pick<FmSnapshot, 'gameDate'> & { fixtures?: unknown; nextMatch?: unknown }): SnapshotFixture[] {
  if (Array.isArray(snap.fixtures) && snap.fixtures.length) return snap.fixtures as SnapshotFixture[];
  const next = snap.nextMatch && typeof snap.nextMatch === 'object' ? (snap.nextMatch as Record<string, unknown>) : null;
  if (!next || !Array.isArray(next.next5)) return [];
  const out: SnapshotFixture[] = [];
  const seen = new Set<string>();
  next.next5.forEach((raw, i) => {
    const f = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
    const n = daysUntil(f?.DisplayValue);
    if (n == null || n < 0) return;
    const date = addDays(snap.gameDate, n);
    const opponent = typeof next[`next5Opponent${i}`] === 'string' ? (next[`next5Opponent${i}`] as string) : null;
    const key = `${date}|${opponent}`;
    if (seen.has(key)) return;
    seen.add(key);
    const first = i === 0;
    out.push({
      date,
      opponent,
      competition: first && typeof next.competition === 'string' ? next.competition : null,
      home: first ? homeFrom(next.location) : null,
    });
  });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Jours avant le prochain match de l'instantané (0 = aujourd'hui), ou null s'il n'est pas connu. */
export function nextMatchInDays(snap: Pick<FmSnapshot, 'gameDate'> & { fixtures?: unknown; nextMatch?: unknown }): number | null {
  const first = snapshotFixtures(snap).find((f) => f.date >= snap.gameDate);
  if (first) return Math.round((new Date(first.date).getTime() - new Date(snap.gameDate).getTime()) / 86_400_000);
  const next = snap.nextMatch && typeof snap.nextMatch === 'object' ? (snap.nextMatch as Record<string, unknown>) : null;
  return typeof next?.inDays === 'number' ? next.inDays : daysUntil(next?.inDays);
}
