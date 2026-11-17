import { lineOf, SQUAD_TARGET, seasonPlan, type Line, type SquadEntry, type SquadRow, type FmPlayer, type PosCode, type SeasonPlan, type SlotOutlook, type SquadAt, type Viability, type YouthAdvice } from '@fm-immersion/module-fm';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { PosBadge } from './FmFoot';
import { useLeaving } from './FmLeaving';
import { ReserveContext, useTacticEngine } from './FmTactic';
import { Empty, Fit, More, Panel, PlayerLink, Tag, useCoach, useFormat, type Tone } from './FmUi';

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


const VIABILITY_TONE: Record<Viability, Tone> = { lasting: 'good', fair: 'info', stopgap: 'warn' };

/** Tenue sur le long terme : verdict et adéquation attendue au pic (« estimation » sans CA/PA lus). */
function Lasting({ v, peak, reliable }: { v: Viability | null; peak: number | null; reliable: boolean }) {
  const { t } = useTranslation();
  if (!v) return <span className="text-canard/40">–</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5" title={reliable ? undefined : t('fm.seasons.viability.estimate')}>
      <Tag tone={VIABILITY_TONE[v]}>{t(`fm.seasons.viability.${v}`)}</Tag>
      <Fit value={peak} />
      {!reliable && <span className="text-xs text-brun">*</span>}
    </span>
  );
}

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
          {s.viability ? ` ${t(`fm.seasons.wait.${s.viability}`)}` : ''}
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
    <>
      <div className="table-scroll">
      <table className="data-table">
        <thead className="text-left text-canard/70">
          <tr>
            <th className="py-1 pr-3">{t('fm.seasons.col.player')}</th>
            <th className="py-1 pr-3">{t('fm.seasons.col.pos')}</th>
            <th className="py-1 pr-3">{t('fm.seasons.col.from')}</th>
            <th className="py-1 pr-3 text-right">{t('fm.seasons.col.valueNow')}</th>
            <th className="py-1 pr-3 text-right">{t('fm.seasons.col.valueAt')}</th>
            <th className="py-1 pr-3">{t('fm.seasons.col.lasting')}</th>
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
              <td className="py-1.5 pr-3">
                <Lasting v={y.viability} peak={y.peakFit} reliable={y.reliable} />
              </td>
              <td className="py-1.5">
                <Tag tone={ADVICE_TONE[y.advice]}>{t(`fm.seasons.advice.${y.advice}`)}</Tag>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <p className="mt-2 text-xs text-brun">{t('fm.seasons.viability.legend')}</p>
    </>
  );
}

const ROLE_CLS: Record<SquadEntry['role'], string> = {
  starter: 'bg-eau/25',
  backup: 'bg-canard/5',
  rotation: 'bg-creme text-brun',
  prospect: 'bg-orange-clair ring-2 ring-inset ring-orange',
  gone: 'bg-corail/10 text-corail',
};
const LINES: Line[] = ['GB', 'DEF', 'MIL', 'ATT'];
type Filter = 'all' | Line | 'youth';

/** Case d'un joueur à une saison : rôle, poste, adéquation, et ce qui l'attend (départ, baisse, vente). */
function RoleCell({ e, prev }: { e: SquadEntry | undefined; prev: SquadEntry | undefined }) {
  const { t } = useTranslation();
  const f = useFormat();
  if (!e) return null;
  if (e.role === 'gone') return <div className={`rounded-md px-2 py-1 text-xs ${ROLE_CLS.gone}`}>{prev && prev.role !== 'gone' ? t('fm.seasons.role.gone') : '–'}</div>;
  const note: string[] = [];
  if (e.leaves) note.push(t('fm.seasons.leaves', { date: f.date(e.leaves) }));
  else if (e.sell && e.role !== 'starter') note.push(t('fm.seasons.toSell'));
  if (e.declining) note.push(t('fm.seasons.declining'));
  const warn = e.leaves || e.declining;
  return (
    <div className={`flex items-center justify-between gap-2 rounded-md px-2 py-1 text-sm ${warn && e.role !== 'prospect' ? 'bg-ambre/20' : ROLE_CLS[e.role]}`}>
      <span className="min-w-0 truncate">
        <span className={e.role === 'starter' ? 'font-bold' : ''}>{t(`fm.seasons.role.${e.role}`)}</span>
        {(e.role === 'starter' || e.role === 'backup') && e.pos && <span className="ml-1 text-xs text-brun">{e.pos}</span>}
        {note.length > 0 && <span className="ml-1 text-xs text-brun">· {note.join(' · ')}</span>}
      </span>
      {e.role !== 'rotation' && <Fit value={e.fit} />}
    </div>
  );
}

