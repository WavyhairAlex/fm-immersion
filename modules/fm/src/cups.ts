import { inboxOf } from './coach-news';
import { calendarFixtures } from './fixtures';
import type { MatchResult } from './results';
import { competitionKind } from './rules';
import type { FmSnapshot } from './snapshot';

/**
 * Parcours en coupe (coupes nationales et européennes), d'après les matchs suivis et le calendrier complet lu par le
 * plugin (`calNN…`, matchs à venir de toutes les compétitions). Le jeu ne dit pas « éliminé » : on le déduit.
 * - Un match à venir dans la compétition : encore en course.
 * - Coupe nationale : défaite sur un match sec, ou sur l'ensemble d'une double confrontation (deux matchs contre le
 *   même adversaire à moins de 3 semaines), sans match suivant au calendrier : éliminé.
 * - Nul sans match suivant (tirs au but inconnus), coupe d'Europe (phase de groupes : une défaite n'élimine pas) :
 *   éliminé seulement si aucun match n'est revenu au calendrier 30 jours après le dernier.
 * - Victoire sans match suivant : qualifié en attendant le tirage, ou vainqueur quand la saison est finie et que ce
 *   dernier match tombe dans les trois dernières semaines (les finales se jouent en fin de saison).
 * - Supercoupe (un seul match, en début de saison) : gagnée dès la victoire. Un nul (tirs au but inconnus) attend le
 *   message du jeu (`cupFinalsWon`).
 */

export type CupStatus = 'alive' | 'through' | 'out' | 'won' | 'unknown';

export interface CupTie {
  opponent: string | null;
  date: string;
  goalsFor: number;
  goalsAgainst: number;
  /** Matchs de la confrontation (2 = aller-retour). */
  legs: number;
}

export interface CupRun {
  competition: string;
  kind: 'cup' | 'europe';
  played: number;
  wins: number;
  draws: number;
  losses: number;
  /** Tours joués (une double confrontation compte pour un). */
  ties: CupTie[];
  status: CupStatus;
  /** Tour perdu, quand le club est éliminé. */
  outBy: CupTie | null;
}

const DAY_MS = 86_400_000;
const days = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / DAY_MS);
const norm = (s: string) => s.normalize('NFC').trim().toLowerCase();

