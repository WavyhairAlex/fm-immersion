import { figuresForResultIn } from './lastmatch';
import { officialResults, POINTS, type MatchResult, type Outcome } from './results';
import type { FmSnapshot } from './snapshot';

/*
 * Ce que disent les derniers matchs de la tactique : avant de changer quoi que ce soit, on regarde ce que l'équipe
 * a vraiment produit sur le terrain. Occasions créées et concédées (xG), tirs, possession et pressing des derniers
 * matchs officiels, puis le bilan de chaque tactique jouée cette saison.
 *
 * Les xG disent mieux que le score si une tactique marche : sur cinq ou six matchs, le score dépend beaucoup de la
 * réussite devant le but. Une équipe qui crée plus qu'elle ne concède et ne gagne pas a un problème de finition,
 * pas de tactique ; l'inverse tient souvent à la chance et ne dure pas.
 *
 * Tout vient des instantanés déjà lus (résultats, chiffres du dernier match, Centre de données) : rien de nouveau
 * dans le jeu, et rien n'y est écrit.
 */

/** Matchs officiels regardés pour la tendance. */
export const REVIEW_MATCHES = 6;
/** En dessous, on ne tire aucune conclusion. */
export const REVIEW_MIN = 3;

export interface ReviewedMatch {
  date: string;
  opponent: string | null;
  home: boolean | null;
  outcome: Outcome;
  goalsFor: number;
  goalsAgainst: number;
  /** Nous, puis l'adversaire ; null si le jeu n'a pas donné le chiffre. */
  xg: [number, number] | null;
  shots: [number, number] | null;
  possession: number | null;
  /** Pressings réussis et tentés par l'équipe sur le match. */
  press: [number, number] | null;
  tactic: string | null;
}

/** Derniers matchs officiels au résultat connu, du plus récent au plus ancien, avec leurs chiffres. */
export function reviewedMatches(history: { gameDate: string; data: FmSnapshot }[], results: MatchResult[] = officialResults(history)): ReviewedMatch[] {
  // Du plus récent au plus ancien : les chiffres d'un match se lisent jusqu'au match suivant.
  const desc = [...results].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const singles = desc.filter((r) => !r.friendly && r.matches === 1 && r.outcome && r.goalsFor != null && r.goalsAgainst != null);
  return singles.map((r) => {
    const i = desc.indexOf(r);
    const f = figuresForResultIn(history, r, desc[i - 1]?.date ?? null);
    const won = r.players.reduce((s, p) => s + ((p.stats.press90 ?? 0) * p.minutes) / 90, 0);
    const att = r.players.reduce((s, p) => s + ((p.stats.pressAtt90 ?? 0) * p.minutes) / 90, 0);
    return {
      date: r.played ?? r.date,
      opponent: r.opponent,
      home: r.home,
      outcome: r.outcome!,
      goalsFor: r.goalsFor!,
      goalsAgainst: r.goalsAgainst!,
      xg: f?.xg ?? null,
      shots: f?.shots ?? null,
      possession: f?.possession ? f.possession[0] : null,
      press: att > 0 ? [won, att] : null,
      tactic: r.tactic ?? r.formation ?? null,
    };
  });
}

export interface MatchTrend {
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  /** Par match. */
  goalsFor: number;
  goalsAgainst: number;
  /** Matchs dont on connaît les xG des deux équipes. */
  xgMatches: number;
  xgFor: number | null;
  xgAgainst: number | null;
  /** Buts marqués et encaissés sur ces seuls matchs (pour comparer aux xG). */
  xgGoalsFor: number;
  xgGoalsAgainst: number;
  shotsFor: number | null;
  shotsAgainst: number | null;
  /** xG par tir : qualité moyenne de nos occasions, et de celles qu'on laisse. */
  xgPerShot: number | null;
  xgPerShotAgainst: number | null;
  possession: number | null;
  /** Pressings réussis / tentés (%). */
  pressSuccess: number | null;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : null);

