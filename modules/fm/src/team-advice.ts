import type { GameInstructions } from './game-instructions';
import { styleOptions } from './match-plan';
import type { ReviewFinding } from './match-review';
import type { FmPlayer } from './player';
import { attrOf, avg, sideOf, type FormationPlan, type Slot, type StyleRef } from './tactic';
import { TEAM_INSTRUCTIONS_FM27, type TeamInstructionDef } from './team-instructions-fm27';

/*
 * Consignes d'équipe conseillées pour CE onze : on part des consignes du style, puis on corrige celles que
 * l'effectif ne peut pas tenir (ligne haute avec une défense lente, pressing sans volume de jeu) et on choisit le
 * style de centres d'après les attaquants. Quand le plugin a lu les consignes réglées dans FM27, chaque case est
 * comparée à ce qui est conseillé. Purement consultatif.
 *
 * Avec les derniers matchs (`findings`, voir match-review.ts), les consignes sont aussi corrigées d'après ce que
 * l'équipe a vraiment produit : pressing qui ne récupère rien, occasions concédées, possession stérile, tirs de loin.
 *
 * Comme pour l'équilibre du onze, vitesse, volume de jeu et jeu de tête sont comparés au niveau moyen du onze.
 */

export type TeamAdviceReason = 'slowLine' | 'lowPress' | 'lowPressBlock' | 'stretched' | 'aerialStriker' | 'smallStrikers' | 'noHighBlock'
  // D'après les derniers matchs
  | 'pressFails' | 'leakyLine' | 'leakyBlock' | 'ballsBehind' | 'sterile' | 'longShots';

export interface TeamAdviceRow {
  def: TeamInstructionDef;
  /** Option conseillée (index dans `def.options`). */
  option: number;
  /** Option de départ (style, ou tactique du jeu) avant correction ; null si elle laisse la valeur par défaut. */
  styleOption: number | null;
  /** Raison de la correction par rapport au style ; null si la consigne du style est gardée. */
  reason: TeamAdviceReason | null;
  vals: Record<string, number | string>;
  /** Option réglée dans FM27 ; null si le plugin ne l'a pas lue. */
  game: number | null;
}

export interface TeamAdvice {
  /** Cases qui s'écartent de la valeur par défaut (conseil ou jeu) ou que l'effectif fait corriger, dans l'ordre du jeu. */
  rows: TeamAdviceRow[];
  /** Vrai si les consignes du jeu ont été lues. */
  read: boolean;
  /** Nombre de cases réglées dans le jeu autrement que conseillé. */
  differs: number;
  /** Nombre de consignes hors valeur par défaut : conseillées, et réglées dans le jeu (null si non lues). */
  count: { advised: number; game: number | null };
}

/** Valeur par défaut d'une case : celle du jeu, et le bloc médian pour la hauteur du pressing (sans défaut dans le jeu). */
const defaultOf = (d: TeamInstructionDef) => d.def ?? (d.code === 'LineOfEngagement' ? 1 : 0);
const byCode = new Map(TEAM_INSTRUCTIONS_FM27.map((d) => [d.code, d]));
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Rôles avec ballon qui centrent depuis la ligne de touche. */
const CROSSERS = new Set(['FB', 'WB', 'AWB', 'WM', 'W', 'WF', 'OCB']);

/**
 * `base` : d'où partent les consignes. « style » (par défaut) : celles du style choisi, pour un onze calculé ou une
 * tactique construite. « game » : celles réglées dans FM27, pour le onze du jeu ; on ne compare alors pas la tactique
 * du joueur à un style qu'il n'a pas choisi, on signale seulement ce que son effectif ne peut pas tenir.
 */
