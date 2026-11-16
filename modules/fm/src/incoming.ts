import { inboxOf } from './coach-news';
import type { FmSnapshot } from './snapshot';
import { trialistIds } from './targets';

type Raw = Record<string, unknown>;

/**
 * Recrue annoncée par FM27 mais pas encore arrivée au club : le jeu écrit « X a trouvé un accord pour rejoindre le
 * club » puis ne l'inscrit dans l'effectif qu'à la signature effective, parfois plusieurs jours plus tard (vu le
 * 16/11/2026 : accord le 12/07, recrutement finalisé le 15/07). En attendant, l'appli la montre « arrive bientôt »
 * dans l'Effectif, hors des compos.
 */
export interface IncomingSigning {
  /** Identifiant du jeu, s'il est connu (liste de suivi ou joueur à l'essai). */
  id: string | null;
  name: string;
  age: number | null;
  positions: string | null;
  /** Le joueur est déjà au club à l'essai. */
  trial: boolean;
}

// Accord d'un joueur avec notre club (français et anglais selon la langue de FM27).
const AGREED =
  /\s+(?:a\s+trouvé\s+un\s+accord\s+pour\s+(?:rejoindre|s['’]engager)|a\s+accepté\s+de\s+(?:rejoindre|s['’]engager)|rejoindra\s+(?:le\s+club|l['’]équipe)|has\s+agreed\s+(?:terms\s+)?to\s+(?:join|sign)|(?:has\s+)?agreed\s+(?:personal\s+)?terms\s+to\s+join|will\s+join\s+the\s+club)/i;
// Négociation ou essai qui ne va pas au bout : le joueur n'arrivera pas.
const FAILED =
  /refus|rejet|annul|échou|rompu|n['’]a\s+pas\s+abouti|quitt\w*\s+le\s+club\s+à\s+l['’]issue|fin\s+de\s+(?:son|l['’])\s*essai|reject|turned\s+down|collaps|fallen\s+through|fell\s+through|cancel|called\s+off|walked\s+away|trial\s+(?:has\s+)?(?:ended|is\s+over)/i;

const norm = (s: string) => s.normalize('NFC').toLocaleLowerCase().trim();

/** Nom du joueur juste avant l'annonce d'accord : le dernier lien du jeu placé avant, sinon les mots qui précèdent. */
function agreedName(body: string, links: string[]): string | null {
  const m = AGREED.exec(body);
  if (!m) return null;
  const before = body.slice(0, m.index);
  const linked = links.filter((l) => before.endsWith(l));
  if (linked.length) return linked.sort((a, b) => b.length - a.length)[0]!;
  const words = /([\p{Lu}][\p{L}'’.-]*(?:\s+[\p{Lu}][\p{L}'’.-]*){0,3})$/u.exec(before.trim());
  return words ? words[1]! : null;
}

/** Recrues dont l'accord est annoncé dans la boîte de réception et qui ne sont pas encore sous contrat au club. */
export function incomingSignings(snap: FmSnapshot): IncomingSigning[] {
  const players = (Array.isArray(snap.players) ? snap.players : []) as Raw[];
  const trial = trialistIds(snap);
  const byName = new Map<string, Raw>();
  for (const x of (Array.isArray(snap.shortlist) ? snap.shortlist : []) as Raw[]) if (typeof x?.name === 'string') byName.set(norm(x.name), x);
  for (const x of players) if (typeof x?.name === 'string' && trial.has(String(x.id))) byName.set(norm(x.name), x);
  const signed = new Set(players.filter((x) => typeof x?.name === 'string' && !trial.has(String(x.id))).map((x) => norm(x.name as string)));

  const out: IncomingSigning[] = [];
  const seen = new Set<string>();
  // Le jeu range les messages du plus récent au plus ancien : seul le dernier message sur un joueur compte.
  for (const item of inboxOf(snap)) {
    const agreed = agreedName(item.body, item.links) ?? agreedName(item.title, item.links);
    if (!agreed) {
      // Un refus ou un essai sans suite plus récent annule l'accord annoncé plus tôt.
      if (FAILED.test(`${item.title}\n${item.body}`)) for (const l of item.links) if (byName.has(norm(l))) seen.add(norm(l));
      continue;
    }
    const k = norm(agreed);
    if (seen.has(k)) continue;
    seen.add(k);
    if (signed.has(k)) continue;
    const raw = byName.get(k);
    out.push({
      id: raw?.id != null ? String(raw.id) : null,
      name: typeof raw?.name === 'string' ? raw.name : agreed,
      age: typeof raw?.age === 'number' ? raw.age : null,
      positions: typeof raw?.positionsText === 'string' ? raw.positionsText : Array.isArray(raw?.positions) ? (raw.positions as string[]).join(', ') : null,
      trial: raw != null && trial.has(String(raw.id)),
    });
  }
  return out;
}

