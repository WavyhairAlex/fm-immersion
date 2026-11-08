import { figuresForResultIn } from './lastmatch';
import { effectiveness } from './project';
import { officialResults } from './results';
import type { FmSnapshot } from './snapshot';
import { rolePrint, tacticSlots } from './tactic-slots';

/*
 * « Garder ou changer » : l'adjoint dit s'il faut laisser du temps à la tactique jouée ou en essayer une autre.
 * Règles tirées des tests de Stybb Gaming sur FM27 (vidéo « Struggling With FM27? Stop Doing This », 11/2026,
 * faits sur la bêta avec l'efficacité bloquée par FMRTE) :
 * - plus d'efficacité tactique = plus de victoires, mais seulement si le schéma est bon : un mauvais schéma ne
 *   s'améliore pas en le gardant ;
 * - garder la même tactique toute la saison donne le meilleur résultat, en changer tous les 10 matchs le pire ;
 * - une tactique simple (consignes par défaut) est à son niveau tout de suite, une tactique chargée met jusqu'à
 *   20 matchs à progresser ;
 * - changer le rôle d'un joueur remet sa familiarité à zéro.
 * D'où : perdre aux xG sans progrès avec une tactique déjà apprise → repartir d'un autre schéma en consignes par
 * défaut ; tactique encore en rodage dont l'efficacité monte → patience.
 *
 * Seuls comptent les instantanés où le plugin a lu les onze postes de la tactique (0.5.5 et suivants) : avant, il
 * lisait une tactique par défaut et chaque instantané aurait compté comme un changement.
 */

export type TacticAdviceKind = 'tacticRoles' | 'tacticSwitches' | 'tacticRethink' | 'tacticPatience';

export interface TacticAdvice {
  kind: TacticAdviceKind;
  tone: 'warn' | 'info';
  values: Record<string, string | number>;
}

/** Matchs qu'une tactique chargée peut mettre à progresser. */
export const LEARNING_MATCHES = 20;
/** Matchs avant de juger qu'une tactique ne marche pas. */
export const JUDGE_MATCHES = 10;
/** Matchs récents regardés pour les xG et la progression. */
export const RECENT_MATCHES = 8;
/** Écart d'xG moyen par match (nous − eux) en dessous duquel on perd aux occasions. */
export const XG_LOSING = -0.2;
/** Points d'efficacité gagnés sur la période en dessous desquels elle stagne. */
export const TE_PLATEAU = 3;
/** Changements de tactique sur 120 jours de jeu à partir desquels l'adjoint alerte. */
export const SWITCH_ALERT = 2;
const SWITCH_WINDOW_DAYS = 120;
const DAY_MS = 86_400_000;

interface Seen {
  date: string;
  name: string;
  roles: string[];
  te: number | null;
}

export function tacticAdvice(entries: { gameDate: string; data: FmSnapshot }[]): TacticAdvice | null {
  const sorted = [...entries].sort((a, b) => a.gameDate.localeCompare(b.gameDate));
  const seen: Seen[] = sorted.flatMap((e) => {
    const slots = tacticSlots(e.data.tactic);
    const name = typeof e.data.tactic?.name === 'string' ? e.data.tactic.name : null;
    if (!slots || !name) return [];
    return [{ date: e.gameDate, name, roles: rolePrint(slots)!, te: effectiveness(e.data)?.overall?.mid ?? null }];
  });
  const now = seen.at(-1);
  if (!now) return null;

  // 1. Rôles changés depuis l'instantané précédent, même tactique : la familiarité de ces joueurs repart de zéro.
  const prev = seen.at(-2);
  if (prev && prev.name === now.name) {
    const before = new Set(prev.roles);
    const changed = now.roles.filter((r) => !before.has(r)).length;
    if (changed > 0) return { kind: 'tacticRoles', tone: 'warn', values: { count: changed } };
  }

  // 2. Trop de changements de tactique récents.
  const since = Date.parse(now.date) - SWITCH_WINDOW_DAYS * DAY_MS;
  const recent = seen.filter((s) => Date.parse(s.date) >= since);
  const switches = recent.filter((s, i) => i > 0 && s.name !== recent[i - 1]!.name).length;
  if (switches >= SWITCH_ALERT) return { kind: 'tacticSwitches', tone: 'warn', values: { count: switches } };

  // Période de la tactique actuelle : depuis le premier instantané d'affilée avec ce nom.
  let start = seen.length - 1;
  while (start > 0 && seen[start - 1]!.name === now.name) start--;
  const from = seen[start]!.date;
  const results = officialResults(sorted).filter((r) => r.matches === 1 && r.date > from);
  const played = results.length;
  const last = results.slice(-RECENT_MATCHES);
  const xgDiffs = last.flatMap((r) => {
    const f = figuresForResultIn(sorted, r);
    return f?.xg ? [f.xg[0] - f.xg[1]] : [];
  });
  const xgAvg = xgDiffs.length ? xgDiffs.reduce((a, b) => a + b, 0) / xgDiffs.length : null;
  // Efficacité au début des matchs regardés et maintenant.
  const teThen = seen.slice(start).find((s) => s.te != null && (!last[0] || s.date <= last[0].date))?.te ?? null;
  const teGain = teThen != null && now.te != null ? now.te - teThen : null;
  const round = (x: number) => Math.round(x * 100) / 100;

  // 3. Assez de matchs, on perd aux occasions et l'efficacité ne monte plus : le schéma est en cause.
  if (played >= JUDGE_MATCHES && xgDiffs.length >= RECENT_MATCHES / 2 && xgAvg != null && xgAvg < XG_LOSING && teGain != null && teGain < TE_PLATEAU)
    return { kind: 'tacticRethink', tone: 'warn', values: { count: xgDiffs.length, xg: round(xgAvg), te: Math.round(now.te!) } };

  // 4. Tactique en rodage dont l'efficacité monte : patience, même si les résultats tardent.
  if (played < LEARNING_MATCHES && teGain != null && teGain >= TE_PLATEAU && now.te != null && now.te < 70)
    return { kind: 'tacticPatience', tone: 'info', values: { count: played, te: Math.round(now.te), gain: Math.round(teGain) } };

  return null;
}
