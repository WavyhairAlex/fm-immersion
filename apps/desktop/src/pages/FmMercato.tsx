import { CONTRACT_CALLS, MERCATO_ORDER, POS_LABEL, POS_ORDER, lineOf, type Line, type PosCode, askingPrice, buildProject, clubFinances, contractDecisions, engineValue, financeState, mercatoAdvice, recruitmentNeeds, type ContractCall, type FmPlayer, type Project, type Target, type TacticEngine, teamPlan, storedTargets, type TeamPlanLimits, marketModel, bestSlotFit, targetPrice, roleCeiling, valueScore, slotFit, type PriceVerdict, type FmSnapshot, type MercatoAdvice, type MercatoReason, type MercatoReport, type MercatoVerdict, type RecruitNeed, type SquadAt, type ClubFinances } from '@fm-immersion/module-fm';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { fmData } from '../lib/data';
import { useNavigate } from 'react-router-dom';
import { clubPath } from '../lib/club-nav';
import { useTacticEngine } from './FmTactic';
import { LeaveButton, useLeaving } from './FmLeaving';
import { NeedsPanel } from './FmNeeds';
import { DivisionLevelPanel, ReplacementFinder } from './FmReplacement';
import { CompatTag, EngineTag, Empty, Kpi, Level, Panel, Pos, Tag, useCoach, useFormat, useNames, type Tone, More, PlayerLink, Chips } from './FmUi';

export const TONE: Record<MercatoVerdict, Tone> = { sell: 'bad', release: 'bad', loan: 'warn', extend: 'warn', develop: 'good', replace: 'warn', backup: 'info', core: 'good' };
/** Groupes affichés en détail : ce qui demande une décision au mercato. */
const ACTION: MercatoVerdict[] = ['sell', 'release', 'loan', 'extend', 'replace'];
/** Groupes où l'on cherche un remplaçant : le joueur part, ou il faut mieux à son poste. */
const REPLACE: MercatoVerdict[] = ['sell', 'release', 'replace'];

/** Fins de contrat à six mois ou moins : à régler avant que le joueur puisse signer ailleurs. */
const URGENT_MONTHS = 6;
/** Une décision individuelle, ouverte sous son groupe : une ligne, une raison courte, le détail au clic. */
type PlanRow = { key: string; head: ReactNode; tag: ReactNode; line: string; detail: ReactNode };
type PlanKind = 'extendUrgent' | 'recruit1' | 'sell' | 'release' | 'recruit2' | 'loan' | 'extend' | 'recruit3';
/** Ordre de priorité des groupes : du plus pressé au confort de banc. */
const PLAN_ORDER: PlanKind[] = ['extendUrgent', 'recruit1', 'sell', 'release', 'recruit2', 'loan', 'extend', 'recruit3'];
/** Au-delà de ce rang, des finances serrées passent en tête (rien de plus pressé qu'elles). */
type PlanGroup = { kind: PlanKind; rows: PlanRow[]; names: string[]; why: string };

