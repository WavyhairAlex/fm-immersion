import { nextWindows } from './evolution';
import { replacementFor } from './replacement';
import { contractDecisions, mercatoAdvice, type ContractCall, type MercatoAdvice } from './mercato';
import { unavailable, type FmPlayer } from './player';
import type { PosCode } from './positions';
import { bestTactic, buildProject, rankTactics, SWITCH_POINTS, type CoachPrefs } from './project';
import type { SquadAt } from './progress';
import type { StyleRef, TacticEngine } from './tactic';

/*
 * Aide à la décision : ce que FM Immersion propose de faire, une carte par décision, triée par échéance.
 * Chaque carte dit quoi faire, pourquoi (raison et chiffres), avant quand, et sur quoi repose le conseil
 * (donnée lue dans le jeu, calcul de FM Immersion, ou CA/PA réels). « Ne rien changer » est une décision à part
 * entière : quand l'écart ne vaut pas un changement, FM Immersion le dit au lieu d'en proposer un.
 * Le joueur décide ; FM Immersion ne touche jamais au jeu.
 */

export type DecisionKind = 'contract' | 'tactic' | 'recruit' | 'departure';
/** Sur quoi repose le conseil : lu dans le jeu, CA/PA réels (échelle fixe), ou calcul de FM Immersion (estimation). */
export type Basis = 'read' | 'real' | 'computed';

export interface Decision {
  kind: DecisionKind;
  /** Action proposée (clé i18n `fm.dec.action.*`). */
  action: string;
  players: FmPlayer[];
  pos?: PosCode | null;
  /** Échéance (ISO) : fin de contrat, prochaine fenêtre de mercato… ; null = à chaque match. */
  deadline: string | null;
  /** Raison (clé i18n `fm.dec.why.*`) et ses valeurs. */
  why: string;
  values: Record<string, string | number>;
  basis: Basis;
  /** Ce qui ferait changer d'avis (clé i18n `fm.dec.unless.*`), s'il y a lieu. */
  unless?: string;
  /** Styles cités (noms traduits par l'interface : valeurs `style` et `other`). */
  style?: StyleRef;
  other?: StyleRef;
}

const CONTRACT_ACTION: Record<ContractCall, string> = { extend: 'extend', extendShort: 'extendShort', sellNow: 'sellNow', letGo: 'letGo' };

function contractWhy(a: MercatoAdvice): { why: string; values: Record<string, string | number>; basis: Basis } {
  const r = (id: string) => a.reasons.find((x) => x.id === id);
  const pa = r('potentialPa');
  if (pa && pa.id === 'potentialPa') return { why: 'potentialPa', values: { pa: pa.pa, ca: pa.ca }, basis: 'real' };
  const pot = r('potential');
  if (pot && pot.id === 'potential') return { why: 'potential', values: { stars: pot.stars }, basis: 'read' };
  if (a.now.tier === 0) return { why: 'starter', values: { age: a.player.age ?? '–' }, basis: 'computed' };
  if (a.now.tier === 1 || a.project.tier === 1) return { why: 'backup', values: { age: a.player.age ?? '–' }, basis: 'computed' };
  return { why: 'surplus', values: { age: a.player.age ?? '–' }, basis: 'computed' };
}

