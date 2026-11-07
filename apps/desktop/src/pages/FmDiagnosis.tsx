import {
  diagnoseLineup,
  officialResults,
  matchStats,
  POS_LABEL,
  ratingsByPlayer,
  statsBoard,
  type DiagReason,
  type FmPlayer,
  type FmSnapshot,
  type GameSlot,
  type PlayerDiagnosis,
} from '@fm-immersion/module-fm';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useTacticChoice } from './FmTactic';
import { Empty, fitPct, More, Panel, PlayerLink, Tag } from './FmUi';

/**
 * Pourquoi un titulaire ne performe pas à son poste : sa note en match face au reste du onze, puis les causes
 * trouvées (poste, rôle, stats, forme, mieux sur le banc). Même onze que Tactique > Composition.
 */
export function FmDiagnosis({
  snap,
  players,
  folder,
  gameFormation,
  lineup,
  gameTactic,
  history,
}: {
  snap: FmSnapshot;
  players: FmPlayer[];
  folder: string;
  gameFormation: string | null;
  lineup: GameSlot[] | null;
  gameTactic: string | null;
  history?: { gameDate: string; data: FmSnapshot }[];
}) {
  const { t, i18n } = useTranslation();
  const en = i18n.resolvedLanguage === 'en';
  const { engine, plan } = useTacticChoice(players, folder, gameFormation, lineup, gameTactic);
  const ratings = useMemo(() => ratingsByPlayer(officialResults(history ?? [])), [history]);
  const weaknesses = useMemo(() => {
    const board = statsBoard(players, matchStats(snap));
    return new Map(board.players.filter((r) => r.enough).map((r) => [r.player.id, r.weaknesses]));
  }, [players, snap]);
  const list = useMemo(() => (plan ? diagnoseLineup(engine, plan, players, { ratings, weaknesses }) : []), [engine, plan, players, ratings, weaknesses]);
  const num = (x: number, d = 2) => new Intl.NumberFormat(i18n.resolvedLanguage, { minimumFractionDigits: d, maximumFractionDigits: d }).format(x);
  const roleName = (code: string) => {
    const r = engine.roles.get(code);
    return (en ? r?.en : r?.fr) ?? r?.fr ?? code;
  };
  const reason = (r: DiagReason) => {
    switch (r.kind) {
      case 'familiarity':
        return t('fm.diag.reason.familiarity', { value: r.value });
      case 'foot':
        return t(`fm.diag.reason.foot${r.side}`);
      case 'roleFit':
        return t('fm.diag.reason.roleFit', { fit: fitPct(r.fit), xi: fitPct(r.xi) });
      case 'keyAttrs':
        return t('fm.diag.reason.keyAttrs', { list: r.attrs.map((a) => `${t(`fm.attr.${a.key}`, { defaultValue: a.key })} ${a.value}`).join(', ') });
      case 'threshold':
        return t('fm.diag.reason.threshold', { t: r.t, ca: r.ca ?? '?' });
      case 'stats':
        return t('fm.diag.reason.stats', { list: r.marks.map((m) => t(`fm.stats.col.${m.key}`)).join(', ') });
      case 'condition':
        return t('fm.diag.reason.condition', { value: Math.round(r.value) });
      case 'sharpness':
        return t('fm.diag.reason.sharpness', { value: Math.round(r.value) });
      case 'morale':
        return t('fm.diag.reason.morale', { text: r.text });
      case 'better':
        return t('fm.diag.reason.better', { name: r.player.name, fit: fitPct(r.fit) });
    }
  };
  if (!plan) return null;
  const under = list.filter((d) => d.under).sort((a, b) => (a.gap ?? 0) - (b.gap ?? 0));
  const others = list.filter((d) => !d.under && d.reasons.length);
  const row = (d: PlayerDiagnosis) => (
    <li key={d.player.id} className="py-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <PlayerLink player={d.player} />
        <span className="text-xs text-brun">
          {POS_LABEL[d.pos]} · {roleName(d.ip)} / {roleName(d.oop)}
        </span>
        {d.rating != null && (
          <Tag tone={d.under ? 'bad' : 'info'}>
            {t(d.ratedMatches ? 'fm.diag.recent' : 'fm.diag.season', { rating: num(d.rating), count: d.ratedMatches })}
            {d.gap != null && ` (${d.gap > 0 ? '+' : ''}${num(d.gap)})`}
          </Tag>
        )}
      </div>
      {d.reasons.length ? (
        <ul className="mt-1 list-disc pl-5 text-xs text-canard">
          {d.reasons.map((r, i) => (
            <li key={i}>{reason(r)}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-xs text-brun">{t('fm.diag.noReason')}</p>
      )}
    </li>
  );
  return (
    <Panel title={t('fm.diag.title')}>
      {under.length ? <ul className="divide-y divide-canard/10">{under.map(row)}</ul> : <Empty>{t('fm.diag.allGood')}</Empty>}
      {others.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-bold text-canard/60">{t('fm.diag.others', { count: others.length })}</summary>
          <ul className="divide-y divide-canard/10">{others.map(row)}</ul>
        </details>
      )}
      <More>{t('fm.diag.how')}</More>
    </Panel>
  );
}
