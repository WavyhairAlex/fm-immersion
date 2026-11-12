import type { FmPlayer } from './player';

/**
 * Fiabilité des données derrière une analyse (repris de l'ancienne appli FM Notebook) : part des attributs utiles
 * connus, taille de l'effectif lu, et ce qui affaiblit le potentiel ou les cibles. Sert à nuancer les conseils.
 */
const KEYS = ['Technique', 'Passing', 'Vision', 'FirstTouch', 'Dribbling', 'Crossing', 'Finishing', 'Heading', 'LongShots', 'Marking', 'Tackling', 'Positioning', 'Pace', 'Acceleration', 'Strength', 'Stamina', 'WorkRate', 'JumpingReach', 'Composure', 'Movement', 'Decisions', 'Anticipation', 'Teamwork'];

export type ReliabilityLevel = 'high' | 'medium' | 'low';
export type ReliabilityReason =
  | { id: 'partial'; pct: number }
  | { id: 'small'; count: number }
  | { id: 'noPa' }
  | { id: 'shortHistory' }
  | { id: 'targetsUnknown'; count: number; total: number };

export interface Reliability {
  level: ReliabilityLevel;
  coverage: number;
  reasons: ReliabilityReason[];
}

export interface ReliabilityOpts {
  /** Nombre d'instantanés de la carrière (la progression mesurée en demande au moins deux espacés). */
  snapshots?: number;
  /** Cibles du mercato : connaissance des recruteurs en % (null si inconnue). */
  targets?: { knowledge: number | null }[];
}

export function reliability(players: FmPlayer[], opts: ReliabilityOpts = {}): Reliability {
  const field = players.filter((p) => !p.positions.every((x) => x === 'GB'));
  let known = 0;
  let total = 0;
  for (const p of field)
    for (const k of KEYS) {
      total++;
      if (typeof p.attributes[k] === 'number') known++;
    }
  const coverage = total ? known / total : 0;
  const n = players.length;
  const reasons: ReliabilityReason[] = [];
  if (coverage < 0.9) reasons.push({ id: 'partial', pct: Math.round(coverage * 100) });
  if (n < 16) reasons.push({ id: 'small', count: n });
  let level: ReliabilityLevel = n === 0 || coverage === 0 ? 'low' : coverage >= 0.9 && n >= 16 ? 'high' : coverage >= 0.6 && n >= 11 ? 'medium' : 'low';
  // Potentiel : sans PA lu en mémoire, il vient des étoiles du staff, relatives à l'effectif.
  if (n && players.every((p) => p.pa == null)) reasons.push({ id: 'noPa' });
  if (opts.snapshots != null && opts.snapshots < 2) reasons.push({ id: 'shortHistory' });
  if (opts.targets?.length) {
    const low = opts.targets.filter((t) => t.knowledge == null || t.knowledge < 50).length;
    if (low) reasons.push({ id: 'targetsUnknown', count: low, total: opts.targets.length });
    // Plus de la moitié des cibles mal connues : les notes des recrues restent incertaines.
    if (low * 2 > opts.targets.length && level === 'high') level = 'medium';
  }
  return { level, coverage, reasons };
}
