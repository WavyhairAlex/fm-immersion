import { POS_LABEL, teamInstructionCards, teamInstructionOf, type CoachPrefs, type FmPlayer, type PlanLetter, type Project, type ProjectCompat, type TacticEngine } from '@fm-immersion/module-fm';
import { Face } from '../components/Face';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
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
      <PanelTitle.Provider value={title}>{children}</PanelTitle.Provider>
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

const LETTER_TONE: Record<PlanLetter, Tone> = { A: 'good', B: 'good', C: 'info', D: 'warn', E: 'bad' };
const LETTER_CLASS: Record<PlanLetter, string> = {
  A: 'bg-eau-soutenu text-canard',
  B: 'bg-eau/40 text-canard',
  C: 'bg-canard/10 text-canard',
  D: 'bg-ambre/40 text-canard',
  E: 'bg-corail text-white',
};

/** Pastille de la note de projet (A à E), avec en infobulle le détail des critères. */
export function CompatTag({ c }: { c: ProjectCompat | null | undefined }) {
  const { t } = useTranslation();
  if (!c) return <span className="text-canard/40">–</span>;
  const g = c.grade;
  const parts = g.parts.map((x) => `${t(`fm.grade.${x.id}`)} ${x.score}`).join(' · ');
  const title = [
    c.noPosition ? t('fm.compat.noPosition') : t('fm.grade.title', { letter: g.letter, score: g.score, parts }),
    !c.noPosition && t('fm.compat.title', { fit: fitPct(c.fit), best: fitPct(c.best) }),
    g.capped && t('fm.grade.titleCapped', { letter: g.letter }),
  ]
    .filter(Boolean)
    .join('\n');
  return (
    <span title={title}>
      <Tag tone={LETTER_TONE[g.letter]}>{t('fm.grade.badge', { letter: g.letter })}</Tag>
    </span>
  );
}

/** Grande lettre de la note de projet. */
export function GradeLetter({ letter, size = 'md' }: { letter: PlanLetter; size?: 'md' | 'lg' }) {
  const box = size === 'lg' ? 'h-12 w-12 text-2xl' : 'h-7 w-7 text-sm';
  return <span className={`inline-flex shrink-0 items-center justify-center rounded-lg font-display font-bold ${box} ${LETTER_CLASS[letter]}`}>{letter}</span>;
}

/**
 * Explication pédagogique de la note de projet : chaque critère, son poids, sa note et pourquoi,
 * puis ce que chaque consigne d'équipe du style demande au joueur.
 */