/** Les décisions d'un groupe, une par ligne ; un clic ouvre la ligne sur place. */
function PlanRows({ rows }: { rows: PlanRow[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <ul className="divide-y divide-canard/10 border-t border-canard/10">
      {rows.map((row) => {
        const isOpen = open === row.key;
        return (
          <li key={row.key}>
            <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : row.key)} className={`flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-orange-clair/40 ${isOpen ? 'bg-orange-clair/40' : ''}`}>
              <span className="flex min-w-0 flex-1 items-center gap-1.5 font-bold">{row.head}</span>
              <span className="hidden min-w-0 flex-[2] truncate text-sm text-brun md:block">{row.line}</span>
              <span className="shrink-0">{row.tag}</span>
            </button>
            {isOpen && <div className="space-y-1.5 px-4 pb-3 text-sm">{row.detail}</div>}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Le plan du mercato, hiérarchisé : 1) la priorité, en grand, avec l'argent disponible ; 2) les décisions regroupées
 * par type, dans l'ordre où les prendre (une ligne par groupe) ; 3) au clic, chaque joueur ou poste ; le reste est replié.
 */
function MercatoPlan({ r, pr, engine, pool, needs, fin, gameDate, onMarked }: { r: MercatoReport; pr: Project | null; engine: TacticEngine; pool: Target[]; needs: RecruitNeed[]; fin: ClubFinances | null; gameDate: string; onMarked: (id: string) => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  const reason = useReason();
  const navigate = useNavigate();
  const attr = (k: string) => t(`fm.attr.${k}`, { defaultValue: k });
  const [open, setOpen] = useState<PlanKind | null>(null);

  const needRow = (n: RecruitNeed, i: number): PlanRow => ({
    key: `need-${n.pos}-${i}`,
    head: (
      <>
        <span className="pill">{POS_LABEL[n.pos]}</span>
        {n.player && <span className="truncate font-normal text-brun">{n.player.name}</span>}
      </>
    ),
    tag: <Tag tone={n.priority === 1 ? 'bad' : n.priority === 2 ? 'warn' : undefined}>{t(`fm.needs.priority.${n.priority}`)}</Tag>,
    line: n.why[0] ? t(`fm.needs.why.${n.why[0]}`, { name: n.player?.name ?? '' }) : '',
    detail: (
      <>
        {n.why.length > 1 && <p>{n.why.slice(1).map((w) => t(`fm.needs.why.${w}`, { name: n.player?.name ?? '' })).join(' ')}</p>}
        {n.attrs.length > 0 && <p className="text-brun">{t('fm.needs.attrs', { list: n.attrs.map(attr).join(', ') })}</p>}
        {n.player && <PlayerLink player={n.player} />}
      </>
    ),
  });
  const playerRow = (a: MercatoAdvice, v: MercatoVerdict): PlanRow => ({
    key: `${v}-${a.player.id}`,
    head: (
      <>
        <span className="truncate">{a.player.name}</span> <Pos player={a.player} />
      </>
    ),
    tag:
      v === 'extend' ? (a.months != null && a.months <= URGENT_MONTHS ? <Tag tone="bad">{t('fm.merc.board.urgent')}</Tag> : null) : <Tag tone={TONE[v]}>{t(`fm.merc.verdict.${v}`)}</Tag>,
    line:
      v === 'extend'
        ? [t('fm.contracts.age', { count: a.player.age ?? 0 }), a.player.contractEnd ? t('fm.merc.board.until', { date: f.date(a.player.contractEnd) }) : null].filter(Boolean).join(' · ')
        : a.reasons[0]
          ? reason(a.reasons[0])
          : '',
    detail: (
      <>
        <p className="text-brun">{a.reasons.map(reason).join(' · ')}</p>
        <p className="flex flex-wrap items-center gap-2">
          <PlayerLink player={a.player} />
          {v === 'sell' && <PriceTag a={a} />}
          {v !== 'extend' && <LeaveButton player={a.player} gameDate={gameDate} onMarked={onMarked} />}
        </p>
      </>
    ),
  });

  const extend = [...r.byVerdict.extend].sort((x, y) => (x.months ?? 99) - (y.months ?? 99));
  const urgentExt = extend.filter((a) => a.months != null && a.months <= URGENT_MONTHS);
  const laterExt = extend.filter((a) => !(a.months != null && a.months <= URGENT_MONTHS));
  const lastEnd = (xs: MercatoAdvice[]) => xs.map((a) => a.player.contractEnd).filter(Boolean).sort().at(-1);
  const extWhy = (xs: MercatoAdvice[]) => (lastEnd(xs) ? t('fm.merc.plan.why.extend', { date: f.date(lastEnd(xs)!) }) : '');
  const byPrio = (p: number) => needs.map((n, i) => ({ n, i })).filter((x) => x.n.priority === p);
  const recruit = (p: number): PlanGroup => {
    const xs = byPrio(p);
    return { kind: `recruit${p}` as PlanKind, rows: xs.map((x) => needRow(x.n, x.i)), names: xs.map((x) => POS_LABEL[x.n.pos]), why: xs[0]?.n.why[0] ? t(`fm.needs.why.${xs[0].n.why[0]}`, { name: xs[0].n.player?.name ?? '' }) : '' };
  };
  const players = (kind: PlanKind, v: MercatoVerdict, xs: MercatoAdvice[], why?: string): PlanGroup => ({
    kind,
    rows: xs.map((a) => playerRow(a, v)),
    names: xs.map((a) => a.player.name),
    why: why ?? (xs[0]?.reasons[0] ? reason(xs[0].reasons[0]) : ''),
  });
  const groups = [
    players('extendUrgent', 'extend', urgentExt, extWhy(urgentExt)),
    recruit(1),
    players('sell', 'sell', r.byVerdict.sell),
    players('release', 'release', r.byVerdict.release),
    recruit(2),
    players('loan', 'loan', r.byVerdict.loan),
    players('extend', 'extend', laterExt, extWhy(laterExt)),
    recruit(3),
  ].filter((g) => g.rows.length);

  const tight = fin ? financeState(fin).tight : false;
  const listNames = (xs: string[]) => (xs.length <= 3 ? xs.join(', ') : t('fm.merc.plan.andMore', { list: xs.slice(0, 3).join(', '), count: xs.length - 3 }));
  // Argent du plan : budget transferts + ventes possibles ; marge salariale + salaires libérés (inconnu = sans limite).
  const limits = useMemo<TeamPlanLimits>(
    () => ({
      budget: fin && fin.transferBudget != null ? Math.max(0, fin.transferBudget) + r.income : null,
      wageRoom: fin && fin.wageRoom != null ? Math.max(0, fin.wageRoom + r.wagesFreed) : null,
    }),
    [fin, r.income, r.wagesFreed],
  );
  const kpis = [
    fin && <Kpi key="tb" label={t('fm.merc.view.kpi.transfer')} value={f.money(fin.transferBudget)} />,
    fin && fin.wageRoom != null && <Kpi key="wr" label={t('fm.merc.view.kpi.wage')} value={f.money(fin.wageRoom)} tone={fin.wageRoom < 0 ? 'bad' : undefined} sub={t('fm.merc.view.kpi.perMonth')} />,
    <Kpi key="in" label={t('fm.merc.view.kpi.income')} value={f.money(r.income)} sub={t('fm.merc.view.kpi.incomeSub', { wages: f.money(r.wagesFreed) })} />,
    fin && <Kpi key="bal" label={t('fm.merc.view.kpi.balance')} value={f.money(fin.balance)} tone={(fin.balance ?? 0) < 0 ? 'bad' : undefined} />,
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      {/* 1. L'argent disponible, en un coup d'œil. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{kpis}</div>
      {tight && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border-l-4 border-ambre bg-ambre/10 px-4 py-2 text-sm">
          <span className="font-bold">{t('fm.merc.plan.tightTitle')}</span>
          <span className="text-brun">{t('fm.merc.plan.tightText')}</span>
          <button type="button" className="font-bold text-orange-fonce hover:underline" onClick={() => navigate(clubPath('finances'))}>
            {t('fm.merc.plan.seeFinances')}
          </button>
        </p>
      )}

      {/* 2. Le niveau du onze face à la note visée, et l'argent réparti pour combler l'écart. */}
      {pr && <TeamTarget pr={pr} engine={engine} pool={pool} limits={limits} />}

      {/* 3. Vue d'ensemble : tout l'effectif par ligne, avec ce qui reste, part, se prolonge et manque. */}
      <SquadOverview r={r} needs={needs} />

      {/* 4. Les décisions, dans l'ordre ; le détail s'ouvre sous le groupe. */}
      {groups.length > 0 ? (
        <section className="card !p-0" aria-labelledby="merc-next">
          <h2 id="merc-next" className="px-4 pb-2 pt-4 text-xs font-extrabold uppercase tracking-widest text-canard">
            {t('fm.merc.plan.decisions')}
          </h2>
          <ol className="divide-y divide-canard/10 border-t border-canard/10">
            {groups.map((g, i) => {
              const isOpen = open === g.kind;
              return (
                <li key={g.kind}>
                  <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : g.kind)} className={`flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-orange-clair/40 ${isOpen ? 'bg-orange-clair/40' : ''}`}>
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-canard/10 text-sm font-extrabold tabular-nums">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold">
                        {t(`fm.merc.plan.verb.${g.kind}`)} · <span className="font-normal">{listNames(g.names)}</span>
                      </span>
                      <span className="block truncate text-sm text-brun">{g.why}</span>
                    </span>
                    <span className="shrink-0 text-sm font-bold text-orange-fonce">{isOpen ? '▴' : t('fm.merc.plan.see', { count: g.rows.length })}</span>
                  </button>
                  {isOpen && <PlanRows rows={g.rows} />}
                </li>
              );
            })}
          </ol>
        </section>
      ) : (
        <p className="card text-sm">
          <span className="font-bold">{t('fm.merc.plan.calmTitle')}</span> <span className="text-brun">{t('fm.merc.plan.calmText')}</span>
        </p>
      )}
    </div>
  );
}

/**
 * Le onze face à la note visée, avec la formule de l'ancienne appli du coach : moyenne du onze, note visée, puis
 * les recrues abordables (parmi tes cibles suivies) qui font monter la moyenne, de la plus utile à la moins utile,
 * jusqu'à passer la barre.
 */
function TeamTarget({ pr: pr0, engine: engine0, pool, limits }: { pr: Project; engine: TacticEngine; pool: Target[]; limits: TeamPlanLimits }) {
  // Notes absolues (attributs seuls, comme FM Notebook) : les étoiles du jeu sont relatives à l'effectif et ne disent
  // pas si une recrue d'un autre club apporte quelque chose.
  const { engine, pr } = useMemo(() => {
    const abs = engine0.absolute();
    return { engine: abs, pr: { ...pr0, slots: pr0.slots.map((sl) => ({ ...sl, fit: sl.player ? slotFit(abs, sl.player, sl) : null })) } };
  }, [engine0, pr0]);
  const { t } = useTranslation();
  const f = useFormat();
  const names = useNames();
  const [coach, setCoach] = useCoach();
  const now = pr.slots.reduce((s, sl) => s + (sl.fit ?? 0), 0) / (pr.slots.length || 11);
  // Notes proposées dans l'unité affichée (sur 20 en interne) : par demi-étoile, ou par 5 %.
  // Notes sur 20 dans le rôle (comme FM Notebook) : les étoiles, relatives à l'effectif, ne disent pas si une recrue apporte.
  const options = Array.from({ length: 17 }, (_, i) => 10 + i / 2);
  // Par défaut, le palier juste au-dessus de la moyenne actuelle : un objectif atteignable.
  const T = coach.teamTarget ?? options.find((o) => o > now + 0.01) ?? options.at(-1)!;
  const plan = useMemo(() => teamPlan(engine, pr, pool, T, limits), [engine, pr, pool, T, limits]);
  // Moneyball : juste prix calibré sur tes cibles chiffrées ; « sous les radars » = bonne note pour bien moins cher.
  const scored = useMemo(
    () => pool.map((p) => ({ p, best: bestSlotFit(engine, pr, p), ...targetPrice(p) })).filter((x) => x.best != null && Object.keys(x.p.attributes).length),
    [engine, pr, pool],
  );
  const market = useMemo(() => marketModel(scored.map((x) => ({ fit: x.best!.fit, price: x.price }))), [scored]);
  const radar = market
    ? scored
        .map((x) => ({ ...x, v: market.verdict(x.best!.fit, x.price) }))
        .filter((x) => x.v?.verdict === 'bargain')
        .sort((a, b) => a.v!.ratio - b.v!.ratio)
        .slice(0, 5)
    : [];
  const done = plan.xiAvg >= T;
  const rows = plan.toTarget.length ? plan.toTarget : plan.upgrades.slice(0, 6);
  const [showAll, setShowAll] = useState(false);
  const [sort, setSort] = useState<CandSort>('status');
  // Potentiel du onze : moyenne des plafonds des titulaires dans leur rôle.
  const xiCeil = pr.slots.reduce((s, sl) => s + (roleCeiling(sl.fit, sl.player ?? { age: null, ca: null, pa: null, stars: null }) ?? sl.fit ?? 0), 0) / (pr.slots.length || 11);
  type Cand = { key: string; status: CandStatus; pos: PosCode; player: Target; starter: FmPlayer | null; starterFit: number; fit: number; delta: number; after: number | null; price: number | null; isEst: boolean; wage: number | null; knowledge: number | null; ceil: number; starterCeil: number };
  const cands: Cand[] = [];
  const seen = new Set<string>();
  const add = (c: Omit<Cand, 'ceil' | 'starterCeil'>) => {
    if (seen.has(c.player.id)) return;
    seen.add(c.player.id);
    const ceil = roleCeiling(c.fit, c.player) ?? c.fit;
    const starterCeil = c.starter ? (roleCeiling(c.starterFit, c.starter) ?? c.starterFit) : c.starterFit;
    cands.push({ ...c, ceil, starterCeil });
  };
  for (const u of rows) add({ key: `p-${u.player.id}`, status: 'plan', pos: u.slot.pos, player: u.player, starter: u.starter, starterFit: u.starterFit, fit: u.fit, delta: u.delta, after: u.after, price: u.price, isEst: u.priceIsEst, wage: u.wage, knowledge: u.knowledge });
  for (const x of radar) {
    const sl = x.best!.slot;
    add({ key: `r-${x.p.id}`, status: 'bargain', pos: sl.pos, player: x.p, starter: sl.player, starterFit: sl.fit ?? 0, fit: x.best!.fit, delta: x.best!.fit - (sl.fit ?? 0), after: null, price: x.price, isEst: x.isEst, wage: x.p.wage ?? null, knowledge: x.p.scout?.knowledge ?? null });
  }
  for (const u of plan.tooDear) add({ key: `d-${u.player.id}`, status: 'dear', pos: u.slot.pos, player: u.player, starter: u.starter, starterFit: u.starterFit, fit: u.fit, delta: u.delta, after: null, price: u.price, isEst: u.priceIsEst, wage: u.wage, knowledge: u.knowledge });
  for (const u of plan.unpriced) add({ key: `u-${u.player.id}`, status: 'unpriced', pos: u.slot.pos, player: u.player, starter: u.starter, starterFit: u.starterFit, fit: u.fit, delta: u.delta, after: null, price: null, isEst: false, wage: u.wage, knowledge: u.knowledge });
  const verdict = done ? 'done' : plan.reached ? 'reachable' : 'out';
  const sorted =
    sort === 'status'
      ? cands
      : [...cands].sort((a, b) =>
          sort === 'now' ? b.fit - a.fit : sort === 'potential' ? b.ceil - a.ceil || b.fit - a.fit : valueScore(b.fit, b.delta, b.price) - valueScore(a.fit, a.delta, a.price),
        );

  return (
    <section className="card" aria-labelledby="merc-target">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="merc-target" className="font-display text-xl font-semibold">{t('fm.merc.target.title')}</h2>
          <p className="text-sm text-brun">{t('fm.merc.target.help', { style: names.style(pr.style), form: pr.form })}</p>
        </div>
        <label className="text-xs font-bold text-canard">
          {t('fm.merc.target.aim')}{' '}
          <select className="input ml-1 inline-block w-auto py-1 font-normal" value={T} onChange={(e) => setCoach({ teamTarget: Number(e.target.value) })}>
            {(options.includes(T) ? options : [...options, T].sort((a, b) => a - b)).map((v) => (
              <option key={v} value={v}>{n20(v)} / 20</option>
            ))}
          </select>
        </label>
      </div>

      {/* Où on est, où on vise, où on peut arriver avec les cibles abordables. */}
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-canard/5 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-canard/60">{t('fm.merc.target.now')}</p>
          <p className="mt-1 font-display text-3xl font-semibold tabular-nums"><Big v={plan.xiAvg} /></p>
          <p className="text-xs text-brun">{t('fm.merc.target.ready', { count: pr.slots.filter((s) => s.fit != null && s.fit >= T).length })} · {t('fm.merc.target.floor', { value: n20(plan.floor) })}</p>
          {xiCeil - plan.xiAvg >= 0.1 && <p className="text-xs text-eau-fonce">{t('fm.merc.target.xiCeil', { value: n20(xiCeil) })}</p>}
        </div>
        <div className="rounded-lg bg-orange-clair p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-canard/60">{t('fm.merc.target.aimed')}</p>
          <p className="mt-1 font-display text-3xl font-semibold tabular-nums"><Big v={T} /></p>
          <p className="text-xs text-brun">{done ? t('fm.merc.target.reached') : t('fm.merc.target.missing', { gap: n20(T - plan.xiAvg) })}</p>
        </div>
        <div className={`rounded-lg p-3 ${verdict === 'out' ? 'bg-corail/10' : 'bg-eau/15'}`}>
          <p className="text-xs font-bold uppercase tracking-wide text-canard/60">{t('fm.merc.target.reachable')}</p>
          <p className="mt-1 font-display text-3xl font-semibold tabular-nums"><Big v={plan.reachable} /></p>
          <p className={`text-xs font-bold ${verdict === 'out' ? 'text-corail' : 'text-eau-fonce'}`}>
            {t(`fm.merc.target.verdict.${verdict}`, { count: plan.toTarget.length })}
          </p>
        </div>
      </div>
      <p className="mt-2 text-xs text-brun">
        {limits.budget == null ? t('fm.merc.target.capNone') : t('fm.merc.target.cap', { amount: f.money(limits.budget) })}
        {limits.wageRoom != null && <> · {t('fm.merc.target.wageCap', { amount: f.money(limits.wageRoom) })}</>} · {t('fm.merc.target.pool', { count: pool.length })}
        {rows.length > 0 && !done && <> · {t('fm.merc.target.spent', { amount: f.money(rows.reduce((a, u) => a + (u.price ?? 0), 0)), wages: f.money(rows.reduce((a, u) => a + (u.wage ?? 0), 0)) })}</>}
      </p>

      {/* Une seule liste de cibles, chacune avec son statut : dans le plan, bonne affaire, trop chère, prix à chiffrer. */}
      {done && <p className="mt-3 text-sm text-brun">{t('fm.merc.target.doneText')}</p>}
      {!pool.length ? (
        <p className="mt-3 text-sm text-brun">{t('fm.merc.target.noPool')}</p>
      ) : !cands.length ? (
        <p className="mt-3 text-sm text-brun">{t('fm.merc.target.noUpgrade')}</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold">{t('fm.merc.target.listTitle')}</p>
            <div className="flex items-center gap-2 text-xs text-brun">
              {t('fm.merc.target.sort.label')}
              <Chips<CandSort> value={sort} onChange={setSort} options={CAND_SORTS.map((k) => [k, t(`fm.merc.target.sort.${k}`)])} />
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-canard/15 text-left text-xs uppercase tracking-wide text-canard/60">
                <th className="py-1.5 pr-3">{t('fm.merc.target.col.status')}</th>
                <th className="py-1.5 pr-3">{t('fm.merc.target.col.pos')}</th>
                <th className="py-1.5 pr-3">{t('fm.merc.target.col.recruit')}</th>
                <th className="py-1.5 pr-3" title={t('fm.merc.target.col.fitHint')}>{t('fm.merc.target.col.fit')}</th>
                <th className="py-1.5 pr-3" title={t('fm.merc.target.col.potentialHint')}>{t('fm.merc.target.col.potential')}</th>
                <th className="py-1.5 pr-3">{t('fm.merc.target.col.gain')}</th>
                <th className="py-1.5 pr-3 text-right">{t('fm.merc.target.col.price')}</th>
                <th className="py-1.5 pr-3 text-right">{t('fm.merc.target.col.wage')}</th>
                <th className="py-1.5 text-right">{t('fm.merc.target.col.known')}</th>
              </tr>
            </thead>
            <tbody>
              {(showAll ? sorted : sorted.slice(0, CAND_MAX)).map((c) => (
                <tr key={c.key} className={`border-b border-canard/5 last:border-0 ${c.status === 'plan' ? 'bg-eau/10' : ''}`}>
                  <td className="py-1.5 pr-3"><span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-bold ${STATUS_CLS[c.status]}`}>{t(`fm.merc.target.status.${c.status}`)}</span></td>
                  <td className="py-1.5 pr-3"><span className="pill">{POS_LABEL[c.pos]}</span></td>
                  <td className="py-1.5 pr-3">
                    <PlayerLink player={c.player} />
                    {c.starter && <span className="block text-xs text-brun">{t(c.delta > 0 ? 'fm.merc.target.replaces' : 'fm.merc.target.backupOf', { name: c.starter.name, fit: c.starterCeil - c.starterFit >= 0.4 ? `${n20(c.starterFit)} → ${n20(c.starterCeil)}` : n20(c.starterFit) })}</span>}
                  </td>
                  <td className="py-1.5 pr-3"><Note v={c.fit} aim={T} /></td>
                  <td className="py-1.5 pr-3 tabular-nums">
                    {c.ceil - c.fit >= 0.4 ? <span className="font-bold text-eau-fonce">→ {n20(c.ceil)}</span> : <span className="text-brun" title={t('fm.merc.target.ceilSameHint')}>{t('fm.merc.target.ceilSame')}</span>}
                  </td>
                  <td className="py-1.5 pr-3 tabular-nums">
                    {c.delta > 0 ? <span className="font-bold text-eau-fonce">+{n20(c.delta)}</span> : <span className="text-brun">{t('fm.merc.target.depth')}</span>}
                    {c.after != null && <span className="block text-xs text-brun">{t('fm.merc.target.afterShort', { value: n20(c.after) })}</span>}
                    {c.ceil - c.starterCeil > Math.max(0, c.delta) + 0.3 && <span className="block text-xs text-eau-fonce">{t('fm.merc.target.later', { gain: `${c.ceil - c.starterCeil > 0 ? '+' : ''}${n20(c.ceil - c.starterCeil)}` })}</span>}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">
                    {c.price == null ? '–' : `${c.isEst ? '~' : ''}${f.money(c.price)}`}
                    {market && c.status !== 'bargain' && <PriceTag2 v={market.verdict(c.fit, c.price)?.verdict ?? null} />}
                    {c.status === 'bargain' && limits.budget != null && c.price != null && c.price > limits.budget && <span className="block text-xs text-corail">{t('fm.merc.target.overBudget')}</span>}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{c.wage == null ? '–' : f.money(c.wage)}</td>
                  <td className="py-1.5 text-right"><Known value={c.knowledge} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {cands.length > CAND_MAX && (
            <button type="button" className="mt-1 text-sm font-bold text-orange-fonce hover:underline" onClick={() => setShowAll(!showAll)}>
              {showAll ? t('fm.merc.target.less') : t('fm.merc.target.more', { count: cands.length - CAND_MAX })}
            </button>
          )}
          <p className="mt-2 text-xs text-brun">{t('fm.merc.target.scaleHelp')}</p>
          <p className="mt-1 text-xs text-brun">{market ? t('fm.merc.target.marketHelp', { count: market.n }) : t('fm.merc.target.marketNone')}</p>
        </div>
      )}
    </section>
  );
}

type CandStatus = 'plan' | 'bargain' | 'dear' | 'unpriced';
const STATUS_CLS: Record<CandStatus, string> = {
  plan: 'bg-eau-fonce text-white',
  bargain: 'bg-eau/40 text-canard',
  dear: 'bg-corail/15 text-canard',
  unpriced: 'bg-canard/10 text-canard',
};
const CAND_MAX = 8;
type CandSort = 'status' | 'now' | 'potential' | 'value';
const CAND_SORTS: CandSort[] = ['status', 'now', 'potential', 'value'];

/** Note sur 20 à une décimale. */
const n20 = (v: number | null | undefined) => (v == null ? '–' : v.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
/** Grand chiffre sur 20 des cadres du haut. */
function Big({ v }: { v: number }) {
  return (
    <>
      {n20(v)}
      <span className="ml-0.5 text-base font-normal text-brun">/20</span>
    </>
  );
}
/** Pastille de note sur 20 colorée face à la note visée : au-dessus, juste en dessous, loin en dessous. */
function Note({ v, aim }: { v: number; aim: number }) {
  const cls = v >= aim ? 'bg-eau-fonce text-white' : v >= aim - 1 ? 'bg-eau/40 text-canard' : v >= aim - 2 ? 'bg-canard/10 text-canard' : 'bg-corail/20 text-canard';
  return <span className={`num-pill ${cls}`}>{n20(v)}</span>;
}

/** Verdict de prix face au marché de tes cibles : bonne affaire ou cher (rien quand le prix est dans la norme). */
function PriceTag2({ v }: { v: PriceVerdict | null }) {
  const { t } = useTranslation();
  if (!v || v === 'fair') return null;
  return <span className={`ml-1.5 rounded px-1.5 py-0.5 text-[11px] font-bold ${v === 'bargain' ? 'bg-eau/40 text-canard' : 'bg-corail/15 text-canard'}`}>{t(`fm.merc.target.price.${v}`)}</span>;
}

/** Connaissance d'une cible par tes recruteurs : sous 50 %, sa note est encore incertaine. */
function Known({ value }: { value: number | null }) {
  const { t } = useTranslation();
  if (value == null) return <span className="text-canard/40">–</span>;
  return (
    <span className={`num-pill ${value >= 75 ? 'bg-eau/40 text-canard' : value >= 50 ? 'bg-canard/10 text-canard' : 'bg-ambre/30 text-canard'}`} title={value < 50 ? t('fm.merc.target.knownLow') : undefined}>
      {Math.round(value)} %
    </span>
  );
}

type Status = 'stay' | 'upgrade' | 'extend' | 'leave';
const STATUS_ORDER: Status[] = ['stay', 'upgrade', 'extend', 'leave'];
const STATUS_OF: Record<MercatoVerdict, Status> = { core: 'stay', develop: 'stay', backup: 'stay', replace: 'upgrade', extend: 'extend', sell: 'leave', release: 'leave', loan: 'leave' };
const CHIP: Record<Status, string> = {
  stay: 'border-eau-fonce/40 bg-eau/15',
  upgrade: 'border-ambre bg-ambre/15',
  extend: 'border-orange-fonce/50 bg-orange-clair',
  leave: 'border-corail/50 bg-corail/10 text-canard/70 line-through decoration-corail/60',
};
const LINES: Line[] = ['GB', 'DEF', 'MIL', 'ATT'];

/** Vue d'ensemble de l'effectif : une ligne par secteur, chaque joueur avec son sort au mercato, et les postes à pourvoir. */
function SquadOverview({ r, needs }: { r: MercatoReport; needs: RecruitNeed[] }) {
  const { t } = useTranslation();
  const f = useFormat();
  const reason = useReason();
  type Item = { id: string; name: string; pos: PosCode | null; status: Status; note: string; title: string; rank: number };
  const items: Item[] = [
    ...r.advice.map((a) => {
      const status = STATUS_OF[a.verdict];
      const pos = a.project.pos ?? a.now.pos ?? a.player.positions[0] ?? null;
      const note =
        status === 'extend' ? (a.player.contractEnd ? f.date(a.player.contractEnd) : '') : status === 'leave' || status === 'upgrade' ? t(`fm.merc.verdict.${a.verdict}`) : a.verdict === 'develop' ? t('fm.merc.view.young') : '';
      return { id: a.player.id, name: a.player.name, pos, status, note, title: a.reasons.map(reason).join(' · '), rank: a.project.rank ?? a.now.rank ?? 99 };
    }),
    ...r.leaving.map((p) => ({ id: p.id, name: p.name, pos: p.positions[0] ?? null, status: 'leave' as Status, note: t('fm.merc.view.marked'), title: '', rank: 99 })),
  ];
  const lineItems = (l: Line) =>
    items
      .filter((x) => x.pos && lineOf(x.pos) === l)
      .sort((x, y) => STATUS_ORDER.indexOf(x.status) - STATUS_ORDER.indexOf(y.status) || POS_ORDER.indexOf(x.pos!) - POS_ORDER.indexOf(y.pos!) || x.rank - y.rank);
  const lineNeeds = (l: Line) => needs.filter((n) => lineOf(n.pos) === l).sort((x, y) => x.priority - y.priority);
  const count = (s: Status) => items.filter((x) => x.status === s).length;
  const urgentNeeds = needs.filter((n) => n.priority < 3).length;

  return (
    <section className="card" aria-labelledby="merc-view">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="merc-view" className="font-display text-xl font-semibold">{t('fm.merc.view.title')}</h2>
        <p className="text-sm text-brun">
          {t('fm.merc.view.summary', { total: items.length, stay: count('stay') + count('upgrade'), extend: count('extend'), leave: count('leave') })} · {needs.length ? t('fm.merc.view.needs', { count: needs.length }) : t('fm.merc.view.noNeeds')}
          {urgentNeeds > 0 && <> ({t('fm.merc.view.needsUrgent', { count: urgentNeeds })})</>}
        </p>
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-brun" aria-label={t('fm.merc.view.legend')}>
        {STATUS_ORDER.map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <span className={`inline-block h-3 w-5 rounded border ${CHIP[s]}`} /> {t(`fm.merc.view.status.${s}`)}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded border border-dashed border-canard/50" /> {t('fm.merc.view.status.need')}
        </li>
      </ul>
      <div className="mt-3 divide-y divide-canard/10 border-t border-canard/10">
        {LINES.map((l) => {
          const xs = lineItems(l);
          const ns = lineNeeds(l);
          const kept = xs.filter((x) => x.status !== 'leave').length;
          return (
            <div key={l} className="grid gap-2 py-3 sm:grid-cols-[9rem_1fr]">
              <div>
                <p className="font-bold">{t(`fm.line.${l}`)}</p>
                <p className="text-xs text-brun">{t('fm.merc.view.lineCount', { kept, total: xs.length })}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {xs.map((x) => (
                  <span key={x.id} title={x.title || undefined} className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm ${CHIP[x.status]}`}>
                    {x.pos && <span className="text-[11px] font-bold text-canard/60 no-underline">{POS_LABEL[x.pos]}</span>}
                    <span className="font-semibold">{x.name}</span>
                    {x.note && <span className="text-xs text-brun">{x.note}</span>}
                  </span>
                ))}
                {ns.map((n, i) => (
                  <span key={`n-${n.pos}-${i}`} className={`inline-flex items-center gap-1.5 rounded-md border border-dashed px-2 py-1 text-sm ${n.priority === 1 ? 'border-corail text-corail' : n.priority === 2 ? 'border-orange-fonce text-orange-fonce' : 'border-canard/40 text-brun'}`}>
                    <span className="text-[11px] font-bold">{POS_LABEL[n.pos]}</span>
                    <span className="font-semibold">{t('fm.merc.view.toRecruit')}</span>
                    <span className="text-xs">{t(`fm.needs.priority.${n.priority}`)}</span>
                  </span>
                ))}
                {!xs.length && !ns.length && <span className="text-sm text-brun">–</span>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Étoiles du staff « 1,5 ★ → 4 ★ » (niveau actuel → potentiel). */
function Stars({ p }: { p: FmPlayer }) {
  const { i18n } = useTranslation();
  const s = p.stars;
  if (!s || (s.current == null && s.potential == null)) return <span className="text-canard/40">–</span>;
  const n = (x: number | null) => (x == null ? '?' : x.toLocaleString(i18n.resolvedLanguage, { maximumFractionDigits: 1 }));
  return (
    <span className="whitespace-nowrap tabular-nums">
      {n(s.current)} ★ <span className="text-brun">→</span> <b>{n(s.potential)} ★</b>
    </span>
  );
}

/** Prix conseillé pour la liste des transferts : prix demandé et plancher, raisons en infobulle. */
function PriceTag({ a }: { a: MercatoAdvice }) {
  const { t } = useTranslation();
  const f = useFormat();
  const price = askingPrice(a.player, a.months);
  if (!price) return null;
  const why = [t('fm.price.value', { value: f.money(price.value) }), ...price.factors.map((x) => t(`fm.price.factor.${x}`))].join(' · ');
  return (
    <span className="rounded-md bg-orange-clair px-1.5 py-0.5 text-canard" title={why}>
      {t('fm.price.ask', { ask: f.money(price.ask), floor: f.money(price.floor) })}
    </span>
  );
}

/** Texte d'une raison du conseil mercato. */
export function useReason() {
  const { t, i18n } = useTranslation();
  return (x: MercatoReason) => {
    switch (x.id) {
      case 'surplus':
        return t('fm.merc.why.surplus', { pos: POS_LABEL[x.pos], rank: x.rank, count: x.need });
      case 'starterNow':
      case 'starterProject':
      case 'backupAt':
      case 'misfit':
        return t(`fm.merc.why.${x.id}`, { pos: POS_LABEL[x.pos] });
      case 'contract':
        return x.months <= 0 ? t('fm.contracts.expired') : t('fm.merc.why.contract', { count: x.months });
      case 'unwanted':
        return t('fm.merc.why.unwanted', { status: x.status });
      case 'potential':
        return t('fm.merc.why.potential', { stars: typeof x.stars === 'number' ? x.stars.toLocaleString(i18n.resolvedLanguage) : x.stars });
      case 'potentialPa':
        return t('fm.merc.why.potentialPa', { pa: x.pa, ca: x.ca });
      case 'overtakes':
        return t('fm.merc.why.overtakes', { count: x.years, starter: x.starter });
      case 'decline':
        return t('fm.merc.why.decline', { age: x.age });
      default:
        return t(`fm.merc.why.${x.id}`);
    }
  };
}

/** Une ligne joueur : nom, poste, âge, compatibilité, raisons ; étoiles, niveau projeté et valeur à droite. */
function AdviceLine({ a, tag, extra, after }: { a: MercatoAdvice; tag?: ReactNode; extra?: ReactNode; after?: ReactNode }) {
  const { t } = useTranslation();
  const f = useFormat();
  const reason = useReason();
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 border-b border-canard/5 py-2 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <PlayerLink player={a.player} /> <Pos player={a.player} />
          <span className="text-xs text-brun">{t('fm.contracts.age', { count: a.player.age ?? 0 })}</span>
          {a.player.team && <Tag>{a.player.team}</Tag>}
          <CompatTag c={a.compat} />
          <EngineTag v={engineValue(a.player)} />
          {tag}
        </div>
        <p className="mt-0.5 text-xs text-brun">{a.reasons.map(reason).join(' · ')}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-brun">
        {extra}
        <Stars p={a.player} />
        <span className="flex items-center gap-1">
          <Level value={a.player.level} />→<Level value={a.proj[1]} />
        </span>
        <span className="tabular-nums">{f.money(a.player.value)}</span>
      </div>
      {after && <div className="w-full">{after}</div>}
    </div>
  );
}

/** Adéquation moyenne des titulaires du onze cible. */
const xiFit = (pr: { slots: { fit: number | null }[] }) => {
  const xs = pr.slots.flatMap((s) => (s.fit == null ? [] : [s.fit]));
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
};

const CALL_TONE: Record<ContractCall, Tone> = { extend: 'good', extendShort: 'info', sellNow: 'warn', letGo: 'bad' };

/**
 * Contrats à décider : les fins de contrat à six mois ou moins (celles que FM27 envoie en message), avec pour
 * chacun la décision à prendre dans le jeu et pourquoi. Rien n'est affiché s'il n'y en a pas.
 */
export function ContractsToDecide({ r, go, gameDate, onMarked }: { r: MercatoReport; go?: (view: string) => void; gameDate: string; onMarked?: (id: string) => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  const list = useMemo(() => contractDecisions(r), [r]);
  if (!list.length) return null;
  const count = (c: ContractCall) => list.filter((d) => d.call === c).length;
  return (
    <Panel
      title={t('fm.decide.title', { count: list.length })}
      action={
        go && (
          <button type="button" className="text-sm font-bold text-orange-fonce hover:underline" onClick={() => go('mercato')}>
            {t('fm.views.mercato')} →
          </button>
        )
      }
    >
      <More>{t('fm.decide.help')}</More>
      <p className="mb-2 flex flex-wrap gap-1.5 text-sm">
        {CONTRACT_CALLS.filter(count).map((c) => (
          <Tag key={c} tone={CALL_TONE[c]}>
            {t(`fm.decide.call.${c}`)} · {count(c)}
          </Tag>
        ))}
      </p>
      {list.map(({ advice: a, call, years }) => (
        <AdviceLine
          key={a.player.id}
          a={a}
          tag={
            <Tag tone={CALL_TONE[call]}>
              {t(`fm.decide.call.${call}`)}
              {years ? ` · ${t('fm.decide.years', { count: years })}` : ''}
            </Tag>
          }
          extra={
            <>
              <LeaveButton player={a.player} gameDate={gameDate} onMarked={onMarked} />
              {call === 'sellNow' && <PriceTag a={a} />}
              <span className="tabular-nums">{t('fm.decide.wage', { wage: f.money(a.player.wage) })}</span>
            </>
          }
        />
      ))}
      <More>{t('fm.decide.legend')}</More>
    </Panel>
  );
}

/**
 * Départs et jeunes : qui faire partir (vente, fin de contrat, prêt), qui prolonger, et quels jeunes valent le coup.
 * Calculé sur l'effectif importé ; aucune lecture supplémentaire dans le jeu.
 */
export function FmMercato({ saveId, snap, players, folder, gameDate, history }: { saveId: string; snap?: FmSnapshot; players: FmPlayer[]; folder: string; gameDate: string; history: SquadAt[] }) {
  const { t } = useTranslation();
  const f = useFormat();
  const names = useNames();
  const { engine } = useTacticEngine(folder, players);
  const [coach] = useCoach();
  // Partants signalés : le mercato planifie sans eux ; un signalement lance la recherche de son remplaçant.
  const { ids: leavingIds, loanIds, marks } = useLeaving();
  const [justMarked, setJustMarked] = useState<string | null>(null);
  const r = useMemo(() => mercatoAdvice(engine, players, gameDate, coach, history, leavingIds, loanIds), [engine, players, gameDate, coach, history, leavingIds, loanIds]);
  // Onze cible, comme pour les cibles du mercato : sert au remplaçant d'un partant et au niveau de la division.
  const own = useMemo(() => players.filter((p) => !p.injury && Object.keys(p.attributes).length), [players]);
  const pr = useMemo(() => buildProject(engine, own, coach), [engine, own, coach]);
  // Liste de courses : partants sans remplaçant, trous du projet, titulaires à remplacer, successions, banc.
  const needs = useMemo(() => recruitmentNeeds(engine, players, gameDate, coach, history, leavingIds, loanIds), [engine, players, gameDate, coach, history, leavingIds, loanIds]);
  const [replacing, setReplacing] = useState<string | null>(null);
  // Cibles suivies (liste du jeu et ajouts de l'appli) : le vivier du plan pour atteindre la note visée.
  const { data: targetRows } = useQuery({ queryKey: ['fm', saveId, 'targets', gameDate], queryFn: () => fmData.targets(saveId) });
  const pool = useMemo(() => storedTargets(targetRows ?? [], players).filter((x) => !x.dismissed), [targetRows, players]);
  // Finances serrées : le mercato commence par les départs ; les recrues se cherchent libres ou en prêt.
  const fin = useMemo(() => (snap ? clubFinances(snap, players) : null), [snap, players]);
  const tight = useMemo(() => {
    if (!fin) return null;
    const st = financeState(fin);
    return st.tight ? { fin, signals: st.signals } : null;
  }, [fin]);
  if (!r) return <Empty>{t('fm.tac.noAttributes')}</Empty>;
  const style = engine.ref.styles.find((s) => s.id === r.projectStyle);

  const n = (v: MercatoVerdict) => r.byVerdict[v].length;
  const prospects = r.youth.filter((a) => a.prospect);
  // Chaque joueur n'apparaît qu'une fois : les jeunes sont dans leur cadre (avec leur étiquette), pas aussi dans les groupes.
  const youthIds = new Set(r.youth.map((a) => a.player.id));
  const rest = (v: MercatoVerdict) => r.byVerdict[v].filter((a) => !youthIds.has(a.player.id));

  return (
    <div className="space-y-4">
      <MercatoPlan r={r} pr={pr} engine={engine} pool={pool} needs={needs?.needs ?? []} fin={fin} gameDate={gameDate} onMarked={setJustMarked} />
      {/* Le reste (jeunes, recherche de remplaçants, niveau de la division…) replié : l'écran tient sur une page. */}
      <details className="group">
        <summary className="cursor-pointer text-sm font-bold text-orange-fonce hover:underline">
          <span className="group-open:hidden">{t('fm.merc.board.detailOpen')}</span>
          <span className="hidden group-open:inline">{t('fm.merc.board.detailClose')}</span>
        </summary>
        <div className="mt-4 space-y-4">
      {/* Finances serrées : l'adjoint le dit déjà en tête ; le détail reste à portée, replié. */}
      {tight && (
        <details className="card group p-5">
          <summary className="cursor-pointer list-none font-bold [&::-webkit-details-marker]:hidden">
            {t('fm.tight.title')} <span className="text-sm font-normal text-orange-fonce group-open:hidden">· {t('fm.tight.more')}</span>
          </summary>
          <p className="text-sm">
            {t('fm.tight.signals', {
              list: tight.signals.map((sg) => t(`fm.tight.signal.${sg}`, { amount: f.money(Math.abs((sg === 'wageOver' ? tight.fin.wageRoom : sg === 'debt' ? tight.fin.balance : 0) ?? 0)) })).join(', '),
            })}
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            <li>{t('fm.tight.sellFirst', { count: n('sell') + n('release') + n('loan'), income: f.money(r.income), wages: f.money(r.wagesFreed) })}</li>
            <li>{t('fm.tight.freeOrLoan')}</li>
            <li>{t('fm.tight.youth', { count: prospects.length })}</li>
            {tight.signals.includes('wageOver') && <li>{t('fm.tight.noRaise')}</li>}
          </ul>
        </details>
      )}
      {pr && r.leaving.length > 0 && (
        <Panel title={t('fm.leave.title', { count: r.leaving.length })}>
          <More>{t('fm.leave.help')}</More>
          {r.leaving.map((p) => (
            <div key={p.id} className="border-b border-canard/5 py-2 last:border-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <PlayerLink player={p} /> <Pos player={p} />
                <span className="text-xs text-brun">{t('fm.contracts.age', { count: p.age ?? 0 })}</span>
                <LeaveButton player={p} gameDate={gameDate} />
                {marks[p.id] && <span className="text-xs text-brun">{t('fm.leave.since', { date: f.date(marks[p.id]!.since) })}</span>}
              </div>
              <ReplacementFinder
                saveId={saveId}
                gameDate={gameDate}
                engine={engine}
                project={pr}
                leaving={p}
                squad={own.filter((x) => !leavingIds.has(x.id))}
                autoSearch={justMarked === p.id}
                finances={fin}
              />
            </div>
          ))}
        </Panel>
      )}
      <ContractsToDecide r={r} gameDate={gameDate} onMarked={setJustMarked} />
      {/* Compteurs : seuls ceux qui ne sont pas à zéro, un zéro n'appelle aucune décision. */}
      {(() => {
        const off = r.advice.filter((a) => a.compat?.compat === 'no').length;
        const tiles = [
          r.income > 0 && <Kpi key="income" label={t('fm.merc.kpi.income')} value={f.money(r.income)} sub={t('fm.merc.kpi.incomeSub', { wages: f.money(r.wagesFreed) })} />,
          prospects.length > 0 && <Kpi key="prospects" label={t('fm.merc.kpi.prospects')} value={prospects.length} sub={n('loan') > 0 ? t('fm.merc.kpi.prospectsSub', { loan: n('loan') }) : undefined} />,
          off > 0 && <Kpi key="off" label={t('fm.merc.kpi.off')} value={off} sub={t('fm.merc.kpi.offSub')} />,
        ].filter(Boolean);
        return tiles.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{tiles}</div> : null;
      })()}
      <More>{t('fm.merc.help', { form: r.nowForm ?? '–', style: names.style(style), projectForm: r.projectForm ?? '–' })}</More>

      {needs && <div id="merc-needs" className="scroll-mt-28"><NeedsPanel needs={needs.needs} saveId={saveId} gameDate={gameDate} engine={engine} project={pr} squad={own.filter((x) => !leavingIds.has(x.id))} finances={fin} /></div>}

      <Panel title={t('fm.merc.youth', { count: r.youth.length })}>
        {r.youth.length ? r.youth.map((a) => <AdviceLine key={a.player.id} a={a} tag={<Tag tone={TONE[a.verdict]}>{t(`fm.merc.verdict.${a.verdict}`)}</Tag>} />) : <Empty>{t('fm.merc.noYouth')}</Empty>}
        <More>{t('fm.merc.youthHelp')}</More>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        {ACTION.filter((v) => rest(v).length).map((v) => (
          <Panel key={v} title={t(`fm.merc.group.${v}`, { count: rest(v).length })}>
            <p className="help">{t(`fm.merc.groupHelp.${v}`)}</p>
            {rest(v).map((a) =>
              pr && REPLACE.includes(v) ? (
                <AdviceLine
                  key={a.player.id}
                  a={a}
                  tag={
                    replacing !== a.player.id && (
                      <button type="button" className="text-xs font-bold text-orange-fonce hover:underline" onClick={() => setReplacing(a.player.id)}>
                        {t('fm.repl.open')}
                      </button>
                    )
                  }
                  extra={
                    <>
                      {v === 'sell' && <PriceTag a={a} />}
                      <LeaveButton player={a.player} gameDate={gameDate} onMarked={setJustMarked} />
                    </>
                  }
                  after={
                    replacing === a.player.id && (
                      <ReplacementFinder saveId={saveId} gameDate={gameDate} engine={engine} project={pr} leaving={a.player} squad={own} onClose={() => setReplacing(null)} finances={fin} />
                    )
                  }
                />
              ) : (
                <AdviceLine key={a.player.id} a={a} />
              ),
            )}
          </Panel>
        ))}
      </div>

      {pr && <DivisionLevelPanel engine={engine} project={pr} ownXiFit={xiFit(pr)} />}

      <Panel title={t('fm.merc.stay')}>
        <p className="help">{t('fm.merc.stayNoYouth')}</p>
        {MERCATO_ORDER.filter((v) => !ACTION.includes(v) && rest(v).length).map((v) => (
          <div key={v} className="mb-2 last:mb-0">
            <p className="mb-1 text-sm">
              <Tag tone={TONE[v]}>{t(`fm.merc.verdict.${v}`)}</Tag> <span className="text-brun">{t(`fm.merc.groupHelp.${v}`)}</span>
            </p>
            <p className="text-sm">{rest(v).map((a) => a.player.name).join(', ')}</p>
          </div>
        ))}
      </Panel>
        </div>
      </details>
    </div>
  );
}
