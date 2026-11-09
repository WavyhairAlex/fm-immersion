/**
 * Couleurs et identifiant des clubs, pour habiller la gazette et le direct aux couleurs des équipes.
 *
 * Lus par chemins.json (08/11/2026) dans `custom.club` (club du joueur : `idUnique`, `couleur1` à `couleur3`,
 * `nomCourt`, `abreviation`) et dans `custom.equipe` pour les adversaires : `calNNDomId`, `calNNDomC1`, `calNNDomC2`
 * (et `Ext` pour l'équipe à l'extérieur) à côté de `calNNDom`/`calNNExt` du calendrier, `dernierAdv*` pour le dernier
 * adversaire. L'identifiant unique est celui des packs de logos (`graphics/clubs/<id>.png`).
 *
 * Le format exact des couleurs du jeu n'est pas encore vu en vrai : la lecture accepte `#RRGGBB`, `RRGGBB`,
 * `RGBA(1.000, 0.000, 0.000, 1.000)` (Unity), `rgb(255, 0, 0)`, un objet `{ r, g, b }` (0-1 ou 0-255) ou un entier.
 */

export interface ClubLook {
  name: string;
  /** Identifiant unique FM27 du club (nom des fichiers de logos), ou null. */
  id: string | null;
  /** Couleurs du club, de la principale à la troisième, en `#rrggbb`. */
  colors: string[];
  /** Sigle à trois lettres donné par le jeu, ou null. */
  abbr: string | null;
}

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
const toHex = (r: number, g: number, b: number) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;

/**
 * Trois composantes 0-1 (toutes ≤ 1) ou 0-255 : en 0-255. L'opacité, quand elle est donnée, tranche l'échelle :
 * FM27 écrit « RGBA(16, 16, 16, 255) », donc « RGBA(1, 1, 1, 255) » est un presque noir, pas du blanc.
 */
function scale(parts: number[], alpha?: number): [number, number, number] | null {
  const [r, g, b] = parts;
  if (![r, g, b].every((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0)) return null;
  const unit = typeof alpha === 'number' && Number.isFinite(alpha) ? alpha <= 1 && r! <= 1 && g! <= 1 && b! <= 1 : r! <= 1 && g! <= 1 && b! <= 1;
  const k = unit ? 255 : 1;
  if (!unit && (r! > 255 || g! > 255 || b! > 255)) return null;
  return [r! * k, g! * k, b! * k];
}

/** Couleur du jeu, quel que soit son format, en `#rrggbb` ; null si illisible ou transparente. */
export function parseColour(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'number') {
    if (!Number.isInteger(v) || v < 0 || v > 0xffffffff) return null;
    const rgb = v > 0xffffff ? v & 0xffffff : v;
    return toHex((rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255);
  }
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    // Valeur enveloppée par le jeu ({ PropertyValue }) ou objet couleur ({ r, g, b, a }).
    if ('PropertyValue' in o) return parseColour(o.PropertyValue);
    const pick = (k: string) => {
      const x = o[k] ?? o[k.toUpperCase()] ?? o[{ r: 'red', g: 'green', b: 'blue', a: 'alpha' }[k]!] ?? o[{ r: 'Red', g: 'Green', b: 'Blue', a: 'Alpha' }[k]!];
      return typeof x === 'string' ? Number(x) : x;
    };
    const a = pick('a');
    if (typeof a === 'number' && a === 0) return null;
    const c = scale([pick('r'), pick('g'), pick('b')] as number[], typeof a === 'number' ? a : undefined);
    return c ? toHex(...c) : null;
  }
  if (typeof v !== 'string') return null;
  const s = v.trim();
  const h = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(s) ?? /^#([0-9a-f]{3})$/i.exec(s);
  if (h) {
    const x = h[1]!.length === 3 ? h[1]!.replace(/./g, (c) => c + c) : h[1]!;
    return `#${x.toLowerCase()}`;
  }
  // « RGBA(1.000, 0.000, 0.000, 1.000) », « rgb(255, 0, 0) », « Color { R = 255, G = 0, B = 0 } ».
  const nums = (s.match(/-?\d+(?:[.,]\d+)?/g) ?? []).map((x) => Number(x.replace(',', '.')));
  if (/^(rgba?|color|colour)\b/i.test(s) || /\bR\s*=/.test(s)) {
    if (nums.length >= 4 && nums[3] === 0) return null;
    const c = scale(nums.slice(0, 3), nums[3]);
    return c ? toHex(...c) : null;
  }
  return null;
}

/** Luminance relative WCAG d'une couleur `#rrggbb`. */
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}

/** Rapport de contraste WCAG entre deux couleurs (1 à 21). */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}

