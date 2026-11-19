import { breakingNews, isCoachBreaking, type BreakingNews } from './breaking';
import { cupFinalsWon, isSuperCup } from './cups';
import { shortQuote, type AnswerTone, type PressHeld } from './press';
import { officialResults, type MatchResult } from './results';
import type { FmSnapshot } from './snapshot';

/**
 * Le Fil : les réseaux sociaux autour du club, que FM a retirés (écran « Réseaux sociaux » supprimé dans FM26, pas prévu
 * dans FM27 ; il n'en reste que l'encart « Réactions principales » sous quelques actualités). Des comptes inventés
 * réagissent à ce que le plugin a déjà lu : résultats, séries, trophées, recrues, départs, blessures, rumeurs sur le
 * coach et réponses en conférence de presse. L'humeur des supporters (forme des derniers matchs) donne le ton.
 * Le moteur ne rédige rien : il dit qui parle, de quoi, avec quels faits ; l'appli tire la phrase (variantes FR/EN).
 */

/** Qui parle : quatre supporters au caractère fixe, un journaliste, le compte officiel du club, un insider du mercato. */
export const SOCIAL_AUTHORS = ['ultra', 'grumpy', 'optimist', 'veteran', 'reporter', 'club', 'insider'] as const;
export type SocialAuthor = (typeof SOCIAL_AUTHORS)[number];

export type SocialTopic =
  | 'win'
  | 'bigWin'
  | 'draw'
  | 'loss'
  | 'heavyLoss'
  | 'winStreak'
  | 'badRun'
  | 'trophy'
  | 'signing'
  | 'exit'
  | 'injury'
  | 'coachLinked'
  | 'coachTalks'
  | 'pressBold'
  | 'pressHumble'
  | 'pressDodge';

/** Hashtag : celui du club, la fronde contre le coach (#NomOut), la fête d'un trophée. */
export type SocialTag = 'club' | 'coachOut' | 'champions';

/** Humeur des supporters, de -2 (colère) à +2 (euphorie). */
export type SocialMood = -2 | -1 | 0 | 1 | 2;

export interface SocialPost {
  /** Unique et stable d'un relevé à l'autre (sert aussi à choisir la variante de la phrase). */
  id: string;
  date: string;
  author: SocialAuthor;
  topic: SocialTopic;
  /** Humeur des supporters au moment du message. */
  mood: SocialMood;
  /** Faits à glisser dans la phrase : score, adversaire, joueur, compétition, citation… */
  vars: Record<string, string | number>;
  tags: SocialTag[];
  likes: number;
  /** Nombre tiré du `id`, pour choisir une variante de phrase sans hasard à l'affichage. */
  seed: number;
}

export interface SocialFeed {
  posts: SocialPost[];
  /** Humeur au dernier relevé. */
  mood: SocialMood;
  /** Nom de famille du coach (pour #NomOut), s'il est connu. */
  coach: string | null;
  club: string;
  /** Nom court du club pour les hashtags et les comptes (« Slutsk » pour « Football Club Slutsk-2024 »). */
  tag: string;
}

type Entry = { gameDate: string; data: FmSnapshot };

const DAY_MS = 86_400_000;
const days = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / DAY_MS);
/** Fil des 45 derniers jours de jeu, 80 messages au plus, 6 par jour au plus (la répétition tue le fil). */
const WINDOW_DAYS = 45;
const MAX_POSTS = 80;
const PER_DAY = 6;
/** Matchs pris en compte pour l'humeur. */
const MOOD_GAMES = 5;

/** Petit hachage stable (FNV-1a) : variantes et nombre de « j'aime » sans hasard. */
export function socialSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const STOP = /^(?:fc|f\.c\.|cf|sc|ac|as|afc|club|football|futbol|fútbol|calcio|sporting|sport|real|athletic|atletico|atlético|cd|sd|ud|rc|olympique|stade|sv|vfb|vfl|tsv|fk|nk|sk|bk|if|ik|hk|cs|us|ss|ssc|de|del|la|le|les|the|of|club)$/i;

