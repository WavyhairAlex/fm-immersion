import { progression, type SquadAt } from '@fm-immersion/module-fm';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Level, Panel, PlayerLink, Pos, useFormat } from './FmUi';

/** Petite courbe du niveau au fil des instantanés. */
export function Spark({ values }: { values: (number | null)[] }) {
  const { t } = useTranslation();
  const v = values.filter((x): x is number => x != null);
  if (v.length < 2) return <span className="text-xs text-brun">{t('fm.prog.onePoint')}</span>;
  const w = 120;
  const h = 28;
  // Échelle d'au moins 2 points de niveau : un dixième de variation reste plat au lieu de ressembler à une chute.
  const mid = (Math.min(...v) + Math.max(...v)) / 2;
  const half = Math.max(1, (Math.max(...v) - Math.min(...v)) / 2 + 0.3);
  const min = mid - half;
  const max = mid + half;
  const trend = v.at(-1)! - v[0]!;
  const tone = trend >= 0.15 ? 'eau' : trend <= -0.15 ? 'corail' : 'brun';
  const pts = values
    .map((x, i) => [(i * (w - 6)) / (values.length - 1) + 3, x == null ? null : h - 3 - ((x - min) / (max - min)) * (h - 6)] as const)
    .filter((p): p is readonly [number, number] => p[1] != null);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
  const last = pts.at(-1)!;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={`${d} L${last[0]} ${h} L${pts[0]![0]} ${h}Z`} className={tone === 'eau' ? 'fill-eau/30' : tone === 'corail' ? 'fill-corail/15' : 'fill-canard/5'} />
      <path d={d} fill="none" className={tone === 'eau' ? 'stroke-eau-fonce' : tone === 'corail' ? 'stroke-corail' : 'stroke-brun'} strokeWidth={1.6} />
      <circle cx={last[0]} cy={last[1]} r={2.5} className={tone === 'eau' ? 'fill-eau-fonce' : tone === 'corail' ? 'fill-corail' : 'fill-brun'} />
    </svg>
  );
}

type Trend = 'all' | 'up' | 'flat' | 'down';
/** Seuil (points d'attributs) au-delà duquel un joueur est dit en progrès ou en baisse. */
const MOVE = 2;
const trendOf = (points: number): Exclude<Trend, 'all'> => (points >= MOVE ? 'up' : points <= -MOVE ? 'down' : 'flat');

/** Progression : ce que chaque joueur a gagné ou perdu depuis son premier instantané, en points d'attributs. */
export function FmProgression({ history }: { history: SquadAt[] }) {
  const { t } = useTranslation();
  const f = useFormat();
  const rows = useMemo(() => progression(history), [history]);
  const [trend, setTrend] = useState<Trend>('all');
  if (!history.length) return null;
  const attr = (k: string) => t(`fm.attr.${k}`, { defaultValue: k });
  const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
  const tone = (n: number | null) => (n == null || Math.abs(n) < MOVE ? 'text-brun' : n > 0 ? 'text-eau-fonce' : 'text-corail');
  const shown = trend === 'all' ? rows : rows.filter((r) => trendOf(r.points) === trend);
  const first = history[0]!.gameDate;

  return (
    <Panel title={t('fm.prog.title', { date: f.date(first) })}>
      <p className="help">{t('fm.prog.snapsRange', { count: history.length, from: f.date(first), to: f.date(history.at(-1)!.gameDate) })}</p>
      <p className="help mt-1">{t('fm.prog.howTo')}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {(['all', 'up', 'flat', 'down'] as Trend[]).map((k) => (
          <button key={k} type="button" aria-pressed={trend === k} onClick={() => setTrend(k)} className={`chip ${trend === k ? 'chip-on' : ''}`}>
            {t(`fm.prog.trend.${k}`)} · {k === 'all' ? rows.length : rows.filter((r) => trendOf(r.points) === k).length}
          </button>
        ))}
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="data-table">
          <thead className="text-left text-canard/70">
            <tr>
              <th className="px-2 py-1">{t('fm.prog.player')}</th>
              <th className="px-2 py-1 text-right">{t('fm.prog.age')}</th>
              <th className="px-2 py-1">{t('fm.prog.curve')}</th>
              <th className="px-2 py-1 text-right">{t('fm.prog.level')}</th>
              <th className="whitespace-nowrap px-2 py-1 text-right" title={t('fm.prog.pointsHelp')}>
                {t('fm.prog.points')}
              </th>
              <th className="whitespace-nowrap px-2 py-1 text-right" title={t('fm.prog.recentHelp')}>
                {t('fm.prog.recent')}
              </th>
              <th className="px-2 py-1">{t('fm.prog.moves')}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(({ player: p, series, points, recent, since, ups, downs }) => (
              <tr key={p.id} className="border-t border-canard/5">
                <td className="whitespace-nowrap px-2 py-1.5 font-bold">
                  <PlayerLink player={p} /> <Pos player={p} />
                  {since !== first && <span className="ml-2 text-xs font-normal text-brun">{t('fm.prog.since', { date: f.date(since) })}</span>}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{p.age ?? '–'}</td>
                <td className="px-2 py-1.5">
                  <Spark values={series} />
                </td>
                <td className="px-2 py-1.5 text-right">
                  <Level value={p.level} />
                </td>
                <td className={`px-2 py-1.5 text-right font-bold tabular-nums ${tone(points)}`}>{signed(points)}</td>
                <td className={`px-2 py-1.5 text-right tabular-nums ${tone(recent)}`}>{recent == null ? '–' : signed(recent)}</td>
                <td className="px-2 py-1.5 text-xs">
                  {ups.map((m) => (
                    <span key={m.key} className="mr-2 whitespace-nowrap text-eau-fonce">
                      ▲ {attr(m.key)} {signed(m.diff)}
                    </span>
                  ))}
                  {downs.map((m) => (
                    <span key={m.key} className="mr-2 whitespace-nowrap text-corail">
                      ▼ {attr(m.key)} {signed(m.diff)}
                    </span>
                  ))}
                  {!ups.length && !downs.length && <span className="text-brun">{t('fm.prog.noMove')}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
