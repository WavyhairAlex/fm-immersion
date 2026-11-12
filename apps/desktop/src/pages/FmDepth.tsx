import { setPieceTakers, depthAlerts, depthChart, depthFromPlan, formationKey, POS_LABEL, seasonStart, type DepthEntry, type FmPlayer, type GameSlot, type SquadAt } from '@fm-immersion/module-fm';
import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { PosBadge } from './FmFoot';
import { useTacticChoice } from './FmTactic';
import { Kpi, Level, Panel, Tag, useNames, PlayerLink } from './FmUi';

/** Titulaires et remplaçants : qui joue à chaque poste, et quelle doublure peut passer devant d'ici deux saisons. */
export function FmDepth({ players, folder, gameFormation, gameTactic = null, lineup, gameDate, history }: { players: FmPlayer[]; folder: string; gameFormation: string | null; gameTactic?: string | null; lineup: GameSlot[] | null; gameDate: string; history: SquadAt[] }) {
  const { t } = useTranslation();
  const names = useNames();
  // Même style, même schéma et même onze que Tactique > Composition ; la formation du jeu n'est qu'une indication.
  const { plan, style, fromGame } = useTacticChoice(players, folder, gameFormation, lineup, gameTactic);
  const form = plan?.form ?? formationKey(gameFormation);
  const rows = useMemo(() => (plan ? depthFromPlan(plan, players, history) : depthChart(players, form, history)), [plan, players, form, history]);
  const alerts = useMemo(() => depthAlerts(rows), [rows]);
  const thin = rows.filter((r) => !r.subs.length);
  // Tireurs et capitaine parmi le onze (sinon tout l'effectif disponible).
  const takers = useMemo(() => {
    const xi = plan ? plan.slots.flatMap((sl) => (sl.player ? [sl.player] : [])) : [];
    return setPieceTakers(xi.length ? xi : players.filter((p) => !p.injury));
  }, [plan, players]);
  const nf1 = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const y0 = seasonStart(gameDate);
  const season = (n: number) => `${y0 + n}/${String(y0 + n + 1).slice(2)}`;

  const line = (e: DepthEntry, extra: ReactNode) => (
    <div key={e.player.id} className="flex items-center justify-between gap-2 border-b border-canard/5 py-1.5 last:border-0">
      <span className="min-w-0 flex-1">
        <PlayerLink player={e.player} /> <span className="text-xs text-brun">{t('fm.contracts.age', { count: e.player.age ?? 0 })}</span>
        {e.player.team && (
          <>
            {' '}
            <Tag>{e.player.team}</Tag>
          </>
        )}
        {e.player.injury && (
          <>
            {' '}
            <Tag tone="bad">{t('fm.depth.injured')}</Tag>
          </>
        )}{' '}
        {extra}
      </span>
      <span className="flex items-center gap-1 text-xs text-brun">
        <Level value={e.player.level} />→<Level value={e.in1} />→<Level value={e.in2} />
      </span>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label={t('fm.depth.canPass')} value={alerts.length} sub={t('fm.depth.by', { season: season(2) })} />
        <Kpi
          label={t('fm.depth.thin')}
          value={thin.length}
          tone={thin.length ? 'bad' : undefined}
          sub={thin.map((r) => POS_LABEL[r.pos]).join(', ') || t('fm.depth.none')}
        />
        <Kpi
          label={t('fm.depth.form')}
          value={form}
          sub={[style && names.style(style), gameFormation && t('fm.tac.inGame', { form: gameFormation })].filter(Boolean).join(' · ') || t('fm.depth.proposed')}
        />
      </div>

      <Panel title={t('fm.takers.title')}>
        <p className="mb-2 text-sm text-brun">{t('fm.takers.help')}</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {takers.map((k) => (
            <div key={k.role} className="rounded-lg bg-canard/5 p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-canard/60">{t(`fm.takers.role.${k.role}`)}</p>
              {k.first ? (
                <>
                  <p className="mt-1 flex items-center justify-between gap-2 font-bold">
                    <PlayerLink player={k.first.player} />
                    <span className="tabular-nums">{nf1(k.first.score)}</span>
                  </p>
                  {k.second && (
                    <p className="flex items-center justify-between gap-2 text-xs text-brun">
                      <span>{t('fm.takers.then', { name: k.second.player.name })}</span>
                      <span className="tabular-nums">{nf1(k.second.score)}</span>
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-1 text-sm text-brun">{t('fm.takers.none')}</p>
              )}
            </div>
          ))}
        </div>
      </Panel>

      {alerts.length > 0 && (
        <Panel title={t('fm.depth.watch')}>
          {alerts.map(({ pos, sub, starter }) => (
            <div key={sub.player.id} className="flex items-center justify-between gap-3 border-b border-canard/5 py-1.5 last:border-0">
              <span>
                <PosBadge pos={pos} />{' '}
                {t(sub.when === 0 ? 'fm.depth.already' : 'fm.depth.may', { sub: sub.player.name, starter: starter.name })}
              </span>
              <Tag tone={sub.when === 0 ? 'good' : 'info'}>{sub.when === 0 ? t('fm.depth.now') : t('fm.depth.in', { season: season(sub.when!) })}</Tag>
            </div>
          ))}
        </Panel>
      )}

      <Panel title={t('fm.depth.byPos')}>
        <p className="help">
          {t(fromGame ? 'fm.depth.fromGame' : 'fm.depth.fromTactic')} {t('fm.depth.help', { s1: season(1), s2: season(2) })}
        </p>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => (
            <div key={r.pos} className="rounded-xl bg-creme/50 px-3 py-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="pill">
                  {POS_LABEL[r.pos]}
                  {r.count > 1 ? ` ×${r.count}` : ''}
                </span>
                {!r.subs.length && <Tag tone="warn">{t('fm.depth.noSub')}</Tag>}
              </div>
              {r.starters.length ? r.starters.map((e) => line(e, <Tag tone="good">{t('fm.depth.starter')}</Tag>)) : <p className="text-xs text-brun">{t('fm.depth.nobody')}</p>}
              {r.subs.map((e) =>
                line(e, e.when === 0 ? <Tag tone="good">{t('fm.depth.level')}</Tag> : e.when ? <Tag tone="info">↑ {season(e.when)}</Tag> : null),
              )}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
