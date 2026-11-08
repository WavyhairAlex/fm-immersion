import { POS_LABEL, teamInstructionCards, teamInstructionOf, type CoachPrefs, type FmPlayer, type ProjectCompat } from '@fm-immersion/module-fm';
import { Face } from '../components/Face';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { PosBadge } from './FmFoot';
import { readScoped, useFmSaveScope, writeScoped } from '../lib/save-store';

/** Petits éléments communs aux écrans du module Football Manager. */

export type Tone = 'good' | 'warn' | 'bad' | 'info';
const TAG: Record<Tone, string> = {
  good: 'bg-eau/25 text-canard',
  warn: 'bg-ambre/30 text-canard',
  bad: 'bg-corail/20 text-canard',
  info: 'bg-canard/10 text-canard',
};

export function Tag({ tone = 'info', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-block whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-bold ${TAG[tone]}`}>{children}</span>;
}

export function Panel({ title, action, children, className = '' }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card p-5 ${className}`}>
      <div className="-mx-5 -mt-1 mb-3 flex items-center justify-between gap-3 border-b border-canard/10 px-5 pb-3">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Chiffre clé. Un zéro (ou `dim`) s'affiche en retrait : rien à signaler, l'œil passe aux tuiles utiles. */
export function Kpi({ label, value, sub, tone, dim }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad'; dim?: boolean }) {
  const quiet = dim ?? value === 0;
  return (
    <div className="card border-l-4 border-eau-fonce !p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-canard/60">{label}</p>
      <p className={`mt-1 font-display text-2xl font-semibold tabular-nums ${quiet ? 'text-canard/30' : tone === 'bad' ? 'text-corail' : ''}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-brun">{sub}</p>}
    </div>
  );
}

export function Row({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`flex items-center justify-between gap-3 border-b border-canard/5 py-1.5 last:border-0 ${className}`}>{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-brun">{children}</p>;
}

/** Pastille « compatible avec le projet de jeu », avec en infobulle la note au rôle du projet et la meilleure note possible. */
export function CompatTag({ c }: { c: ProjectCompat | null | undefined }) {
  const { t } = useTranslation();
  if (!c) return <span className="text-canard/40">–</span>;
  const tone: Tone = c.compat === 'yes' ? 'good' : c.compat === 'partial' ? 'warn' : 'bad';
  const title = c.noPosition ? t('fm.compat.noPosition') : t('fm.compat.title', { fit: fitPct(c.fit), best: fitPct(c.best) });
  return (
    <span title={title}>
      <Tag tone={tone}>{t(`fm.compat.${c.compat}`)}</Tag>
    </span>
  );
}

export function Pos({ player }: { player: FmPlayer }) {
  const c = player.positions[0];
  return c ? <PosBadge pos={c} /> : null;
}

/** Niveau /20 dans une pastille dont la couleur suit la valeur. */
export function Level({ value }: { value: number | null | undefined }) {
  const { i18n } = useTranslation();
  if (value == null) return <span className="text-canard/40">–</span>;
  const cls = value >= 14 ? 'bg-eau-fonce text-white' : value >= 11 ? 'bg-eau/40 text-canard' : value >= 8 ? 'bg-canard/10 text-canard' : 'bg-corail/20 text-canard';
  return <span className={`num-pill ${cls}`}>{new Intl.NumberFormat(i18n.resolvedLanguage, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)}</span>;
}

/** Ouvre la fiche d'un joueur (fournie par la page de la partie) ; absente, les noms restent du texte. */
export const PlayerSheetContext = createContext<((id: string) => void) | null>(null);

/** Nom de joueur cliquable : ouvre sa fiche. */
/** Nom d'un joueur avec son médaillon (photo du facepack ou initiales), cliquable vers sa fiche quand c'est possible. */
export function PlayerLink({ player, className = 'font-bold', face = true }: { player: FmPlayer; className?: string; face?: boolean }) {
  const { t } = useTranslation();
  const open = useContext(PlayerSheetContext);
  const inner = (
    <>
      {face && <Face id={player.id} name={player.name} size={22} className="mr-1.5 align-middle" />}
      {player.name}
    </>
  );
  if (!open) return <span className={`${className} inline-flex items-center`}>{inner}</span>;
  return (
    <button type="button" className={`${className} inline-flex items-center text-left hover:text-orange-fonce hover:underline`} title={t('fm.sheet.open', { name: player.name })} onClick={() => open(player.id)}>
      {inner}
    </button>
  );
}

export function PlayerName({ player }: { player: FmPlayer }) {
  return (
    <span className="font-bold">
      <PlayerLink player={player} />
      {player.team && (
        <span className="ml-2">
          <Tag>{player.team}</Tag>
        </span>
      )}
    </span>
  );
}

export function useFormat() {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;
  const eur = new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const date = new Intl.DateTimeFormat(lang, { dateStyle: 'medium' });
  const pct = new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits: 0 });
  return {
    money: (x: number | null | undefined) => (x == null ? '–' : eur.format(x)),
    /** Montant signé : « +120 € » ou « −310 € ». */
    signed: (x: number | null | undefined) => (x == null ? '–' : `${x < 0 ? '−' : '+'}${eur.format(Math.abs(x))}`),
    date: (x: string | null | undefined) => (x ? date.format(new Date(x)) : '–'),
    pct: (x: number) => pct.format(x),
  };
}

/** Noms des rôles et des styles dans la langue de l'interface (les repères n'ont parfois que le français). */
export function useNames() {
  const { i18n } = useTranslation();
  const en = i18n.resolvedLanguage === 'en';
  return {
    role: (r: { fr: string; en?: string } | null | undefined) => (r ? (en && r.en) || r.fr : '–'),
    style: (s: { name: string; nameEn?: string } | null | undefined) => (s ? (en && s.nameEn) || s.name : '–'),
  };
}

/** Adéquation sur 20 affichée en pourcentage. */
/*
 * Échelle d'affichage des notes. Dès que des étoiles ont été lues dans le jeu, toutes les notes sont sur
 * l'échelle du jeu (10 = 0 étoile, 20 = 5 étoiles) et s'affichent en étoiles dans tous les onglets ;
 * sinon en pourcentage. Réglée par useTacticEngine (FmTactic), commun à tous les onglets.
 */
let starScale = false;
export const setFitScale = (stars: boolean) => {
  starScale = stars;
};
const toStars = (f: number) => Math.max(0, Math.min(5, (f - 10) / 2));
export const fitPct = (f: number | null | undefined) =>
  f == null ? '–' : starScale ? `${toStars(f).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ★` : `${Math.round((f / 20) * 100)} %`;

/** Écart entre deux notes sur 20, dans l'unité affichée (étoiles ou pourcentage), à deux décimales près. */
export const fitGap = (d: number) =>
  starScale ? `${(d / 2).toLocaleString(undefined, { maximumFractionDigits: 2 })} ★` : `${((d / 20) * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })} %`;

/** Pastille d'adéquation : vert au-dessus de 65 % (3,5 étoiles), neutre au milieu, corail sous 45 % (1,5 étoile). */
export function Fit({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="text-canard/40">–</span>;
  const pc = starScale ? (toStars(value) / 5) * 100 : (value / 20) * 100;
  const [hi, mid, lo] = starScale ? [70, 50, 30] : [65, 55, 45];
  const cls = pc >= hi ? 'bg-eau-fonce text-white' : pc >= mid ? 'bg-eau/40 text-canard' : pc >= lo ? 'bg-canard/10 text-canard' : 'bg-corail/20 text-canard';
  return <span className={`num-pill ${cls}`}>{fitPct(value)}</span>;
}

/** Choix du coach (style aimé, schéma, niveau visé), partagés entre « Mon projet » et « Cibles », par partie. */
const COACH_KEY = 'fmi.coach';
export function useCoach() {
  const scope = useFmSaveScope();
  const [coach, setCoach] = useState<CoachPrefs>(() => readScoped<CoachPrefs>(COACH_KEY, scope, {}));
  const update = (p: CoachPrefs) => {
    const next = { ...coach, ...p };
    setCoach(next);
    writeScoped(COACH_KEY, scope, next);
  };
  return [coach, update] as const;
}

/** Puces de choix (une seule active). */
export function Chips<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`chip ${v === value ? 'chip-on' : ''}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * Consignes d'équipe comme l'écran du jeu : toutes les cases, avec et sans ballon, dans l'ordre de FM27.
 * Les cases que le style change sont en gras ; les autres gardent la valeur par défaut du jeu.
 */
export function TeamCards({ inPossession, outOfPossession, wide = false }: { inPossession: string[]; outOfPossession: string[]; wide?: boolean }) {
  const { t } = useTranslation();
  const labels = [...inPossession, ...outOfPossession];
  const cards = teamInstructionCards(labels);
  const unknown = labels.filter((l) => !teamInstructionOf(l));
  return (
    <div className={`text-sm ${wide ? 'grid gap-4 sm:grid-cols-2' : 'space-y-3'}`}>
      {(['ip', 'oop'] as const).map((ph) => (
        <div key={ph}>
          <p className="text-xs font-bold uppercase text-canard/60">
            {t(`fm.style.${ph}`)} · {t('fm.style.cardsSet', { count: cards[ph].filter((c) => c.set).length, total: cards[ph].length })}
          </p>
          <ul className="mt-1 divide-y divide-canard/10">
            {cards[ph].map((c) => (
              <li key={c.def.id} className="flex items-baseline justify-between gap-3 py-0.5">
                <span className={c.set ? 'font-bold' : 'text-brun'}>{c.def.title}</span>
                <span className={`text-right ${c.set ? 'font-bold' : 'text-brun'}`}>{c.value}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {unknown.map((l) => (
        <p key={l}>
          {l} <span className="text-xs text-brun">({t('fm.style.notInGame')})</span>
        </p>
      ))}
    </div>
  );
}

/** Explication repliée (« Comment c'est calculé ») : l'écran montre le résultat, le détail reste à un clic. */
export function More({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <details className="mt-2 max-w-3xl text-xs text-brun">
      <summary className="w-fit cursor-pointer select-none font-bold text-canard/60 hover:text-canard">{t('fm.howItWorks')}</summary>
      <div className="mt-1">{children}</div>
    </details>
  );
}

/**
 * Sections d'un long onglet, montrées une à la fois derrière une rangée de pastilles : moins de défilement, et le
 * choix est retenu (par onglet) d'une visite à l'autre.
 */
export function SectionTabs({ id, sections }: { id: string; sections: { id: string; label: string; badge?: ReactNode; node: ReactNode }[] }) {
  const { t } = useTranslation();
  const key = `fmi.section.${id}`;
  const [cur, setCur] = useState(() => {
    try {
      return localStorage.getItem(key) ?? '';
    } catch {
      return '';
    }
  });
  const list = sections.filter((s) => s.node);
  const active = list.find((s) => s.id === cur) ?? list[0];
  const pick = (v: string) => {
    setCur(v);
    try {
      localStorage.setItem(key, v);
    } catch {
      /* stockage indisponible */
    }
  };
  if (!active) return null;
  return (
    <div className="space-y-4">
      {list.length > 1 && (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label={t('fm.onThisPage')}>
          {list.map((s) => (
            <button key={s.id} type="button" role="tab" aria-selected={s === active} className={`chip inline-flex items-center gap-1.5 ${s === active ? 'chip-on' : ''}`} onClick={() => pick(s.id)}>
              {s.label}
              {s.badge}
            </button>
          ))}
        </div>
      )}
      <div role="tabpanel" className="space-y-4">
        {active.node}
      </div>
    </div>
  );
}