/** Nom court du club : le mot le plus parlant (« Slutsk », « Marseille », « Arsenal »). */
export function clubTag(club: string): string {
  const words = club
    .replace(/[-–]\d+$/u, '')
    .split(/[\s\-–]+/u)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((w) => w && !STOP.test(w) && !/^\d+$/.test(w));
  return words.sort((a, b) => b.length - a.length)[0] ?? club.replace(/\s+/g, '');
}

/** Nom de famille du coach, pour #NomOut. */
const surname = (full: string | null) => full?.trim().split(/\s+/).at(-1) ?? null;

const coachOf = (history: Entry[]): string | null => {
  for (let i = history.length - 1; i >= 0; i--) {
    const v = (history[i]!.data.custom as Record<string, Record<string, unknown>> | undefined)?.partie?.coachNom;
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
};

/** Humeur d'après les points par match des derniers matchs officiels (un trophée récent remonte d'un cran). */
export function moodOf(results: MatchResult[], trophyRecent = false): SocialMood {
  const last = results.filter((r) => r.outcome).slice(-MOOD_GAMES);
  if (!last.length) return trophyRecent ? 1 : 0;
  const ppg = last.reduce((a, r) => a + (r.outcome === 'W' ? 3 : r.outcome === 'D' ? 1 : 0), 0) / last.length;
  const m = ppg >= 2.3 ? 2 : ppg >= 1.7 ? 1 : ppg >= 1.0 ? 0 : ppg >= 0.6 ? -1 : -2;
  return Math.min(2, m + (trophyRecent ? 1 : 0)) as SocialMood;
}

/** Tons de réponse en conférence et la réaction qu'ils déclenchent. */
const BOLD: ReadonlySet<AnswerTone> = new Set(['confident', 'ambitious', 'tease', 'firm']);
const HUMBLE: ReadonlySet<AnswerTone> = new Set(['humble', 'selfCritical', 'calm', 'praise', 'protect']);

interface Draft {
  key: string;
  date: string;
  author: SocialAuthor;
  topic: SocialTopic;
  vars: Record<string, string | number>;
  tags?: SocialTag[];
  /** Importance dans la journée (les plus importants restent quand on coupe). */
  weight: number;
}

/** Ce que le fil sait du club, tiré des relevés (séparé pour les tests). */
export interface SocialFacts {
  club: string;
  /** Nom complet du coach. */
  coach: string | null;
  /** Dernier jour de jeu lu. */
  today: string;
  /** Matchs officiels au détail exact, du plus ancien au plus récent. */
  results: MatchResult[];
  trophies: { date: string; competition: string }[];
  news: BreakingNews[];
  press: readonly PressHeld[];
}

/**
 * Fil des réseaux sociaux, du plus récent au plus ancien. `press` : conférences tenues (réponses du coach), pour que
 * les supporters réagissent à ce qu'il a dit. Seulement le club actuel : un ancien club n'a plus de fil pour ce coach.
 */
export function socialFeed(history: Entry[], press: readonly PressHeld[] = []): SocialFeed {
  const sorted = [...history].sort((a, b) => a.gameDate.localeCompare(b.gameDate));
  const last = sorted.at(-1);
  const club = last?.data.club ?? '';
  const here = sorted.filter((e) => e.data.club === club);
  const results = officialResults(here).filter((r) => r.matches === 1 && r.outcome);
  // Trophées : finale annoncée par le jeu, ou Supercoupe gagnée sur son match.
  const trophies = new Map<string, { date: string; competition: string }>();
  for (const t of cupFinalsWon(here)) trophies.set(t.competition.toLowerCase(), t);
  for (const r of results) if (r.competition && isSuperCup(r.competition) && r.outcome === 'W') trophies.set(r.competition.toLowerCase(), { date: r.date, competition: r.competition });
  return socialFeedOf({ club, coach: coachOf(sorted), today: last?.gameDate ?? '', results, trophies: [...trophies.values()], news: breakingNews(here), press });
}

export function socialFeedOf(f: SocialFacts): SocialFeed {
  const { club, results, press } = f;
  const tag = clubTag(club);
  const coach = surname(f.coach);
  if (!f.today) return { posts: [], mood: 0, coach, club, tag };
  const today = f.today.slice(0, 10);
  const recent = (d: string) => days(d, today) >= 0 && days(d, today) <= WINDOW_DAYS;
  const drafts: Draft[] = [];
  const trophyDates = f.trophies.map((t) => t.date.slice(0, 10));
  const trophyNear = (d: string) => trophyDates.some((t) => days(t, d) >= 0 && days(t, d) <= 14);
  const moodAt = (d: string) => moodOf(results.filter((r) => (r.played ?? r.date).slice(0, 10) <= d.slice(0, 10)), trophyNear(d));

  // Résultats : chaque match officiel, puis séries.
  let streakW = 0;
  let winless = 0;
  for (const r of results) {
    const date = (r.played ?? r.date).slice(0, 10);
    const gf = r.goalsFor ?? 0;
    const ga = r.goalsAgainst ?? 0;
    streakW = r.outcome === 'W' ? streakW + 1 : 0;
    winless = r.outcome === 'W' ? 0 : winless + 1;
    if (!recent(date)) continue;
    const scorer = [...r.players].filter((p) => (p.goals ?? 0) > 0).sort((a, b) => (b.goals ?? 0) - (a.goals ?? 0))[0];
    const star = r.players.find((p) => p.potm) ?? [...r.players].filter((p) => p.rating != null).sort((a, b) => b.rating! - a.rating!)[0];
    const vars: Record<string, string | number> = {
      score: `${gf}-${ga}`,
      opponent: r.opponent ?? '',
      competition: r.competition ?? '',
      ...(scorer ? { scorer: scorer.name, goals: scorer.goals ?? 1 } : {}),
      ...(star ? { star: star.name } : {}),
    };
    const key = `r|${date}|${r.opponent ?? ''}`;
    const mood = moodAt(date);
    const topic: SocialTopic = r.outcome === 'W' ? (gf - ga >= 3 ? 'bigWin' : 'win') : r.outcome === 'D' ? 'draw' : ga - gf >= 3 ? 'heavyLoss' : 'loss';
    const voices: SocialAuthor[] =
      topic === 'bigWin'
        ? ['club', 'ultra', 'veteran', 'reporter']
        : topic === 'win'
          ? ['club', 'ultra', mood < 0 ? 'grumpy' : 'optimist']
          : topic === 'draw'
            ? ['club', mood > 0 ? 'optimist' : 'grumpy', 'veteran']
            : topic === 'heavyLoss'
              ? ['club', 'grumpy', 'reporter', 'veteran']
              : ['club', 'grumpy', mood >= 0 ? 'optimist' : 'ultra'];
    voices.forEach((a, i) =>
      drafts.push({ key: `${key}|${a}`, date, author: a, topic, vars, tags: a === 'club' || a === 'ultra' ? ['club'] : [], weight: 50 - i }),
    );
    if (streakW >= 3 && (streakW === 3 || streakW % 2 === 1))
      drafts.push({ key: `${key}|streak`, date, author: 'reporter', topic: 'winStreak', vars: { ...vars, count: streakW }, tags: ['club'], weight: 55 });
    if (winless >= 3 && (winless === 3 || winless === 5 || winless % 3 === 0))
      drafts.push({
        key: `${key}|winless`,
        date,
        author: 'grumpy',
        topic: 'badRun',
        vars: { ...vars, count: winless },
        tags: winless >= 5 && coach ? ['coachOut'] : [],
        weight: 56,
      });
  }

  for (const t of f.trophies) {
    const date = t.date.slice(0, 10);
    if (!recent(date)) continue;
    (['club', 'ultra', 'veteran', 'reporter', 'optimist'] as const).forEach((a, i) =>
      drafts.push({ key: `t|${t.competition}|${a}`, date, author: a, topic: 'trophy', vars: { competition: t.competition }, tags: ['champions', 'club'], weight: 90 - i }),
    );
  }

  // Mouvements de l'effectif et avenir du coach (les dépêches).
  for (const n of f.news) {
    const date = n.date.slice(0, 10);
    if (!recent(date)) continue;
    const key = `n|${n.kind}|${n.id}|${date}`;
    const vars: Record<string, string | number> = { name: n.name, ...(n.age != null ? { age: n.age } : {}), ...(n.other ? { other: n.other } : {}), ...(n.injury ? { injury: n.injury } : {}) };
    if (n.days != null) vars.weeks = Math.max(1, Math.round(n.days / 7));
    const push = (author: SocialAuthor, topic: SocialTopic, weight: number, tags: SocialTag[] = []) => drafts.push({ key: `${key}|${author}`, date, author, topic, vars, tags, weight });
    if (n.kind === 'signing') {
      push('club', 'signing', 70, ['club']);
      push('insider', 'signing', 66);
      push(n.age != null && n.age >= 32 ? 'grumpy' : 'ultra', 'signing', 64);
    } else if (n.kind === 'exit') {
      push('club', 'exit', 68, ['club']);
      push('veteran', 'exit', 64);
      push('grumpy', 'exit', 62);
    } else if (n.kind === 'injury') {
      push('club', 'injury', 60, ['club']);
      push(n.rank <= 5 ? 'grumpy' : 'optimist', 'injury', 58);
    } else if (isCoachBreaking(n)) {
      const topic: SocialTopic = n.kind === 'interview' || n.kind === 'offer' ? 'coachTalks' : 'coachLinked';
      push('insider', topic, 75);
      push('ultra', topic, 72, ['club']);
      if (moodAt(date) < 0) push('grumpy', topic, 70, coach ? ['coachOut'] : []);
    }
  }

  // Conférences de presse : le journaliste cite le coach, un supporter réagit selon le ton.
  for (const h of press) {
    const date = h.matchDate.slice(0, 10);
    if (!recent(date) || !h.answers.length) continue;
    const a = h.answers.find((x) => x.tone && (BOLD.has(x.tone) || HUMBLE.has(x.tone))) ?? h.answers[0]!;
    const topic: SocialTopic = a.tone && BOLD.has(a.tone) ? 'pressBold' : a.tone && HUMBLE.has(a.tone) ? 'pressHumble' : 'pressDodge';
    const vars = { quote: shortQuote(a.text), opponent: h.opponent };
    const key = `p|${h.kind}|${h.opponent}|${date}`;
    drafts.push({ key: `${key}|reporter`, date, author: 'reporter', topic, vars, weight: 52 });
    const mood = moodAt(date);
    const fan: SocialAuthor = topic === 'pressBold' ? (mood < 0 ? 'grumpy' : 'ultra') : topic === 'pressHumble' ? 'veteran' : 'grumpy';
    drafts.push({ key: `${key}|${fan}`, date, author: fan, topic, vars, weight: 51 });
  }

  // Au plus PER_DAY messages par jour : les plus importants restent.
  const byDay = new Map<string, Draft[]>();
  for (const d of drafts) byDay.set(d.date, [...(byDay.get(d.date) ?? []), d]);
  const kept = [...byDay.values()].flatMap((ds) => {
    const seen = new Set<string>();
    return ds
      .sort((a, b) => b.weight - a.weight)
      .filter((d) => {
        // Un même compte ne parle qu'une fois par sujet dans la journée.
        const k = `${d.author}|${d.topic}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, PER_DAY);
  });

  const posts = kept
    .map((d): SocialPost => {
      const seed = socialSeed(d.key);
      const mood = moodAt(d.date);
      const base = d.author === 'club' ? 400 : d.author === 'reporter' || d.author === 'insider' ? 250 : 60;
      const heat = d.topic === 'trophy' ? 4 : d.topic === 'badRun' || d.topic === 'heavyLoss' || d.topic === 'bigWin' ? 2 : 1;
      return {
        id: d.key,
        date: d.date,
        author: d.author,
        topic: d.topic,
        mood,
        vars: d.vars,
        tags: d.tags ?? [],
        likes: Math.round(base * heat * (0.6 + (seed % 1000) / 1000)),
        seed,
      };
    })
    // Plus récent d'abord ; dans une journée, les messages les plus aimés en tête.
    .sort((a, b) => b.date.localeCompare(a.date) || b.likes - a.likes)
    .slice(0, MAX_POSTS);

  return { posts, mood: moodAt(today), coach, club, tag };
}

