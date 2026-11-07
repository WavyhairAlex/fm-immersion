import { PROMISED_SHARE, playingTime, type FmPlayer, type FmSnapshot, type PlaytimeRow, type PlaytimeVerdict } from '@fm-immersion/module-fm';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Empty, Kpi, More, Panel, PlayerLink, Pos, Tag, useFormat, type Tone } from './FmUi';

const GROUPS: PlaytimeVerdict[] = ['short', 'over', 'ok', 'early'];
const TONE: Record<PlaytimeVerdict, Tone> = { short: 'bad', over: 'warn', ok: 'good', early: 'info', none: 'info' };

/** Barre du temps de jeu : part jouée, avec un trait à la part promise par le statut. */
function Bar({ row }: { row: PlaytimeRow }) {
  const share = row.share ?? 0;
  const color = row.verdict === 'short' ? 'bg-corail' : row.verdict === 'over' ? 'bg-ambre' : 'bg-eau-fonce';
  return (
    <span className="relative block h-2 w-full overflow-hidden rounded-full bg-canard/10" aria-hidden>
      <span className={`absolute inset-y-0 left-0 rounded-full ${color}`} style={{ width: `${Math.round(share * 100)}%` }} />
      {row.expected != null && row.expected > 0 && <span className="absolute inset-y-0 w-0.5 bg-canard" style={{ left: `${Math.round(row.expected * 100)}%` }} />}
    </span>
  );
}

/** Effectif > Temps de jeu : statut promis dans FM27 contre minutes réellement jouées cette saison. */
export function FmPlaytime({ players, history }: { players: FmPlayer[]; history?: { gameDate: string; data: FmSnapshot }[] }) {
  const { t } = useTranslation();
  const f = useFormat();
  const r = useMemo(() => playingTime(players, history ?? []), [players, history]);
  const count = (v: PlaytimeVerdict) => r.rows.filter((x) => x.verdict === v).length;
  const statusFor = (rank: number | null) => (rank == null ? '' : t(`fm.play.rank.${rank}`));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label={t('fm.play.kpi.short')} value={count('short')} tone={count('short') ? 'bad' : 'good'} sub={t('fm.play.kpi.shortSub')} />
        <Kpi label={t('fm.play.kpi.over')} value={count('over')} sub={t('fm.play.kpi.overSub')} />
        <Kpi label={t('fm.play.kpi.matches')} value={r.matches} sub={t('fm.play.kpi.matchesSub')} />
      </div>
      <More>{t('fm.play.help', { shares: PROMISED_SHARE.slice(0, 5).map((x) => f.pct(x)).join(' / ') })}</More>
      {!r.matches ? (
        <Empty>{t('fm.play.noMatches')}</Empty>
      ) : (
        GROUPS.map((g) => {
          const rows = r.rows.filter((x) => x.verdict === g);
          if (!rows.length) return null;
          return (
            <Panel key={g} title={t(`fm.play.group.${g}`, { count: rows.length })}>
              <ul>
                {rows.map((x) => (
                  <li key={x.player.id} className="grid grid-cols-[minmax(0,1fr)_8rem] items-center gap-x-3 gap-y-1 border-b border-canard/5 py-2 last:border-0 sm:grid-cols-[minmax(0,1fr)_12rem_9rem]">
                    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <PlayerLink player={x.player} /> <Pos player={x.player} />
                      <Tag tone={TONE[x.verdict]}>{x.player.squadStatus ?? '–'}</Tag>
                      {x.player.injury && <Tag tone="bad">{x.player.injury}</Tag>}
                    </span>
                    <span className="hidden sm:block">
                      <Bar row={x} />
                    </span>
                    <span className="text-right text-xs text-brun">
                      <b className="text-canard tabular-nums">{x.share == null ? '–' : f.pct(x.share)}</b>
                      {x.expected != null && ` / ${f.pct(x.expected)}`}
                      <br />
                      {t('fm.play.detail', { starts: x.starts, available: x.available })}
                    </span>
                    {(g === 'short' || g === 'over') && (
                      <span className="col-span-full text-xs text-brun">
                        {g === 'short' ? t('fm.play.adviceShort') : t('fm.play.adviceOver', { status: statusFor(x.earnedRank) })}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </Panel>
          );
        })
      )}
    </div>
  );
}