function PlayerRow({ r, n }: { r: SquadRow; n: number }) {
  const { t } = useTranslation();
  const p = r.player;
  return (
    <tr className="border-t border-canard/5">
      <td className="py-1 pr-3 align-middle">
        {r.youth && '★ '}
        <PlayerLink player={p} face={false} />
        <span className="block text-xs text-brun">
          {[t('fm.seasons.age', { age: p.age ?? '?' }), p.positionsLabel, r.youth ? r.team : p.contractEnd ? t('fm.seasons.contract', { date: p.contractEnd.slice(0, 4) }) : null].filter(Boolean).join(' · ')}
        </span>
      </td>
      {Array.from({ length: n }, (_, i) => (
        <td key={i} className="py-1 pr-2 align-middle">
          <RoleCell e={r.seasons[i]} prev={r.seasons[i - 1]} />
        </td>
      ))}
    </tr>
  );
}

/** Mon effectif › Saisons : tout l'effectif joueur par joueur sur les trois prochaines saisons, jeunes du centre compris. */
export function FmSeasons({ go }: { go?: (view: string) => void }) {
  const { t } = useTranslation();
  const plan = useSeasonPlan();
  const [filter, setFilter] = useState<Filter>('all');
  if (!plan || !plan.stages.length) return <Empty>{t('fm.tac.noAttributes')}</Empty>;
  const n = plan.stages.length;
  // Un même jeune peut prendre un poste puis l'autre (deux DC) : un seul encadré par jeune.
  const seen = new Set<string>();
  const at = (label: string | null) => plan.stages.findIndex((st) => st.label === label);
  const todo = [...plan.slots].sort((x, y) => at(x.from) - at(y.from) || x.index - y.index).filter((s) => {
    if (s.verdict === 'ok') return false;
    if (s.verdict !== 'youth' || !s.youth) return true;
    if (seen.has(s.youth.id)) return false;
    seen.add(s.youth.id);
    return true;
  });
  const rows = plan.squad.filter((r) => (filter === 'all' ? true : filter === 'youth' ? r.youth : r.line === filter));
  const lines = filter === 'all' || filter === 'youth' ? LINES : [filter];
  const lineOfPos = (pos: PosCode) => lineOf(pos);
  return (
    <div className="space-y-4">
      <p className="text-sm text-brun">{t('fm.seasons.intro', { target: SQUAD_TARGET })}</p>
      <div className="flex flex-wrap gap-1">
        {(['all', ...LINES, 'youth'] as Filter[]).map((k) => (
          <button key={k} type="button" className={`chip ${filter === k ? 'chip-on' : ''}`} onClick={() => setFilter(k)}>
            {t(`fm.seasons.filter.${k}`)}
          </button>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {plan.stages.map((st, i) => {
          const sm = st.summary;
          const bits = [
            i > 0 && sm.departures ? t('fm.seasons.sum.departures', { count: sm.departures }) : null,
            sm.promoted ? t(i ? 'fm.seasons.sum.promoted' : 'fm.seasons.sum.youthNow', { count: sm.promoted }) : null,
            sm.recruit.length ? t('fm.seasons.sum.recruit', { list: sm.recruit.join(', ') }) : null,
            sm.noBackup.length ? t('fm.seasons.sum.noBackup', { list: sm.noBackup.join(', ') }) : null,
          ].filter(Boolean);
          return (
            <div key={st.date} className="card !p-3">
              <p className="text-xs text-brun">{i === 0 ? t('fm.seasons.now', { season: st.label }) : st.label}</p>
              <p className="font-display text-lg font-semibold">
                {t('fm.seasons.sum.size', { count: sm.size, target: SQUAD_TARGET })} · {t('fm.seasons.sum.keepers', { count: sm.keepers })}
              </p>
              <div className="my-1.5 h-1.5 overflow-hidden rounded bg-canard/10">
                <div className={`h-full ${sm.size >= SQUAD_TARGET - 2 ? 'bg-eau-soutenu' : 'bg-orange'}`} style={{ width: `${Math.min(100, (sm.size / SQUAD_TARGET) * 100)}%` }} />
              </div>
              <p className="text-xs text-brun">{bits.length ? bits.join(' · ') : t('fm.seasons.sum.ok')}</p>
            </div>
          );
        })}
      </div>
      <Panel title={t('fm.seasons.grid')}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] table-fixed">
            <colgroup>
              <col className="w-56" />
              {plan.stages.map((st) => (
                <col key={st.date} />
              ))}
            </colgroup>
            <tbody>
              {lines.map((ln) => {
                const lr = rows.filter((r) => r.line === ln);
                const rec = plan.stages.map((st) => st.summary.recruit.filter((pos) => lineOfPos(pos) === ln));
                const thin = plan.stages.map((st) => st.summary.noBackup.filter((pos) => lineOfPos(pos) === ln));
                if (!lr.length && rec.every((x) => !x.length) && thin.every((x) => !x.length)) return null;
                return (
                  <LineBlock key={ln} title={t(`fm.seasons.line.${ln}`)} n={n}>
                    {lr.map((r) => (
                      <PlayerRow key={r.player.id} r={r} n={n} />
                    ))}
                    {filter !== 'youth' && (rec.some((x) => x.length) || thin.some((x) => x.length)) && (
                      <tr className="border-t border-canard/5">
                        <td className="py-1 pr-3 font-bold text-corail">{t('fm.seasons.recruit')}</td>
                        {rec.map((x, i) => (
                          <td key={i} className="py-1 pr-2">
                            {x.length || thin[i]!.length ? (
                              <div className="rounded-md border-2 border-dashed border-corail px-2 py-0.5 text-xs">
                                {x.length > 0 && <b>{t('fm.seasons.recruitStarter', { list: x.join(', ') })}</b>}
                                {x.length > 0 && thin[i]!.length > 0 && ' · '}
                                {thin[i]!.length > 0 && t('fm.seasons.recruitBackup', { list: thin[i]!.join(', ') })}
                              </div>
                            ) : null}
                          </td>
                        ))}
                      </tr>
                    )}
                  </LineBlock>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-brun">
          {(['starter', 'backup', 'rotation', 'prospect', 'gone'] as const).map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <i className={`inline-block h-3 w-3 rounded ${ROLE_CLS[k]}`} />
              {t(`fm.seasons.legend.${k}`)}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-3 w-3 rounded bg-ambre/20" />
            {t('fm.seasons.legend.ending')}
          </span>
        </p>
        <More>
          <p>{t('fm.seasons.help')}</p>
        </More>
      </Panel>
      {filter === 'youth' && (
        <Panel title={t('fm.seasons.prospects')}>
          <YouthPaths plan={plan} limit={12} />
        </Panel>
      )}
      <Panel title={t('fm.seasons.beforeBuying')}>
        {todo.length ? (
          <div className="space-y-2">
            {todo.map((s) => (
              <SlotAdvice key={s.index} s={s} go={go} />
            ))}
          </div>
        ) : (
          <Empty>{t('fm.seasons.nothingToBuy')}</Empty>
        )}
      </Panel>
    </div>
  );
}

function LineBlock({ title, n, children }: { title: string; n: number; children: ReactNode }) {
  return (
    <>
      <tr>
        <td colSpan={n + 1} className="pb-1 pt-3 text-xs font-bold uppercase tracking-wide text-brun">
          {title}
        </td>
      </tr>
      {children}
    </>
  );
}
