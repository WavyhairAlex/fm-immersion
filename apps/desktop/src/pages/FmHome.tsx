import { PART_TIME_DAYS, currentTrainingWeek, homeOverview, nearestPreset, trainingAlerts, trainingFor, type FmPlayer, type FmSnapshot } from '@simloom/module-fm';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FmSummary } from './FmSummary';
import { useTacticChoice } from './FmTactic';
import { useIndividualSetups } from './FmTraining';
import { Empty, fitPct, Level, Panel, PlayerName, Pos, Row, Tag, useCoach, type Tone } from './FmUi';

const KIND_TONE: Record<string, Tone> = { injured: 'bad', suspended: 'bad', contract: 'warn', condition: 'warn', status: 'info' };

/** Accueil de la partie : chiffres clés, ce qui est à traiter, styles adaptés, meilleurs joueurs et jeunes. */
export function FmHome({ snap, players, folder, go }: { snap: FmSnapshot; players: FmPlayer[]; folder: string; go: (view: string) => void }) {
  const { t, i18n } = useTranslation();
  const en = i18n.resolvedLanguage === 'en';
  const h = useMemo(() => homeOverview(players, snap.gameDate), [players, snap.gameDate]);
  // Même classement que l'onglet Composition : note d'équipe du meilleur onze de chaque style.
  const { engine, ranked } = useTacticChoice(players, folder, null);
  const [coach] = useCoach();
  const style = engine.ref.styles.find((s) => s.id === coach.style) ?? engine.ref.styles[0];
  const week = useMemo(
    () =>
      currentTrainingWeek({
        gameDate: snap.gameDate,
        fixtures: snap.fixtures,
        seasonStart: coach.seasonStart,
        winterBreak: coach.winterBreak,
        trainingDays: (coach.clubStatus ?? 'pro') === 'pro' ? undefined : (coach.trainingDays ?? PART_TIME_DAYS),
        priorities: style ? trainingFor(style) : [],
        style: style?.id,
      }),
    [snap.gameDate, snap.fixtures, coach.seasonStart, coach.winterBreak, coach.clubStatus, coach.trainingDays, style],
  );
  const tr = useMemo(() => trainingAlerts(players), [players]);
  const setups = useIndividualSetups(engine, players, folder, week.days.filter((d) => d.kind === 'match').length);
  const toChange = setups.rows.filter((r) => r.status === 'change').map((r) => r.plan.player);
  const short = (list: FmPlayer[]) => list.map((p) => p.name.split(' ').at(-1)).join(', ');
  const link = (view: string, label: string) => (
    <button type="button" className="text-sm font-bold text-eau-fonce hover:underline" onClick={() => go(view)}>
      {label} →
    </button>
  );
  const alertText = (a: (typeof h.alerts)[number]) =>
    a.kind === 'injured'
      ? a.detail
      : a.kind === 'contract'
        ? a.months <= 0
          ? t('fm.contracts.expired')
          : t('fm.home.endsIn', { count: a.months })
        : a.kind === 'condition'
          ? `${Math.round(a.condition)} %`
          : a.detail;
  // Les joueurs fatigués sont déjà regroupés dans le cadre Entraînement : pas de doublon ligne par ligne ici.
  const alerts = h.alerts;
  const shown = alerts.slice(0, 8);

  return (
    <div className="space-y-4">
      <FmSummary snap={snap} players={players} />
      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
        <Panel title={t('fm.home.todo')} action={link('squad', t('fm.views.squad'))}>
          {h.contracts && (
            <button type="button" className="mb-1 w-full text-left" onClick={() => go('contracts')}>
              <Row>
                <span>
                  <Tag tone="warn">{t('fm.home.kind.contract')}</Tag> <b>{t('fm.home.contracts', { count: h.contracts.length })}</b>
                  <br />
                  <span className="text-xs text-brun">{h.contracts.map((p) => p.name.split(' ').at(-1)).join(', ')}</span>
                </span>
                <span className="text-xs font-bold text-eau-fonce">{t('fm.home.see')} →</span>
              </Row>
            </button>
          )}
          {shown.length ? (
            shown.map((a, i) => (
              <Row key={i}>
                <span>
                  <Tag tone={KIND_TONE[a.kind]}>{t(`fm.home.kind.${a.kind}`)}</Tag> <PlayerName player={a.player} />
                </span>
                <span className="text-xs text-brun">{alertText(a)}</span>
              </Row>
            ))
          ) : !h.contracts ? (
            <Empty>{t('fm.home.nothing')}</Empty>
          ) : null}
          {alerts.length > shown.length && <p className="mt-1 text-xs text-brun">{t('fm.home.more', { count: alerts.length - shown.length })}</p>}
        </Panel>

        <Panel title={t('fm.home.training')} action={link('training', t('fm.views.training'))}>
          <Row>
            <span>
              <b>{t('fm.train.code', { code: week.code })}</b>
              {week.theme && <span className="text-xs text-brun"> · {t(`fm.train.theme.${week.theme}`)}</span>}
            </span>
          </Row>
          <p className="mb-1 text-xs text-brun">{t('fm.home.trainingPreset', { preset: t(`fm.train.preset.${nearestPreset(week)}`) })}</p>
          {toChange.length > 0 && (
            <Row>
              <span>
                <Tag tone="warn">{t('fm.home.kind.setup')}</Tag> <b>{t('fm.home.setupChanges', { count: toChange.length })}</b>
                <br />
                <span className="text-xs text-brun">{short(toChange)}</span>
              </span>
            </Row>
          )}
          {tr.rusty.length > 0 && (
            <Row>
              <span>
                <Tag tone="info">{t('fm.home.kind.sharpness')}</Tag> <b>{t('fm.home.rusty', { count: tr.rusty.length })}</b>
                <br />
                <span className="text-xs text-brun">{short(tr.rusty)}</span>
              </span>
            </Row>
          )}
        </Panel>

        {ranked.length > 0 && (
          <Panel title={t('fm.home.styles')} action={link('tactic', t('fm.views.tactic'))}>
            {ranked.slice(0, 3).map(({ style, fit }) => (
              <Row key={style.id}>
                <span>
                  <b>{en && style.nameEn ? style.nameEn : style.name}</b> {style.mentality && <span className="text-xs text-brun">{style.mentality}</span>}
                </span>
                <span className="text-sm font-bold tabular-nums">{fitPct(fit)}</span>
              </Row>
            ))}
            <p className="mt-2 text-xs text-brun">{t('fm.home.leastFit', { name: (en && ranked.at(-1)!.style.nameEn) || ranked.at(-1)!.style.name })}</p>
          </Panel>
        )}

        <Panel title={t('fm.home.best')}>
          {h.top.map((p) => (
            <Row key={p.id}>
              <span className="flex items-center gap-2">
                <PlayerName player={p} /> <Pos player={p} />
              </span>
              <Level value={p.level} />
            </Row>
          ))}
        </Panel>

        <Panel title={t('fm.home.young')}>
          {h.young.length ? (
            h.young.map((p) => (
              <Row key={p.id}>
                <span className="flex items-center gap-2">
                  <PlayerName player={p} /> <Pos player={p} />
                </span>
                <span className="flex items-center gap-2 text-xs text-brun">
                  {t('fm.contracts.age', { count: p.age ?? 0 })} <Level value={p.level} />
                </span>
              </Row>
            ))
          ) : (
            <Empty>{t('fm.home.noYoung')}</Empty>
          )}
        </Panel>
      </div>
    </div>
  );
}
