import {
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
} from '@fm-immersion/module-fm';
import { useEffect, useMemo, useState } from 'react';
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
}) {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const next = (snap.nextMatch ?? null) as Record<string, unknown> | null;
  const nm = useMemo(() => {
    const opponent = typeof next?.opponent === 'string' ? next.opponent : null;
    if (!opponent) return null;
    const loc = String(next?.location ?? '').toLowerCase();
    const days = Number(next?.inDays);
    return {
      opponent,
      home: /dom|home/.test(loc) ? true : /ext|away/.test(loc) ? false : null,
      inDays: Number.isFinite(days) ? days : null,
      competition: typeof next?.competition === 'string' ? next.competition : null,
    };
  }, [next]);
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
    () => briefing({ players, nextMatch: nm, starters, decisions, playtime, setupsToChange, offseason, trialists, backForMatch, congested, finances }),
    [players, nm, starters, decisions, playtime, setupsToChange, offseason, trialists, congested, finances],
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
  const firstOpen = ordered.find((x) => isBriefTask(x) && !isDone(x) && x.view !== 'home');
  const todoViews = ordered.filter((x) => isBriefTask(x) && !isDone(x) && x.view !== 'home').map((x) => x.view).join('|');
  useEffect(() => onTodo?.(todoViews ? todoViews.split('|') : []), [todoViews, onTodo]);
  const names = (ps: FmPlayer[]) => nameList(ps, t('fm.brief.and'), (n) => t('fm.brief.others', { count: n }));
  const text = (x: BriefItem) => {
    const v = { ...x.values, names: names(x.players), first: x.players[0]?.name ?? '', date: f.date(String(x.values.date ?? '')) };
    if (x.kind === 'nextMatch' || x.kind === 'friendly') {
      const where = x.values.where ? t(`fm.brief.where.${x.values.where}`) : '';
      return x.values.days === 0 ? t(`fm.brief.${x.kind}Today`, { ...v, where }) : t(`fm.brief.${x.kind}`, { ...v, where });
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
  const day = new Intl.DateTimeFormat(i18n.resolvedLanguage, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${snap.gameDate.slice(0, 10)}T00:00:00Z`));

  return (
    <section className="rounded-xl bg-canard p-5 text-white" aria-labelledby="fm-brief-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="fm-brief-title" className="font-display text-2xl font-semibold text-white">
          {t('fm.brief.title')}
        </h2>
        <span className="text-sm text-white/70">{day}</span>
      </div>
      {tasks.length > 0 && (
        <div className="mt-3" role="status" aria-live="polite">
          <div className="flex items-center justify-between gap-3 text-sm text-white/80">
            <span>{doneCount === tasks.length ? t('fm.brief.allDone') : t('fm.brief.progress', { done: doneCount, count: tasks.length })}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden>
            <div className="h-full rounded-full bg-orange transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${(doneCount / tasks.length) * 100}%` }} />
          </div>
        </div>
      )}
      <ul className="mt-3 space-y-2">
        {ordered.map((x) => {
          const ok = isDone(x);
          const primary = x === firstOpen;
          return (
            <li key={briefKey(x)} className={`flex items-start gap-3 rounded-lg px-3 py-2.5 ${ok ? 'bg-white/[0.03]' : 'bg-white/5'}`}>
              {isBriefTask(x) ? (
                <input
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-orange focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange"
                  checked={ok}
                  onChange={() => toggle(x)}
                  aria-label={t(ok ? 'fm.brief.undo' : 'fm.brief.markDone')}
                  title={t(ok ? 'fm.brief.undo' : 'fm.brief.markDone')}
                />
              ) : (
                <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-eau-fonce" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                {!ok && x.tone === 'bad' && <span className="mr-2 rounded bg-corail px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide text-white">{t('fm.brief.urgent')}</span>}
                <span className={`text-[0.95rem] leading-snug ${ok ? 'text-white/50 line-through' : ''}`}>{text(x)}</span>
                <span className="sr-only">{t(`fm.brief.tone.${x.tone}`)}</span>
              </div>
              {!ok && x.view !== 'home' && (
                <button
                  type="button"
                  className={`shrink-0 cursor-pointer rounded-lg px-3 py-1.5 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange ${
                    primary ? 'bg-orange-fonce text-white hover:bg-orange-fonce/90' : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                  onClick={() => go(x.view)}
                >
                  {t(`fm.brief.act.${x.kind}`, { defaultValue: t('fm.brief.go') })}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
