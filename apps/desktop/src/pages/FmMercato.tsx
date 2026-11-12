import { CONTRACT_CALLS, MERCATO_ORDER, POS_LABEL, askingPrice, buildProject, clubFinances, contractDecisions, engineValue, financeState, mercatoAdvice, recruitmentNeeds, type ContractCall, type FmPlayer, type FmSnapshot, type MercatoAdvice, type MercatoReason, type MercatoReport, type MercatoVerdict, type RecruitNeed, type SquadAt, type ClubFinances } from '@fm-immersion/module-fm';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useTacticEngine } from './FmTactic';
import { LeaveButton, useLeaving } from './FmLeaving';
import { NeedsPanel } from './FmNeeds';
import { DivisionLevelPanel, ReplacementFinder } from './FmReplacement';
import { CompatTag, EngineTag, Empty, Kpi, Level, Panel, Pos, Tag, useCoach, useFormat, useNames, type Tone, More, PlayerLink } from './FmUi';

export const TONE: Record<MercatoVerdict, Tone> = { sell: 'bad', release: 'bad', loan: 'warn', extend: 'warn', develop: 'good', replace: 'warn', backup: 'info', core: 'good' };
/** Groupes affichés en détail : ce qui demande une décision au mercato. */
const ACTION: MercatoVerdict[] = ['sell', 'release', 'loan', 'extend', 'replace'];
/** Groupes où l'on cherche un remplaçant : le joueur part, ou il faut mieux à son poste. */
const REPLACE: MercatoVerdict[] = ['sell', 'release', 'replace'];

/** Fins de contrat à six mois ou moins : à régler avant que le joueur puisse signer ailleurs. */
const URGENT_MONTHS = 6;
/** Lignes montrées par colonne avant « + N autres ». */
const COLUMN_ROWS = 5;

/** Une décision du bureau : une ligne (poste ou joueur, étiquette), une raison courte, le détail au clic. */
type BoardRow = { key: string; head: ReactNode; tag: ReactNode; line: string; detail: ReactNode };

