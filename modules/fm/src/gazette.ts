import { boardObjectives } from './club';
import { coachNews } from './coach-news';
import { cupRuns, type CupStatus, type CupTie } from './cups';
import { calendarFixtures } from './fixtures';
import { figuresForResultIn } from './lastmatch';
import { normalizePlayer, toNumber, type FmPlayer } from './player';
import { matchResults, type MatchResult, type Outcome } from './results';
import { competitionKind } from './rules';
import { seasonSegments } from './season';
import type { FmSnapshot } from './snapshot';

/**
 * Gazette de la semaine : à partir des instantanés déjà importés (un par jour de jeu), on repère ce qui s'est passé
 * pendant chaque semaine de jeu (lundi → dimanche) et on en fait des « brèves ». Aucune nouvelle lecture du jeu.
 * Les textes ne sont pas écrits ici : chaque brève a un type et des paramètres, l'interface les met en mots (FR/EN).
 *
 * Sources, de la plus sûre à la plus fragile :
 * - matchs : différence des cumuls de saison entre deux instantanés (`matchResults`), complétée par les chiffres du
 *   dernier match écrits par le jeu (possession, tirs, xG, homme du match : `custom.equipe.dernierMatch*`) ;
 * - séries : trois victoires ou défaites de suite, longue période sans victoire ou sans défaite (matchs officiels) ;
 * - effectif : arrivées, départs, blessures, retours, prolongations, buts (comparaison des joueurs) ;
 * - classement, confiance, sécurité de l'emploi, présentation du prochain adversaire (`adv*`) : `custom.equipe`
 *   (chemins.json), seulement si le plugin les lit ;
 * - avenir du coach (entretien, offre, intérêt d'autres clubs, rumeur de presse) : sa boîte de réception
 *   (`custom.partie.boite*`, voir `coachNews`), la rubrique « Bruits de couloir ».
 */

export type StoryKind =
  | 'result'
  | 'results'
  | 'streak'
  | 'position'
  | 'scorer'
  | 'injury'
  | 'return'
  | 'arrival'
  | 'youthIntake'
  | 'departure'
  | 'extension'
  | 'fans'
  | 'job'
  | 'coachFuture'
  | 'nextMatch'
  | 'cupOut'
  | 'cupThrough'
  | 'press'
  | 'quiet';

export interface GazetteStory {
  kind: StoryKind;
  /** Importance pour choisir la une (plus grand = plus important). */
  weight: number;
  params: Record<string, string | number | null>;
}

export interface GazetteIssue {
  /** Numéro de la gazette dans la carrière (1 = première semaine suivie). */
  number: number;
  club: string;
  /** Lundi et dimanche de la semaine de jeu (ISO). */
  weekStart: string;
  weekEnd: string;
  /** Dernier instantané de la semaine. */
  date: string;
  headline: GazetteStory;
  stories: GazetteStory[];
  /** Objectif de la saison fixé par la direction (vision du club lue par le plugin), pour le billet. */
  board: string | null;
  /** Textes rédigés par l'IA choisie par le joueur (appli), à la place des phrases toutes faites ; absent sinon. */
  written?: GazetteWriting | null;
}

/**
 * Une gazette rédigée par l'IA : gros titre, récit de la une, billet de la rédaction, tribunes et direction.
 * Écrite à partir des mêmes brèves (l'IA ne reçoit que ces faits), vérifiée par l'appli avant d'être gardée.
 */
export interface GazetteWriting {
  title: string;
  article: string;
  editorial: string;
  fans: string;
  board: string;
}

type Entry = { gameDate: string; data: FmSnapshot };
const DAY_MS = 86_400_000;

/** Lundi de la semaine d'une date ISO (AAAA-MM-JJ). */
export function weekStartOf(date: string): string {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // lundi = 0
  return new Date(d.getTime() - dow * DAY_MS).toISOString().slice(0, 10);
}

