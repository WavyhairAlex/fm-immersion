import { rotation, upcomingFixtures, type FmPlayer, type FmSnapshot } from '@fm-immersion/module-fm';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Empty, Level, Panel, Pos, Row, Tag, useFormat, PlayerLink } from './FmUi';

/** Calendrier et rotation : prochains matchs rapprochés, joueurs à faire souffler ou à relancer. */
export function FmCalendar({ snap, players }: { snap: FmSnapshot; players: FmPlayer[] }) {
  const { t } = useTranslation();
  const f = useFormat();
  const fixtures = useMemo(() => upcomingFixtures(snap), [snap]);
  const { tired, rusty } = useMemo(() => rotation(players), [players]);
  const pct = (x: number) => `${Math.round(x)} %`;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title={t('fm.cal.next')}>
        {fixtures.length ? (
          <>
            {fixtures.map((m, i) => (
              <Row key={i}>
                <span>
                  <b>{f.date(m.date)}</b> {t(m.home === false ? 'fm.cal.away' : 'fm.cal.home', { team: m.opponent ?? '?' })}{' '}
                  {m.competition && <span className="text-xs text-brun">{m.competition}</span>}
                </span>
                {m.gap != null && m.gap <= 3 && <Tag tone="warn">{t('fm.cal.gap', { count: m.gap })}</Tag>}
              </Row>
            ))}
            {fixtures.some((m) => m.gap != null && m.gap <= 3) && <p className="mt-2 text-xs text-brun">{t('fm.cal.help')}</p>}
          </>
        ) : (
          <Empty>{t('fm.cal.none')}</Empty>
        )}
      </Panel>

      <Panel title={t('fm.cal.tired')}>
        {tired.length ? (
          tired.map((p) => (
            <Row key={p.id}>
              <span className="flex items-center gap-2">
                <PlayerLink player={p} focus="form" /> <Pos player={p} />
              </span>
              <Tag tone={p.condition! < 80 ? 'bad' : 'warn'}>{pct(p.condition!)}</Tag>
            </Row>
          ))
        ) : (
          <Empty>{t('fm.cal.fresh')}</Empty>
        )}
        <h3 className="mt-4 font-semibold">{t('fm.cal.rusty')}</h3>
        {rusty.length ? (
          rusty.map((p) => (
            <Row key={p.id}>
              <span className="flex items-center gap-2">
                <PlayerLink player={p} focus="form" /> <Pos player={p} /> <Level value={p.level} />
              </span>
              <span className="flex items-center gap-1 text-xs text-brun">
                {t('fm.cal.sharpness')} <Tag tone="warn">{pct(p.sharpness!)}</Tag>
              </span>
            </Row>
          ))
        ) : (
          <Empty>{t('fm.cal.nobody')}</Empty>
        )}
        <p className="mt-2 text-xs text-brun">{t('fm.cal.rustyHelp')}</p>
      </Panel>
    </div>
  );
}