/** Texte lisible sur ce fond : blanc ou anthracite, celui qui contraste le plus. */
export const inkOn = (bg: string, light = '#FFFFFF', dark = '#0F1B2D') => (contrast(bg, light) >= contrast(bg, dark) ? light : dark);

/**
 * Couleur du club qui se voit sur ce fond (contraste ≥ `min`), de la principale à la troisième ; sinon `fallback`.
 * Sert aux liserés et aux pastilles : un club en blanc et noir prend son noir sur le papier de la gazette.
 */
export function visibleOn(colors: string[], bg: string, fallback: string, min = 1.6): string {
  return colors.find((c) => contrast(c, bg) >= min) ?? fallback;
}

/** Mots qui ne comptent pas dans un sigle (« FC », « AS », « 1. »…). */
const NOISE = new Set(['fc', 'fk', 'sk', 'ac', 'as', 'sc', 'cf', 'cd', 'ud', 'sv', 'vfb', 'vfl', 'tsg', 'afc', 'ssc', 'us', 'rc', 'ogc', 'losc', 'ks', 'mfk', 'msk', 'ofk', 'tj', 'de', 'du', 'la', 'le', 'el', 'of', 'the', 'and', 'et']);

/** Sigle d'un club pour son écusson de remplacement : celui du jeu, sinon tiré du nom (« Považská Bystrica » → « PB »). */
export function crestLetters(name: string, abbr?: string | null): string {
  const a = (abbr ?? '').trim();
  if (a && a.length <= 4) return a.toLocaleUpperCase();
  const words = name.split(/[\s\-–.']+/).filter((w) => /\p{L}/u.test(w));
  const kept = words.filter((w) => !NOISE.has(w.toLowerCase()));
  const use = kept.length ? kept : words;
  if (!use.length) return '?';
  if (use.length === 1) return use[0]!.slice(0, 3).toLocaleUpperCase();
  return use
    .slice(0, 3)
    .map((w) => w[0]!)
    .join('')
    .toLocaleUpperCase();
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const idOf = (v: unknown) => {
  const s = typeof v === 'number' ? String(v) : str(v);
  return s && /^\d{1,12}$/.test(s) && s !== '0' ? s : null;
};

type LookIn = { name: string | null; id?: unknown; colors?: unknown[]; abbr?: unknown };

/** Fiche lue (champs absents ignorés) : null sans nom ou sans rien d'utile. */
function lookOf(x: LookIn): ClubLook | null {
  if (!x.name) return null;
  const colors = (x.colors ?? []).map(parseColour).filter((c): c is string => !!c);
  const id = idOf(x.id);
  if (!id && !colors.length) return null;
  return { name: x.name, id, colors, abbr: str(x.abbr) };
}

/** Clubs vus dans un instantané : le club du joueur et ceux de son calendrier, par nom affiché par le jeu. */
export function snapshotClubLooks(snap: { club?: unknown; custom?: unknown }): ClubLook[] {
  const custom = (snap.custom ?? {}) as { club?: Record<string, unknown>; equipe?: Record<string, unknown> };
  const c = custom.club ?? {};
  const e = custom.equipe ?? {};
  const out: ClubLook[] = [];
  const own = lookOf({ name: str(snap.club), id: c.idUnique, colors: [c.couleur1, c.couleur2, c.couleur3], abbr: c.abreviation });
  if (own) out.push(own);
  for (const k of Object.keys(e)) {
    const m = /^cal(\d{2})(Dom|Ext)$/.exec(k);
    if (!m) continue;
    const p = `cal${m[1]}${m[2]}`;
    const look = lookOf({ name: str(e[p]), id: e[`${p}Id`], colors: [e[`${p}C1`], e[`${p}C2`]] });
    if (look) out.push(look);
  }
  const last = lookOf({ name: str(e.dernierAdvNom), id: e.dernierAdvId, colors: [e.dernierAdvC1, e.dernierAdvC2] });
  if (last) out.push(last);
  return out;
}

/** Fusionne une fiche dans la table : les champs connus du plus récent l'emportent, les autres restent. */
export function mergeLook(map: Map<string, ClubLook>, look: ClubLook) {
  const prev = map.get(look.name);
  map.set(look.name, {
    name: look.name,
    id: look.id ?? prev?.id ?? null,
    colors: look.colors.length ? look.colors : (prev?.colors ?? []),
    abbr: look.abbr ?? prev?.abbr ?? null,
  });
}

/** Table nom → couleurs et identifiant, construite sur tout l'historique (du plus ancien au plus récent). */
export function clubLooks(history: { gameDate: string; data: { club?: unknown; custom?: unknown } }[]): Map<string, ClubLook> {
  const map = new Map<string, ClubLook>();
  for (const h of [...history].sort((a, b) => a.gameDate.localeCompare(b.gameDate))) for (const l of snapshotClubLooks(h.data)) mergeLook(map, l);
  return map;
}
