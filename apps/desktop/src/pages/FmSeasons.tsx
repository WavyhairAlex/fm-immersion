import { seasonPlan, type FmPlayer, type PosCode, type SeasonCell, type SeasonPlan, type SlotOutlook, type SquadAt, type YouthAdvice } from '@fm-immersion/module-fm';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { PosBadge } from './FmFoot';
import { useLeaving } from './FmLeaving';
import { ReserveContext, useTacticEngine } from './FmTactic';
import { Empty, Fit, Kpi, More, Panel, PlayerLink, Tag, useCoach, useFormat, type Tone } from './FmUi';

/** Ce qu'il faut pour calculer l'effectif par saison, posé une fois par l'écran de la partie. */
export const SeasonInputsContext = createContext<{ players: FmPlayer[]; history: SquadAt[]; gameDate: string; folder: string } | null>(null);

/** Effectif saison par saison (jeunes du centre compris) : partagé par Saisons, Académie et Recrues pour ma tactique. */
export function useSeasonPlan(): SeasonPlan | null {
  const inputs = useContext(SeasonInputsContext);
  const reserve = useContext(ReserveContext);
  const { engine } = useTacticEngine(inputs?.folder ?? '', inputs?.players ?? []);
  const [coach] = useCoach();
  const { ids: leavingIds, loanUntil } = useLeaving();
  return useMemo(
    () => (inputs ? seasonPlan(engine, inputs.players, reserve, inputs.gameDate, coach, inputs.history, 3, leavingIds, loanUntil) : null),
    [engine, inputs, reserve, coach, leavingIds, loanUntil],
  );
}

/** Bilan du poste `index` (même ordre que la tactique choisie), retrouvé par son poste si l'ordre diffère. */
export function slotOutlook(plan: SeasonPlan | null, index: number, pos: PosCode): SlotOutlook | null {
  if (!plan) return null;
  const s = plan.slots[index];
  return s && s.pos === pos ? s : (plan.slots.find((x) => x.pos === pos && x.verdict === 'youth') ?? null);
}

const CELL: Record<SeasonCell['state'], string> = {
  ok: 'bg-eau/20',
  youth: 'bg-orange-clair ring-2 ring-orange',
  ending: 'bg-ambre/20',
  recruit: 'border-2 border-dashed border-corail bg-corail/10',
};

const ADVICE_TONE: Record<YouthAdvice, Tone> = { promote: 'good', extend: 'warn', loan: 'info', keep: 'info', sell: 'bad' };

