import { backForMatch, briefing, nameList, type BriefItem, type Decision, type FmPlayer, type FmSnapshot, type PlaytimeRow } from '@fm-immersion/module-fm';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useFormat } from './FmUi';

const DOT: Record<BriefItem['tone'], string> = { bad: 'bg-corail', warn: 'bg-ambre', info: 'bg-orange', good: 'bg-eau-fonce' };

/**
 * Briefing de l'adjoint, tout en haut de l'accueil : quelques phrases triées par urgence, chacune avec l'écran où
 * agir. Le détail (tableaux, onglets) reste à un clic.
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
}: {
  snap: FmSnapshot;
  players: FmPlayer[];
  starters: ReadonlySet<string>;
  decisions: Decision[];
  playtime: PlaytimeRow[];
  setupsToChange: number;
  offseason: boolean;
  go: (view: string) => void;
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
  const items = useMemo(
    () => briefing({ players, nextMatch: nm, starters, decisions, playtime, setupsToChange, offseason, backForMatch }),
    [players, nm, starters, decisions, playtime, setupsToChange, offseason],
  );
  const names = (ps: FmPlayer[]) => nameList(ps, t('fm.brief.and'), (n) => t('fm.brief.others', { count: n }));
  const text = (x: BriefItem) => {
    const v = { ...x.values, names: names(x.players), first: x.players[0]?.name ?? '', date: f.date(String(x.values.date ?? '')) };
    if (x.kind === 'nextMatch') {
      const where = x.values.where ? t(`fm.brief.where.${x.values.where}`) : '';
      return x.values.days === 0 ? t('fm.brief.nextMatchToday', { ...v, where }) : t('fm.brief.nextMatch', { ...v, where });
    }
    return t(`fm.brief.${x.kind}`, v);
  };
  const day = new Intl.DateTimeFormat(i18n.resolvedLanguage, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${snap.gameDate.slice(0, 10)}T00:00:00Z`));

  return (
    <section className="rounded-xl bg-canard p-5 text-white">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-2xl font-semibold text-white">{t('fm.brief.title')}</h2>
        <span className="text-sm text-white/70">{day}</span>
      </div>
      <ul className="mt-3 space-y-2">
        {items.map((x, i) => (
          <li key={`${x.kind}-${i}`} className="flex items-start gap-3 rounded-lg bg-white/5 px-3 py-2.5">
            <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${DOT[x.tone]}`} aria-hidden />
            <p className="min-w-0 flex-1 text-[0.95rem] leading-snug">{text(x)}</p>
            {x.view !== 'home' && (
              <button type="button" className="shrink-0 rounded-lg bg-orange-fonce px-3 py-1 text-sm font-bold text-white hover:bg-orange-fonce/90" onClick={() => go(x.view)}>
                {t('fm.brief.go')}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
