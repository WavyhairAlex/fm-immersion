import { wageReport, type FmPlayer } from '@fm-immersion/module-fm';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Empty, Kpi, Level, Panel, Pos, PlayerName, Row, Tag, useFormat, type Tone } from './FmUi';

/** Masse salariale : salaires regroupés par statut dans l'effectif, et ce qui détonne. */
export function FmWages({ players, gameDate }: { players: FmPlayer[]; gameDate: string }) {
  const { t } = useTranslation();
  const f = useFormat();
  const r = useMemo(() => wageReport(players, gameDate), [players, gameDate]);
  if (!r) return <Empty>{t('fm.wages.none')}</Empty>;
  const maxSum = Math.max(...r.groups.map((g) => g.sum));
  const groupTone = (rank: number): Tone => (rank <= 1 ? 'good' : rank <= 3 ? 'info' : rank >= 7 ? 'bad' : 'warn');

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label={t('fm.wages.total')} value={f.money(r.total)} sub={t('fm.wages.perYear', { amount: f.money(r.total * 12) })} />
        <Kpi label={t('fm.wages.avg')} value={f.money(r.avg)} sub={t('fm.wages.players', { count: r.count })} />
        <Kpi label={t('fm.wages.top3')} value={f.pct(r.top3 / r.total)} sub={t('fm.wages.perMonth', { amount: f.money(r.top3) })} />
        <Kpi label={t('fm.wages.ending')} value={f.money(r.ending.sum)} sub={t('fm.wages.endingSub', { count: r.ending.players.length })} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t('fm.wages.byStatus')}>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead className="text-left text-canard/70">
                <tr>
                  <th className="py-1 pr-2">{t('fm.wages.status')}</th>
                  <th className="py-1 pr-2 text-right">{t('fm.wages.count')}</th>
                  <th className="py-1 pr-2">{t('fm.wages.share')}</th>
                  <th className="py-1 pr-2 text-right">{t('fm.wages.average')}</th>
                  <th className="py-1 text-right">{t('fm.wages.level')}</th>
                </tr>
              </thead>
              <tbody>
                {r.groups.map((g) => (
                  <tr key={g.status} className="border-t border-canard/5">
                    <td className="py-1.5 pr-2">
                      <Tag tone={groupTone(g.rank)}>{g.status}</Tag>
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{g.players.length}</td>
                    <td className="py-1.5 pr-2">
                      <span className="flex items-center gap-2">
                        <span className="h-2 rounded-full bg-eau-fonce" style={{ width: `${Math.round((90 * g.sum) / maxSum)}px` }} />
                        <span className="text-xs tabular-nums">
                          {f.money(g.sum)} · {f.pct(g.sum / r.total)}
                        </span>
                      </span>
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{f.money(g.avg)}</td>
                    <td className="py-1.5 text-right">
                      <Level value={g.level} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-brun">{t('fm.wages.byStatusHelp')}</p>
        </Panel>

        <Panel title={t('fm.wages.review')}>
          {r.flags.length ? (
            r.flags.map((x, i) => (
              <Row key={i} className="items-start">
                <span className="flex flex-none items-center gap-2">
                  <Tag tone={x.kind === 'over' ? 'warn' : x.kind === 'release' ? 'bad' : 'info'}>{t(`fm.wages.flag.${x.kind}`)}</Tag>
                  <PlayerName player={x.player} />
                </span>
                <span className="text-right text-xs text-brun">
                  {x.kind === 'over'
                    ? t('fm.wages.overText', { wage: f.money(x.player.wage), status: x.ref.status, ref: f.money(x.ref.median) })
                    : x.kind === 'under'
                      ? t('fm.wages.underText', { wage: f.money(x.player.wage), status: x.group.status, other: x.ref.status, ref: f.money(x.ref.median) })
                      : t('fm.wages.releaseText', { wage: f.money(x.player.wage) })}
                </span>
              </Row>
            ))
          ) : (
            <Empty>{t('fm.wages.coherent')}</Empty>
          )}
        </Panel>
      </div>

      <Panel title={t('fm.wages.detail')}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {r.groups.map((g) => (
            <div key={g.status}>
              <div className="mb-1 flex justify-between gap-2">
                <b>{g.status}</b>
                <span className="text-xs text-brun">{t('fm.wages.perMonth', { amount: f.money(g.sum) })}</span>
              </div>
              {g.players.map((p) => (
                <Row key={p.id}>
                  <span className="flex items-center gap-2">
                    <PlayerName player={p} /> <Pos player={p} />
                  </span>
                  <span className="flex items-center gap-2">
                    <Level value={p.level} />
                    <span className="min-w-[4rem] text-right text-xs tabular-nums">{f.money(p.wage)}</span>
                  </span>
                </Row>
              ))}
            </div>
          ))}
        </div>
      </Panel>

      <Panel title={t('fm.wages.value')}>
        <p className="help">{t('fm.wages.valueHelp')}</p>
        {r.costPerPoint.slice(0, 5).map(({ player, cost }) => (
          <Row key={player.id}>
            <span>
              <PlayerName player={player} /> <span className="text-xs text-brun">{player.squadStatus}</span>
            </span>
            <span className="flex items-center gap-2">
              <Level value={player.level} />
              <span className="text-xs tabular-nums">{t('fm.wages.perPoint', { amount: f.money(cost) })}</span>
            </span>
          </Row>
        ))}
        <p className="mt-2 text-xs text-brun">
          {t('fm.wages.bargains', {
            names: r.costPerPoint
              .slice(-3)
              .reverse()
              .map((c) => c.player.name)
              .join(', '),
          })}
        </p>
      </Panel>
    </div>
  );
}
