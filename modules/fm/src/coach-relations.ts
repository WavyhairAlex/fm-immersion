import type { CareerSpell } from './career';
import { seasonEnd, type CoachLife } from './coach-life';
import type { Scene } from './coach-scenes';

/**
 * « Ma vie » : les proches du coach (conjoint, adjoint, agent, président, journaliste), chacun avec sa jauge et sa
 * mémoire. Leurs messages partent de vrais moments de la partie (arrivée, titre, entraîneur du mois, série de défaites)
 * et rappellent les réponses d'avant : une promesse faite à l'arrivée revient le jour d'un trophée, une offre écoutée
 * fuite dans la presse, le président la ressort après trois défaites. Tout reste dans l'appli : rien n'est écrit dans FM27.
 */

/** Les proches qui ont une jauge (les autres expéditeurs, agent immobilier, vendeur, ami, n'en ont pas). */
export type Contact = 'partner' | 'assistant' | 'representative' | 'chairman' | 'journalist';
export const CONTACTS: Contact[] = ['partner', 'assistant', 'representative', 'chairman', 'journalist'];

/** Jauges : foyer, moral du coach, et une par proche (confiance, patience, estime, ton de la presse). */
export type Gauge = 'harmony' | 'morale' | 'trust' | 'patience' | 'esteem' | 'press';
export const GAUGES: Gauge[] = ['harmony', 'morale', 'trust', 'patience', 'esteem', 'press'];
export const CONTACT_GAUGE: Record<Contact, Gauge> = { partner: 'harmony', assistant: 'trust', representative: 'patience', chairman: 'esteem', journalist: 'press' };
/** L'adjoint et le président changent avec le club : leur jauge repart de zéro (base) à chaque nouveau club. */
export const PER_CLUB: Gauge[] = ['trust', 'esteem'];

/** Promesses gardées en mémoire, vérifiées plus tard (par une réponse ou par le classement du jeu). */
export type PromiseKind = 'trophyWeekend' | 'seasonEnd' | 'title' | 'top3';

/** Match officiel du club entraîné (tiré des instantanés), pour les séries et le club adverse d'une offre. */
export interface LifeResult {
  date: string;
  outcome: 'W' | 'D' | 'L';
  opponent: string | null;
  competition: string | null;
}

