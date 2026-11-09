import {
  nextMatchCountdown,
  backForMatch,
  briefIsDone,
  briefKey,
  briefing,
  clubFinances,
  financeState,
  isBriefTask,
  nameList,
  pruneBriefDone,
  type BriefDone,
  trialistIds,
  isCongested,
  snapshotFixtures,
  type BriefItem,
  type Decision,
  type FmPlayer,
  type FmSnapshot,
  type PlaytimeRow,
  type TacticAdvice,
} from '@fm-immersion/module-fm';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useCareerStore } from '../lib/career';
import { readScoped, useFmSaveScope, writeScoped } from '../lib/save-store';
import { useFormat } from './FmUi';

const DONE_KEY = 'fmi.briefDone';

/**
 * Briefing de l'adjoint, tout en haut de l'accueil : la liste « à faire » de la semaine, triée par urgence.
 * Chaque message dit quoi faire, ouvre l'écran où le faire (un seul bouton principal : le premier à traiter) et
 * se coche une fois réglé ; quand tout est coché, l'adjoint le dit. Le détail (tableaux, onglets) reste à un clic.
 */
export function FmBriefing({
  snap,
  players,
  starters,
  decisions,
  playtime,
  setupsToChange,
  offseason,
  go,
  onTodo,
  tactic = null,
  hideMatch = false,
}: {
  snap: FmSnapshot;
  players: FmPlayer[];
  starters: ReadonlySet<string>;
  decisions: Decision[];
  playtime: PlaytimeRow[];
  setupsToChange: number;
  offseason: boolean;
  go: (view: string) => void;
  /** Écrans où il reste quelque chose à faire (pastilles des onglets). */
  onTodo?: (views: string[]) => void;
  /** Garder ou changer la tactique jouée (historique des instantanés). */
  tactic?: TacticAdvice | null;
  /** Le prochain match a déjà son bandeau : ne pas le répéter dans la liste. */
  hideMatch?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const next = (snap.nextMatch ?? null) as Record<string, unknown> | null;
  const nm = useMemo(() => {
    const opponent = typeof next?.opponent === 'string' ? next.opponent : null;
    if (!opponent) return null;
    const loc = String(next?.location ?? '').toLowerCase();
    // Le jeu écrit « Dans 100 jours », « Demain » : un texte, pas un nombre. Le calendrier daté fait foi.
    const days = nextMatchCountdown(snap);
    return {
      opponent,
      home: /dom|home/.test(loc) ? true : /ext|away/.test(loc) ? false : null,
      inDays: days,
      competition: typeof next?.competition === 'string' ? next.competition : null,
    };
  }, [next, snap]);
  // Joueurs à l'essai : hors de l'effectif (`players`), lus directement dans l'instantané.
  const trialists = useMemo(() => {
    const ids = trialistIds(snap);
    return (snap.players as unknown as { id: unknown; name?: unknown }[])
      .filter((p) => ids.has(String(p.id)))
      .map((p) => ({ id: String(p.id), name: String(p.name ?? '') }) as FmPlayer);
  }, [snap]);
  const congested = useMemo(() => isCongested(snapshotFixtures(snap), snap.gameDate), [snap]);
  // Finances serrées : chaque signal formulé avec son montant, pour une seule phrase dans le briefing.
  const finances = useMemo(() => {
    const fin = clubFinances(snap, players);
    const st = financeState(fin);
    if (!st.tight) return null;
    const amount = { wageOver: Math.abs(fin.wageRoom ?? 0), noTransfer: 0, debt: Math.abs(fin.balance ?? 0) };
    return { signals: st.signals, detail: st.signals.map((sg) => t(`fm.brief.finSignal.${sg}`, { amount: f.money(amount[sg]) })).join(', ') };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap, players, i18n.resolvedLanguage]);
  const items = useMemo(
    () => briefing({ players, nextMatch: nm, starters, decisions, playtime, setupsToChange, offseason, trialists, backForMatch, congested, finances, tactic }),
    [players, nm, starters, decisions, playtime, setupsToChange, offseason, trialists, congested, finances, tactic],
  );
  const scope = useFmSaveScope();
  const [done, setDone] = useState<BriefDone>(() => readScoped<BriefDone>(DONE_KEY, { ...scope, inheritsLegacy: false }, {}));
  const toggle = (x: BriefItem) =>
    setDone((d) => {
      const k = briefKey(x);
      const next = pruneBriefDone(d, snap.gameDate);
      if (briefIsDone(d, x, snap.gameDate)) delete next[k];
      else next[k] = snap.gameDate;
      writeScoped(DONE_KEY, scope, next);
      return next;
    });
  const tasks = items.filter(isBriefTask);
  const isDone = (x: BriefItem) => isBriefTask(x) && briefIsDone(done, x, snap.gameDate);
  const doneCount = tasks.filter(isDone).length;
  // À traiter d'abord, dans l'ordre d'urgence ; ce qui est réglé passe en bas, barré.
  const ordered = [...items.filter((x) => !isDone(x)), ...items.filter(isDone)];
  const todoViews = ordered.filter((x) => isBriefTask(x) && !isDone(x) && x.view !== 'home').map((x) => x.view).join('|');
  useEffect(() => onTodo?.(todoViews ? todoViews.split('|') : []), [todoViews, onTodo]);
  const names = (ps: FmPlayer[]) => nameList(ps, t('fm.brief.and'), (n) => t('fm.brief.others', { count: n }));
  const text = (x: BriefItem) => {
    const v = { ...x.values, names: names(x.players), first: x.players[0]?.name ?? '', date: f.date(String(x.values.date ?? '')) };
    if (x.kind === 'nextMatch' || x.kind === 'friendly') {
      const where = x.values.where ? t(`fm.brief.where.${x.values.where}`) : '';
      // Date inconnue (-1) : on ne dit ni « demain » ni un nombre de jours.
      const key = x.values.days === 0 ? 'Today' : Number(x.values.days) < 0 ? 'Soon' : '';
      return t(`fm.brief.${x.kind}${key}`, { ...v, where });
    }
    return t(`fm.brief.${x.kind}`, v);
  };
  // Messages encore ouverts, déjà rédigés : chaque écran du club reprend ceux qui le concernent.
  const setBrief = useCareerStore((s) => s.setBrief);
  const open = ordered.filter((x) => isBriefTask(x) && !isDone(x) && x.view !== 'home');
  const openJson = JSON.stringify(
    open.map((x) => ({ key: briefKey(x), view: x.view, tone: x.tone, text: text(x), action: t(`fm.brief.act.${x.kind}`, { defaultValue: t('fm.brief.go') }) })),
  );
  useEffect(() => setBrief({ at: `${scope.saveId}|${snap.gameDate}`, items: JSON.parse(openJson) }), [openJson, scope.saveId, snap.gameDate, setBrief]);
  // Le mot de l'adjoint : le premier message à traiter, cité ; le reste suit en liste. Le prochain match a son
  // bandeau en haut de l'accueil (`hideMatch`), il n'est pas répété ici.
  const isMatch = (x: BriefItem) => x.kind === 'nextMatch' || x.kind === 'friendly';
  const shown = hideMatch ? ordered.filter((x) => !isMatch(x)) : ordered;
  const quote = shown.find((x) => isBriefTask(x) && !isDone(x) && x.view !== 'home') ?? shown.find((x) => !isDone(x)) ?? null;
  const rows = shown.filter((x) => x !== quote);
  const shownTasks = shown.filter(isBriefTask);
  const shownDone = shownTasks.filter(isDone).length;
  const action = (x: BriefItem) => t(`fm.brief.act.${x.kind}`, { defaultValue: t('fm.brief.go') });
  const ring = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange';

  return (
    <div className="space-y-4">
      <section className="card p-5" aria-labelledby="fm-brief-word">
        <h2 id="fm-brief-word" className="text-lg">
          {t('fm.brief.word')}
        </h2>
        <blockquote className="mt-3 border-l-4 border-orange pl-4 font-display text-lg italic leading-snug text-canard">
          {quote ? text(quote) : tasks.length ? t('fm.brief.allDone') : t('fm.brief.allGood')}
        </blockquote>
        {quote && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 pl-5">
            {!isDone(quote) && quote.tone === 'bad' && <span className="rounded bg-corail px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide text-white">{t('fm.brief.urgent')}</span>}
            {quote.view !== 'home' && (
              <button type="button" className={`rounded text-sm font-bold text-orange-fonce hover:underline ${ring}`} onClick={() => go(quote.view)}>
                {action(quote)} →
              </button>
            )}
            {isBriefTask(quote) && (
              <label className="flex cursor-pointer items-center gap-2 text-sm text-brun">
                <input type="checkbox" className="h-4 w-4 cursor-pointer accent-orange-fonce" checked={isDone(quote)} onChange={() => toggle(quote)} />
                {t('fm.brief.markDone')}
              </label>
            )}
          </div>
        )}
      </section>

      <section className="card p-5" aria-labelledby="fm-brief-week">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="fm-brief-week" className="text-lg">
            {t('fm.brief.week')}
          </h2>
          {shownTasks.length > 0 && (
            <span className="text-sm text-brun" role="status" aria-live="polite">
              {shownDone === shownTasks.length ? t('fm.brief.allDone') : t('fm.brief.progressShort', { done: shownDone, count: shownTasks.length })}
            </span>
          )}
        </div>
        {shownTasks.length > 0 && (
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-canard/10" aria-hidden>
            <div className="h-full rounded-full bg-orange transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${(shownDone / shownTasks.length) * 100}%` }} />
          </div>
        )}
        {rows.length ? (
          <ul className="mt-2 divide-y divide-canard/10">
            {rows.map((x) => {
              const ok = isDone(x);
              return (
                <li key={briefKey(x)} className="flex items-center gap-3 py-2.5">
                  {isBriefTask(x) ? (
                    <input
                      type="checkbox"
                      className={`h-4 w-4 shrink-0 cursor-pointer accent-orange-fonce ${ring}`}
                      checked={ok}
                      onChange={() => toggle(x)}
                      aria-label={t(ok ? 'fm.brief.undo' : 'fm.brief.markDone')}
                      title={t(ok ? 'fm.brief.undo' : 'fm.brief.markDone')}
                    />
                  ) : (
                    <span className="h-4 w-4 shrink-0" aria-hidden />
                  )}
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${ok ? 'bg-canard/5 text-brun' : x.tone === 'bad' ? 'bg-corail/10 text-corail' : 'bg-orange-clair text-orange-fonce'}`} aria-hidden>
                    <CatIcon view={x.view} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs font-bold uppercase tracking-wide ${ok ? 'text-brun/70' : 'text-brun'}`}>
                      {t(`fm.brief.cat.${x.view}`, { defaultValue: t(`fm.views.${x.view}`, { defaultValue: '' }) })}
                      {!ok && x.tone === 'bad' && <span className="ml-2 rounded bg-corail px-1.5 py-0.5 text-[0.65rem] text-white">{t('fm.brief.urgent')}</span>}
                    </p>
                    <p className={`line-clamp-2 text-sm leading-snug ${ok ? 'text-brun line-through' : 'text-canard'}`}>{text(x)}</p>
                    <span className="sr-only">{t(`fm.brief.tone.${x.tone}`)}</span>
                  </div>
                  {x.view !== 'home' && (
                    <button
                      type="button"
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg font-bold text-orange-fonce hover:bg-orange-clair ${ring}`}
                      onClick={() => go(x.view)}
                      aria-label={action(x)}
                      title={action(x)}
                    >
                      →
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-brun">{t('fm.brief.nothingElse')}</p>
        )}
      </section>
    </div>
  );
}

/** Icônes au trait (24×24) des catégories du briefing, dessinées ici : aucun visuel du jeu. */
const CAT_ICONS: Record<string, ReactNode> = {
  tactic: <path d="M4 4h16v16H4zM12 4v16M4 12h3M17 12h3" />,
  depth: <path d="M4 12a8 8 0 0114-5.3L20 5v5h-5M20 12a8 8 0 01-14 5.3L4 19v-5h5" />,
  opponent: <path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" />,
  targets: <path d="M12 3a9 9 0 100 18 9 9 0 000-18zM12 8a4 4 0 100 8 4 4 0 000-8z" />,
  finances: <path d="M12 3v18M17 7H9.5a3 3 0 000 6h5a3 3 0 010 6H6" />,
  contracts: <path d="M6 3h9l3 3v15H6zM9 10h6M9 14h6M9 18h3" />,
  playtime: <path d="M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2" />,
  dressing: <path d="M9 7a3 3 0 106 0 3 3 0 00-6 0M4 21c1-4 4-6 8-6s7 2 8 6" />,
  effectiveness: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  training: <path d="M3 10v4M6 7v10M18 7v10M21 10v4M6 12h12" />,
  mercato: <path d="M4 7h13l-3-3M20 17H7l3 3" />,
  home: <path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z" />,
};

function CatIcon({ view }: { view: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] fill-none stroke-current" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {CAT_ICONS[view] ?? CAT_ICONS.home}
    </svg>
  );
}