/** Moyennes d'une série de matchs ; null en dessous de REVIEW_MIN matchs. */
export function matchTrend(ms: ReviewedMatch[]): MatchTrend | null {
  if (ms.length < REVIEW_MIN) return null;
  const x = ms.filter((m) => m.xg);
  const s = ms.filter((m) => m.shots);
  const both = ms.filter((m) => m.xg && m.shots);
  const shotsF = sum(both.map((m) => m.shots![0]));
  const shotsA = sum(both.map((m) => m.shots![1]));
  const pressAtt = sum(ms.map((m) => m.press?.[1] ?? 0));
  const enough = x.length >= REVIEW_MIN;
  return {
    matches: ms.length,
    wins: ms.filter((m) => m.outcome === 'W').length,
    draws: ms.filter((m) => m.outcome === 'D').length,
    losses: ms.filter((m) => m.outcome === 'L').length,
    goalsFor: mean(ms.map((m) => m.goalsFor))!,
    goalsAgainst: mean(ms.map((m) => m.goalsAgainst))!,
    xgMatches: x.length,
    xgFor: enough ? mean(x.map((m) => m.xg![0])) : null,
    xgAgainst: enough ? mean(x.map((m) => m.xg![1])) : null,
    xgGoalsFor: sum(x.map((m) => m.goalsFor)),
    xgGoalsAgainst: sum(x.map((m) => m.goalsAgainst)),
    shotsFor: s.length >= REVIEW_MIN ? mean(s.map((m) => m.shots![0])) : null,
    shotsAgainst: s.length >= REVIEW_MIN ? mean(s.map((m) => m.shots![1])) : null,
    xgPerShot: both.length >= REVIEW_MIN && shotsF > 0 ? sum(both.map((m) => m.xg![0])) / shotsF : null,
    xgPerShotAgainst: both.length >= REVIEW_MIN && shotsA > 0 ? sum(both.map((m) => m.xg![1])) / shotsA : null,
    possession: mean(ms.flatMap((m) => (m.possession != null ? [m.possession] : []))),
    pressSuccess: pressAtt >= 30 ? (100 * sum(ms.map((m) => m.press?.[0] ?? 0))) / pressAtt : null,
  };
}

/*
 * Repères (par match) : volontairement prudents, pour ne signaler que ce qui se voit sur la durée.
 * Un match moyen d'un championnat professionnel tourne autour de 1,3 xG par équipe et 0,10 xG par tir.
 */
/** Écart de xG par match à partir duquel la tendance est nette. */
export const XG_EDGE = 0.25;
/** On crée peu en dessous, on concède trop au-dessus. */
export const XG_LOW = 1.0;
export const XG_LEAKY = 1.4;
/** Buts / xG : en dessous, la finition coûte des points ; au-dessus (encaissés), le gardien ou la malchance. */
export const CONVERSION_LOW = 0.7;
export const CONVERSION_HIGH = 1.35;
/** Écart minimal en buts sur la série pour parler de réussite : en dessous, c'est le hasard d'un ou deux tirs. */
export const LUCK_GOALS = 2.5;
/** Possession haute qui ne donne pas d'occasions. */
export const STERILE_POSSESSION = 57;
/** Qualité des tirs : en dessous, l'équipe frappe de trop loin. */
export const SHOT_QUALITY_LOW = 0.085;
export const SHOT_VOLUME = 11;
/** Pressing : part de pressings réussis en dessous de laquelle l'équipe court dans le vide. */
export const PRESS_LOW = 22;

export type ReviewFindingId =
  | 'dominant' // crée nettement plus qu'elle ne concède
  | 'outplayed' // concède nettement plus qu'elle ne crée
  | 'wasteful' // marque bien moins que ses occasions
  | 'overperforming' // marque bien plus que ses occasions : ne durera pas
  | 'unluckyDefence' // encaisse bien plus que les occasions concédées
  | 'sterile' // possession sans occasions
  | 'fewChances' // crée peu
  | 'longShots' // beaucoup de tirs de faible qualité
  | 'leaky' // concède trop d'occasions
  | 'bigChancesAgainst' // peu de tirs concédés, mais dangereux
  | 'pressFails'; // pressing peu efficace

