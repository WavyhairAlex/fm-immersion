import { boardTone, clubFinances, upcomingContracts, type FmPlayer, type FmSnapshot } from '@fm-immersion/module-fm';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Empty, Kpi, Level, Panel, Row, Tag, useFormat, PlayerLink } from './FmUi';

/** Finances et board : budgets, simulateur de prolongations, attentes de la direction. */
export function FmFinances({ snap, players }: { snap: FmSnapshot; players: FmPlayer[] }) {
  const { t } = useTranslation();
  const f = useFormat();
  const fin = useMemo(() => clubFinances(snap, players), [snap, players]);
  const ext = useMemo(() => upcomingContracts(players, snap.gameDate, 12), [players, snap.gameDate]);
  // Salaire proposé pour chaque prolongation (0 = laisser partir) ; rien n'est enregistré.
  const [offer, setOffer] = useState<Record<string, number>>({});
  const delta = ext.reduce((a, { player: p }) => a + ((offer[p.id] ?? p.wage ?? 0) - (p.wage ?? 0)), 0);
  const after = fin.wageRoom != null ? fin.wageRoom - delta : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label={t('fm.fin.bill')} value={f.money(fin.wageBill)} sub={t('fm.fin.perMonth')} />
        <Kpi label={t('fm.fin.budget')} value={f.money(fin.wageBudget)} sub={fin.wageBudget != null ? t('fm.fin.perMonth') : t('fm.fin.unknown')} />
        <Kpi
          label={t('fm.fin.room')}
          value={f.signed(fin.wageRoom)}
          tone={fin.wageRoom == null ? undefined : fin.wageRoom < 0 ? 'bad' : 'good'}
          sub={fin.wageRoom != null && fin.wageRoom < 0 ? t('fm.fin.over') : t('fm.fin.perMonth')}
        />
        <Kpi label={t('fm.fin.transfer')} value={f.money(fin.transferBudget)} sub={fin.balance != null ? t('fm.fin.balance', { amount: f.money(fin.balance) }) : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t('fm.fin.sim')}>
          <p className="help">{t('fm.fin.simHelp')}</p>
          {ext.length ? (
            ext.map(({ player: p }) => (
              <Row key={p.id}>
                <span className="flex flex-wrap items-center gap-2">
                  <PlayerLink player={p} />
                  <span className="text-xs text-brun">{t('fm.fin.ends', { date: f.date(p.contractEnd) })}</span>
                  <Level value={p.level} />
                </span>
                <label className="flex items-center gap-2 text-xs text-brun">
                  {f.money(p.wage)} →
                  <input
                    type="number"
                    min={0}
                    step={5}
                    className="w-24 rounded-lg border border-canard/20 bg-white px-2 py-1 text-sm text-canard"
                    value={offer[p.id] ?? p.wage ?? 0}
                    aria-label={t('fm.fin.offer', { name: p.name })}
                    onChange={(e) => setOffer((o) => ({ ...o, [p.id]: Number(e.target.value) || 0 }))}
                  />
                </label>
              </Row>
            ))
          ) : (
            <Empty>{t('fm.fin.noExt')}</Empty>
          )}
          <p className={`mt-3 rounded-xl px-3 py-2 text-sm ${after == null ? 'bg-canard/5' : after < 0 ? 'bg-corail/15' : 'bg-eau/20'}`}>
            {t('fm.fin.effect', { delta: f.signed(delta) })}
            {after != null ? ` · ${t('fm.fin.after', { room: f.signed(after) })}` : ` · ${t('fm.fin.afterUnknown')}`}
          </p>
        </Panel>

        <Panel title={t('fm.fin.board')}>
          {fin.boardConfidence && (
            <p className="mb-2 text-sm">
              {t('fm.fin.confidence')} <Tag tone={boardTone(fin.boardConfidence)}>{fin.boardConfidence}</Tag>
            </p>
          )}
          {fin.expectations.length ? (
            fin.expectations.map((e) => (
              <Row key={e.label}>
                <span>{e.label}</span>
                {e.status && <Tag tone={boardTone(e.status)}>{e.status}</Tag>}
              </Row>
            ))
          ) : (
            <Empty>{t('fm.fin.noBoard')}</Empty>
          )}
        </Panel>
      </div>
    </div>
  );
}
