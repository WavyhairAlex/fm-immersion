import { matchStatsFull, MIN_STAT_MINUTES, RAW_GROUPS, STAT_METRICS, statsBoard, statsTrends, type FmPlayer, type FmSnapshot, type PlayerStatReport, type StatKey, type PlayerTrend, type StatMark, type StatTrend } from '@simloom/module-fm';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Chips, Empty, Kpi, Panel, Pos, Tag, More } from './FmUi';

type LineFilter = 'all' | 'GB' | 'DEF' | 'MIL' | 'ATT';
const LINE_ORDER = { GB: 0, DEF: 1, MIL: 2, ATT: 3 } as const;
const COLS: StatKey[] = ['passPct', 'progPass90', 'keyPass90', 'xgPer90', 'xaPer90', 'press90', 'tacklePct', 'interc90', 'headerPct', 'possLost90', 'distance90', 'mistakes', 'points90'];
/** Colonnes d'une ligne : les mesures qui comptent pour elle (celles qui servent à la comparer), puis les points pris. */
const lineCols = (l: LineFilter): StatKey[] => (l === 'all' ? COLS : [...STAT_METRICS.filter((m) => m.lines.includes(l)).map((m) => m.key), 'points90']);
const PCT = new Set<StatKey>(['passPct', 'tacklePct', 'headerPct', 'shotsOnTargetPct', 'crossPct', 'savePct']);
/** Mesures où moins vaut mieux (tri croissant). */
const LOW = new Set<StatKey>(STAT_METRICS.filter((m) => m.better === 'low').map((m) => m.key));

/** Valeur d'une stat dans une pastille : verte dans le meilleur quart de sa ligne, corail dans le moins bon. */
function Cell({ r, k }: { r: PlayerStatReport; k: StatKey }) {
  const { i18n } = useTranslation();
  const v = r.stats[k];
  if (v == null) return <span className="text-canard/40">–</span>;
  const digits = PCT.has(k) || k === 'mistakes' ? 0 : k === 'distance90' ? 1 : 2;
  const txt = new Intl.NumberFormat(i18n.resolvedLanguage, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v) + (PCT.has(k) ? ' %' : '');
  const rank = r.marks[k]?.rank;
  const cls = rank == null ? 'text-canard' : rank >= 0.75 ? 'bg-eau-fonce text-white' : rank <= 0.25 ? 'bg-corail/20 text-canard' : 'text-canard';
  return <span className={`inline-block min-w-[2.8rem] rounded-full px-2 py-0.5 text-center text-xs font-bold tabular-nums ${cls}`}>{txt}</span>;
}

