import { POS_LABEL, lineOf, type FmPlayer, type Line, type PosCode } from '@fm-immersion/module-fm';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Éléments « football » communs aux écrans FM27 : couleurs de ligne, pastille joueur, terrain, attributs 1-20
 * colorés comme sur la fiche du jeu, carte des postes et profil en radar.
 */

/** Couleur de chaque ligne (gardien, défense, milieu, attaque), dans la palette FM Immersion (anthracite, vert, orange). */
export const LINE_COLOR: Record<Line, { bg: string; text: string; ring: string; fill: string }> = {
  GB: { bg: 'bg-brun', text: 'text-white', ring: 'ring-brun', fill: '#5C6067' },
  DEF: {
    bg: 'bg-canard',
    text: 'text-white',
    ring: 'ring-canard',
    fill: '#25282D',
  },
  MIL: {
    bg: 'bg-eau-fonce',
    text: 'text-white',
    ring: 'ring-eau-fonce',
    fill: '#1E7A45',
  },
  ATT: { bg: 'bg-orange', text: 'text-canard', ring: 'ring-orange', fill: '#F26B1D' },
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

/** Pastille ronde aux initiales, à la couleur de la ligne du joueur (aucun visuel du jeu). */
export function Avatar({ player, size = 'md' }: { player: FmPlayer; size?: 'xs' | 'sm' | 'md' | 'lg' }) {
  const c = LINE_COLOR[player.line ?? 'MIL'];
  const dim = size === 'lg' ? 'h-16 w-16 text-xl' : size === 'xs' ? 'h-5 w-5 text-[0.55rem] ring-1' : size === 'sm' ? 'h-7 w-7 text-xs' : 'h-10 w-10 text-sm';
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold ring-2 ring-white/70 ${c.bg} ${c.text} ${dim}`} aria-hidden>
      {initials(player.name)}
    </span>
  );
}

/** Poste dans une pastille à la couleur de sa ligne. */
export function PosBadge({ pos }: { pos: PosCode }) {
  const c = LINE_COLOR[lineOf(pos)];
  return <span className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-bold ${c.bg} ${c.text}`}>{POS_LABEL[pos]}</span>;
}

/** Couleur d'un attribut 1-20 : même lecture que la fiche du jeu (faible, correct, bon, excellent). */
export const attrTone = (v: number) =>
  v >= 16 ? 'bg-eau-fonce text-white' : v >= 13 ? 'bg-eau/60 text-canard' : v >= 10 ? 'bg-canard/10 text-canard' : v >= 7 ? 'bg-creme text-brun' : 'bg-corail/25 text-canard';

export function AttrValue({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="inline-block w-7 text-center text-canard/30">–</span>;
  return <span className={`inline-block w-7 rounded text-center text-xs font-bold tabular-nums leading-5 ${attrTone(value)}`}>{Math.round(value)}</span>;
}

/** Terrain vertical (attaque en haut) : fond et lignes ; le contenu se place en pourcentages. */
export function Pitch({ children, className = '', horizontal = false }: { children?: ReactNode; className?: string; horizontal?: boolean }) {
  // À plat (`horizontal`), le même dessin tourné d'un quart de tour : attaque à droite.
  return (
    <div className={`relative overflow-hidden rounded-xl bg-[#2f8f6b] ${horizontal ? 'aspect-[100/62]' : 'aspect-[68/100]'} ${className}`}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
        <g transform={horizontal ? 'rotate(90 50 50)' : undefined}>
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
            <rect key={i} x="0" y={i * 10} width="100" height="10" fill={i % 2 ? '#2b8664' : '#309271'} />
          ))}
          <g fill="none" stroke="white" strokeOpacity="0.55" strokeWidth="0.5">
            <rect x="3" y="2" width="94" height="96" />
            <line x1="3" y1="50" x2="97" y2="50" />
            <ellipse cx="50" cy="50" rx="13" ry="9" />
            <rect x="25" y="2" width="50" height="15" />
            <rect x="38" y="2" width="24" height="6" />
            <rect x="25" y="83" width="50" height="15" />
            <rect x="38" y="92" width="24" height="6" />
          </g>
        </g>
      </svg>
      {children}
    </div>
  );
}