const d10 = (s: string) => s.slice(0, 10);
const addDays = (date: string, n: number) => {
  const d = new Date(`${d10(date)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const nextMonthFirst = (month: string) => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
};
/** Une date ramenée dans le passage au club (jamais après le départ). */
const within = (s: CareerSpell, date: string) => (date > d10(s.end) ? d10(s.end) : date);
const spellAt = (spells: CareerSpell[], date: string) => spells.find((s) => d10(s.start) <= date && date <= d10(s.end)) ?? null;

/** Matchs du passage au club, dans l'ordre. */
function resultsOf(s: CareerSpell, results: LifeResult[]) {
  return results.filter((r) => d10(s.start) <= d10(r.date) && d10(r.date) <= d10(s.end)).sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Dernier adversaire battu avant `date` (club qui t'a vu gagner) : c'est lui qui t'appelle dans une offre. */
function rivalBefore(s: CareerSpell, results: LifeResult[], date: string): string | null {
  const won = resultsOf(s, results).filter((r) => r.outcome === 'W' && r.opponent && r.opponent !== s.club && d10(r.date) <= date);
  return won.at(-1)?.opponent ?? null;
}

const answerOf = (life: CoachLife | undefined, id: string) => life?.answers?.[id] ?? null;

/**
 * Scènes des proches jusqu'à la date de jeu. Certaines n'existent que par une réponse d'avant (rappel d'une promesse,
 * fuite d'une offre écoutée) : elles suivent la carrière comme une histoire.
 */
export function relationScenes(spells: CareerSpell[], life: CoachLife | undefined, gameDate: string | null, results: LifeResult[] = []): Scene[] {
  const out: Scene[] = [];
  const partner = life?.partner?.name ? life.partner : null;
  const partnerAt = (date: string) => !!partner && (!partner.since || (/^\d{4}$/.test(partner.since) ? `${partner.since}-01-01` : d10(partner.since)) <= date);
  const until = gameDate ? d10(gameDate) : null;

  for (const s of spells) {
    const start = d10(s.start);
    // Arrivée : une promesse au conjoint, des objectifs pour le président.
    if (partnerAt(start))
      out.push({
        id: `promise|${s.club}|${start}`,
        kind: 'promise',
        date: start,
        from: 'partner',
        club: s.club,
        name: partner!.name,
        choices: [
          { key: 'promise', harmony: 5, promise: 'trophyWeekend' },
          { key: 'honest', harmony: 2 },
          { key: 'career', harmony: -5, morale: 5 },
        ],
      });
    out.push({
      id: `objectives|${s.club}|${start}`,
      kind: 'objectives',
      date: within(s, addDays(start, 2)),
      from: 'chairman',
      club: s.club,
      choices: [
        { key: 'title', effects: { esteem: 5 }, promise: 'title' },
        { key: 'top3', effects: { esteem: 2 }, promise: 'top3' },
        { key: 'safe', effects: { esteem: -3 } },
      ],
    });

    // Titres : le conjoint rappelle la promesse de l'arrivée (une fois), l'agent reçoit une offre.
    const promised = answerOf(life, `promise|${s.club}|${start}`)?.choice === 'promise';
    let recalled = false;
    // Offres : une par saison au plus, après le premier titre ou prix de la saison (saison d'été à été).
    const triggers: { date: string; season?: string; cause: Scene['kind'] }[] = [];
    const seasonKey = (date: string) => (Number(date.slice(5, 7)) >= 7 ? Number(date.slice(0, 4)) : Number(date.slice(0, 4)) - 1);
    const offer = (trigger: string, season: string | undefined, because: Scene['kind']) => {
      const date = addDays(trigger, 9);
      if (date > d10(s.end) && !s.current) return;
      // Identifiant stable (club et saison) : la date d'un titre du club actuel bouge tant que la saison n'est pas finie.
      const id = `offer|${s.club}|${seasonKey(trigger)}`;
      out.push({
        id,
        kind: 'offer',
        date,
        from: 'representative',
        club: s.club,
        season,
        rival: rivalBefore(s, results, trigger),
        cause: because,
        dilemma: true,
        choices: [
          { key: 'listen', effects: { patience: 10 }, harmony: -8 },
          { key: 'negotiate', effects: { patience: 4, esteem: -10 } },
          { key: 'refuse', effects: { patience: -6, trust: 8, press: 3 }, harmony: 6 },
        ],
      });
      // Offre écoutée : deux semaines plus tard, la presse l'apprend.
      const a = answerOf(life, id);
      if (a?.choice === 'listen')
        out.push({
          id: `leak|${s.club}|${seasonKey(trigger)}`,
          kind: 'leak',
          date: addDays(date, 14),
          from: 'journalist',
          club: s.club,
          rival: rivalBefore(s, results, trigger),
          recall: { id, choice: a.choice, date },
          choices: [
            { key: 'deny', effects: { press: -5 } },
            { key: 'admit', effects: { press: 5, esteem: -10 } },
            { key: 'noComment', effects: { press: -2, esteem: -3 } },
          ],
        });
    };
    for (const tr of s.trophies) {
      const end = within(s, seasonEnd(tr.season, s.end));
      if (promised && !recalled && partnerAt(end)) {
        recalled = true;
        const id = `promiseDue|${s.club}|${start}`;
        out.push({
          id,
          kind: 'promiseDue',
          date: addDays(end, 1),
          from: 'partner',
          club: s.club,
          name: partner!.name,
          season: tr.season,
          competition: tr.competition,
          recall: { id: `promise|${s.club}|${start}`, choice: 'promise', date: start },
          choices: [
            { key: 'now', cost: 1500, harmony: 12, effects: { esteem: -5 } },
            { key: 'later', promise: 'seasonEnd' },
            { key: 'club', harmony: -15, morale: 5 },
          ],
        });
        // « Juste après » : elle le rappelle cinq semaines plus tard.
        const a = answerOf(life, id);
        if (a?.choice === 'later')
          out.push({
            id: `reminder|${s.club}|${start}`,
            kind: 'reminder',
            date: addDays(end, 36),
            from: 'partner',
            club: s.club,
            name: partner!.name,
            recall: { id, choice: 'later', date: a.date },
            choices: [
              { key: 'go', cost: 1500, harmony: 8 },
              { key: 'again', harmony: -12, morale: -3 },
            ],
          });
      }
      triggers.push({ date: end, season: tr.season, cause: 'trophy' });
    }

    // Entraîneur du mois : la journaliste veut une réaction, et les clubs regardent.
    for (const aw of s.awards ?? []) {
      const date = within(s, nextMonthFirst(aw.month));
      out.push({
        id: `award|${s.club}|${aw.month}`,
        kind: 'award',
        date,
        from: 'journalist',
        club: s.club,
        month: aw.month,
        competition: aw.competition,
        choices: [
          { key: 'humble', effects: { press: 5, trust: 5 } },
          { key: 'proud', morale: 5, effects: { press: 2, esteem: 3 } },
          { key: 'players', morale: -2, effects: { press: 3, trust: 8 } },
        ],
      });
      triggers.push({ date, cause: 'award' });
    }
    const seen = new Set<number>();
    for (const tg of triggers.sort((a, b) => (a.date < b.date ? -1 : 1))) {
      if (seen.has(seasonKey(tg.date))) continue;
      seen.add(seasonKey(tg.date));
      offer(tg.date, tg.season, tg.cause);
    }

    // Trois défaites d'affilée : le président veut te voir (une fois par série, pas plus d'une fois en 45 jours).
    let run = 0;
    let last = '';
    for (const r of resultsOf(s, results)) {
      run = r.outcome === 'L' ? run + 1 : 0;
      if (run !== 3) continue;
      const date = d10(r.date);
      if (last && addDays(last, 45) > date) continue;
      last = date;
      // Une offre écoutée ou utilisée plus tôt dans ce club revient dans la bouche du président.
      const before = out
        .filter((x) => x.kind === 'offer' && x.club === s.club && x.date < date)
        .map((x) => ({ x, a: answerOf(life, x.id) }))
        .filter(({ a }) => a && a.choice !== 'refuse')
        .at(-1);
      out.push({
        id: `streak|${s.club}|${date}`,
        kind: 'streak',
        date,
        from: 'chairman',
        club: s.club,
        rival: before?.x.rival ?? null,
        recall: before ? { id: before.x.id, choice: before.a!.choice, date: before.x.date } : undefined,
        dilemma: true,
        choices: [
          { key: 'backPlayers', effects: { trust: 6, esteem: -5 } },
          { key: 'blameSelf', morale: -5, effects: { esteem: 3, press: 3 } },
          { key: 'pressure', morale: 2, effects: { trust: -6, esteem: 5 } },
        ],
      });
    }
  }

  // Deux promesses non tenues au conjoint : elle parle de partir.
  const broken = out
    .filter((x) => (x.kind === 'promiseDue' && answerOf(life, x.id)?.choice === 'club') || (x.kind === 'reminder' && answerOf(life, x.id)?.choice === 'again'))
    .map((x) => ({ x, a: answerOf(life, x.id)! }))
    .sort((a, b) => (a.a.date < b.a.date ? -1 : 1));
  if (broken.length >= 2 && partner) {
    const second = broken[1]!;
    const date = addDays(d10(second.a.date) > second.x.date ? d10(second.a.date) : second.x.date, 7);
    const s = spellAt(spells, date) ?? spells.at(-1);
    out.push({
      id: `ultimatum|${second.x.id}`,
      kind: 'ultimatum',
      date,
      from: 'partner',
      club: s?.club,
      name: partner.name,
      recall: { id: second.x.id, choice: second.a.choice, date: second.a.date },
      dilemma: true,
      choices: [
        { key: 'holiday', cost: 3000, harmony: 15, effects: { esteem: -5 } },
        { key: 'space', harmony: -10, morale: -10 },
        { key: 'talk', harmony: 4 },
      ],
    });
  }

  return out.filter((sc) => !until || sc.date <= until);
}

/** Effet automatique d'un fait du jeu sur une jauge (titre, prix, objectif tenu ou manqué). */
export interface LifeOutcome {
  date: string;
  club: string;
  kind: 'trophy' | 'award' | 'objectiveKept' | 'objectiveMissed';
  gauge: Gauge;
  delta: number;
  season?: string;
  competition?: string | null;
  month?: string;
  objective?: PromiseKind;
  position?: number | null;
}

/** Faits du jeu qui font bouger les jauges sans question : titres et prix (président), objectifs vérifiés au classement. */
export function lifeOutcomes(spells: CareerSpell[], life: CoachLife | undefined, gameDate: string | null): LifeOutcome[] {
  const out: LifeOutcome[] = [];
  const until = gameDate ? d10(gameDate) : null;
  for (const s of spells) {
    for (const tr of s.trophies) out.push({ date: within(s, seasonEnd(tr.season, s.end)), club: s.club, kind: 'trophy', gauge: 'esteem', delta: 8, season: tr.season, competition: tr.competition });
    for (const aw of s.awards ?? []) out.push({ date: within(s, nextMonthFirst(aw.month)), club: s.club, kind: 'award', gauge: 'esteem', delta: 3, month: aw.month, competition: aw.competition });
    // Objectif donné au président : vérifié à la fin de la première saison finie après la réponse.
    const a = answerOf(life, `objectives|${s.club}|${d10(s.start)}`);
    const objective = a?.choice === 'title' || a?.choice === 'top3' ? (a.choice as PromiseKind) : null;
    if (!objective) continue;
    const se = s.seasons.find((x) => x.ended && x.position != null && within(s, seasonEnd(x.label, s.end)) >= d10(a!.date));
    if (!se) continue;
    const kept = objective === 'title' ? se.position === 1 : se.position! <= 3;
    out.push({ date: within(s, seasonEnd(se.label, s.end)), club: s.club, kind: kept ? 'objectiveKept' : 'objectiveMissed', gauge: 'esteem', delta: kept ? 15 : -15, season: se.label, objective, position: se.position });
  }
  return out.filter((o) => !until || o.date <= until).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