const addDays = (date: string, n: number) => new Date(new Date(`${date}T00:00:00Z`).getTime() + n * DAY_MS).toISOString().slice(0, 10);

const equipe = (s: FmSnapshot): Record<string, unknown> => {
  const custom = (s as { custom?: { equipe?: Record<string, unknown> } }).custom;
  return custom?.equipe ?? {};
};

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.replace(/<[^>]*>/g, '').trim() : null);

/** Place au classement lue par le plugin (`classementPosition`), si elle est connue. */
export function leaguePosition(s: FmSnapshot): number | null {
  const n = toNumber(equipe(s).classementPosition as never);
  return n != null && n > 0 && n < 100 ? Math.round(n) : null;
}

const players = (s: FmSnapshot) => new Map<string, FmPlayer>(s.players.map((p) => [String(p.id), normalizePlayer(p)]));

function resultStory(r: MatchResult, week: FmSnapshot[], until: string | null): GazetteStory {
  if (r.matches === 1 && r.outcome) {
    // Plusieurs matchs dans la semaine : chacun retrouve ses chiffres dans l'instantané du jour qui l'a révélé.
    const fig = figuresForResultIn(week.map((s) => ({ gameDate: s.gameDate, data: s })), r, until);
    const margin = r.goalsFor != null && r.goalsAgainst != null ? r.goalsFor - r.goalsAgainst : 0;
    const scorers = r.players
      .filter((p) => (p.goals ?? 0) > 0)
      .sort((a, b) => (b.goals ?? 0) - (a.goals ?? 0))
      .map((p) => (p.goals! > 1 ? `${p.name} (${p.goals})` : p.name))
      .join(', ');
    // Homme du match élu par le jeu quand il est chez nous ; sinon la meilleure note recalculée (moins sûre :
    // elle vient de l'écart des notes moyennes, arrondies par le jeu).
    // L'homme du match du jeu, quand c'est l'un des nôtres, vaut mieux que tout : sa note est celle du jeu.
    const byGame = fig?.motm ? r.players.find((p) => p.name === fig.motm!.name) : undefined;
    const best = byGame ?? r.players.find((p) => p.potm) ?? [...r.players].filter((p) => p.rating != null).sort((a, b) => b.rating! - a.rating!)[0];
    const kind = r.friendly ? 'friendly' : competitionKind(r.competition);
    return {
      kind: 'result',
      // Une défaite pèse un peu plus qu'une victoire (la presse aime les crises), un gros écart encore plus.
      // Un amical reste une brève : il ne fait la une que d'une semaine sans autre nouvelle. Un match de coupe
      // d'Europe pèse un peu plus qu'un match de championnat ; l'issue d'un tour de coupe est ajoutée ensuite.
      weight: r.friendly ? 18 : (r.outcome === 'L' ? 62 : r.outcome === 'W' ? 58 : 50) + Math.min(10, Math.abs(margin) * 3) + (kind === 'europe' ? 4 : 0),
      params: {
        outcome: r.outcome,
        opponent: r.opponent,
        competition: r.competition,
        // Type de compétition (championnat, coupe nationale, coupe d'Europe, amical, autre) : le ton en dépend.
        compKind: kind,
        // Issue du tour de coupe joué ce jour-là (« out » : éliminé, « through » : qualifié), sinon null.
        cup: null,
        friendly: r.friendly ? 1 : 0,
        home: r.home == null ? null : r.home ? 1 : 0,
        goalsFor: r.goalsFor,
        goalsAgainst: r.goalsAgainst,
        scorers: scorers || null,
        best: best?.name ?? null,
        bestId: best?.id ?? null,
        rating: byGame ? (fig!.motm!.rating ?? byGame.rating) : (best?.rating ?? null),
        date: r.date,
        // Chiffres du jeu (nous, puis l'adversaire), quand l'instantané de la semaine parle bien de ce match.
        possession: fig?.possession?.[0] ?? null,
        possessionOpp: fig?.possession?.[1] ?? null,
        shots: fig?.shots?.[0] ?? null,
        shotsOpp: fig?.shots?.[1] ?? null,
        onTarget: fig?.onTarget?.[0] ?? null,
        onTargetOpp: fig?.onTarget?.[1] ?? null,
        xg: fig?.xg?.[0] ?? null,
        xgOpp: fig?.xg?.[1] ?? null,
        gameMotm: fig?.motm?.name ?? null,
      },
    };
  }
  return {
    kind: 'results',
    weight: 45,
    params: { matches: r.matches, wins: r.wins, draws: r.draws, losses: r.losses, goalsFor: r.goalsFor, goalsAgainst: r.goalsAgainst },
  };
}