/** Place de chaque poste sur le terrain vertical (x, y en %, attaque en haut). */
export const POS_XY: Record<PosCode, [number, number]> = {
  GB: [50, 91],
  DG: [21, 75],
  DC: [50, 78],
  DD: [79, 75],
  DLG: [20, 59],
  MDF: [50, 63],
  DLD: [80, 59],
  MG: [20, 43],
  MC: [50, 47],
  MD: [80, 43],
  MOG: [22, 27],
  MOC: [50, 30],
  MOD: [78, 27],
  BT: [50, 12],
};

/**
 * Postes d'un joueur sur un petit terrain : naturel en plein, possible (adéquation proche) en clair,
 * avec la note au meilleur rôle du poste quand elle est connue.
 */
export function PositionMap({ player, fits, label }: { player: FmPlayer; fits: Partial<Record<PosCode, number>>; label: (fit: number) => string }) {
  const best = Math.max(0, ...player.positions.map((p) => fits[p] ?? 0));
  return (
    <Pitch className="w-full max-w-[13rem]">
      {(Object.keys(POS_XY) as PosCode[]).map((pos) => {
        const [x, y] = POS_XY[pos];
        const natural = player.positions.includes(pos);
        const fit = fits[pos];
        const near = !natural && fit != null && fit >= best - 0.3;
        if (!natural && !near) return <span key={pos} className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/25" style={{ left: `${x}%`, top: `${y}%` }} />;
        return (
          <span
            key={pos}
            className={`absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center whitespace-nowrap rounded-md px-1 py-0.5 text-[0.65rem] font-bold leading-tight shadow ${natural ? 'bg-white text-canard' : 'bg-white/45 text-canard'}`}
            style={{ left: `${x}%`, top: `${y}%` }}
            title={POS_LABEL[pos]}
          >
            {POS_LABEL[pos]}
            {fit != null && <span className="font-normal">{label(fit)}</span>}
          </span>
        );
      })}
    </Pitch>
  );
}

/** Axes du profil : moyennes d'attributs, comme un rapport de scout. */
const AXES_FIELD: [string, string[]][] = [
  ['attack', ['Finishing', 'Movement', 'OffTheBall', 'Composure', 'LongShots']],
  ['creation', ['Passing', 'Vision', 'Technique', 'FirstTouch', 'Flair']],
  ['dribble', ['Dribbling', 'Agility', 'Balance', 'Acceleration']],
  ['defence', ['Tackling', 'Marking', 'Positioning', 'Anticipation', 'Heading']],
  ['mental', ['Decisions', 'Concentration', 'Teamwork', 'WorkRate', 'Determination']],
  ['physical', ['Pace', 'Stamina', 'Strength', 'NaturalFitness', 'JumpingReach']],
];
const AXES_GK: [string, string[]][] = [
  ['shotStopping', ['Reflexes', 'Handling', 'OneOnOnes']],
  ['aerial', ['AerialReach', 'CommandOfArea', 'JumpingReach']],
  ['distribution', ['Kicking', 'Throwing', 'Passing', 'FirstTouch']],
  ['sweeping', ['RushingOut', 'Acceleration', 'Anticipation']],
  ['mental', ['Decisions', 'Concentration', 'Composure', 'Positioning']],
  ['communication', ['Communication', 'Leadership', 'Bravery']],
];

export function profileAxes(p: FmPlayer): { id: string; value: number | null }[] {
  const axes = p.positions.includes('GB') ? AXES_GK : AXES_FIELD;
  return axes.map(([id, keys]) => {
    const v = keys.map((k) => p.attributes[k]).filter((x): x is number => x != null);
    return {
      id,
      value: v.length ? v.reduce((a, b) => a + b, 0) / v.length : null,
    };
  });
}

