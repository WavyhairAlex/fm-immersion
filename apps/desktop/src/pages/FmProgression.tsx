import { progression, type SquadAt } from '@simloom/module-fm';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Level, Panel, Pos, useFormat } from './FmUi';

/** Petite courbe du niveau au fil des instantanés. */
function Spark({ values }: { values: (number | null)[] }) {
  const { t } = useTranslation();
  const v = values.filter((x): x is number => x != null);
  if (v.length < 2) return <span className="text-xs text-brun">{t('fm.prog.onePoint')}</span>;
  const w = 120;
  const h = 28;
  const min = Math.min(...v) - 0.5;
  const max = Math.max(...v) + 0.5;
  const pts = values
    .map((x, i) => [(i * (w - 6)) / (values.length - 1) + 3, x == null ? null : h - 3 - ((x - min) / (max - min)) * (h - 6)] as const)
    .filter((p): p is readonly [number, number] => p[1] != null);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
  const last = pts.at(-1)!;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={`${d} L${last[0]} ${h} L${pts[0]![0]} ${h}Z`} className="fill-eau/30" />
      <path d={d} fill="none" className="stroke-eau-fonce" strokeWidth={1.6} />
      <circle cx={last[0]} cy={last[1]} r={2.5} className="fill-eau-fonce" />
    </svg>
  );
}

/** Progression : évolution du niveau de chaque joueur depuis le premier instantané importé. */
export function FmProgression({ history }: { history: SquadAt[] }) {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const rows = useMemo(() => progression(history), [history]);
  const one = new Intl.NumberFormat(i18n.resolvedLanguage, { minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: 'exceptZero' });
  if (!history.length) return null;

  return (
    <Panel title={t('fm.prog.title', { date: f.date(history[0]!.gameDate) })}>
      <p className="-mt-2 mb-3 text-xs text-brun">
        {t('fm.prog.snaps', { count: history.length, dates: history.map((h) => f.date(h.gameDate)).join(' · ') })}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-canard/70">
            <tr>
              <th className="px-2 py-1">{t('fm.prog.player')}</th>
              <th className="px-2 py-1 text-right">{t('fm.prog.age')}</th>
              <th className="px-2 py-1">{t('fm.prog.curve')}</th>
              <th className="px-2 py-1 text-right">{t('fm.prog.level')}</th>
              <th className="px-2 py-1 text-right">{t('fm.prog.delta')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ player: p, series, delta }) => (
              <tr key={p.id} className="border-t border-canard/5">
                <td className="px-2 py-1.5 font-bold">
                  {p.name} <Pos player={p} />
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{p.age ?? '–'}</td>
                <td className="px-2 py-1.5">
                  <Spark values={series} />
                </td>
                <td className="px-2 py-1.5 text-right">
                  <Level value={p.level} />
                </td>
                <td className={`px-2 py-1.5 text-right font-bold tabular-nums ${delta > 0 ? 'text-eau-fonce' : delta < 0 ? 'text-corail' : 'text-brun'}`}>
                  {one.format(delta)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
