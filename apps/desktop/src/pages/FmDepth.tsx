import { depthAlerts, depthChart, formationKey, POS_LABEL, seasonStart, type DepthEntry, type FmPlayer, type SquadAt } from '@simloom/module-fm';
import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Kpi, Level, Panel, Tag } from './FmUi';

/** Titulaires et remplaçants : qui joue à chaque poste, et quelle doublure peut passer devant d'ici deux saisons. */
export function FmDepth({ players, gameFormation, gameDate, history }: { players: FmPlayer[]; gameFormation: string | null; gameDate: string; history: SquadAt[] }) {
  const { t } = useTranslation();
  const form = formationKey(gameFormation);
  const rows = useMemo(() => depthChart(players, form, history), [players, form, history]);
  const alerts = useMemo(() => depthAlerts(rows), [rows]);
  const thin = rows.filter((r) => !r.subs.length);
  const y0 = seasonStart(gameDate);
  const season = (n: number) => `${y0 + n}/${String(y0 + n + 1).slice(2)}`;

  const line = (e: DepthEntry, extra: ReactNode) => (
    <div key={e.player.id} className="flex items-center justify-between gap-2 border-b border-canard/5 py-1.5 last:border-0">
      <span className="min-w-0 flex-1">
        <b>{e.player.name}</b> <span className="text-xs text-brun">{t('fm.contracts.age', { count: e.player.age ?? 0 })}</span>
        {e.player.team && (
          <>
            {' '}
            <Tag>{e.player.team}</Tag>
          </>
        )}
        {e.player.injury && (
          <>
            {' '}
            <Tag tone="bad">{t('fm.depth.injured')}</Tag>
          </>
        )}{' '}
        {extra}
      </span>
      <span className="flex items-center gap-1 text-xs text-brun">
        <Level value={e.player.level} />→<Level value={e.in1} />→<Level value={e.in2} />
      </span>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label={t('fm.depth.canPass')} value={alerts.length} sub={t('fm.depth.by', { season: season(2) })} />
        <Kpi
          label={t('fm.depth.thin')}
          value={thin.length}
          tone={thin.length ? 'bad' : undefined}
          sub={thin.map((r) => POS_LABEL[r.pos]).join(', ') || t('fm.depth.none')}
        />
        <Kpi label={t('fm.depth.form')} value={form} sub={gameFormation ?? t('fm.depth.proposed')} />
      </div>

      {alerts.length > 0 && (
        <Panel title={t('fm.depth.watch')}>
          {alerts.map(({ pos, sub, starter }) => (
            <div key={sub.player.id} className="flex items-center justify-between gap-3 border-b border-canard/5 py-1.5 last:border-0">
              <span>
                <span className="rounded-full bg-eau/20 px-2 py-0.5 text-xs font-bold">{POS_LABEL[pos]}</span>{' '}
                {t(sub.when === 0 ? 'fm.depth.already' : 'fm.depth.may', { sub: sub.player.name, starter: starter.name })}
              </span>
              <Tag tone={sub.when === 0 ? 'good' : 'info'}>{sub.when === 0 ? t('fm.depth.now') : t('fm.depth.in', { season: season(sub.when!) })}</Tag>
            </div>
          ))}
        </Panel>
      )}

      <Panel title={t('fm.depth.byPos')}>
        <p className="-mt-2 mb-3 text-xs text-brun">{t('fm.depth.help', { s1: season(1), s2: season(2) })}</p>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => (
            <div key={r.pos} className="rounded-xl bg-creme/50 px-3 py-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="rounded-full bg-eau/20 px-2 py-0.5 text-xs font-bold">
                  {POS_LABEL[r.pos]}
                  {r.count > 1 ? ` ×${r.count}` : ''}
                </span>
                {!r.subs.length && <Tag tone="warn">{t('fm.depth.noSub')}</Tag>}
              </div>
              {r.starters.length ? r.starters.map((e) => line(e, <Tag tone="good">{t('fm.depth.starter')}</Tag>)) : <p className="text-xs text-brun">{t('fm.depth.nobody')}</p>}
              {r.subs.map((e) =>
                line(e, e.when === 0 ? <Tag tone="good">{t('fm.depth.level')}</Tag> : e.when ? <Tag tone="info">↑ {season(e.when)}</Tag> : null),
              )}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
