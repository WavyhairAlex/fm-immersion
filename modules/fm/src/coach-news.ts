import type { FmSnapshot } from './snapshot';

type Entry = { gameDate: string; data: FmSnapshot };

/**
 * L'avenir du coach : ce que sa boîte de réception dans FM27 dit des autres clubs. Le plugin lit les 30 premiers
 * messages (`GameCurrentManager/AllNews`, clés `boiteNN{Titre,Texte,Id,Age,Club}` de la section partie de
 * chemins.json, validé en jeu le 10/11/2026) ; on repère ceux qui apparaissent d'un relevé au suivant :
 * - `interview` : un autre club le convie à un entretien (« Les dirigeants de X proposent un entretien ») ;
 * - `offer` : un autre club lui propose un contrat ;
 * - `courted` : sa propre direction sait que d'autres clubs s'intéressent à lui (« réunion pour discuter de votre
 *   avenir ») ;
 * - `linked` : la presse l'envoie sur un autre banc.
 * Les textes du jeu sont en français ou en anglais selon la langue de FM27 : les deux sont reconnus.
 */
export type CoachNewsKind = 'interview' | 'offer' | 'courted' | 'linked';

export interface CoachNews {
  kind: CoachNewsKind;
  /** Jour de jeu du relevé où le message est apparu (ISO). */
  date: string;
  /** Club entraîné ce jour-là. */
  club: string;
  /** Club qui s'intéresse au coach, s'il est connu. */
  other: string | null;
  /** Nom du coach lu par le plugin (`coachNom`), s'il est connu. */
  coach: string | null;
  /** Clé stable du message (numéro du jeu et titre), pour ne l'annoncer qu'une fois. */
  key: string;
  title: string;
}

export interface InboxItem {
  key: string;
  title: string;
  body: string;
  /** Club de l'expéditeur. */
  sender: string | null;
  /** Ancienneté écrite par le jeu (« Il y a 2 jour(s) », « 3 days ago »). */
  age: string | null;
  /** Noms liés dans le titre et le texte (clubs, personnes), tels qu'affichés. */
  links: string[];
}

const partie = (s: FmSnapshot): Record<string, unknown> => (s as { custom?: { partie?: Record<string, unknown> } }).custom?.partie ?? {};
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);

// Les liens du jeu sont écrits « \x01<base64>\x02texte affiché\x01 » : on garde le texte affiché.
const LINK = /\x01[A-Za-z0-9+/=]*\x02([^\x01]*)\x01?/g;
export const cleanGameText = (s: string) => s.replace(LINK, '$1').replace(/[\x01\x02]/g, '').replace(/ /g, ' ').trim();
const LEAD = /^(?:de la|de l'|de l’|du|des|de|d'|d’|à la|à l'|à l’|au|aux|à|le|la|les|l'|l’|the)\s*/i;
const linksOf = (s: string) => [...s.matchAll(LINK)].map((m) => m[1]!.replace(LEAD, '').trim()).filter(Boolean);

/** Messages de la boîte de réception lus par le plugin, dans l'ordre du jeu ; vide s'il ne les lit pas. */
export function inboxOf(s: FmSnapshot): InboxItem[] {
  const p = partie(s);
  const out: InboxItem[] = [];
  for (let i = 0; i < 100; i++) {
    const n = String(i).padStart(2, '0');
    if (!(`boite${n}Titre` in p)) break;
    const rawTitle = str(p[`boite${n}Titre`]);
    if (!rawTitle) continue;
    const rawBody = str(p[`boite${n}Texte`]) ?? '';
    const title = cleanGameText(rawTitle);
    const id = p[`boite${n}Id`];
    out.push({
      key: `${id ?? ''}|${title}`,
      title,
      body: cleanGameText(rawBody),
      sender: str(p[`boite${n}Club`])?.trim() ?? null,
      age: str(p[`boite${n}Age`]),
      links: [...linksOf(rawTitle), ...linksOf(rawBody)],
    });
  }
  return out;
}