/** Centre de données : stats de la saison par joueur, comparées dans chaque ligne, et ce qu'elles disent à travailler. */
export function FmStats({ snap, players, history }: { snap: FmSnapshot; players: FmPlayer[]; history?: { gameDate: string; data: FmSnapshot }[] }) {
  const { t, i18n } = useTranslation();
  const full = useMemo(() => matchStatsFull(snap), [snap]);
  const trends = useMemo(() => statsTrends(history ?? [], players), [history, players]);
  const board = useMemo(() => statsBoard(players, new Map([...full].map(([id, m]) => [id, m.stats]))), [players, full]);
  const [picked, setPicked] = useState<string | null>(null);
  const [line, setLine] = useState<LineFilter>('all');
  const [sort, setSort] = useState<StatKey | null>(null);
  const num = (x: number | null | undefined, d = 1) => (x == null ? '–' : new Intl.NumberFormat(i18n.resolvedLanguage, { maximumFractionDigits: d, minimumFractionDigits: d }).format(x));
  if (!board.players.length)
    return (
      <Panel title={t('fm.stats.title')}>
        <Empty>{t('fm.stats.none')}</Empty>
      </Panel>
    );
  const rows = [...board.players].sort((a, b) => (LINE_ORDER[a.player.line ?? 'ATT'] ?? 4) - (LINE_ORDER[b.player.line ?? 'ATT'] ?? 4) || b.minutes - a.minutes);
  const cols = lineCols(line);
  const shown = rows.filter((r) => line === 'all' || r.player.line === line);
  if (sort && cols.includes(sort)) {
    // Tri par la colonne choisie : le meilleur en haut, les joueurs sans valeur en bas.
    const dir = LOW.has(sort) ? 1 : -1;
    shown.sort((a, b) => {
      const x = a.stats[sort],
        y = b.stats[sort];
      if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1;
      return Number(b.enough) - Number(a.enough) || dir * (x - y);
    });
  }
  const team = board.team!;
  const stat = (k: StatKey) => t(`fm.stats.col.${k}`);
  const marks = (list: StatMark[]) => list.slice(0, 2).map((m) => stat(m.key)).join(', ');
  const date = (d: string) => new Intl.DateTimeFormat(i18n.resolvedLanguage, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(d));
  const fmtStat = (k: StatKey, v: number) => (PCT.has(k) ? `${num(v, 0)} %` : num(v, k === 'distance90' ? 1 : 2));
  const move = (x: StatTrend) => `${stat(x.key)} ${fmtStat(x.key, x.before)} → ${fmtStat(x.key, x.recent)}`;
  const named = (dir: 'up' | 'down') =>
    rows
      .map((r) => ({ r, tr: trends.players.get(r.player.id) }))
      .filter((x) => x.tr && (dir === 'up' ? x.tr.improved : x.tr.declined).length)
      .map((x) => ({ name: x.r.player.name, list: dir === 'up' ? x.tr!.improved : x.tr!.declined }));
  const ups = named('up');
  const downs = named('down');
  const teamVal = (k: string, v: number) => (k === 'xgPerMatch' ? num(v, 2) : `${num(v, 0)} %`);
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
                {t(`fm.stats.alert.${a.kind}.text`, { value: num(a.value, a.kind === 'creation' ? 2 : a.kind === 'discipline' ? 1 : 0) })}
                {a.areas.length > 0 && <> {t('fm.stats.train', { list: a.areas.map((x) => t(`fm.train.session.${x}`)).join(', ') })}</>}
                {a.names.length > 0 && <span className="text-brun"> {t('fm.stats.who', { list: a.names.join(', ') })}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <Empty>{team.matches >= 3 ? t('fm.stats.noAlert') : t('fm.stats.tooEarly')}</Empty>
        )}
      </Panel>

      <Panel title={trends.since ? t('fm.stats.trend.title', { date: date(trends.since) }) : t('fm.stats.trend.titleNone')}>
        {trends.since ? (
          <div className="space-y-3 text-sm">
            {trends.team.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {trends.team.map((x) => (
                  <span key={x.key} className={`rounded-full px-3 py-1 text-xs font-bold ${x.dir === 'up' ? 'bg-eau-fonce text-white' : x.dir === 'down' ? 'bg-corail/20 text-canard' : 'bg-canard/10 text-canard'}`}>
                    {x.dir === 'up' ? '↑ ' : x.dir === 'down' ? '↓ ' : ''}
                    {t(`fm.stats.trend.team.${x.key}`)} {teamVal(x.key, x.before)} → {teamVal(x.key, x.recent)}
                  </span>
                ))}
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              {(['up', 'down'] as const).map((dir) => {
                const list = dir === 'up' ? ups : downs;
                return (
                  <div key={dir}>
                    <h3 className={`mb-1 font-bold ${dir === 'up' ? 'text-eau-fonce' : 'text-canard'}`}>{t(`fm.stats.trend.${dir}`)}</h3>
                    {list.length ? (
                      <ul className="space-y-1">
                        {list.map((x) => (
                          <li key={x.name}>
                            <span className="font-bold">{x.name}</span> <span className="text-brun">{x.list.slice(0, 2).map(move).join(' · ')}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <Empty>{t(dir === 'up' ? 'fm.stats.trend.noneUp' : 'fm.stats.trend.noneDown')}</Empty>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-brun">{t('fm.stats.trend.help')}</p>
          </div>
        ) : (
          <Empty>{trends.firstDate ? t('fm.stats.trend.wait', { date: date(trends.firstDate) }) : t('fm.stats.trend.waitNone')}</Empty>
        )}
      </Panel>

      <Panel
        title={t('fm.stats.title')}
        action={<Chips<LineFilter> value={line} onChange={setLine} options={(['all', 'GB', 'DEF', 'MIL', 'ATT'] as const).map((l) => [l, t(`fm.line.${l}`)])} />}
      >
        <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-brun">
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-5 rounded-full bg-eau-fonce" /> {t('fm.stats.legend.best')}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-5 rounded-full ring-1 ring-canard/20" /> {t('fm.stats.legend.mid')}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-5 rounded-full bg-corail/20" /> {t('fm.stats.legend.worst')}
          </span>
          <span>{t('fm.stats.legend.sort')}</span>
        </div>
        <div className="table-scroll">
          <table className="data-table wide">
            <thead className="text-left text-canard/70">
              <tr>
                <th className="px-2 py-1">{t('fm.stats.col.player')}</th>
                <th className="px-2 py-1">{t('fm.stats.col.minutes')}</th>
                {cols.map((k) => (
                  <th key={k} className="px-2 py-1" title={t(`fm.stats.def.${k}`)}>
                    <button type="button" onClick={() => setSort(sort === k ? null : k)} className={`text-left font-bold ${sort === k ? 'text-canard underline' : ''}`}>
                      {stat(k)}
                      {sort === k ? ' ▾' : ''}
                    </button>
                  </th>
                ))}
                <th className="px-2 py-1">{t('fm.stats.col.strengths')}</th>
                {trends.since && <th className="px-2 py-1">{t('fm.stats.col.trend')}</th>}
                <th className="px-2 py-1">{t('fm.stats.col.focus')}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.player.id} className={`border-t border-canard/5 ${r.enough ? '' : 'opacity-60'}`}>
                  <td className="px-2 py-1.5 font-bold">
                    {r.player.name} <Pos player={r.player} />
                  </td>
                  <td className="px-2 py-1.5 tabular-nums">{r.minutes}</td>
                  {cols.map((k) => (
                    <td key={k} className="px-2 py-1.5">
                      <Cell r={r} k={k} />
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-xs">
                    {r.strengths.length ? <span className="font-bold text-eau-fonce">{marks(r.strengths)}</span> : <span className="text-canard/40">–</span>}
                  </td>
                  {trends.since && (
                    <td className="px-2 py-1.5 text-xs">
                      <TrendCell tr={trends.players.get(r.player.id)} label={stat} />
                    </td>
                  )}
                  <td className="px-2 py-1.5 text-xs">
                    {r.weaknesses.length > 0 && <span className="mr-1.5 text-brun">{marks(r.weaknesses)}</span>}
                    {r.focus ? <Tag tone="warn">{t(`fm.train.focus.${r.focus}`)}</Tag> : !r.weaknesses.length && <span className="text-canard/40">–</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <More>{t('fm.stats.help', { min: MIN_STAT_MINUTES })}</More>
      </Panel>

      <AllStats rows={rows} full={full} picked={picked ?? rows[0]?.player.id ?? null} onPick={setPicked} />
    </div>
  );
}

/** Tendance d'un joueur : ce qui progresse (↑) et recule (↓) sur la période récente. */
function TrendCell({ tr, label }: { tr: PlayerTrend | undefined; label: (k: StatKey) => string }) {
  if (!tr) return <span className="text-canard/40">–</span>;
  if (!tr.improved.length && !tr.declined.length) return <span className="text-brun">=</span>;
  return (
    <div className="flex gap-2">
      {tr.improved.length > 0 && <div className="font-bold text-eau-fonce">↑ {tr.improved.slice(0, 2).map((x) => label(x.key)).join(', ')}</div>}
      {tr.declined.length > 0 && <div className="text-brun">↓ {tr.declined.slice(0, 2).map((x) => label(x.key)).join(', ')}</div>}
    </div>
  );
}

/** Toutes les stats lues dans le jeu pour un joueur, rangées par thème. */
function AllStats({ rows, full, picked, onPick }: { rows: PlayerStatReport[]; full: ReturnType<typeof matchStatsFull>; picked: string | null; onPick: (id: string) => void }) {
  const { t, i18n } = useTranslation();
  const row = rows.find((r) => r.player.id === picked) ?? rows[0];
  if (!row) return null;
  const raw = full.get(row.player.id)?.raw ?? {};
  const fmt = new Intl.NumberFormat(i18n.resolvedLanguage, { maximumFractionDigits: 2 });
  const groups = RAW_GROUPS.map((g) => ({ ...g, props: g.props.filter((p) => raw[p] != null) })).filter((g) => g.props.length);
  return (
    <Panel
      title={t('fm.stats.allTitle', { name: row.player.name })}
      action={
        <label className="flex items-center gap-2 text-xs font-bold text-canard/70">
          {t('fm.stats.allPick')}
          <select className="rounded-lg border border-canard/15 bg-white px-2 py-1 text-sm text-canard" value={row.player.id} onChange={(e) => onPick(e.target.value)}>
            {rows.map((r) => (
              <option key={r.player.id} value={r.player.id}>
                {r.player.name}
              </option>
            ))}
          </select>
        </label>
      }
    >
      {groups.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((g) => (
            <div key={g.id}>
              <h3 className="mb-1 text-sm font-bold">{t(`fm.stats.group.${g.id}`)}</h3>
              {g.props.map((p) => (
                <div key={p} className="flex justify-between gap-3 border-b border-canard/5 py-1 text-sm last:border-0">
                  <span className="text-brun">{t(`fm.stats.raw.${p}`, { defaultValue: p })}</span>
                  <span className="font-bold tabular-nums">{fmt.format(raw[p]!)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <Empty>{t('fm.stats.allNone')}</Empty>
      )}
      <p className="mt-2 text-xs text-brun">{t('fm.stats.allHelp')}</p>
    </Panel>
  );
}
