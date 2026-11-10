import type { FmSnapshot } from './snapshot';
import { addDays, detectWinterBreak, type WinterBreak } from './training';

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

/** Nombre de matchs du calendrier lus un par un dans `chemins.json` (clés `cal00Date` à `cal39Date`). */
export const CALENDAR_SLOTS = 40;

/** Date du jeu (« GameDate { Data1 = 265740837, … } ») en ISO : année = Data1 >> 17, jour de l'année = (Data1 >> 8) & 0x1FF. */
export function decodeGameDate(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const m = text.match(/Data1 = (\d+)/);
  if (!m) return null;
  const d = Number(m[1]);
  const year = Math.floor(d / 2 ** 17);
  const doy = Math.floor(d / 256) & 0x1ff;
  if (year < 1900 || doy < 1 || doy > 366) return null;
  return new Date(Date.UTC(year, 0, doy)).toISOString().slice(0, 10);
}

const norm = (s: string) => s.normalize('NFC').trim().toLowerCase();

/**
 * Calendrier complet de la saison, lu match par match par le plugin (07/11/2026) : `custom.equipe.calNNDate`,
 * `calNNDom`, `calNNExt`, `calNNComp` pour le NN-ième match à venir de `FixtureList` (toutes compétitions).
 * L'adversaire est l'équipe qui n'est pas le club. Vide si le plugin ne lit pas ces clés.
 */
export function calendarFixtures(snap: { club?: string; custom?: unknown }): SnapshotFixture[] {
  const eq = (snap.custom as { equipe?: Record<string, unknown> } | undefined)?.equipe;
  if (!eq) return [];
  const club = typeof snap.club === 'string' ? norm(snap.club) : null;
  const text = (v: unknown) => (typeof v === 'string' && v.trim() && !v.startsWith('FM.UI.') ? v.trim() : null);
  const out: SnapshotFixture[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < CALENDAR_SLOTS; i++) {
    const n = String(i).padStart(2, '0');
    const date = decodeGameDate(eq[`cal${n}Date`]);
    if (!date) continue;
    const dom = text(eq[`cal${n}Dom`]);
    const ext = text(eq[`cal${n}Ext`]);
    const home = club && dom && norm(dom) === club ? true : club && ext && norm(ext) === club ? false : null;
    const opponent = home === true ? ext : home === false ? dom : null;
    const competition = text(eq[`cal${n}Comp`]);
    const key = `${date}|${opponent}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ date, opponent, competition, home });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Calendrier de l'instantané. Le plugin ne lit pas encore de liste de matchs datés (`fixtures`) ;
 * on la reconstitue à partir de ce qu'il lit déjà : les 5 prochains matchs du club (`Next5Fixtures`,
 * texte « Dans N jours » relatif à la date du jeu) et le nom de chaque adversaire. La compétition et le
 * lieu ne sont connus que pour le prochain match. Une vraie liste `fixtures` reste prioritaire, puis le calendrier complet (`calendarFixtures`).
 */
export function snapshotFixtures(snap: Pick<FmSnapshot, 'gameDate'> & { club?: string; fixtures?: unknown; nextMatch?: unknown; custom?: unknown }): SnapshotFixture[] {
  if (Array.isArray(snap.fixtures) && snap.fixtures.length) return snap.fixtures as SnapshotFixture[];
  const season = calendarFixtures(snap);
  if (season.length) {
    // Le prochain match garde sa compétition et son lieu lus à part, si le calendrier ne les donne pas.
    const next = snap.nextMatch && typeof snap.nextMatch === 'object' ? (snap.nextMatch as Record<string, unknown>) : null;
    const n = daysUntil(next?.inDays);
    const first = season[0]!;
    if (next && n != null && first.date === addDays(snap.gameDate, n)) {
      if (first.competition == null && typeof next.competition === 'string') first.competition = next.competition;
      if (first.home == null) first.home = homeFrom(next.location);
    }
    return season;
  }
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

/**
 * Compte à rebours du prochain match tel que le joueur le voit dans FM27 : le texte du jeu (« Dans 100 jours », « Demain »)
 * d'abord, car il est lu au moment où le jeu l'affiche ; le calendrier daté seulement si ce texte manque.
 */
export function nextMatchCountdown(snap: Pick<FmSnapshot, 'gameDate'> & { fixtures?: unknown; nextMatch?: unknown }): number | null {
  const next = snap.nextMatch && typeof snap.nextMatch === 'object' ? (snap.nextMatch as Record<string, unknown>) : null;
  const fromGame = typeof next?.inDays === 'number' ? next.inDays : daysUntil(next?.inDays);
  return fromGame ?? nextMatchInDays(snap);
}

/** Trêve hivernale déduite du calendrier de l'instantané (voir `detectWinterBreak`) ; le dernier match joué en marque le début. */
export function snapshotWinterBreak(snap: Parameters<typeof snapshotFixtures>[0]): WinterBreak | null {
  const e = (snap.custom as { equipe?: Record<string, unknown> } | undefined)?.equipe;
  return detectWinterBreak(snap.gameDate, snapshotFixtures(snap).map((f) => f.date).filter((d): d is string => typeof d === 'string'), decodeGameDate(e?.dernierMatchDate));
}