/** Radar du profil sur 20 ; `compare` dessine en pointillé un second profil (moyenne de la ligne, par exemple). */
export function ProfileRadar({ axes, compare }: { axes: { id: string; value: number | null }[]; compare?: (number | null)[] }) {
  const { t, i18n } = useTranslation();
  const nf = new Intl.NumberFormat(i18n.resolvedLanguage, {
    maximumFractionDigits: 1,
  });
  const n = axes.length;
  const pt = (i: number, v: number, r = 38) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const k = (Math.max(0, Math.min(20, v)) / 20) * r;
    return [50 + Math.cos(a) * k, 50 + Math.sin(a) * k] as const;
  };
  const poly = (vals: (number | null)[]) => vals.map((v, i) => pt(i, v ?? 0).join(',')).join(' ');
  return (
    <svg viewBox="-28 -6 156 112" className="h-auto w-full max-w-[22rem]" role="img" aria-label={t('fm.foot.profile')}>
      {[5, 10, 15, 20].map((g) => (
        <polygon key={g} points={poly(axes.map(() => g))} fill="none" stroke="#25282D" strokeOpacity={g === 20 ? 0.25 : 0.1} strokeWidth="0.4" />
      ))}
      {axes.map((_, i) => {
        const [x, y] = pt(i, 20);
        return <line key={i} x1="50" y1="50" x2={x} y2={y} stroke="#25282D" strokeOpacity="0.1" strokeWidth="0.4" />;
      })}
      {compare && <polygon points={poly(compare)} fill="none" stroke="#5C6067" strokeWidth="0.6" strokeDasharray="1.5 1" />}
      <polygon points={poly(axes.map((a) => a.value))} fill="#F26B1D" fillOpacity="0.35" stroke="#C2410C" strokeWidth="0.9" />
      {axes.map((a, i) => {
        const [x, y] = pt(i, 20, 46);
        return (
          <text key={a.id} x={x} y={y} textAnchor={x < 45 ? 'end' : x > 55 ? 'start' : 'middle'} dominantBaseline="middle" fontSize="4.2" fill="#25282D" fontWeight="700">
            {t(`fm.foot.axis.${a.id}`)}
            <tspan fill="#5C6067" fontWeight="400">
              {' '}
              {a.value != null ? nf.format(a.value) : '–'}
            </tspan>
          </text>
        );
      })}
    </svg>
  );
}

/** Barre de percentile (0-1) : où se situe le joueur dans sa ligne, du moins bon au meilleur. */
export function RankBar({ rank }: { rank: number }) {
  const pct = Math.round(rank * 100);
  const tone = rank >= 0.75 ? 'bg-eau-fonce' : rank <= 0.25 ? 'bg-corail' : 'bg-eau';
  return (
    <span className="relative inline-block h-2 w-full overflow-hidden rounded-full bg-canard/10">
      <span className={`absolute inset-y-0 left-0 rounded-full ${tone}`} style={{ width: `${Math.max(4, pct)}%` }} />
    </span>
  );
}

/** Jauge horizontale simple (condition, rythme…) sur 100. */
export function Gauge({ value, label }: { value: number | null; label: string }) {
  const v = value == null ? null : Math.max(0, Math.min(100, value));
  const tone = v == null ? 'bg-canard/20' : v >= 90 ? 'bg-eau-fonce' : v >= 80 ? 'bg-eau' : 'bg-corail';
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="text-brun">{label}</span>
        <span className="font-bold tabular-nums">{v == null ? '–' : `${Math.round(v)} %`}</span>
      </div>
      <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-canard/10">
        <span className={`block h-full rounded-full ${tone}`} style={{ width: `${v ?? 0}%` }} />
      </span>
    </div>
  );
}
