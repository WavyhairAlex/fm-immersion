import { homeOverview, unavailable, type FmPlayer, type FmSnapshot } from '@simloom/module-fm';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FmSummary } from './FmSummary';
import { useTacticEngine } from './FmTactic';
import { Empty, Level, Panel, PlayerName, Pos, Row, Tag, type Tone } from './FmUi';

const KIND_TONE: Record<string, Tone> = { injured: 'bad', suspended: 'bad', contract: 'warn', condition: 'warn', status: 'info' };

/** Accueil de la partie : chiffres clés, ce qui est à traiter, styles adaptés, meilleurs joueurs et jeunes. */
export function FmHome({ snap, players, folder, go }: { snap: FmSnapshot; players: FmPlayer[]; folder: string; go: (view: string) => void }) {
  const { t, i18n } = useTranslation();
  const en = i18n.resolvedLanguage === 'en';
  const h = useMemo(() => homeOverview(players, snap.gameDate), [players, snap.gameDate]);
  const { engine } = useTacticEngine(folder, players);
  const ranked = useMemo(() => engine.rankStyles(players.filter((p) => !unavailable(p) && Object.keys(p.attributes).length)), [engine, players]);
  const pct = (f: number | null) => (f == null ? '–' : `${Math.round((f / 20) * 100)} %`);
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
  const shown = h.alerts.slice(0, 8);

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
          {h.alerts.length > shown.length && <p className="mt-1 text-xs text-brun">{t('fm.home.more', { count: h.alerts.length - shown.length })}</p>}
        </Panel>

        {ranked.length > 0 && (
          <Panel title={t('fm.home.styles')} action={link('tactic', t('fm.views.tactic'))}>
            {ranked.slice(0, 3).map(({ style, fit }) => (
              <Row key={style.id}>
                <span>
                  <b>{en && style.nameEn ? style.nameEn : style.name}</b> {style.mentality && <span className="text-xs text-brun">{style.mentality}</span>}
                </span>
                <span className="text-sm font-bold tabular-nums">{pct(fit)}</span>
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
