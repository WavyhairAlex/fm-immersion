import { matchStatsFull, MIN_STAT_MINUTES, RAW_GROUPS, statsBoard, type FmPlayer, type FmSnapshot, type PlayerStatReport, type StatKey } from '@simloom/module-fm';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Empty, Kpi, Panel, Pos, Tag } from './FmUi';

const LINE_ORDER = { GB: 0, DEF: 1, MIL: 2, ATT: 3 } as const;
const COLS: StatKey[] = ['passPct', 'progPass90', 'keyPass90', 'xgPer90', 'xaPer90', 'press90', 'tacklePct', 'interc90', 'headerPct', 'possLost90', 'distance90', 'mistakes', 'points90'];
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
  const full = useMemo(() => matchStatsFull(snap), [snap]);
  const board = useMemo(() => statsBoard(players, new Map([...full].map(([id, m]) => [id, m.stats]))), [players, full]);
  const [picked, setPicked] = useState<string | null>(null);
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

      <AllStats rows={rows} full={full} picked={picked ?? rows[0]?.player.id ?? null} onPick={setPicked} />
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
