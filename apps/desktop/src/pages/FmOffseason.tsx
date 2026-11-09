import { offseasonDue, offseasonPlan, summarize, type Decision, type FmPlayer, type FmSnapshot } from '@fm-immersion/module-fm';
import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useDecisionVals } from './FmDecisions';
import { useLeaving } from './FmLeaving';
import { More, Panel, useCoach, useFormat } from './FmUi';

/**
 * Plan d'intersaison, en tête de l'accueil une fois le championnat fini : contrats, départs, recrutement et
 * présaison, dans l'ordre où l'été se joue, avec les comptes du mercato. Reprend les décisions de l'accueil.
 */
export function FmOffseason({ snap, players, list, go }: { snap: FmSnapshot; players: FmPlayer[]; list: Decision[]; go: (view: string) => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  const vals = useDecisionVals();
  const [coach] = useCoach();
  // Intersaison : les prêtés chez nous rentrent chez eux à la fin du prêt, ils comptent parmi les départs.
  const { nextSeasonIds: leavingIds } = useLeaving();
  const seasonStart = coach.seasonStart ?? 8;
  const s = useMemo(() => summarize(snap, players), [snap, players]);
  const plan = useMemo(
    () => offseasonPlan(snap, list, players, { wageRoom: s.wageRoom, transferBudget: s.transferBudget }, seasonStart, leavingIds),
    [snap, list, players, s.wageRoom, s.transferBudget, seasonStart, leavingIds],
  );
  if (!offseasonDue(snap, seasonStart)) return null;

  const items = (ds: Decision[]) =>
    ds.length ? (
      <ul className="mt-1 space-y-0.5 text-sm">
        {ds.map((d, i) => (
          <li key={i} className="text-canard">
            {t(`fm.dec.action.${d.action}`, vals(d))}
          </li>
        ))}
      </ul>
    ) : (
      <p className="mt-1 text-sm text-eau-fonce">{t('fm.off.nothing')}</p>
    );
  const money = (label: string, value: string, tone = '') => (
    <div className="rounded-lg bg-canard/5 p-2">
      <p className={`font-display text-lg font-semibold tabular-nums ${tone}`}>{value}</p>
      <p className="text-xs text-brun">{label}</p>
    </div>
  );
  const steps: { id: string; when: string; view: string; body: ReactNode }[] = [
    {
      id: 'contracts',
      when: plan.contractsBy ? t('fm.off.before', { date: f.date(plan.contractsBy) }) : t('fm.off.now'),
      view: 'contracts',
      body: items(plan.contracts),
    },
    {
      id: 'departures',
      when: t('fm.off.before', { date: f.date(plan.restart) }),
      view: 'mercato',
      body: (
        <>
          {items(plan.departures)}
          {plan.leaving.length > 0 && (
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              {money(t('fm.off.wagesFreed', { count: plan.leaving.length }), f.money(plan.wagesFreed))}
              {money(t('fm.off.wageRoomAfter'), f.money(plan.wageRoomAfter), plan.wageRoomAfter != null && plan.wageRoomAfter < 0 ? 'text-corail' : 'text-eau-fonce')}
              {money(t('fm.off.saleValue'), f.money(plan.saleValue))}
            </div>
          )}
        </>
      ),
    },
    {
      id: 'recruits',
      when: t('fm.off.before', { date: f.date(plan.restart) }),
      view: 'targets',
      body: (
        <>
          {items(plan.recruits)}
          <p className="mt-1 text-xs text-brun">{t('fm.off.budget', { transfer: f.money(plan.transferBudget), wages: f.money(plan.wageRoomAfter) })}</p>
        </>
      ),
    },
    {
      id: 'preseason',
      when: t('fm.off.range', { from: f.date(plan.preseason), to: f.date(plan.restart) }),
      view: 'training',
      body: <p className="mt-1 text-sm text-canard">{t('fm.off.preseasonText')}</p>,
    },
  ];

  return (
    <Panel title={t('fm.off.title')}>
      <More>{t(plan.seasonOver ? 'fm.off.helpOver' : 'fm.off.help')}</More>
      <ol className="space-y-3">
        {steps.map((st, i) => (
          <li key={st.id} className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange text-sm font-bold text-canard" aria-hidden>
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <b className="text-canard">{t(`fm.off.step.${st.id}`)}</b>
                <span className="text-xs font-bold text-canard/70">{st.when}</span>
              </div>
              {st.body}
              <button type="button" className="mt-1 text-sm font-bold text-orange-fonce hover:underline" onClick={() => go(st.view)}>
                {t(`fm.off.go.${st.id}`)} →
              </button>
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
