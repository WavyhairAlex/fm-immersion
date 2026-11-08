import {
  ATTR_GROUPS,
  levelSeries,
  matchStatsFull,
  mercatoAdvice,
  roleMatrix,
  statsBoard,
  STAT_METRICS,
  type FmPlayer,
  type FmSnapshot,
  type PosCode,
  type SquadAt,
  type StatKey,
} from '@fm-immersion/module-fm';
import { Face } from '../components/Face';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AttrValue, Avatar, Gauge, LINE_COLOR, PosBadge, PositionMap, ProfileRadar, profileAxes, RankBar } from './FmFoot';
import { LeaveButton, useLeaving } from './FmLeaving';
import { TONE, useReason } from './FmMercato';
import { Spark } from './FmProgression';
import { useTacticEngine } from './FmTactic';
import { CompatTag, fitPct, Level, Tag, useCoach, useFormat, useNames } from './FmUi';

const PCT = new Set<StatKey>(['passPct', 'tacklePct', 'headerPct', 'shotsOnTargetPct', 'savePct']);

/**
 * Fiche joueur, façon fiche du jeu : bandeau d'identité, profil en radar face à sa ligne, postes sur le terrain,
 * attributs 1-20 colorés, forme, stats de match en percentiles de la ligne, progression et conseil mercato.
 * S'ouvre en panneau à droite depuis un nom cliquable.
 */