/** Une colonne du bureau : titre, compteur, une ligne par décision ; un clic ouvre la ligne, « + N autres » déplie. */
function BoardColumn({ title, rows, empty }: { title: string; rows: BoardRow[]; empty: string }) {
  const { t } = useTranslation();
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const shown = all ? rows : rows.slice(0, COLUMN_ROWS);
  return (
    <section className="card min-w-0 !p-3">
      <h3 className="mb-1 flex items-center justify-between px-1 text-xs font-extrabold uppercase tracking-widest text-canard">
        {title} <span className="rounded-full bg-canard px-2 text-white">{rows.length}</span>
      </h3>
      {rows.length ? (
        <ul className="divide-y divide-canard/10">
          {shown.map((row) => {
            const isOpen = open === row.key;
            return (
              <li key={row.key}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : row.key)}
                  className={`w-full rounded-md px-1 py-1.5 text-left hover:bg-orange-clair/50 ${isOpen ? 'bg-orange-clair/50' : ''}`}
                >
                  <span className="flex items-center gap-2">
                    <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate font-bold">{row.head}</span>
                    <span className="shrink-0">{row.tag}</span>
                  </span>
                  <span className="block truncate text-xs text-brun">{row.line}</span>
                </button>
                {isOpen && <div className="space-y-1.5 px-1 pb-2 text-sm">{row.detail}</div>}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-1 py-2 text-sm text-brun">{empty}</p>
      )}
      {rows.length > COLUMN_ROWS && (
        <button type="button" className="mt-1 px-1 text-sm font-bold text-orange-fonce hover:underline" onClick={() => setAll(!all)}>
          {all ? t('fm.merc.board.less') : t('fm.merc.board.more', { count: rows.length - COLUMN_ROWS })}
        </button>
      )}
    </section>
  );
}

/**
 * Le bureau du mercato (version A choisie par le joueur), fait pour tenir sur un écran : l'argent disponible en une
 * bande, puis trois colonnes (faire venir, faire partir, prolonger), une ligne par décision ; le détail s'ouvre au clic.
 */
function MercatoBoard({ r, needs, fin, gameDate, onMarked }: { r: MercatoReport; needs: RecruitNeed[]; fin: ClubFinances | null; gameDate: string; onMarked: (id: string) => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  const reason = useReason();
  const attr = (k: string) => t(`fm.attr.${k}`, { defaultValue: k });
  const arrivals: BoardRow[] = needs.map((n, i) => {
    const why = n.why[0] ? t(`fm.needs.why.${n.why[0]}`, { name: n.player?.name ?? '' }) : '';
    return {
      key: `need-${n.pos}-${i}`,
      head: (
        <>
          <span className="pill">{POS_LABEL[n.pos]}</span>
          {n.player && <span className="truncate font-normal text-brun">{n.player.name}</span>}
        </>
      ),
      tag: <Tag tone={n.priority === 1 ? 'bad' : n.priority === 2 ? 'warn' : undefined}>{t(`fm.needs.priority.${n.priority}`)}</Tag>,
      line: why,
      detail: (
        <>
          {n.why.length > 1 && <p>{n.why.slice(1).map((w) => t(`fm.needs.why.${w}`, { name: n.player?.name ?? '' })).join(' ')}</p>}
          {n.attrs.length > 0 && <p className="text-brun">{t('fm.needs.attrs', { list: n.attrs.map(attr).join(', ') })}</p>}
          {n.player && <PlayerLink player={n.player} />}
        </>
      ),
    };
  });
  const departures: BoardRow[] = (['sell', 'release', 'loan'] as const).flatMap((v) =>
    r.byVerdict[v].map((a) => ({
      key: `${v}-${a.player.id}`,
      head: (
        <>
          <span className="truncate">{a.player.name}</span> <Pos player={a.player} />
        </>
      ),
      tag: <Tag tone={TONE[v]}>{t(`fm.merc.verdict.${v}`)}</Tag>,
      line: a.reasons[0] ? reason(a.reasons[0]) : '',
      detail: (
        <>
          <p className="text-brun">{a.reasons.map(reason).join(' · ')}</p>
          <p className="flex flex-wrap items-center gap-2">
            <PlayerLink player={a.player} />
            {v === 'sell' && <PriceTag a={a} />}
            <LeaveButton player={a.player} gameDate={gameDate} onMarked={onMarked} />
          </p>
        </>
      ),
    })),
  );
  const extensions: BoardRow[] = [...r.byVerdict.extend]
    .sort((x, y) => (x.months ?? 99) - (y.months ?? 99))
    .map((a) => {
      const urgent = a.months != null && a.months <= URGENT_MONTHS;
      return {
        key: `extend-${a.player.id}`,
        head: (
          <>
            <span className="truncate">{a.player.name}</span> <Pos player={a.player} />
          </>
        ),
        tag: urgent ? <Tag tone="bad">{t('fm.merc.board.urgent')}</Tag> : null,
        line: [t('fm.contracts.age', { count: a.player.age ?? 0 }), a.player.contractEnd ? t('fm.merc.board.until', { date: f.date(a.player.contractEnd) }) : null].filter(Boolean).join(' · '),
        detail: (
          <>
            <p className="text-brun">{a.reasons.map(reason).join(' · ')}</p>
            <PlayerLink player={a.player} />
          </>
        ),
      };
    });
  const red = 'text-corail';
  return (
    <div className="space-y-3">
      {fin && (
        <div className="card flex flex-wrap items-center gap-x-8 gap-y-2 !px-4 !py-3">
          <p>
            <span className="block text-xs font-bold uppercase tracking-wide text-canard/60">{t('fm.merc.board.transfer')}</span>
            <span className={`font-display text-xl font-semibold tabular-nums ${fin.transferBudget != null && fin.transferBudget <= 0 ? red : ''}`}>{f.money(fin.transferBudget)}</span>
          </p>
          <p>
            <span className="block text-xs font-bold uppercase tracking-wide text-canard/60">{t('fm.merc.board.wageRoom')}</span>
            <span className={`font-display text-xl font-semibold tabular-nums ${fin.wageRoom != null && fin.wageRoom < 0 ? red : ''}`}>
              {fin.wageRoom == null ? f.money(null) : f.money(Math.abs(fin.wageRoom))}
            </span>{' '}
            <span className="text-xs text-brun">{t(fin.wageRoom != null && fin.wageRoom < 0 ? 'fm.merc.board.wageOver' : 'fm.merc.board.wageLeft')}</span>
          </p>
          <p>
            <span className="block text-xs font-bold uppercase tracking-wide text-canard/60">{t('fm.merc.board.balance')}</span>
            <span className={`font-display text-xl font-semibold tabular-nums ${fin.balance != null && fin.balance < 0 ? red : ''}`}>{f.money(fin.balance)}</span>
          </p>
        </div>
      )}
      <div className="grid items-start gap-3 lg:grid-cols-3">
        <BoardColumn title={t('fm.merc.board.in')} rows={arrivals} empty={t('fm.merc.board.noIn')} />
        <BoardColumn title={t('fm.merc.board.out')} rows={departures} empty={t('fm.merc.board.noOut')} />
        <BoardColumn title={t('fm.merc.board.extend')} rows={extensions} empty={t('fm.merc.board.noExtend')} />
      </div>
      <p className="text-xs text-brun">{t('fm.merc.board.hint')}</p>
    </div>
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
      <MercatoBoard r={r} needs={needs?.needs ?? []} fin={fin} gameDate={gameDate} onMarked={setJustMarked} />
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
