import { reviewOf, seasonSegments, type SeasonReview } from './season';
import type { FmSnapshot } from './snapshot';

type Entry = { gameDate: string; data: FmSnapshot };

/** Départ du coach : limogé par la direction, ou parti de lui-même (démission, autre club). */
export type ExitReason = 'sacked' | 'left';

/** Une saison du passage au club, pour le tableau du hors-série. */
export interface FarewellSeason {
  label: string;
  /** Place au championnat à la fin de la saison (ou au départ, si elle n'était pas finie). */
  position: number | null;
  ended: boolean;
  played: number;
  wins: number;
  draws: number;
  losses: number;
}

/** Hors-série « Flash spécial » : le coach quitte son club, avec le bilan de tout son passage. */
export interface CoachExit {
  club: string;
  /** Premier et dernier jour suivis au club (ISO). */
  start: string;
  end: string;
  /** Club suivant, ou null s'il est sans club. */
  next: string | null;
  /** Raison devinée d'après la sécurité de l'emploi au dernier relevé (le joueur peut la corriger). */
  reason: ExitReason;
  seasons: FarewellSeason[];
  /** Bilan de tout le passage (matchs, buts, meilleur buteur, plus large victoire…). */
  total: SeasonReview;
  /** Titres : championnats finis en tête (competition null), coupes gagnées. */
  trophies: { season: string; competition: string | null }[];
  /** Meilleure place finale au championnat (saisons finies), null sans saison finie. */
  bestFinish: number | null;
}

const equipe = (s: FmSnapshot): Record<string, unknown> => (s as { custom?: { equipe?: Record<string, unknown> } }).custom?.equipe ?? {};
const INSECURE = /insécur|danger|menac|precarious|insecure|under threat/i;

/** Un passage du coach dans un club : ses instantanés, et s'il l'a quitté (raison devinée, club suivant). */
export interface CoachSpell {
  club: string;
  entries: Entry[];
  left: boolean;
  next: string | null;
  reason: ExitReason;
}

/**
 * Passages du coach dans l'historique, du plus ancien au plus récent : chaque changement de club en clôt un, et le
 * dernier club aussi quand le coach est sans club depuis (`freeSince`, lu en direct par le plugin). Le licenciement
 * est supposé quand la sécurité de l'emploi était menacée au dernier relevé ; sinon c'est un départ.
 */
export function coachSpells(history: Entry[], opts: { freeSince?: string | null } = {}): CoachSpell[] {
  const sorted = [...history].sort((a, b) => a.gameDate.localeCompare(b.gameDate));
  const spells: Entry[][] = [];
  for (const e of sorted) {
    const cur = spells.at(-1);
    if (cur && cur[0]!.data.club === e.data.club) cur.push(e);
    else spells.push([e]);
  }
  return spells.map((spell, i) => {
    const next = spells[i + 1]?.[0]!.data.club ?? null;
    const last = spell.at(-1)!;
    const job = equipe(last.data).securiteEmploi;
    return {
      club: spell[0]!.data.club,
      entries: spell,
      left: !!next || !!(opts.freeSince && opts.freeSince >= last.gameDate),
      next,
      reason: typeof job === 'string' && INSECURE.test(job) ? 'sacked' : 'left',
    };
  });
}

/** Départs du coach dans l'historique (passages quittés, voir `coachSpells`), du plus récent au plus ancien. */
export function coachExits(history: Entry[], opts: { freeSince?: string | null } = {}): CoachExit[] {
  const out: CoachExit[] = [];
  for (const sp of coachSpells(history, opts)) {
    if (!sp.left) continue;
    const spell = sp.entries;
    const last = spell.at(-1)!;
    const segs = seasonSegments(spell);
    const seasons = segs.map((s) => {
      const r = reviewOf(s.entries, !s.ended);
      return { label: r.label, position: r.position, ended: s.ended, played: r.played, wins: r.wins, draws: r.draws, losses: r.losses, cups: r.cups };
    });
    const trophies = [
      ...seasons.filter((s) => s.ended && s.position === 1).map((s) => ({ season: s.label, competition: null })),
      ...seasons.flatMap((s) => s.cups.filter((c) => c.status === 'won').map((c) => ({ season: s.label, competition: c.competition }))),
    ];
    const finished = seasons.filter((s) => s.ended && s.position != null).map((s) => s.position!);
    out.push({
      club: sp.club,
      start: spell[0]!.gameDate,
      end: last.gameDate,
      next: sp.next,
      reason: sp.reason,
      seasons: seasons.map(({ cups: _c, ...s }) => s),
      total: reviewOf(spell, false),
      trophies,
      bestFinish: finished.length ? Math.min(...finished) : null,
    });
  }
  return out.reverse();
}
