import { lineOf, parsePositions, POS_LABEL, type Line, type PosCode } from './positions';
import type { FmPlayerRaw } from './snapshot';

/** Nombre à partir d'une valeur du jeu : 12, « 85 % », « 1,2 M€ », « 450 K € ». */
export function toNumber(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const m = String(v).replace(/\s/g, '').replace(',', '.').match(/(-?\d+(?:\.\d+)?)([KkMm](?![a-z]))?/);
  if (!m) return null;
  let n = parseFloat(m[1]!);
  if (/m/i.test(m[2] ?? '')) n *= 1e6;
  else if (/k/i.test(m[2] ?? '')) n *= 1e3;
  return n;
}

/** Attribut exact, ou milieu de la fourchette quand le recrutement ne l'a pas encore affiné. */
function attrValue(a: number | { min?: unknown; max?: unknown }): number | null {
  if (typeof a === 'number') return a;
  const lo = toNumber(a.min);
  const hi = toNumber(a.max);
  if (lo == null && hi == null) return null;
  return ((lo ?? hi)! + (hi ?? lo)!) / 2;
}

const GK_ONLY = new Set(['AerialReach', 'CommandOfArea', 'Communication', 'Eccentricity', 'Handling', 'Kicking', 'OneOnOnes', 'Reflexes', 'RushingOut', 'TendencyToPunch', 'Throwing']);
const GK_SKIP = new Set(['Corners', 'Crossing', 'Dribbling', 'Finishing', 'Heading', 'LongShots', 'LongThrows', 'Marking', 'Tackling', 'Technique']);

export interface FmPlayer {
  id: string;
  name: string;
  age: number | null;
  positions: PosCode[];
  positionsLabel: string;
  line: Line | null;
  /** Moyenne des attributs utiles au poste (gardien ou joueur de champ), sur 20. */
  level: number | null;
  condition: number | null;
  sharpness: number | null;
  contractEnd: string | null;
  wage: number | null;
  value: number | null;
  squadStatus: string | null;
  apps: number | null;
  goals: number | null;
  avgRating: number | null;
  injury: string | null;
  injuryDays: number | null;
  /** Pied fort tel qu'écrit par le jeu (« Gauche », « Droit uniquement », « Les deux »…). */
  foot: string | null;
  /** Attributs connus (milieu de fourchette si le recrutement ne les a pas affinés), sans le préfixe « Attribute ». */
  attributes: Record<string, number>;
}

export function normalizePlayer(p: FmPlayerRaw): FmPlayer {
  const positions = parsePositions(p.positionsText ?? p.positions);
  const isGK = positions[0] === 'GB';
  const skip = isGK ? GK_SKIP : GK_ONLY;
  const attributes: Record<string, number> = {};
  for (const [k, v] of Object.entries(p.attributes ?? {})) {
    const n = attrValue(v);
    if (n != null) attributes[k.replace(/^Attribute/, '')] = n;
  }
  const values = Object.entries(attributes)
    .filter(([k]) => !skip.has(k))
    .map(([, v]) => v);
  const level = p.level ?? (values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null);
  const injury = typeof p.injury === 'string' ? p.injury : (p.injury?.description ?? null);
  const injuryDays = p.injuryReturnDays ?? (typeof p.injury === 'object' ? p.injury?.returnDays : null) ?? null;
  const condition = toNumber(p.condition);
  return {
    id: String(p.id),
    // Le jeu entoure parfois les noms de balises de mise en forme.
    name: p.name.replace(/<[^>]*>/g, '').trim(),
    age: p.age ?? null,
    positions,
    positionsLabel: positions.map((c) => POS_LABEL[c]).join(', '),
    line: positions[0] ? lineOf(positions[0]) : null,
    level,
    condition: condition != null && condition >= 0 ? condition : null,
    sharpness: toNumber(p.sharpness),
    contractEnd: p.contractEnd ?? null,
    wage: toNumber(p.wage ?? p.wageText),
    value: toNumber(p.value ?? p.valueText),
    squadStatus: p.squadStatus ?? null,
    apps: p.apps ?? null,
    goals: p.goals ?? null,
    avgRating: p.avgRating ?? null,
    injury: injury || null,
    injuryDays,
    foot: p.foot ?? null,
    attributes,
  };
}