/** Supercoupe : trophée joué sur un seul match (Trophée des champions, Community Shield, Supierkubok…). */
export function isSuperCup(name: string | null | undefined): boolean {
  const n = (name ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return /super\s?(?:cup|coupe|copa|coppa|taca|kubok|kubak|puchar|kupa|pokal|beker)|supi?erkubok|superpuchar|trophee des champions|community shield|supercup/.test(n);
}

/** Compétition à élimination suivie : coupe nationale ou coupe d'Europe. */
export function cupKind(name: string | null | undefined): 'cup' | 'europe' | null {
  const k = competitionKind(name);
  return k === 'cup' || k === 'europe' ? k : null;
}

/** Le calendrier de l'instantané annonce encore un match de cette compétition. */
export function cupFixtureAhead(s: FmSnapshot, competition: string): boolean | null {
  const cal = calendarFixtures(s);
  if (!cal.length) return null;
  return cal.some((f) => f.date >= s.gameDate.slice(0, 10) && f.competition != null && norm(f.competition) === norm(competition));
}

function tiesOf(ms: MatchResult[]): CupTie[] {
  const out: CupTie[] = [];
  for (const m of ms) {
    const prev = out.at(-1);
    if (prev && prev.legs === 1 && m.opponent && prev.opponent === m.opponent && days(prev.date, m.date) <= 21) {
      prev.goalsFor += m.goalsFor!;
      prev.goalsAgainst += m.goalsAgainst!;
      prev.legs = 2;
      prev.date = m.date;
    } else out.push({ opponent: m.opponent, date: m.date, goalsFor: m.goalsFor!, goalsAgainst: m.goalsAgainst!, legs: 1 });
  }
  return out;
}

/**
 * Parcours de chaque coupe jouée, vu depuis l'instantané `last` (le plus récent de la période). `seasonOver` : la
 * saison est finie (permet de dire « vainqueur »), `seasonEnd` sa date.
 */
export function cupRuns(results: MatchResult[], last: FmSnapshot, opts: { seasonOver?: boolean; seasonEnd?: string } = {}): CupRun[] {
  const byComp = new Map<string, MatchResult[]>();
  for (const r of results) {
    if (r.matches !== 1 || r.friendly || r.goalsFor == null || r.goalsAgainst == null || !r.competition || !cupKind(r.competition)) continue;
    byComp.set(r.competition, [...(byComp.get(r.competition) ?? []), r]);
  }
  const today = last.gameDate.slice(0, 10);
  return [...byComp].map(([competition, ms]) => {
    const kind = cupKind(competition)!;
    const ties = tiesOf(ms);
    const tie = ties.at(-1)!;
    const ahead = cupFixtureAhead(last, competition);
    const margin = tie.goalsFor - tie.goalsAgainst;
    const quiet = days(tie.date, today) >= 30;
    let status: CupStatus;
    if (isSuperCup(competition) && ties.length === 1 && tie.legs === 1 && margin > 0) status = 'won';
    else if (ahead) status = 'alive';
    else if (ahead == null) status = 'unknown';
    else if (margin > 0)
      status = opts.seasonOver && kind === 'cup' && days(tie.date, opts.seasonEnd ?? today) <= 21 ? 'won' : kind === 'europe' && quiet ? 'out' : 'through';
    else if (margin < 0 && kind === 'cup') status = 'out';
    else status = quiet || opts.seasonOver ? 'out' : 'unknown';
    return {
      competition,
      kind,
      played: ms.length,
      wins: ms.filter((m) => m.goalsFor! > m.goalsAgainst!).length,
      draws: ms.filter((m) => m.goalsFor === m.goalsAgainst).length,
      losses: ms.filter((m) => m.goalsFor! < m.goalsAgainst!).length,
      ties,
      status,
      outBy: status === 'out' ? tie : null,
    };
  });
}

/** Le club a encore un match de coupe au calendrier dans les `within` jours (fin de saison repoussée). */
export function cupPending(s: FmSnapshot, within = 60): boolean {
  const today = s.gameDate.slice(0, 10);
  return calendarFixtures(s).some((f) => f.date >= today && days(today, f.date) <= within && !!cupKind(f.competition));
}

// Finale gagnée annoncée par la boîte de réception (message de la prime : « Nous avons reçu 93K € après avoir battu X en
// Finale de Betera Kubok Belarusi »). Une finale jouée en cours de saison (coupe de Biélorussie en mai) n'est pas vue
// par `cupRuns`, qui ne dit « vainqueur » qu'une fois la saison finie. Textes français et anglais.
const BEAT = /apr[eè]s avoir battu|after (?:beating|defeating)/i;
const FINAL_FR = /^finale\s+(?:de la |de l['’]|du |des |de |d['’])(.+)$/i;
const FINAL_EN = /^(?:the\s+)?(.+?)\s+final$/i;
const FINAL_OF = /^(?:the\s+)?final\s+of\s+(?:the\s+)?(.+)$/i;
// Trophée annoncé par l'actualité du jeu (« Menard mène X au sommet » : « Profitez bien des compliments à votre égard
// suite au succès de l'équipe en Supierkubok Belarusi ! »). Vu en jeu le 19/11/2026 pour une Supercoupe ; on ne garde
// que les coupes (un titre de championnat est compté par le classement final).
const SUCCESS_FR = /succ[eè]s de l['’]\s*[ée]quipe en (.+?)\s*!?\s*$/im;
const VICTORY_FR = /men[ée] (?:leur|son|votre) [ée]quipe [àa] la victoire en (.+?)\.?\s*$/im;

/** Coupes gagnées en finale d'après les messages des instantanés (une fois par compétition), avec le jour du relevé. */
export function cupFinalsWon(entries: { gameDate: string; data: FmSnapshot }[]): { date: string; competition: string }[] {
  const out: { date: string; competition: string }[] = [];
  for (const e of entries)
    for (const item of inboxOf(e.data)) {
      const told = SUCCESS_FR.exec(item.body)?.[1] ?? VICTORY_FR.exec(item.body)?.[1];
      const won = told?.trim();
      if (won && competitionKind(won) === 'cup' && !out.some((o) => norm(o.competition) === norm(won))) out.push({ date: e.gameDate.slice(0, 10), competition: won });
      if (!BEAT.test(item.body)) continue;
      for (const l of item.links) {
        if (/demi|semi|quart|quarter/i.test(l)) continue;
        const m = FINAL_FR.exec(l) ?? FINAL_OF.exec(l) ?? FINAL_EN.exec(l);
        const comp = m?.[1]?.trim();
        if (comp && !out.some((o) => norm(o.competition) === norm(comp))) out.push({ date: e.gameDate.slice(0, 10), competition: comp });
      }
    }
  return out;
}

const MONTH_AWARD = /entra[iî]neur du mois|manager of the month/i;
// Message d'un proche du club qui se réjouit du prix : seul signe que c'est bien le coach du joueur qui l'a reçu
// (l'annonce « Voici des infos concernant le vainqueur… » arrive chaque mois, quel que soit le lauréat).
const PRAISE_YOU = /parler de vous|vous plaire|(?:speak|talk)\w*\s+(?:so\s+)?(?:highly|well)\s+of\s+you|about you/i;
const AWARD_COMP = /(?:du mois|of the month)\s+(?:en|in|de|du|for)\s+(?:la |le |l['’])?(.+?)\.?$/i;

/**
 * Prix d'entraîneur du mois reçus par le coach, d'après la boîte de réception : le mois récompensé est celui qui
 * précède le message (il arrive en début de mois suivant), la compétition vient de l'annonce quand elle est là.
 */
export function managerAwards(entries: { gameDate: string; data: FmSnapshot }[]): { month: string; competition: string | null }[] {
  const out: { month: string; competition: string | null }[] = [];
  for (const e of entries) {
    const items = inboxOf(e.data).filter((i) => MONTH_AWARD.test(i.title));
    if (!items.some((i) => PRAISE_YOU.test(i.body))) continue;
    const d = new Date(`${e.gameDate.slice(0, 10)}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 10);
    const month = d.toISOString().slice(0, 7);
    if (out.some((o) => o.month === month)) continue;
    const comp = items.map((i) => AWARD_COMP.exec(i.body)?.[1]?.trim()).find(Boolean) ?? null;
    out.push({ month, competition: comp });
  }
  return out;
}

// Prix de fin de saison (« Entraîneur de l'année », « Entraîneur français de l'année », « Manager of the Year ») :
// même principe que le prix du mois, un proche s'en réjouit dans un message au même titre. L'annonce du jeu
// (« Voici des infos concernant le vainqueur de l'Entraîneur français de l'année ») nomme le prix.
const YEAR_AWARD = /entra[iî]neur\b.*\bde l['’]ann[ée]e|manager of the year/i;
const AGE_DAYS = /(\d+)\s*(jour|day|semaine|week)/i;

/** Jours écoulés depuis l'arrivée d'un message, d'après son ancienneté écrite par le jeu (0 si en heures ou inconnue). */
function ageDays(age: string | null): number {
  const m = age ? AGE_DAYS.exec(age) : null;
  if (!m) return 0;
  return Number(m[1]) * (/semaine|week/i.test(m[2]!) ? 7 : 1);
}

/**
 * Prix d'entraîneur de l'année reçus par le coach, d'après la boîte de réception : jour du message (relevé moins
 * son ancienneté) et nom du prix quand une seule annonce le donne ce jour-là (null sinon : « Entraîneur de l'année »).
 * Un même prix revu dans les relevés suivants ne compte qu'une fois.
 */
export function managerYearAwards(entries: { gameDate: string; data: FmSnapshot }[]): { date: string; award: string | null }[] {
  const out: { date: string; award: string | null }[] = [];
  for (const e of entries) {
    const items = inboxOf(e.data).filter((i) => YEAR_AWARD.test(i.title));
    const praise = items.find((i) => PRAISE_YOU.test(i.body));
    if (!praise) continue;
    const names = [
      ...new Set(
        items
          // Annonce du même jour que le message du proche : un ancien bravo resté dans la boîte ne donne pas son nom
          // au prix d'un autre entraîneur annoncé plus tard.
          .filter((i) => i !== praise && Math.abs(ageDays(i.age) - ageDays(praise.age)) <= 1)
          .flatMap((i) => i.links.filter((l) => YEAR_AWARD.test(l)))
          .map((l) => l.replace(/\.$/, '').trim()),
      ),
    ];
    const award = names.length === 1 ? names[0]! : null;
    const d = new Date(`${e.gameDate.slice(0, 10)}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ageDays(praise.age));
    const date = d.toISOString().slice(0, 10);
    // Le message reste dans la boîte plusieurs semaines : le même prix (ou un prix sans nom) revu à moins de 200 jours
    // est le même ; deux prix nommés différemment la même saison comptent chacun.
    const seen = out.find(
      (o) => Math.abs(Date.parse(o.date) - Date.parse(date)) < 200 * 86_400_000 && (!o.award || !award || norm(o.award) === norm(award)),
    );
    if (seen) {
      if (!seen.award && award) seen.award = award;
      continue;
    }
    out.push({ date, award });
  }
  return out;
}
