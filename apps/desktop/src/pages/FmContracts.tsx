import { contractsByYear, upcomingContracts, type FmPlayer } from '@fm-immersion/module-fm';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Empty, Level, Panel, Row, Tag, useFormat, PlayerLink } from './FmUi';

/** Contrats : salaires libérés par année de fin, et échéances à traiter dans les 18 mois. */
export function FmContracts({ players, gameDate }: { players: FmPlayer[]; gameDate: string }) {
  const { t } = useTranslation();
  const f = useFormat();
  const years = useMemo(() => contractsByYear(players), [players]);
  const soon = useMemo(() => upcomingContracts(players, gameDate, 18), [players, gameDate]);
  const maxW = Math.max(1, ...years.map((y) => y.sum));
  const W = 560;
  const H = 200;
  const pad = 34;
  const bw = (W - pad * 2) / Math.max(1, years.length);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title={t('fm.contracts.byYear')}>
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="min-w-[22rem] text-[11px]" role="img" aria-label={t('fm.contracts.byYear')}>
            <line x1={pad} x2={W - pad} y1={H - pad} y2={H - pad} className="stroke-canard/20" />
            {years.map((y, i) => {
              const h = ((H - pad * 2) * y.sum) / maxW;
              const x = pad + i * bw;
              return (
                <g key={y.year}>
                  <rect x={x + bw * 0.2} y={H - pad - h} width={bw * 0.6} height={h} rx={3} className="fill-eau-fonce" />
                  <text x={x + bw / 2} y={H - pad + 14} textAnchor="middle" className="fill-canard">
                    {y.year}
                  </text>
                  <text x={x + bw / 2} y={H - pad - h - 5} textAnchor="middle" className="fill-brun">
                    {f.money(y.sum)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
        {years.map((y) => (
          <Row key={y.year} className="items-start text-sm">
            <b>{y.year}</b>
            <span className="flex-1 text-right text-brun">{y.players.map((p) => p.name).join(', ')}</span>
          </Row>
        ))}
      </Panel>

      <Panel title={t('fm.contracts.soon')}>
        {soon.length ? (
          soon.map(({ player: p, months }) => (
            <Row key={p.id}>
              <div>
                <div><PlayerLink player={p} /></div>
                <div className="flex flex-wrap items-center gap-1 text-xs text-brun">
                  {[p.age != null ? t('fm.contracts.age', { count: p.age }) : null, p.positionsLabel, f.money(p.wage)].filter(Boolean).join(' · ')} <Level value={p.level} />
                </div>
              </div>
              <Tag tone={months <= 6 ? 'bad' : months <= 12 ? 'warn' : 'info'}>{months <= 0 ? t('fm.contracts.expired') : t('fm.contracts.months', { count: months })}</Tag>
            </Row>
          ))
        ) : (
          <Empty>{t('fm.contracts.none')}</Empty>
        )}
      </Panel>
    </div>
  );
}
