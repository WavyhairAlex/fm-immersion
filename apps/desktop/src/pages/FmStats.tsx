import { matchStats, MIN_STAT_MINUTES, statsBoard, type FmPlayer, type FmSnapshot, type PlayerStatReport, type StatKey } from '@simloom/module-fm';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Empty, Kpi, Panel, Pos, Tag } from './FmUi';

const LINE_ORDER = { GB: 0, DEF: 1, MIL: 2, ATT: 3 } as const;
const COLS: StatKey[] = ['passPct', 'progPass90', 'keyPass90', 'xgPer90', 'xaPer90', 'press90', 'tacklePct', 'interc90', 'headerPct', 'distance90', 'mistakes'];
const PCT = new Set<StatKey>(['passPct', 'tacklePct', 'headerPct', 'shotsOnTargetPct', 'crossPct', 'savePct']);

/** Valeur d'une stat dans une pastille : verte dans le meilleur quart de sa ligne, corail dans le moins bon. */
function Cell({ r, k }: { r: PlayerStatReport; k: StatKey }) {
  const { i18n } = useTranslation();
  const v = r.stats[k];
  if (v == null) return <span className="text-canard/40">–</span>;
  const digits = PCT.has(k) || k === 'mistakes' ? 0 : k === 'distance90' ? 1 : 2;
  const txt = new Intl.NumberFormat(i18n.resolvedLanguage, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v) + (PCT.has(k) ? ' %' : '');
  const rank = r.marks[k]?.rank;
  const cls = rank == null ? 'text-canard' : rank >= 0.75 ? 'bg-eau-fonce text-white' : rank <= 0.25 ? 'bg-corail/20 text-canard' : 'bg-canard/10 text-canard';
  return <span className={`inline-block min-w-[2.8rem] rounded-full px-2 py-0.5 text-center text-xs font-bold tabular-nums ${cls}`}>{txt}</span>;
}

/** Centre de données : stats de la saison par joueur, comparées dans chaque ligne, et ce qu'elles disent à travailler. */
export function FmStats({ snap, players }: { snap: FmSnapshot; players: FmPlayer[] }) {
  const { t, i18n } = useTranslation();
  const board = useMemo(() => statsBoard(players, matchStats(snap)), [players, snap]);
  const num = (x: number | null | undefined, d = 1) => (x == null ? '–' : new Intl.NumberFormat(i18n.resolvedLanguage, { maximumFractionDigits: d, minimumFractionDigits: d }).format(x));
  if (!board.players.length)
    return (
      <Panel title={t('fm.stats.title')}>
        <Empty>{t('fm.stats.none')}</Empty>
      </Panel>
    );
  const rows = [...board.players].sort((a, b) => (LINE_ORDER[a.player.line ?? 'ATT'] ?? 4) - (LINE_ORDER[b.player.line ?? 'ATT'] ?? 4) || b.minutes - a.minutes);
  const team = board.team!;
  const stat = (k: StatKey) => t(`fm.stats.col.${k}`);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label={t('fm.stats.kpi.matches')} value={num(team.matches, 1)} />
        <Kpi label={t('fm.stats.kpi.xg')} value={num(team.xgPerMatch, 2)} />
        <Kpi label={t('fm.stats.kpi.pass')} value={team.passPct == null ? '–' : `${num(team.passPct, 0)} %`} />
        <Kpi label={t('fm.stats.kpi.press')} value={team.pressSuccess == null ? '–' : `${num(team.pressSuccess, 0)} %`} />
        <Kpi label={t('fm.stats.kpi.mistakes')} value={team.mistakes} tone={team.mistakes > 0 ? 'bad' : undefined} />
      </div>

      <Panel title={t('fm.stats.alertsTitle')}>
        {board.alerts.length ? (
          <ul className="space-y-2">
            {board.alerts.map((a) => (
              <li key={a.kind} className="text-sm">
                <Tag tone={a.level === 'warning' ? 'warn' : 'info'}>{t(`fm.stats.alert.${a.kind}.tag`)}</Tag>{' '}
                {t(`fm.stats.alert.${a.kind}.text`, { value: num(a.value, a.kind === 'creation' ? 2 : 0) })}
                {a.areas.length > 0 && <> {t('fm.stats.train', { list: a.areas.map((x) => t(`fm.train.session.${x}`)).join(', ') })}</>}
                {a.names.length > 0 && <span className="text-brun"> {t('fm.stats.who', { list: a.names.join(', ') })}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <Empty>{team.matches >= 3 ? t('fm.stats.noAlert') : t('fm.stats.tooEarly')}</Empty>
        )}
      </Panel>

      <Panel title={t('fm.stats.title')}>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead className="text-left text-canard/70">
              <tr>
                <th className="px-2 py-1">{t('fm.stats.col.player')}</th>
                <th className="px-2 py-1">{t('fm.stats.col.minutes')}</th>
                {COLS.map((k) => (
                  <th key={k} className="px-2 py-1">
                    {stat(k)}
                  </th>
                ))}
                <th className="px-2 py-1">{t('fm.stats.col.focus')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.player.id} className={`border-t border-canard/5 ${r.enough ? '' : 'opacity-60'}`}>
                  <td className="px-2 py-1.5 font-bold">
                    {r.player.name} <Pos player={r.player} />
                  </td>
                  <td className="px-2 py-1.5 tabular-nums">{r.minutes}</td>
                  {COLS.map((k) => (
                    <td key={k} className="px-2 py-1.5">
                      <Cell r={r} k={k} />
                    </td>
                  ))}
                  <td className="px-2 py-1.5">{r.focus ? <Tag tone="warn">{t(`fm.train.focus.${r.focus}`)}</Tag> : <span className="text-canard/40">–</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-brun">{t('fm.stats.help', { min: MIN_STAT_MINUTES })}</p>
      </Panel>
    </div>
  );
}