/**
 * Série en cours après le dernier match officiel de la semaine : trois victoires ou défaites de suite, quatre matchs
 * sans victoire, cinq sans défaite. Null si la semaine n'a pas de match officiel décidé (la série n'a pas bougé).
 */
export function streakStory(earlier: MatchResult[], week: MatchResult[]): GazetteStory | null {
  const decided = (rs: MatchResult[]) => rs.filter((r) => !r.friendly && r.matches === 1 && r.outcome);
  if (!decided(week).length) return null;
  const seq = [...decided(earlier), ...decided(week)].map((r) => r.outcome!);
  const run = (ok: (o: Outcome) => boolean) => {
    let n = 0;
    for (let i = seq.length - 1; i >= 0 && ok(seq[i]!); i--) n++;
    return n;
  };
  const last = seq[seq.length - 1]!;
  const same = run((o) => o === last);
  if (last === 'W' && same >= 3) return { kind: 'streak', weight: Math.min(60, 40 + same * 3), params: { outcome: 'W', count: same } };
  if (last === 'L' && same >= 3) return { kind: 'streak', weight: Math.min(68, 48 + same * 3), params: { outcome: 'L', count: same } };
  const winless = run((o) => o !== 'W');
  if (winless >= 4) return { kind: 'streak', weight: Math.min(60, 42 + winless * 2), params: { outcome: 'winless', count: winless } };
  const unbeaten = run((o) => o !== 'L');
  if (unbeaten >= 5) return { kind: 'streak', weight: Math.min(56, 36 + unbeaten * 2), params: { outcome: 'unbeaten', count: unbeaten } };
  return null;
}

/** Une offre ou un entretien ailleurs peut faire la une ; l'intérêt et les rumeurs restent des échos. */
const COACH_WEIGHT = { offer: 82, interview: 76, courted: 62, linked: 55 } as const;

/**
 * Brèves d'une semaine : `prev` = dernier instantané avant la semaine (ou null), `week` = instantanés de la semaine,
 * `results` = matchs de la semaine, `earlier` = matchs d'avant (pour les séries).
 */