export interface ReviewFinding {
  id: ReviewFindingId;
  tone: 'good' | 'warn' | 'info';
  vals: Record<string, number>;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const r0 = (v: number) => Math.round(v);

/** Lecture de la tendance : ce qui marche, ce qui coûte des points, et ce qui tient à la réussite plus qu'à la tactique. */
export function matchFindings(t: MatchTrend | null): ReviewFinding[] {
  if (!t) return [];
  const out: ReviewFinding[] = [];
  if (t.xgFor != null && t.xgAgainst != null) {
    const diff = t.xgFor - t.xgAgainst;
    const vals = { xgFor: r2(t.xgFor), xgAgainst: r2(t.xgAgainst), matches: t.xgMatches };
    if (diff >= XG_EDGE) out.push({ id: 'dominant', tone: 'good', vals });
    else if (diff <= -XG_EDGE) out.push({ id: 'outplayed', tone: 'warn', vals });
    const xgF = t.xgFor * t.xgMatches;
    const xgA = t.xgAgainst * t.xgMatches;
    if (t.xgGoalsFor < xgF * CONVERSION_LOW && xgF - t.xgGoalsFor >= LUCK_GOALS) out.push({ id: 'wasteful', tone: 'info', vals: { goals: t.xgGoalsFor, xg: r2(xgF) } });
    else if (t.xgGoalsFor > xgF * CONVERSION_HIGH && t.xgGoalsFor - xgF >= LUCK_GOALS) out.push({ id: 'overperforming', tone: 'info', vals: { goals: t.xgGoalsFor, xg: r2(xgF) } });
    if (t.xgGoalsAgainst > xgA * CONVERSION_HIGH && t.xgGoalsAgainst - xgA >= LUCK_GOALS) out.push({ id: 'unluckyDefence', tone: 'info', vals: { goals: t.xgGoalsAgainst, xg: r2(xgA) } });
    if (t.xgFor < XG_LOW) {
      if (t.possession != null && t.possession >= STERILE_POSSESSION) out.push({ id: 'sterile', tone: 'warn', vals: { possession: r0(t.possession), xg: r2(t.xgFor) } });
      else out.push({ id: 'fewChances', tone: 'warn', vals: { xg: r2(t.xgFor) } });
    } else if (t.possession != null && t.possession >= STERILE_POSSESSION + 5 && t.xgFor < 1.25) out.push({ id: 'sterile', tone: 'warn', vals: { possession: r0(t.possession), xg: r2(t.xgFor) } });
    if (t.xgPerShot != null && t.shotsFor != null && t.shotsFor >= SHOT_VOLUME && t.xgPerShot < SHOT_QUALITY_LOW)
      out.push({ id: 'longShots', tone: 'warn', vals: { shots: Math.round(t.shotsFor * 10) / 10, quality: r2(t.xgPerShot) } });
    if (t.xgAgainst >= XG_LEAKY) out.push({ id: 'leaky', tone: 'warn', vals: { xg: r2(t.xgAgainst), shots: t.shotsAgainst != null ? Math.round(t.shotsAgainst * 10) / 10 : 0 } });
    else if (t.xgPerShotAgainst != null && t.shotsAgainst != null && t.shotsAgainst <= 9 && t.xgPerShotAgainst >= 0.15 && t.xgAgainst >= 1.1)
      out.push({ id: 'bigChancesAgainst', tone: 'warn', vals: { shots: Math.round(t.shotsAgainst * 10) / 10, quality: r2(t.xgPerShotAgainst) } });
  }
  if (t.pressSuccess != null && t.pressSuccess < PRESS_LOW) out.push({ id: 'pressFails', tone: 'warn', vals: { value: r0(t.pressSuccess) } });
  return out;
}

/* ---------- Bilan par tactique ---------- */

export interface TacticForm {
  tactic: string;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  /** Points par match. */
  ppm: number;
  goalsFor: number;
  goalsAgainst: number;
  /** Écart de xG par match (créés moins concédés) ; null si moins de REVIEW_MIN matchs chiffrés. */
  xgDiff: number | null;
  /** Dernier match joué avec cette tactique. */
  last: string;
}

/** Bilan de chaque tactique jouée (matchs officiels), la plus récente d'abord. */
export function tacticForms(ms: ReviewedMatch[]): TacticForm[] {
  const groups = new Map<string, ReviewedMatch[]>();
  for (const m of ms) if (m.tactic) groups.set(m.tactic, [...(groups.get(m.tactic) ?? []), m]);
  return [...groups]
    .map(([tactic, rs]) => {
      const x = rs.filter((m) => m.xg);
      return {
        tactic,
        matches: rs.length,
        wins: rs.filter((m) => m.outcome === 'W').length,
        draws: rs.filter((m) => m.outcome === 'D').length,
        losses: rs.filter((m) => m.outcome === 'L').length,
        ppm: r2(sum(rs.map((m) => POINTS[m.outcome])) / rs.length),
        goalsFor: sum(rs.map((m) => m.goalsFor)),
        goalsAgainst: sum(rs.map((m) => m.goalsAgainst)),
        xgDiff: x.length >= REVIEW_MIN ? r2(mean(x.map((m) => m.xg![0] - m.xg![1]))!) : null,
        last: rs.map((m) => m.date).sort().at(-1)!,
      };
    })
    .sort((a, b) => (a.last < b.last ? 1 : a.last > b.last ? -1 : 0));
}

/**
 * Faut-il garder la tactique jouée ? `keep` : elle fait ses preuves (au moins REVIEW_MIN matchs, plus d'occasions
 * créées que concédées, ou à défaut de xG au moins 1,5 point par match) : on la corrige, on ne la remplace pas.
 * `doubt` : elle est dominée sur la durée. `early` : pas assez de matchs pour juger. `open` : entre les deux.
 */
export type TacticVerdict = 'keep' | 'doubt' | 'early' | 'open';
export function tacticVerdict(f: TacticForm | null | undefined): TacticVerdict {
  if (!f || f.matches < REVIEW_MIN) return 'early';
  if (f.xgDiff != null) return f.xgDiff >= 0.1 && f.ppm >= 1.2 ? 'keep' : f.xgDiff <= -XG_EDGE && f.ppm < 1.4 ? 'doubt' : 'open';
  return f.ppm >= 1.5 ? 'keep' : f.ppm < 1 ? 'doubt' : 'open';
}

export interface MatchReview {
  /** Derniers matchs regardés, du plus récent au plus ancien. */
  recent: ReviewedMatch[];
  /** Vrai si ces matchs sont tous ceux de la tactique jouée ; faux s'ils mêlent plusieurs tactiques. */
  scoped: boolean;
  trend: MatchTrend | null;
  findings: ReviewFinding[];
  tactics: TacticForm[];
  /** Bilan de la tactique jouée en ce moment, si on la retrouve dans les matchs. */
  current: TacticForm | null;
  verdict: TacticVerdict;
}

const same = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Tout le bilan des matchs pour la tactique jouée (`tactic` : son nom dans le jeu). La tendance porte sur les
 * derniers matchs joués AVEC cette tactique quand il y en a assez : on corrige ce qu'elle a produit, pas ce qu'une
 * autre a donné avant ; sinon sur les derniers matchs toutes tactiques confondues.
 */
export function matchReview(history: { gameDate: string; data: FmSnapshot }[], tactic?: string | null, results?: MatchResult[]): MatchReview {
  const all = reviewedMatches(history, results);
  const tactics = tacticForms(all);
  const mine = tactic ? all.filter((m) => same(m.tactic, tactic)) : [];
  const scoped = mine.length >= REVIEW_MIN;
  const recent = (scoped ? mine : all).slice(0, REVIEW_MATCHES);
  const trend = matchTrend(recent);
  const current = tactics.find((f) => same(f.tactic, tactic)) ?? null;
  return { recent, scoped, trend, findings: matchFindings(trend), tactics, current, verdict: tacticVerdict(current) };
}