export function teamAdvice(plan: FormationPlan, style: StyleRef, game?: GameInstructions | null, base: 'style' | 'game' = 'style', findings: ReviewFinding[] = []): TeamAdvice {
  const fromGame = base === 'game' && !!game && Object.keys(game.ti).length > 0;
  const wanted = fromGame
    ? new Map(TEAM_INSTRUCTIONS_FM27.flatMap((d) => (game!.ti[d.id] != null && game!.ti[d.id] !== defaultOf(d) ? [[d.id, game!.ti[d.id]!] as [number, number]] : [])))
    : styleOptions(style);
  const advised = new Map(wanted);
  const why = new Map<number, { reason: TeamAdviceReason; vals: Record<string, number | string> }>();
  const set = (code: string, option: number, reason: TeamAdviceReason, vals: Record<string, number | string> = {}) => {
    const d = byCode.get(code);
    if (!d) return;
    advised.set(d.id, option);
    why.set(d.id, { reason, vals });
  };
  const opt = (code: string) => {
    const d = byCode.get(code)!;
    return advised.get(d.id) ?? defaultOf(d);
  };

  const xi = plan.slots.filter((s): s is Slot & { player: FmPlayer } => !!s.player);
  const lvl = avg(xi.map((s) => s.player.level));
  const grp = (sls: Slot[], keys: string[]) => avg(sls.filter((s) => s.player).map((s) => avg(keys.map((k) => attrOf(s.player!, k)))));
  if (lvl != null) {
    // Ligne défensive haute : il faut une défense qui rattrape les ballons dans son dos.
    const vPace = grp(xi.filter((s) => /^(DC|DD|DG|DLD|DLG)$/.test(s.pos)), ['Pace', 'Acceleration']);
    if (vPace != null && vPace < lvl - 0.5 && opt('DefensiveLine') >= 3) set('DefensiveLine', 2, 'slowLine', { value: r1(vPace), level: r1(lvl) });

    // Pressing : volume de jeu, endurance et collectif des dix joueurs de champ.
    const vPress = grp(xi.filter((s) => s.pos !== 'GB'), ['WorkRate', 'Stamina', 'Teamwork']);
    if (vPress != null && vPress < lvl - 0.5) {
      const vals = { value: r1(vPress), level: r1(lvl) };
      if (opt('PressingTrigger') >= 3) set('PressingTrigger', 2, 'lowPress', vals);
      if (opt('DefensiveTransition') === 2) set('DefensiveTransition', 1, 'lowPress', vals);
      if (vPress < lvl - 1.5 && opt('LineOfEngagement') === 2) set('LineOfEngagement', 1, 'lowPressBlock', vals);
    }
    // Ce que les derniers matchs ont montré, quand l'effectif n'a pas déjà fait corriger la même case.
    const found = (id: ReviewFinding['id']) => findings.find((f) => f.id === id);
    const free = (code: string) => !why.has(byCode.get(code)!.id);
    const press = found('pressFails');
    if (press && free('PressingTrigger') && opt('PressingTrigger') >= 3) set('PressingTrigger', 2, 'pressFails', press.vals);
    const leaky = found('leaky');
    if (leaky) {
      if (free('DefensiveLine') && opt('DefensiveLine') >= 3) set('DefensiveLine', 2, 'leakyLine', leaky.vals);
      else if (free('LineOfEngagement') && opt('LineOfEngagement') === 2) set('LineOfEngagement', 1, 'leakyBlock', leaky.vals);
    }
    const behind = found('bigChancesAgainst');
    if (behind && free('DefensiveLine') && opt('DefensiveLine') >= 3) set('DefensiveLine', 2, 'ballsBehind', behind.vals);
    const sterile = found('sterile');
    if (sterile && opt('Tempo') <= 2) set('Tempo', opt('Tempo') + 1, 'sterile', sterile.vals);
    const far = found('longShots');
    if (far && opt('ShotsFromDistance') >= 1) set('ShotsFromDistance', 0, 'longShots', far.vals);

    // Pressing haut avec une ligne défensive basse : le bloc s'étire et laisse un grand espace entre les lignes.
    if (opt('LineOfEngagement') === 2 && opt('DefensiveLine') <= 1) set('DefensiveLine', 2, 'stretched');
    // « Empêcher les relances courtes du GB » n'existe qu'en pressing haut.
    if (opt('LineOfEngagement') !== 2 && opt('PreventShortGKDistribution') === 1) set('PreventShortGKDistribution', 0, 'noHighBlock');

    // Style de centres, si le style ne le règle pas et que le onze centre depuis les côtés.
    const crossing = byCode.get('CrossingStyle')!;
    const crossers = xi.some((s) => sideOf(s.pos) && CROSSERS.has(s.ip));
    if (!wanted.has(crossing.id) && crossers) {
      const air = xi
        .filter((s) => s.pos === 'BT')
        .map((s) => ({ name: s.player.name, v: avg(['Heading', 'JumpingReach'].map((k) => attrOf(s.player, k))) }))
        .filter((x): x is { name: string; v: number } => x.v != null)
        .sort((a, b) => b.v - a.v);
      if (air.length && air[0]!.v >= lvl + 3) set('CrossingStyle', 1, 'aerialStriker', { name: air[0]!.name, value: r1(air[0]!.v) });
      else if (air.length && air[0]!.v <= lvl - 1) set('CrossingStyle', 3, 'smallStrikers', { value: r1(air[0]!.v) });
    }
  }

  const rows: TeamAdviceRow[] = [];
  let differs = 0;
  let nAdvised = 0;
  let nGame = 0;
  for (const def of TEAM_INSTRUCTIONS_FM27) {
    const d0 = defaultOf(def);
    const option = advised.get(def.id) ?? d0;
    const g = game?.ti[def.id] ?? null;
    if (option !== d0) nAdvised++;
    if (g != null && g !== d0) nGame++;
    const w = why.get(def.id);
    if (option === d0 && (g == null || g === d0) && !w) continue;
    if (g != null && g !== option) differs++;
    rows.push({ def, option, styleOption: wanted.get(def.id) ?? null, reason: w?.reason ?? null, vals: w?.vals ?? {}, game: g });
  }
  return { rows, read: !!game && Object.keys(game.ti).length > 0, differs, count: { advised: nAdvised, game: game ? nGame : null } };
}