export function weekStories(prev: FmSnapshot | null, week: FmSnapshot[], results: MatchResult[], earlier: MatchResult[] = []): GazetteStory[] {
  const cur = week[week.length - 1]!;
  const out: GazetteStory[] = results.map((r, i) => resultStory(r, week, results[i + 1]?.date ?? null));
  const streak = streakStory(earlier, results);
  if (streak) out.push(streak);

  if (prev && prev.club === cur.club) {
    const before = players(prev);
    const after = players(cur);

    // Classement.
    const p0 = leaguePosition(prev);
    const p1 = leaguePosition(cur);
    if (p1 != null && p0 != null && p1 !== p0) {
      out.push({ kind: 'position', weight: 40 + Math.min(15, Math.abs(p1 - p0) * 3) + (p1 === 1 ? 15 : 0), params: { from: p0, to: p1 } });
    }

    // Arrivées : les jeunes du centre de formation arrivent tous le même jour, on en fait une seule brève.
    const arrivals = [...after.values()].filter((p) => !before.has(p.id));
    const youngsters = arrivals.filter((p) => p.age != null && p.age <= 17);
    const intake = youngsters.length >= 3;
    if (intake) {
      const best = [...youngsters].sort((a, b) => (b.level ?? 0) - (a.level ?? 0)).slice(0, 3);
      out.push({ kind: 'youthIntake', weight: 45, params: { count: youngsters.length, names: best.map((p) => p.name).join(', ') } });
    }
    for (const p of arrivals) {
      if (intake && youngsters.includes(p)) continue;
      out.push({ kind: 'arrival', weight: 35 + Math.min(10, (p.level ?? 0) - 10), params: { id: p.id, name: p.name, age: p.age, position: p.positionsLabel || null } });
    }

    for (const [id, p] of after) {
      const old = before.get(id);
      if (!old) continue;
      const g = (p.goals ?? 0) - (old.goals ?? 0);
      if (g >= 2) out.push({ kind: 'scorer', weight: 30 + g * 5, params: { id, name: p.name, goals: g } });
      if (p.injury && !old.injury) out.push({ kind: 'injury', weight: 30 + Math.min(15, Math.round((p.injuryDays ?? 0) / 7)), params: { id, name: p.name, injury: p.injury, days: p.injuryDays } });
      if (!p.injury && old.injury) out.push({ kind: 'return', weight: 20, params: { id, name: p.name } });
      if (p.contractEnd && old.contractEnd && p.contractEnd > old.contractEnd) {
        out.push({ kind: 'extension', weight: 25, params: { id, name: p.name, until: p.contractEnd.slice(0, 4) } });
      }
    }
    for (const [id, p] of before) {
      if (!after.has(id)) out.push({ kind: 'departure', weight: 35 + Math.min(10, (p.level ?? 0) - 10), params: { id, name: p.name, age: p.age } });
    }

    // Ambiance : supporters et sécurité de l'emploi (textes du jeu), seulement quand ils changent.
    const fans0 = text(equipe(prev).confianceSupporters);
    const fans1 = text(equipe(cur).confianceSupporters);
    if (fans1 && fans0 && fans1 !== fans0) out.push({ kind: 'fans', weight: 28, params: { mood: fans1 } });
    const job0 = text(equipe(prev).securiteEmploi);
    const job1 = text(equipe(cur).securiteEmploi);
    if (job1 && job0 && job1 !== job0) out.push({ kind: 'job', weight: /insécur|danger|insecure|precarious/i.test(job1) ? 70 : 30, params: { status: job1 } });
  }

  // Avenir du coach : messages apparus cette semaine dans sa boîte de réception (un par club et par type).
  const from = prev?.gameDate ?? '';
  const future = coachNews([...(prev ? [prev] : []), ...week].map((data) => ({ gameDate: data.gameDate, data }))).filter((c) => c.date > from);
  const told = new Set<string>();
  for (const c of future) {
    const id = `${c.kind}|${c.other ?? ''}`;
    if (told.has(id)) continue;
    told.add(id);
    out.push({ kind: 'coachFuture', weight: COACH_WEIGHT[c.kind], params: { type: c.kind, other: c.other, coach: c.coach, date: c.date } });
  }

  const next = (cur as { nextMatch?: Record<string, unknown> }).nextMatch;
  const opponent = text(next?.opponent);
  if (opponent) {
    // Présentation de l'adversaire d'après le rapport du jeu (`adv*` de chemins.json), quand le plugin le lit.
    const e = equipe(cur);
    const goals = toNumber(e.advButs as never);
    out.push({
      kind: 'nextMatch',
      weight: 10,
      params: {
        opponent,
        competition: text(next?.competition),
        inDays: text(next?.inDays),
        location: text(next?.location),
        threat: text(next?.threatLevel),
        position: text(e.advClassement),
        manager: text(e.advEntraineur),
        formation: text(e.advFormationPref),
        scorer: text(e.advButeur),
        scorerGoals: goals != null && goals > 0 ? Math.round(goals) : null,
      },
    });
  }

  if (!out.some((s) => s.weight >= 20)) out.push({ kind: 'quiet', weight: 5, params: { club: cur.club } });
  return out.sort((a, b) => b.weight - a.weight);
}