export function decisions(
  engine: TacticEngine,
  players: FmPlayer[],
  gameDate: string,
  coach: CoachPrefs = {},
  history: SquadAt[] = [],
  base?: StyleRef | null,
  leavingIds: ReadonlySet<string> = new Set(),
): Decision[] {
  const all = players.filter((p) => Object.keys(p.attributes).length);
  // Partants signalés : hors recrutement et départs conseillés (on planifie sans eux), mais leur remplacement est une décision.
  const list = all.filter((p) => !leavingIds.has(p.id));
  if (!list.length) return [];
  const out: Decision[] = [];
  const window = nextWindows(gameDate, coach.seasonStart ?? 8, 1)[0]?.date ?? null;
  const report = mercatoAdvice(engine, all, gameDate, coach, history, leavingIds);

  // 1. Contrats : ce que FM27 demande de trancher (six mois ou moins).
  if (report)
    for (const d of contractDecisions(report)) {
      const w = contractWhy(d.advice);
      out.push({
        kind: 'contract',
        action: CONTRACT_ACTION[d.call],
        players: [d.advice.player],
        deadline: d.advice.player.contractEnd?.slice(0, 10) ?? null,
        ...w,
        values: { ...w.values, years: d.years ?? 0 },
      });
    }

  // 2. Tactique : garder la base, ou en changer si le gain le vaut.
  // La tactique du prochain match compte encore les partants : ils jouent jusqu'à leur départ.
  const avail = all.filter((p) => !unavailable(p));
  const ranked = rankTactics(engine, avail);
  const pick = bestTactic(engine, avail, coach, ranked, base);
  if (pick) {
    if (pick.kept)
      out.push({
        kind: 'tactic',
        action: 'keepTactic',
        players: [],
        deadline: null,
        why: 'smallGain',
        values: { gain: Math.round((pick.kept.gain / 2) * 100) / 100, need: SWITCH_POINTS / 2 },
        basis: 'computed',
        unless: 'bigGain',
        style: pick.style,
        other: pick.kept.style,
      });
    else if (base && base.id !== pick.style.id)
      out.push({
        kind: 'tactic',
        action: 'changeTactic',
        players: [],
        deadline: window,
        why: 'bigGain',
        values: { form: pick.form, need: SWITCH_POINTS / 2 },
        basis: 'computed',
        style: pick.style,
        other: base,
      });
  }

  // 3. Recrutement : postes du projet sans joueur au niveau, à chercher pour la prochaine fenêtre.
  const project = buildProject(engine, list, coach);
  // Remplaçant de chaque partant signalé, à son poste du onze cible (calculé avec lui), avant la prochaine fenêtre.
  const withThem = report?.leaving.length ? buildProject(engine, all, coach) : null;
  for (const p of report?.leaving ?? []) {
    const slot = withThem?.slots.find((sl) => sl.player?.id === p.id);
    // La solution interne suffit-elle (profil du projet, au moins au niveau du partant) ? Sinon, recruter.
    const r = withThem ? replacementFor(engine, withThem, p, [], list) : null;
    const covered = r && r.verdict !== 'recruit' && r.internal;
    out.push({
      kind: 'departure',
      action: covered ? 'leavingCovered' : 'replaceLeaving',
      players: covered ? [p, r.internal!.player] : [p],
      pos: r?.slot?.pos ?? slot?.pos ?? p.positions[0] ?? null,
      deadline: window,
      why: r ? `repl_${r.why}` : slot ? 'leavingStarter' : 'leaving',
      values: { age: p.age ?? '–', leaving: p.name, name: r?.internal?.player.name ?? '' },
      basis: 'computed',
    });
  }
  if (project)
    for (const sl of project.slots.filter((s) => s.status === 'recruit' && s.tone === 'bad'))
      out.push({
        kind: 'recruit',
        action: 'recruit',
        players: sl.player ? [sl.player] : [],
        pos: sl.pos,
        deadline: window,
        why: sl.player ? 'weakSlot' : 'emptySlot',
        values: { fit: sl.fit == null ? '–' : Math.round((sl.fit / 20) * 100) },
        basis: 'computed',
      });

  // 4. Départs : jeunes bloqués à prêter, joueurs en trop à vendre (hors contrats déjà traités ci-dessus).
  const decided = new Set(out.flatMap((d) => d.players.map((p) => p.id)));
  if (report)
    for (const a of report.advice) {
      if (decided.has(a.player.id) || !['sell', 'loan', 'release'].includes(a.verdict)) continue;
      out.push({
        kind: 'departure',
        action: a.verdict,
        players: [a.player],
        deadline: window,
        why: a.verdict === 'loan' ? 'blocked' : 'surplus',
        values: { age: a.player.age ?? '–' },
        basis: a.player.ca != null ? 'real' : 'computed',
      });
    }

  const order: Record<DecisionKind, number> = { contract: 0, recruit: 1, departure: 2, tactic: 3 };
  return out.sort((a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999') || order[a.kind] - order[b.kind]);
}