/** Encadré « avant d'acheter » d'un poste : le jeune du centre qui le tiendra, ou un achat utile. */
export function SlotAdvice({ s, go }: { s: SlotOutlook; go?: (view: string) => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  if (s.verdict === 'ok') return null;
  if (s.verdict === 'youth' && s.youth)
    return (
      <div className="rounded-lg border-l-4 border-orange bg-orange-clair/40 px-3 py-2 text-sm">
        <p>
          <b>{t('fm.seasons.wait.title')}</b> <PosBadge pos={s.pos} />{' '}
          {t('fm.seasons.wait.text', { name: s.youth.name, team: s.youthTeam ?? '', season: s.from })}
          {s.current && s.currentLeaves ? ` ${t('fm.seasons.wait.leaves', { name: s.current.name, date: f.date(s.currentLeaves) })}` : ''}
        </p>
        {go && (
          <button type="button" className="btn-secondary mt-2 !px-2 !py-1 text-xs" onClick={() => go('academy')}>
            {t('fm.seasons.wait.see')}
          </button>
        )}
      </div>
    );
  return (
    <div className="rounded-lg border-l-4 border-corail bg-corail/5 px-3 py-2 text-sm">
      <p>
        <b>{t('fm.seasons.buy.title')}</b> <PosBadge pos={s.pos} /> {t('fm.seasons.buy.text', { season: s.buyFrom })}
      </p>
      {go && (
        <button type="button" className="btn-secondary mt-2 !px-2 !py-1 text-xs" onClick={() => go('targets')}>
          {t('fm.seasons.buy.see')}
        </button>
      )}
    </div>
  );
}

/** Tableau des espoirs : poste qu'ils tiendront, saison, valeur à 23 ans, conseil. */
export function YouthPaths({ plan, limit = 10 }: { plan: SeasonPlan; limit?: number }) {
  const { t } = useTranslation();
  const f = useFormat();
  const rows = plan.youth.slice(0, limit);
  if (!rows.length) return <Empty>{t('fm.seasons.noYouth')}</Empty>;
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead className="text-left text-canard/70">
          <tr>
            <th className="py-1 pr-3">{t('fm.seasons.col.player')}</th>
            <th className="py-1 pr-3">{t('fm.seasons.col.pos')}</th>
            <th className="py-1 pr-3">{t('fm.seasons.col.from')}</th>
            <th className="py-1 pr-3 text-right">{t('fm.seasons.col.valueNow')}</th>
            <th className="py-1 pr-3 text-right">{t('fm.seasons.col.valueAt')}</th>
            <th className="py-1">{t('fm.seasons.col.advice')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((y) => (
            <tr key={y.player.id} className="border-t border-canard/5">
              <td className="py-1.5 pr-3">
                <PlayerLink player={y.player} /> <span className="text-xs text-brun">{t('fm.seasons.ageTeam', { age: y.player.age ?? '?', team: y.team ?? '' })}</span>
              </td>
              <td className="py-1.5 pr-3">{y.pos ? <PosBadge pos={y.pos} /> : <span className="text-canard/40">–</span>}</td>
              <td className="py-1.5 pr-3">{y.from ?? <span className="text-brun">{t('fm.seasons.notYet')}</span>}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{f.money(y.valueNow)}</td>
              <td className="py-1.5 pr-3 text-right font-bold tabular-nums">{y.valueAt != null ? `≈ ${f.money(y.valueAt)}` : '–'}</td>
              <td className="py-1.5">
                <Tag tone={ADVICE_TONE[y.advice]}>{t(`fm.seasons.advice.${y.advice}`)}</Tag>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cell({ c }: { c: SeasonCell }) {
  const { t } = useTranslation();
  const f = useFormat();
  if (!c.player)
    return (
      <div className={`rounded-lg px-2.5 py-1.5 text-sm ${CELL.recruit}`}>
        <b>{t('fm.seasons.recruit')}</b>
      </div>
    );
  const note: ReactNode[] = [];
  if (c.youth && c.team) note.push(c.team);
  if (c.state === 'recruit') note.push(t('fm.seasons.tooWeak'));
  if (c.leaves) note.push(t('fm.seasons.leaves', { date: f.date(c.leaves) }));
  if (c.declining) note.push(t('fm.seasons.declining'));
  if (c.newcomer && c.youth) note.push(t('fm.seasons.takesOver'));
  return (
    <div className={`rounded-lg px-2.5 py-1.5 text-sm ${CELL[c.state]}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate">
          {c.youth && '★ '}
          <PlayerLink player={c.player} face={false} /> <span className="text-xs text-brun">{t('fm.seasons.age', { age: c.player.age ?? '?' })}</span>
        </span>
        <Fit value={c.fit} />
      </div>
      {note.length > 0 && <p className="text-xs text-brun">{note.join(' · ')}</p>}
    </div>
  );
}

/** Mon effectif › Saisons : le onze de la tactique choisie sur les trois prochaines saisons, jeunes du centre compris. */
export function FmSeasons({ go }: { go?: (view: string) => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  const plan = useSeasonPlan();
  if (!plan || !plan.stages.length) return <Empty>{t('fm.tac.noAttributes')}</Empty>;
  const last = plan.stages.at(-1)!;
  const buys = plan.slots.filter((s) => s.verdict === 'buy');
  const youthSlots = plan.slots.filter((s) => s.verdict === 'youth');
  const todo = [...youthSlots, ...buys];
  return (
    <div className="space-y-4">
      <p className="text-sm text-brun">{t('fm.seasons.intro')}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label={t('fm.seasons.kpi.youth')} value={plan.youthHeld} sub={t('fm.seasons.kpi.youthSub', { season: last.label })} />
        <Kpi label={t('fm.seasons.kpi.buys')} value={buys.length} sub={buys.length ? buys.map((s) => s.pos).join(', ') : t('fm.seasons.kpi.buysNone')} tone={buys.length ? 'bad' : undefined} />
        <Kpi label={t('fm.seasons.kpi.covered')} value={youthSlots.length} sub={t('fm.seasons.kpi.coveredSub')} />
        <Kpi label={t('fm.seasons.kpi.upside')} value={plan.upside != null ? `+${f.money(plan.upside)}` : '–'} sub={plan.upside != null ? t('fm.seasons.kpi.upsideSub') : t('fm.seasons.kpi.upsideNone')} dim={plan.upside == null} />
      </div>
      <Panel title={t('fm.seasons.grid')}>
        <div className="overflow-x-auto">
          <table className="w-full table-fixed border-separate [border-spacing:6px]">
            <thead>
              <tr className="text-left text-xs text-brun">
                <th className="w-14" />
                {plan.stages.map((st, i) => (
                  <th key={st.date}>{i === 0 ? t('fm.seasons.now', { season: st.label }) : st.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plan.stages[0]!.cells.map((c0, k) => (
                <tr key={k}>
                  <td>
                    <PosBadge pos={c0.pos} />
                  </td>
                  {plan.stages.map((st) => (
                    <td key={st.date} className="align-top">
                      <Cell c={st.cells[k]!} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-brun">
          {(['ok', 'youth', 'ending', 'recruit'] as const).map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5">
              <i className={`inline-block h-3 w-3 rounded ${CELL[s]}`} />
              {t(`fm.seasons.legend.${s}`)}
            </span>
          ))}
        </p>
        <More>
          <p>{t('fm.seasons.help')}</p>
        </More>
      </Panel>
      <Panel title={t('fm.seasons.beforeBuying')}>{todo.length ? <div className="space-y-2">{todo.map((s) => <SlotAdvice key={s.index} s={s} go={go} />)}</div> : <Empty>{t('fm.seasons.nothingToBuy')}</Empty>}</Panel>
      <Panel title={t('fm.seasons.prospects')}>
        <YouthPaths plan={plan} limit={8} />
      </Panel>
    </div>
  );
}
