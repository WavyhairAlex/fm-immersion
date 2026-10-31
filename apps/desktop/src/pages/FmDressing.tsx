import { dressingRoom, moraleLevel, type FmPlayer } from '@simloom/module-fm';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Empty, Kpi, Level, Panel, PlayerName, Row, Tag, type Tone } from './FmUi';

const moraleTone = (l: number | null): Tone => (l == null ? 'info' : l <= 1 ? 'bad' : l === 2 ? 'warn' : 'good');

/** Vestiaire : moral, leaders et hiérarchie. */
export function FmDressing({ players }: { players: FmPlayer[] }) {
  const { t } = useTranslation();
  const d = useMemo(() => dressingRoom(players), [players]);
  const label = (l: number) => t(`fm.dressing.morale.${l}`);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label={t('fm.dressing.avg')} value={d.avgMorale != null ? label(d.avgMorale) : '–'} sub={d.hasMorale ? undefined : t('fm.dressing.unknown')} />
        <Kpi label={t('fm.dressing.unhappy')} value={d.hasMorale ? d.unhappy.length : '–'} tone={d.unhappy.length ? 'bad' : undefined} sub={t('fm.dressing.unhappySub')} />
        <Kpi label={t('fm.dressing.leaders')} value={d.strongLeaders} sub={t('fm.dressing.leadersSub')} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t('fm.dressing.moraleTitle')}>
          {d.hasMorale ? (
            <>
              {d.counts
                .filter((c) => c.count)
                .map((c) => (
                  <Row key={c.level}>
                    <span className="w-24">{label(c.level)}</span>
                    <span className="mx-3 flex-1">
                      <span
                        className={`block h-2 rounded-full ${c.level <= 1 ? 'bg-corail' : c.level === 2 ? 'bg-ambre' : 'bg-eau-fonce'}`}
                        style={{ width: `${(100 * c.count) / players.length}%` }}
                      />
                    </span>
                    <span className="tabular-nums">{c.count}</span>
                  </Row>
                ))}
              {d.unhappy.length > 0 && (
                <>
                  <h3 className="mt-4 font-semibold">{t('fm.dressing.reassure')}</h3>
                  {d.unhappy.map((p) => (
                    <Row key={p.id}>
                      <span>
                        <PlayerName player={p} /> <span className="text-xs text-brun">{p.squadStatus}</span>
                      </span>
                      <Tag tone="bad">{p.morale}</Tag>
                    </Row>
                  ))}
                </>
              )}
            </>
          ) : (
            <Empty>{t('fm.dressing.noMorale')}</Empty>
          )}
        </Panel>

        <Panel title={t('fm.dressing.leadersTitle')}>
          {d.leaders.map((p) => (
            <Row key={p.id}>
              <span>
                <PlayerName player={p} />{' '}
                <span className="text-xs text-brun">{[p.age != null ? t('fm.contracts.age', { count: p.age }) : null, p.squadStatus].filter(Boolean).join(' · ')}</span>
              </span>
              <span className="flex items-center gap-1 text-xs text-brun">
                {t('fm.dressing.lead')} <Level value={p.attributes.Leadership} /> {t('fm.dressing.det')} <Level value={p.attributes.Determination} />
              </span>
            </Row>
          ))}
          <p className="mt-2 text-xs text-brun">{t('fm.dressing.leadersHelp')}</p>
        </Panel>
      </div>

      <Panel title={t('fm.dressing.hierarchy')}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {d.hierarchy.map((g) => (
            <div key={g.status}>
              <b>{g.status}</b>
              {g.players.map((p) => (
                <Row key={p.id}>
                  <span>
                    <PlayerName player={p} />
                    {p.personality && <span className="ml-1 text-xs text-brun">{p.personality}</span>}
                  </span>
                  {p.morale && <Tag tone={moraleTone(moraleLevel(p.morale))}>{p.morale}</Tag>}
                </Row>
              ))}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
