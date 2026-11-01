import { POS_LABEL, type CoachPrefs, type FmPlayer } from '@simloom/module-fm';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
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
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold ${TAG[tone]}`}>{children}</span>;
}

export function Panel({ title, action, children, className = '' }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card p-5 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Kpi({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad' }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-canard/60">{label}</p>
      <p className={`mt-1 font-display text-2xl font-semibold ${tone === 'bad' ? 'text-corail' : ''}`}>{value}</p>
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

export function Pos({ player }: { player: FmPlayer }) {
  const c = player.positions[0];
  return c ? <span className="pill">{POS_LABEL[c]}</span> : null;
}

/** Niveau /20 dans une pastille dont la couleur suit la valeur. */
export function Level({ value }: { value: number | null | undefined }) {
  const { i18n } = useTranslation();
  if (value == null) return <span className="text-canard/40">–</span>;
  const cls = value >= 14 ? 'bg-eau-fonce text-white' : value >= 11 ? 'bg-eau/40 text-canard' : value >= 8 ? 'bg-canard/10 text-canard' : 'bg-corail/20 text-canard';
  return <span className={`inline-block min-w-[2.6rem] rounded-full px-2 py-0.5 text-center text-xs font-bold tabular-nums ${cls}`}>{new Intl.NumberFormat(i18n.resolvedLanguage, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)}</span>;
}

export function PlayerName({ player }: { player: FmPlayer }) {
  return (
    <span className="font-bold">
      {player.name}
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
  return <span className={`inline-block min-w-[3rem] rounded-full px-2 py-0.5 text-center text-xs font-bold tabular-nums ${cls}`}>{fitPct(value)}</span>;
}

/** Choix du coach (style aimé, schéma, niveau visé), partagés entre « Mon projet » et « Cibles », par partie. */
const COACH_KEY = 'simloom.fm.coach';
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
          className={`rounded-full px-3 py-1 text-sm font-bold ${v === value ? 'bg-canard text-white' : 'bg-white text-canard ring-1 ring-canard/15'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