export function PlanGradeCard({ c, project, engine }: { c: ProjectCompat; project: Project; engine: TacticEngine }) {
  const { t } = useTranslation();
  const names = useNames();
  const attr = (k: string) => t(`fm.attr.${k}`, { defaultValue: k });
  const g = c.grade;
  const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 1 });
  const slot = c.slot;
  const why = (id: string, vals: Record<string, number | string>): string => {
    switch (id) {
      case 'role':
        if (!slot) return t('fm.grade.noRole');
        return t(Number(vals.stars) === 0 ? 'fm.grade.why.roleZero' : 'fm.grade.why.role', {
          role: `${names.role(engine.roles.get(slot.ip))} / ${names.role(engine.roles.get(slot.oop))}`,
          slot: POS_LABEL[slot.pos],
          stars: fmt(Number(vals.stars)),
        });
      case 'position': {
        const pos = POS_LABEL[vals.pos as keyof typeof POS_LABEL] ?? String(vals.pos);
        if (vals.natural) return t('fm.grade.why.positionNatural', { pos });
        return vals.fam === '–' ? t('fm.grade.why.positionUnknown', { pos }) : t('fm.grade.why.position', { pos, fam: vals.fam });
      }
      case 'demands':
        return t('fm.grade.why.demands');
      case 'reading':
        return t('fm.grade.why.reading', { value: fmt(Number(vals.value)), need: fmt(Number(vals.need)) });
      case 'mind':
        return t(vals.tone === 'good' ? 'fm.grade.why.mindGood' : vals.tone === 'bad' ? 'fm.grade.why.mindBad' : 'fm.grade.why.mindNeutral', { personality: vals.personality });
      default:
        return '';
    }
  };
  const bar = (score: number) => (score >= 65 ? 'bg-eau-soutenu' : score >= 50 ? 'bg-canard/40' : score >= 35 ? 'bg-ambre' : 'bg-corail');
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <GradeLetter letter={g.letter} size="lg" />
        <div>
          <p className="text-sm">{t('fm.grade.intro', { style: names.style(project.style), form: project.form })}</p>
          <p className="mt-1 text-xs text-brun">{t('fm.grade.scale')}</p>
        </div>
      </div>
      <ul className="space-y-2.5">
        {g.parts.map((x) => (
          <li key={x.id}>
            <div className="flex items-center gap-2 text-sm">
              <b>{t(`fm.grade.${x.id}`)}</b>
              <span className="text-xs text-brun">{t('fm.grade.weight', { weight: x.weight })}</span>
              <span className="ml-auto font-bold tabular-nums">{t('fm.grade.score', { score: x.score })}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-canard/10">
              <div className={`h-full ${bar(x.score)}`} style={{ width: `${x.score}%` }} />
            </div>
            <p className="mt-1 text-xs leading-snug text-brun">{why(x.id, x.vals)}</p>
            {x.id === 'demands' && (
              <ul className="mt-1.5 space-y-1">
                {g.demands.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-baseline gap-x-2 text-xs" title={t('fm.grade.from', { instruction: d.instruction })}>
                    <Tag tone={d.edge >= 1 ? 'good' : d.edge <= -1 ? 'bad' : 'info'}>{t(d.edge >= 1 ? 'fm.grade.edgeUp' : d.edge <= -1 ? 'fm.grade.edgeDown' : 'fm.grade.edgeEven')}</Tag>
                    <b>{t(`fm.grade.demand.${d.id}`)}</b>
                    <span className="text-brun">{d.attrs.map((a) => `${attr(a.key)} ${Math.round(a.value)}`).join(', ')}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {!g.parts.some((x) => x.id === 'demands') && !c.noPosition && <p className="text-xs text-brun">{t('fm.grade.why.noDemands')}</p>}
      {g.capped && <p className="text-xs font-bold text-orange-fonce">{t('fm.grade.why.capped', { letter: g.letter })}</p>}
    </div>
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

/** Section de la fiche à montrer d'abord, selon la raison de l'ouverture (alerte de fatigue, échéance de contrat). */
export type SheetFocus = 'form' | 'contract';
/** Ouvre la fiche d'un joueur (fournie par la page de la partie) ; absente, les noms restent du texte. */
export const PlayerSheetContext = createContext<((id: string, focus?: SheetFocus) => void) | null>(null);

/** Nom de joueur cliquable : ouvre sa fiche. */
/** Nom d'un joueur avec son médaillon (photo du facepack ou initiales), cliquable vers sa fiche quand c'est possible. */
export function PlayerLink({ player, className = 'font-bold', face = true, focus }: { player: FmPlayer; className?: string; face?: boolean; focus?: SheetFocus }) {
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
    <button type="button" className={`${className} inline-flex items-center text-left hover:text-orange-fonce hover:underline`} title={t('fm.sheet.open', { name: player.name })} onClick={() => open(player.id, focus)}>
      {inner}
    </button>
  );
}

export function PlayerName({ player, focus }: { player: FmPlayer; focus?: SheetFocus }) {
  return (
    <span className="font-bold">
      <PlayerLink player={player} focus={focus} />
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

/** Titre du cadre en cours : l'aide de la page range chaque explication sous le nom de son cadre. */
const PanelTitle = createContext<string | null>(null);

/** Hôte de l'aide d'une page : les explications des cadres y sont regroupées au lieu d'un lien par cadre. */
const HelpSlot = createContext<{ el: HTMLElement | null; add: (n: number) => void } | null>(null);

/**
 * Une seule aide « Comment c'est calculé » par page, repliée en bas de l'écran : chaque `More` des cadres y envoie
 * son texte (portail React), sous le titre de son cadre. Rien ne s'affiche si la page n'a aucune explication.
 */
export function HelpHost({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [count, setCount] = useState(0);
  const add = useCallback((n: number) => setCount((c) => c + n), []);
  const slot = useMemo(() => ({ el, add }), [el, add]);
  return (
    <HelpSlot.Provider value={slot}>
      {children}
      <details className={`card mt-6 p-4 text-sm text-brun ${count ? '' : 'hidden'}`}>
        <summary className="w-fit cursor-pointer select-none font-bold text-canard/70 hover:text-canard">{t('fm.howItWorks')}</summary>
        <dl ref={setEl} className="mt-3 max-w-4xl space-y-3" />
      </details>
    </HelpSlot.Provider>
  );
}

/** Explication repliée (« Comment c'est calculé ») : l'écran montre le résultat, le détail reste à un clic. */
export function More({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const slot = useContext(HelpSlot);
  const title = useContext(PanelTitle);
  const add = slot?.add;
  useEffect(() => {
    if (!add) return;
    add(1);
    return () => add(-1);
  }, [add]);
  if (slot) {
    if (!slot.el) return null;
    return createPortal(
      <div>
        {title && <dt className="font-bold text-canard">{title}</dt>}
        <dd>{children}</dd>
      </div>,
      slot.el,
    );
  }
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