/** Match retour à venir contre le même adversaire dans la compétition : l'aller ne qualifie encore personne. */
function secondLegAhead(s: FmSnapshot, competition: string, tie: CupTie): boolean {
  return calendarFixtures(s).some(
    (f) => f.competition === competition && f.opponent === tie.opponent && f.date > tie.date && (Date.parse(f.date) - Date.parse(tie.date)) / DAY_MS <= 21,
  );
}

/** Toutes les gazettes de la carrière, de la plus récente à la plus ancienne. */
export function gazetteIssues(history: Entry[]): GazetteIssue[] {
  const sorted = [...history].sort((a, b) => a.gameDate.localeCompare(b.gameDate));
  if (!sorted.length) return [];
  const results = matchResults(sorted);
  const weeks = new Map<string, Entry[]>();
  for (const e of sorted) {
    const w = weekStartOf(e.gameDate);
    weeks.set(w, [...(weeks.get(w) ?? []), e]);
  }
  const segs = seasonSegments(sorted);
  const issues: GazetteIssue[] = [];
  let prev: Entry | null = null;
  let cupsBefore = new Map<string, CupStatus>();
  let n = 0;
  for (const [w, entries] of weeks) {
    const end = addDays(w, 6);
    const last = entries[entries.length - 1]!;
    const inWeek = results.filter((r) => r.date >= w && r.date <= end);
    const stories = weekStories(prev?.data ?? null, entries.map((e) => e.data), inWeek, results.filter((r) => r.date < w));
    // Coupes : élimination ou qualification de la semaine, sur les matchs de la saison en cours.
    const seasonStart = [...segs].reverse().find((x) => x.entries[0]!.gameDate <= last.gameDate)?.entries[0]!.gameDate ?? '';
    const runs = cupRuns(results.filter((r) => r.date >= seasonStart && r.date <= end), last.data);
    const cupsNow = new Map(runs.map((c) => [c.competition, c.status]));
    for (const c of runs) {
      const tie = c.ties.at(-1)!;
      const was = cupsBefore.get(c.competition);
      const params = { competition: c.competition, opponent: tie.opponent, goalsFor: tie.goalsFor, goalsAgainst: tie.goalsAgainst, legs: tie.legs, rounds: c.ties.length };
      const out = c.status === 'out' && was !== 'out';
      const through = !out && c.kind === 'cup' && tie.date >= w && tie.goalsFor > tie.goalsAgainst && c.status !== 'unknown' && !secondLegAhead(last.data, c.competition, tie);
      if (!out && !through) continue;
      // Le match décisif joué cette semaine porte l'issue du tour : une élimination fait la une, devant une simple
      // défaite de championnat ; une qualification passe devant une victoire ordinaire.
      const match = stories.find((s) => s.kind === 'result' && s.params.competition === c.competition && s.params.opponent === tie.opponent && s.params.date === tie.date);
      if (match) {
        match.params = { ...match.params, cup: out ? 'out' : 'through', legs: tie.legs, aggFor: tie.goalsFor, aggAgainst: tie.goalsAgainst, rounds: c.ties.length };
        match.weight = out ? Math.max(match.weight, 80) : Math.max(match.weight, 64);
      } else stories.push({ kind: out ? 'cupOut' : 'cupThrough', weight: out ? 72 : 42, params });
    }
    cupsBefore = cupsNow;
    stories.sort((a, b) => b.weight - a.weight);
    const board = boardObjectives((last.data as { custom?: { club?: Record<string, unknown> } }).custom?.club)[0]?.label ?? null;
    issues.push({ number: ++n, club: last.data.club, weekStart: w, weekEnd: end, date: last.gameDate, headline: stories[0]!, stories: stories.slice(1), board });
    prev = last;
  }
  return issues.reverse();
}