const hasInbox = (s: FmSnapshot) => 'boite00Titre' in partie(s);

// Ancienneté d'un jour ou plus : au premier relevé qui lit la boîte, seuls les messages du jour comptent.
const OLD = /jour|day|semaine|week|mois|month|\ban\b|\bans\b|year/i;

const INTERVIEW = /entretien|interview/i;
// Une offre adressée au coach (« vous proposent un contrat »), pas celle faite à un de ses joueurs.
const OFFER = /vous\s+(?:propos|offr)\w*\s+(?:un|le|ce)\s+(?:nouveau\s+)?(?:contrat|poste)|offre\s+d['’]emploi|offer(?:ed|s|ing)?\s+you\s+(?:a|the)\s+(?:new\s+)?(?:contract|job|position|role)|job\s+offer/i;
// Un entretien d'embauche, pas une interview d'après-match.
const JOB = /poste|nomination|entraîneur|banc|job|position|manager|vacan|appoint/i;
const COURTED = /intérêt\s+auprès\s+d'autres\s+clubs|intérêt\s+auprès\s+d’autres\s+clubs|d'autres\s+clubs\s+s'intéress|autres\s+clubs\s+(?:sont\s+)?intéressés|interest\s+from\s+other\s+clubs|other\s+clubs\s+(?:are\s+)?interested|clubs\s+(?:are\s+)?(?:showing\s+)?interest(?:ed)?\s+in\s+you/i;
const LINKED = /pisté|courtisé|dans\s+le\s+viseur|en\s+pole|favori\s+pour|lié\s+au\s+poste|associé\s+au\s+poste|pressenti|candidat\s+(?:idéal|crédible|sérieux)|linked\s+with|frontrunner|front-runner|favourite\s+for|favorite\s+for|shortlist(?:ed)?\s+for/i;

const same = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.normalize('NFC').toLocaleLowerCase() === b.normalize('NFC').toLocaleLowerCase();

function classify(item: InboxItem, club: string, coach: string | null): Pick<CoachNews, 'kind' | 'other'> | null {
  const text = `${item.title}\n${item.body}`;
  const own = same(item.sender, club);
  // Autre club : l'expéditeur, sinon le premier nom lié qui n'est ni notre club ni le coach.
  const other = (!own && item.sender) || item.links.find((l) => !same(l, club) && !same(l, coach) && !(coach && coach.includes(l))) || null;
  if (own && COURTED.test(text)) return { kind: 'courted', other: null };
  if (own || !other) return null;
  if (INTERVIEW.test(text) && JOB.test(text)) return { kind: 'interview', other };
  if (OFFER.test(text)) return { kind: 'offer', other };
  if (LINKED.test(text)) return { kind: 'linked', other };
  return null;
}

/**
 * Nouvelles de l'avenir du coach, de la plus ancienne à la plus récente : chaque message n'est compté qu'au relevé où
 * il apparaît. Au premier relevé qui lit la boîte, seuls les messages du jour comptent (pas tout l'historique).
 */
export function coachNews(history: Entry[]): CoachNews[] {
  const sorted = [...history].sort((a, b) => a.gameDate.localeCompare(b.gameDate));
  const out: CoachNews[] = [];
  const seen = new Set<string>();
  let prev: FmSnapshot | null = null;
  for (const e of sorted) {
    if (!hasInbox(e.data)) {
      prev = null;
      continue;
    }
    const items = inboxOf(e.data);
    const baseline = !prev;
    const coach = str(partie(e.data).coachNom)?.trim() ?? null;
    for (const item of items) {
      if (seen.has(item.key)) continue;
      seen.add(item.key);
      if (baseline && item.age && OLD.test(item.age)) continue;
      const c = classify(item, e.data.club, coach);
      if (c) out.push({ ...c, date: e.gameDate, club: e.data.club, coach, key: item.key, title: item.title });
    }
    prev = e.data;
  }
  return out;
}
