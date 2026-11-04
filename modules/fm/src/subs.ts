import type { FmPlayer } from './player';
import { attrOf, type FormationPlan } from './tactic';

/**
 * Plan de remplacements de l'avant-match.
 *
 * Moteur FM27 (Sports Interactive, « Ajustements tactiques et améliorations au moteur de match ») : l'Endurance
 * pèse davantage sur la récupération entre deux sprints et sur la baisse physique au fil des 90 minutes ; les
 * joueurs peu endurants peinent en fin de match et les remplaçants frais ont plus d'impact. On prévoit donc, avant
 * le match, qui sortir et vers quelle minute, et qui entre à sa place (le meilleur remplaçant du poste).
 */

/** Rôles qui courent le plus (pistons, latéraux offensifs, ailiers, relayeurs, attaquant qui presse). */
const RUNNING_ROLES = /^(WB|AWB|PMWB|IWB|FB|IFB|W|IW|IF|WF|B2BPM|BBM|PF|PRF|CHM|WCM)$/;

/** Nombre de changements prévus avant le match : on garde de la marge pour une blessure ou un carton. */
export const PLANNED_SUBS = 3;

export interface SubChange {
  slot: number;
  out: FmPlayer;
  in: FmPlayer;
  /** Minute conseillée. */
  minute: 60 | 70;
  reason: 'stamina' | 'condition' | 'running';
}

/** Charge de fin de match d'un titulaire : plus elle est haute, plus il faut le sortir tôt (0 = rien à craindre). */
export function fadeRisk(p: FmPlayer, ip: string, oop: string): { risk: number; reason: SubChange['reason'] } {
  const stamina = attrOf(p, 'Stamina');
  const fitness = attrOf(p, 'NaturalFitness');
  const running = RUNNING_ROLES.test(ip) || RUNNING_ROLES.test(oop);
  let risk = 0;
  let reason: SubChange['reason'] = 'stamina';
  if (stamina != null) risk += Math.max(0, 13 - stamina) * (running ? 1.5 : 1);
  if (fitness != null) risk += Math.max(0, 11 - fitness) * 0.5;
  if (p.condition != null && p.condition < 92) {
    const c = (92 - p.condition) * 0.6;
    if (c > risk) reason = 'condition';
    risk += c;
  }
  if (running && reason === 'stamina' && stamina != null && stamina >= 13) reason = 'running';
  return { risk, reason };
}

/**
 * Jusqu'à PLANNED_SUBS changements : les titulaires (hors gardien) les plus exposés à la baisse physique, chacun
 * remplacé par le meilleur remplaçant de son poste encore libre. Sortie vers 60 min si le risque est fort, 70 sinon.
 */
export function substitutionPlan(plan: FormationPlan, max = PLANNED_SUBS): SubChange[] {
  const used = new Set(plan.slots.flatMap((s) => (s.player ? [s.player.id] : [])));
  const cands = plan.slots
    .map((s, slot) => ({ s, slot, ...(s.player && s.pos !== 'GB' ? fadeRisk(s.player, s.ip, s.oop) : { risk: 0, reason: 'stamina' as const }) }))
    .filter((x) => x.s.player && x.risk >= 2)
    .sort((a, b) => b.risk - a.risk);
  const out: SubChange[] = [];
  for (const c of cands) {
    if (out.length >= max) break;
    const sub = (plan.subs[c.slot] ?? []).find((p) => !used.has(p.id) && !p.injury && !p.suspension);
    if (!sub) continue;
    used.add(sub.id);
    out.push({ slot: c.slot, out: c.s.player!, in: sub, minute: c.risk >= 5 ? 60 : 70, reason: c.reason });
  }
  return out.sort((a, b) => a.minute - b.minute);
}

/* ---------- Ajustements tactiques selon le score ---------- */

/**
 * Ajustements tactiques de FM27, ceux que Sports Interactive cite (réglés depuis la ligne de touche, cumulables,
 * actifs jusqu'à ce qu'on les coupe). Libellés dans fm.matchSheet.tweak.<id>.
 */
export const MATCH_TWEAKS = ['moreUrgency', 'longerPasses', 'exploitWidth', 'reducePressing', 'swapWingers', 'keeperUp'] as const;
export type MatchTweak = (typeof MATCH_TWEAKS)[number];
export const MATCH_SITUATIONS = ['leading', 'drawing', 'losing', 'lateLosing', 'tired', 'opponentChange'] as const;
export type MatchSituation = (typeof MATCH_SITUATIONS)[number];

/** Styles qui gardent le ballon : les longs ballons cassent ce qu'ils construisent, réservés aux dernières minutes. */
const KEEP_BALL = new Set(['possession', 'tikitaka', 'tikitaka-v']);

/**
 * Ce qu'on active selon la situation, sans changer la tactique de base (« une base, des ajustements ») :
 * - on mène : on baisse le pressing pour durer, on ne force rien ;
 * - égalité contre un bloc bas : on écarte et on inverse les ailiers ;
 * - mené à partir de 60 min : plus d'urgence et de largeur ; un style direct ajoute les passes longues ;
 * - mené dans les 10 dernières minutes : passes longues pour tous, gardien qui monte seulement sur le dernier coup
 *   de pied arrêté (risque fort) ;
 * - équipe fatiguée : pressing réduit, et les remplacements prévus plus tôt ;
 * - l'adversaire change de tactique (le staff le signale) : on suit le conseil du staff, sans tout casser.
 */
export function matchTweaks(styleId: string | null | undefined): { situation: MatchSituation; tweaks: MatchTweak[] }[] {
  const keep = KEEP_BALL.has(styleId ?? '');
  return [
    { situation: 'leading', tweaks: ['reducePressing'] },
    { situation: 'drawing', tweaks: ['exploitWidth', 'swapWingers'] },
    { situation: 'losing', tweaks: keep ? ['moreUrgency', 'exploitWidth'] : ['moreUrgency', 'exploitWidth', 'longerPasses'] },
    { situation: 'lateLosing', tweaks: ['moreUrgency', 'longerPasses', 'keeperUp'] },
    { situation: 'tired', tweaks: ['reducePressing'] },
    { situation: 'opponentChange', tweaks: [] },
  ];
}