export function FmPlayerSheet({
  id,
  players,
  snap,
  history,
  folder,
  gameDate,
  onClose,
}: {
  id: string;
  players: FmPlayer[];
  snap: FmSnapshot;
  history: SquadAt[];
  folder: string;
  gameDate: string;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const names = useNames();
  const reason = useReason();
  const [coach] = useCoach();
  const { engine } = useTacticEngine(folder, players);
  const p = players.find((x) => x.id === id);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Meilleur rôle à chaque poste (avec ballon) : sert à la carte des postes et à la liste des rôles.
  const cells = useMemo(() => (p && Object.keys(p.attributes).length ? (roleMatrix(engine, [p], 'ip').rows[0]?.cells ?? []) : []), [engine, p]);
  const fits = useMemo(() => Object.fromEntries(cells.filter((c) => c).map((c) => [c!.pos, c!.fit])) as Partial<Record<PosCode, number>>, [cells]);
  const roles = cells
    .filter((c): c is NonNullable<typeof c> => !!c && (c.natural || c.tryIt))
    .sort((a, b) => b.fit - a.fit)
    .slice(0, 3);
  const axes = useMemo(() => (p ? profileAxes(p) : []), [p]);
  // Profil moyen des joueurs de la même ligne : repère en pointillé sur le radar.
  const lineAvg = useMemo(() => {
    if (!p) return undefined;
    const mates = players.filter((x) => x.line === p.line && x.id !== p.id).map(profileAxes);
    if (!mates.length) return undefined;
    return axes.map((_, i) => {
      const v = mates.map((m) => m[i]?.value).filter((x): x is number => x != null);
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    });
  }, [players, p, axes]);
  const stats = useMemo(() => {
    const full = matchStatsFull(snap);
    return statsBoard(players, new Map([...full].map(([k, m]) => [k, m.stats]))).players.find((r) => r.player.id === id) ?? null;
  }, [snap, players, id]);
  const { ids: leavingIds, loanIds } = useLeaving();
  const advice = useMemo(
    () => mercatoAdvice(engine, players, gameDate, coach, history, leavingIds, loanIds)?.advice.find((a) => a.player.id === id) ?? null,
    [engine, players, gameDate, coach, history, id, leavingIds, loanIds],
  );
  const series = useMemo(() => levelSeries(history, id), [history, id]);
  if (!p) return null;
  const isGk = p.positions.includes('GB');
  const groups = ATTR_GROUPS.filter(([g]) => (isGk ? g !== 'technical' : g !== 'goalkeeping'));
  const nf = (d: number) =>
    new Intl.NumberFormat(i18n.resolvedLanguage, {
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    });
  const fmtStat = (k: StatKey, v: number) => (PCT.has(k) ? `${nf(0).format(v)} %` : nf(k === 'distance90' ? 1 : 2).format(v));
  const metrics = stats ? STAT_METRICS.filter((m) => p.line && m.lines.includes(p.line) && stats.stats[m.key] != null) : [];
  const line = LINE_COLOR[p.line ?? 'MIL'];
  const levels = series.filter((x): x is number => x != null);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-canard/30" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-label={p.name} className="h-full w-full max-w-3xl overflow-y-auto bg-creme shadow-xl" onClick={(e) => e.stopPropagation()}>
        {/* Bandeau d'identité, comme l'en-tête de la fiche du jeu. */}
        <header className="relative bg-canard px-6 pb-5 pt-6 text-white">
          <span className={`absolute inset-x-0 top-0 h-1.5 ${line.bg}`} aria-hidden />
          <button type="button" className="absolute right-4 top-4 rounded-full px-2 text-2xl text-white/70 hover:bg-white/10 hover:text-white" onClick={onClose} aria-label={t('fm.sheet.close')}>
            ×
          </button>
          <div className="flex items-center gap-4">
            <Avatar player={p} size="lg" />
            <div className="min-w-0">
              <h2 className="flex items-center gap-3 truncate text-3xl font-semibold text-white">
                <Face id={p.id} name={p.name} size={56} className="ring-2 ring-orange" />
                <span className="truncate">{p.name}</span>
              </h2>
              <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-white/80">
                {p.positions.map((pos) => (
                  <PosBadge key={pos} pos={pos} />
                ))}
                {p.age != null && <span>· {t('fm.contracts.age', { count: p.age })}</span>}
                {p.foot && <span>· {t('fm.foot.foot', { foot: p.foot })}</span>}
                {p.squadStatus && <span>· {p.squadStatus}</span>}
              </p>
            </div>
            <div className="ml-auto pr-8 text-right">
              <p className="text-xs uppercase tracking-wide text-white/60">{t('fm.col.level')}</p>
              <p className="font-display text-4xl font-semibold tabular-nums">{p.level != null ? nf(1).format(p.level) : '–'}</p>
              {p.stars?.current != null && (
                <p className="text-sm text-white/80">
                  ★ {p.stars.current}
                  {p.stars.potential != null ? ` → ${p.stars.potential}` : ''}
                </p>
              )}
            </div>
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
            {(
              [
                [t('fm.col.contract'), f.date(p.contractEnd)],
                [t('fm.col.wage'), f.money(p.wage)],
                [t('fm.sheet.value'), f.money(p.value)],
                [t('fm.sheet.morale'), p.morale ?? '–'],
              ] as [string, string][]
            ).map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs uppercase tracking-wide text-white/60">{k}</dt>
                <dd className="font-bold">{v}</dd>
              </div>
            ))}
          </dl>
          {(p.injury || p.suspension) && (
            <p className="mt-3 flex flex-wrap gap-2">
              {p.injury && <Tag tone="bad">{p.injury + (p.injuryDays ? ` (${p.injuryDays} j)` : '')}</Tag>}
              {p.suspension && <Tag tone="bad">{t('fm.home.kind.suspended')}</Tag>}
            </p>
          )}
        </header>

        <div className="space-y-4 p-5">
          {/* Profil et postes côte à côte. */}
          <section className="card grid gap-4 p-4 sm:grid-cols-[1fr_auto]">
            <div>
              <h3 className="font-semibold">{t('fm.foot.profile')}</h3>
              <p className="text-xs text-brun">{t('fm.foot.profileHelp')}</p>
              <div className="mt-2 flex justify-center">
                <ProfileRadar axes={axes} compare={lineAvg} />
              </div>
            </div>
            <div className="flex flex-col items-center">
              <h3 className="self-start font-semibold">{t('fm.sheet.roles')}</h3>
              <div className="mt-2 w-48">
                <PositionMap player={p} fits={fits} label={fitPct} />
              </div>
              <ul className="mt-3 w-full space-y-1 text-sm">
                {roles.map((c) => (
                  <li key={c.pos} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5">
                      <PosBadge pos={c.pos} /> {names.role(c.role)}
                    </span>
                    <b className="tabular-nums">{fitPct(c.fit)}</b>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Attributs par famille, colorés 1-20. */}
          {Object.keys(p.attributes).length > 0 && (
            <section className="card p-4">
              <h3 className="font-semibold">{t('fm.foot.attributes')}</h3>
              <div className="mt-2 grid gap-x-6 gap-y-3 sm:grid-cols-3">
                {groups.map(([g, keys]) => (
                  <div key={g}>
                    <p className="mb-1 text-xs font-bold uppercase tracking-wide text-canard/60">{t(`fm.attrGroup.${g}`)}</p>
                    {keys
                      .filter((k) => p.attributes[k] != null)
                      .map((k) => (
                        <div key={k} className="flex items-center justify-between gap-2 py-px text-sm">
                          <span className="truncate text-canard">{t(`fm.attr.${k}`, { defaultValue: k })}</span>
                          <AttrValue value={p.attributes[k]} />
                        </div>
                      ))}
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Forme du moment. */}
            <section className="card space-y-3 p-4">
              <h3 className="font-semibold">{t('fm.foot.form')}</h3>
              <Gauge value={p.condition} label={t('fm.col.condition')} />
              <Gauge value={p.sharpness} label={t('fm.foot.sharpness')} />
              <dl className="grid grid-cols-3 gap-2 pt-1 text-center">
                {(
                  [
                    [t('fm.foot.apps'), p.apps != null ? String(p.apps) : '–'],
                    [t('fm.foot.goals'), p.goals != null ? String(p.goals) : '–'],
                    [t('fm.foot.rating'), p.avgRating != null ? nf(2).format(p.avgRating) : '–'],
                  ] as [string, string][]
                ).map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-creme/70 py-1.5">
                    <dd className="font-display text-xl font-semibold">{v}</dd>
                    <dt className="text-xs text-brun">{k}</dt>
                  </div>
                ))}
              </dl>
            </section>

            {/* Progression du niveau. */}
            <section className="card p-4">
              <h3 className="font-semibold">{t('fm.sheet.progress')}</h3>
              {levels.length > 1 ? (
                <div className="mt-3 flex flex-col items-start gap-2">
                  <Spark values={series} />
                  <span className="text-sm text-brun">
                    {nf(1).format(levels[0]!)} → <b className="text-canard">{nf(1).format(levels.at(-1)!)}</b>
                  </span>
                </div>
              ) : (
                <p className="mt-2 text-sm text-brun">{t('fm.prog.onePoint')}</p>
              )}
              {advice?.proj[1] != null && (
                <p className="mt-3 flex items-center gap-1.5 text-sm text-brun">
                  {t('fm.sheet.inTwo')} <Level value={p.level} /> → <Level value={advice.proj[1]} />
                </p>
              )}
            </section>
          </div>

          {/* Stats de match : percentile dans sa ligne. */}
          {stats && stats.minutes > 0 && metrics.length > 0 && (
            <section className="card p-4">
              <h3 className="font-semibold">{t('fm.sheet.stats', { minutes: stats.minutes })}</h3>
              <p className="text-xs text-brun">{t('fm.foot.statsHelp')}</p>
              <ul className="mt-3 space-y-2">
                {metrics.map((m) => {
                  const mark = stats.marks[m.key];
                  return (
                    <li key={m.key} className="grid grid-cols-[10rem_1fr_4rem] items-center gap-3 text-sm">
                      <span className="truncate text-canard">{t(`fm.stats.col.${m.key}`)}</span>
                      {mark ? <RankBar rank={mark.rank} /> : <span className="text-xs text-brun">–</span>}
                      <span className="text-right font-bold tabular-nums">{fmtStat(m.key, stats.stats[m.key]!)}</span>
                    </li>
                  );
                })}
              </ul>
              {stats.focus && (
                <p className="mt-3 text-sm">
                  <Tag tone="warn">{t('fm.sheet.focus')}</Tag> {t(`fm.train.focus.${stats.focus}`)}
                </p>
              )}
              {!stats.enough && <p className="mt-2 text-xs text-brun">{t('fm.sheet.fewMinutes')}</p>}
            </section>
          )}

          <section className="card p-4">
            <h3 className="flex flex-wrap items-center gap-2 font-semibold">
              {t('fm.sheet.mercato')}
              {advice && (
                <>
                  <Tag tone={TONE[advice.verdict]}>{t(`fm.merc.verdict.${advice.verdict}`)}</Tag> <CompatTag c={advice.compat} />
                </>
              )}
              <span className="ml-auto font-normal">
                <LeaveButton player={p} gameDate={gameDate} />
              </span>
            </h3>
            {advice ? (
              <p className="mt-1.5 text-sm text-brun">{advice.reasons.map(reason).join(' · ')}</p>
            ) : (
              leavingIds.has(p.id) && <p className="mt-1.5 text-sm text-brun">{t('fm.leave.sheet')}</p>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}
