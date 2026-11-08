import {
  CLUB_STATUSES,
  CONDITION_LEVELS,
  PART_TIME_DAYS,
  TRAINING_PHASES,
  addDays,
  autoPhase,
  buildProject,
  buildTrainingWeek,
  effectiveness,
  individualAdvice,
  matchStats,
  statsBoard,
  mentoringGroups,
  seasonWeeks,
  firstTeamBar,
  youthTeams,
  youthWeek,
  type YouthStatus,
  calendarFixtures,
  weekWorkload,
  nearestPreset,
  defaultMatchDays,
  mondayOf,
  sessionCategory,
  setupStatus,
  trainingFor,
  weekLoad,
  snapshotFixtures,
  weekMatches,
  type ClubStatus,
  type CycleWeek,
  type EffArea,
  type FmPlayer,
  type FmSnapshot,
  type IndividualIntensity,
  type IndividualSetup,
  type SetupField,
  type SetupStatus,
  type TacticEngine,
  type WorkPlan,
  type SessionCategory,
  type SessionId,
  type TrainingPhase,
  HARVEST_WEEK_YIELD,
  SESSION_YIELD,
  DEFAULT_METHOD,
  coachFocus,
  teamIntensityFor,
  trainingYield,
  yieldDaysMissing,
  type SquadAt,
} from '@fm-immersion/module-fm';
import { useContext, useMemo, useState, type ReactNode } from 'react';
import type { SeasonWeekKind } from '@fm-immersion/module-fm';
import { useTranslation } from 'react-i18next';
import { readScoped, useFmSaveScope, writeScoped } from '../lib/save-store';
import { ReserveContext, useTacticEngine } from './FmTactic';
import { Chips, Fit, Panel, Pos, Tag, useCoach, useFormat, useNames, More, PlayerLink, SectionTabs } from './FmUi';

/** Couleur des pastilles par catégorie de séance (texte toujours canard, sauf le match en bouton principal). */
const CAT_CLS: Record<SessionCategory, string> = {
  physical: 'bg-brun/15 text-canard',
  tactical: 'bg-canard/15 text-canard',
  matchPrep: 'bg-eau/60 text-canard',
  ballWork: 'bg-eau/20 text-canard',
  individual: 'bg-white text-canard ring-1 ring-canard/20',
  extra: 'bg-creme text-brun ring-1 ring-brun/30',
  match: 'bg-eau-fonce text-white',
};
/** Semaines montrées avant « Voir toute la saison ». */
const SEASON_PREVIEW = 8;
const KIND_TONE: Record<SeasonWeekKind, 'good' | 'info' | 'warn' | 'bad'> = {
  preseason: 'info',
  tactical: 'info',
  break: 'good',
  free: 'good',
  single: 'info',
  double: 'warn',
  congested: 'bad',
  offseason: 'good',
};
const CATS: SessionCategory[] = ['tactical', 'ballWork', 'matchPrep', 'physical', 'individual', 'extra'];

function Session({ id }: { id: SessionId }) {
  const { t } = useTranslation();
  return <span className={`block rounded-lg px-2 py-1 text-xs font-bold leading-tight ${CAT_CLS[sessionCategory(id)]}`}>{t(`fm.train.session.${id}`)}</span>;
}

/**
 * Réglages individuels notés comme faits en jeu, par partie (retenus sur ce PC).
 * Ils étaient rangés par dossier du plugin, commun à toutes les parties : la plus ancienne partie les reprend.
 */
const SETUP_KEY = 'fmi.individual';
export function useAppliedSetups(folder: string) {
  const scope = useFmSaveScope();
  const [applied, setApplied] = useState(() => readScoped<Record<string, IndividualSetup>>(SETUP_KEY, scope, {}, `${SETUP_KEY}.${folder}`));
  const save = (next: Record<string, IndividualSetup>) => {
    setApplied(next);
    writeScoped(SETUP_KEY, scope, next);
  };
  return [applied, save] as const;
}

export interface SetupRow {
  plan: WorkPlan;
  rec: IndividualSetup;
  advice: ReturnType<typeof individualAdvice>;
  status: SetupStatus;
  changed: SetupField[];
  /** Priorité choisie d'après les stats de match (centre de données) plutôt que les attributs du rôle. */
  focusFromStats: boolean;
}
const STATUS_ORDER: Record<SetupStatus, number> = { change: 0, todo: 1, ok: 2 };

/** Conseil individuel du jour pour chaque joueur, comparé à ce qui est réglé en jeu. */
/** Séances de la table de rendement, par famille (voir `SESSION_YIELD`). */
const YIELD_GROUPS = {
  physical: ['conditioning', 'heavyConditioning', 'lightConditioning', 'recovery', 'rest'],
  ball: ['possessionBallWork', 'attackingBalanced', 'defendingBalanced', 'individualDevelopment'],
  tactical: ['pressingTrap', 'buildUpStrategy', 'chanceCreation', 'inPossessionShape', 'teamBonding'],
} as const;

export function useIndividualSetups(engine: TacticEngine, players: FmPlayer[], folder: string, matches: number, snap?: FmSnapshot) {
  const [coach] = useCoach();
  // Point le plus faible en match (bas de sa ligne, assez de minutes) : il passe avant l'attribut le plus faible du rôle.
  const statFocus = useMemo(() => {
    const out = new Map<string, string>();
    if (!snap) return out;
    for (const r of statsBoard(players, matchStats(snap)).players) if (r.focus) out.set(r.player.id, r.focus);
    return out;
  }, [players, snap]);
  const [applied, save] = useAppliedSetups(folder);
  const list = useMemo(() => players.filter((p) => Object.keys(p.attributes).length), [players]);
  const project = useMemo(() => buildProject(engine, list, coach), [engine, list, coach]);
  const rows = useMemo<SetupRow[]>(() => {
    if (!project) return [];
    return project.plans
      .map((x) => {
        const advice = individualAdvice(x.player, { matches });
        const ip = x.slot ? (engine.roles.get(x.slot.ip) ?? null) : x.phase === 'ip' ? x.role : null;
        const oop = x.slot ? (engine.roles.get(x.slot.oop) ?? null) : x.phase === 'oop' ? x.role : null;
        const fromStats = statFocus.get(x.player.id) ?? null;
        const rec: IndividualSetup = {
          ip: ip?.code ?? null,
          oop: oop?.code ?? null,
          focus: coachFocus(x.player, x.weak, fromStats),
          intensity: advice.intensity,
        };
        return { plan: x, rec, advice, focusFromStats: !!fromStats, ...setupStatus(rec, applied[x.player.id]) };
      })
      .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  }, [project, engine, matches, applied, statFocus]);
  const mark = (ids: string[], on: boolean) => {
    const next = { ...applied };
    for (const r of rows) if (ids.includes(r.plan.player.id)) on ? (next[r.plan.player.id] = r.rec) : delete next[r.plan.player.id];
    save(next);
  };
  return { rows, applied, mark };
}

/** Semaine d'entraînement type (méthode « Freedom » de FM Scout) adaptée au calendrier et au style visé. */
const INTENSITY_TONE: Record<IndividualIntensity, 'good' | 'info' | 'warn' | 'bad'> = { team: 'info', noWork: 'bad', rest: 'warn', half: 'warn', normal: 'info', double: 'good' };

export function FmTraining({ snap, players, folder, history = [] }: { snap: FmSnapshot; players: FmPlayer[]; folder: string; history?: SquadAt[] }) {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const { engine } = useTacticEngine(folder, players);
  const [coach, setCoach] = useCoach();
  const seasonStart = coach.seasonStart ?? 8;
  const clubStatus: ClubStatus = coach.clubStatus ?? 'pro';
  // Une seule proposition : le programme FM Immersion (progression mesurée + efficacité tactique + calendrier).
  const method = DEFAULT_METHOD;
  const teamIntensity = teamIntensityFor(method);
  const nf1 = new Intl.NumberFormat(i18n.resolvedLanguage, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const trainingDays = clubStatus === 'pro' ? undefined : coach.trainingDays ?? PART_TIME_DAYS;
  // Semaine affichée, en semaines après la semaine en cours (0 = cette semaine) ; la vue saison permet d'en choisir une.
  const [offset, setOffset] = useState('0');
  const [allSeason, setAllSeason] = useState(false);
  const [phaseOverride, setPhase] = useState<TrainingPhase | null>(null);
  const [weekOverride, setWeek] = useState<CycleWeek | null>(null);
  const [manualDays, setManualDays] = useState<number[] | null>(null);
  const [eve, setEve] = useState<boolean | null>(null);

  const monday = addDays(mondayOf(snap.gameDate), Number(offset) * 7);
  const winterBreak = coach.winterBreak ?? null;
  const auto = autoPhase(monday, seasonStart, winterBreak);
  const phase = phaseOverride ?? auto.phase;
  const week = weekOverride ?? (phaseOverride && phaseOverride !== auto.phase ? 1 : auto.week);
  const fixtures = useMemo(() => snapshotFixtures(snap), [snap]);
  // Calendrier complet lu par le plugin (toute la saison) : une semaine sans match connu n'a pas de match.
  const calendarComplete = useMemo(() => calendarFixtures(snap).length > 0, [snap]);
  // Au-delà du dernier match connu du calendrier, on revient aux jours cochés.
  const hasCalendar = calendarComplete || fixtures.some((f) => f.date >= monday);
  const cal = useMemo(() => weekMatches(fixtures, monday), [fixtures, monday]);
  const matchDays = manualDays ?? (hasCalendar ? cal.days : defaultMatchDays(phase, week, phase === 'A' || phase === 'B' || phase === 'C' ? 1 : 0));
  const before = eve ?? (hasCalendar ? cal.before : false);

  const style = engine.ref.styles.find((s) => s.id === coach.style) ?? engine.ref.styles[0];
  // Zones à travailler : la n° 1 du style visé, puis les zones les moins comprises d'après le jeu, puis le reste du style.
  const styleAreas = style ? trainingFor(style) : [];
  const gauges = effectiveness(snap);
  const weakest = gauges?.weakest ?? [];
  const gaugesKnown = !!gauges;
  // Puis ce que montrent les matchs (centre de données : passes ratées, pressing inefficace…).
  const fromMatches = useMemo(() => statsBoard(players, matchStats(snap)).areas, [players, snap]);
  const priorities = [...new Set<EffArea>([...styleAreas.slice(0, 1), ...weakest, ...fromMatches, ...styleAreas])];
  const names = useNames();
  const mentoring = useMemo(() => mentoringGroups(players), [players]);
  const attr = (k: string) => t(`fm.attr.${k}`, { defaultValue: k });
  const season = useMemo(
    () => seasonWeeks({ gameDate: snap.gameDate, fixtures, seasonStart, winterBreak, trainingDays, priorities, style: style?.id, method, weakAreas: weakest, gaugesKnown, calendarComplete }),
    [snap.gameDate, fixtures, calendarComplete, seasonStart, winterBreak?.from, winterBreak?.to, trainingDays?.join(), priorities.join(), style?.id, method, weakest.join(), gaugesKnown],
  );
  const plan = useMemo(
    () => buildTrainingWeek({ monday, phase, week, matchDays, matchBeforeMonday: before, priorities, style: style?.id, trainingDays, method, weakAreas: weakest, gaugesKnown }),
    [monday, phase, week, matchDays.join(), before, priorities.join(), style?.id, trainingDays?.join(), method, weakest.join(), gaugesKnown],
  );
  const load = weekLoad(plan);
  // Résumé de la semaine : séances tactiques (efficacité), séances de progression (attributs), matchs.
  const whys = plan.days.flatMap((d) => d.why ?? []);
  const summary = {
    tactical: whys.filter((w) => w === 'press' || w === 'weak' || w === 'top').length,
    grow: whys.filter((w) => w === 'grow' || w === 'noCondition' || w === 'indiv').length,
    matches: plan.days.filter((d) => d.kind === 'match').length,
  };
  const resetWeek = () => {
    setManualDays(null);
    setEve(null);
  };
  const toggleDay = (d: number) => setManualDays(matchDays.includes(d) ? matchDays.filter((x) => x !== d) : [...matchDays, d].sort());
  const label = 'flex flex-col text-xs font-bold text-canard/70';
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const monthName = new Intl.DateTimeFormat(i18n.resolvedLanguage, { month: 'long' });
  const dayMonth = new Intl.DateTimeFormat(i18n.resolvedLanguage, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const setups = useIndividualSetups(engine, players, folder, plan.days.filter((d) => d.kind === 'match').length, snap);
  const todoCount = setups.rows.filter((r) => r.status !== 'ok').length;
  const changeCount = setups.rows.filter((r) => r.status === 'change').length;
  // Phrases de l'adjoint : zones tactiques de la semaine (hors pièges), rendement mesuré sur les instantanés.
  const zones = [...new Set(plan.days.flatMap((d) => d.sessions.filter((x, i) => x && x !== 'pressingTrap' && (d.why?.[i] === 'weak' || d.why?.[i] === 'top'))))] as SessionId[];
  const zoneList = [t('fm.train.session.pressingTrap'), ...zones.map((z) => t(`fm.train.session.${z}`))].join(', ');
  const measured = useMemo(() => trainingYield(history), [history]);
  const missingDays = useMemo(() => yieldDaysMissing(history), [history]);
  const signed = new Intl.NumberFormat(i18n.resolvedLanguage, { maximumFractionDigits: 1, signDisplay: 'exceptZero' });
  const seasonal = 'ABC'.includes(plan.phase);
  const workload = weekWorkload(plan);
  const settingsSummary = t('fm.train.settingsSummary', {
    phase: `${t(`fm.train.phase.${plan.phase}`)} ${plan.week}`,
    status: t(`fm.train.status.${clubStatus}`),
    month: monthName.format(new Date(2026, seasonStart - 1, 1)),
    winter: winterBreak ? t('fm.train.settingsWinter') : '',
  });

  return (
    <SectionTabs
      id="training"
      sections={[
        {
          id: 'week',
          label: t('fm.train.sections.week'),
          node: (
            <>
              <Panel title={t('fm.train.coach.title')}>
                <p className="text-sm text-brun">{t('fm.train.coach.week', { date: dayMonth.format(new Date(`${monday}T00:00:00Z`)), code: plan.code })}</p>
                <p className="mt-1 text-base font-bold text-canard">
                  {plan.congested
                    ? t('fm.train.coach.congested', { matches: summary.matches })
                    : seasonal
                      ? summary.matches
                        ? t('fm.train.coach.season', { matches: summary.matches, tactical: summary.tactical, grow: summary.grow, zones: zoneList })
                        : t('fm.train.coach.noMatch', { tactical: summary.tactical, grow: summary.grow, zones: zoneList })
                      : t(`fm.train.phaseHelp.${plan.phase}`)}
                </p>
                <ul className="mt-2 space-y-1 text-sm">
                  <li>{workload ? t('fm.train.coach.inGame', { preset: t(`fm.train.preset.${nearestPreset(plan)}`), workload: t(`fm.train.workload.${workload}`) }) : t('fm.train.coach.inGameRest', { preset: t(`fm.train.preset.${nearestPreset(plan)}`) })}</li>
                  <li>{t('fm.train.coach.intensity')}</li>
                  {setups.rows.length > 0 && (
                    <li>
                      {todoCount ? <Tag tone="warn">{t('fm.train.coach.setups', { count: todoCount })}</Tag> : <span className="text-brun">{t('fm.train.coach.setupsOk')}</span>}
                    </li>
                  )}
                </ul>
                <div className="mt-3 rounded-xl bg-white/60 p-3 ring-1 ring-canard/10">
                  <p className="text-xs font-bold uppercase tracking-wide text-canard/50">{t('fm.train.coach.yieldTitle')}</p>
                  {measured ? (
                    <>
                      <p className="mt-1 text-sm">
                        {t('fm.train.coach.yield', { from: f.date(measured.from), to: f.date(measured.to), days: measured.days, players: measured.players, delta: signed.format(measured.perPlayer), month: signed.format(measured.perMonth), expected: signed.format(measured.expectedPerMonth) })}
                      </p>
                      <p className="mt-1 text-sm font-bold">
                        <Tag tone={measured.verdict === 'good' ? 'good' : measured.verdict === 'bad' ? 'bad' : 'warn'}>{t(`fm.train.coach.yieldVerdict.${measured.verdict}`)}</Tag>
                      </p>
                      <p className="mt-1 text-xs text-brun">
                        {t('fm.train.coach.yieldGroups', { technical: signed.format(measured.groups.technical), mental: signed.format(measured.groups.mental), physical: signed.format(measured.groups.physical) })}
                        {measured.young != null && measured.senior != null && <> {t('fm.train.coach.yieldAges', { young: signed.format(measured.young), senior: signed.format(measured.senior) })}</>}
                      </p>
                      {measured.attrs.length > 0 && measured.attrs[0]!.delta > 0 && (
                        <p className="mt-1 text-xs text-brun">{t('fm.train.coach.yieldAttrs', { list: measured.attrs.filter((a) => a.delta > 0).slice(0, 4).map((a) => `${attr(a.key)} ${signed.format(a.delta)}`).join(', ') })}</p>
                      )}
                      {measured.up.length > 0 && (
                        <p className="mt-1 text-xs text-eau-fonce">{t('fm.train.coach.yieldUp', { list: measured.up.slice(0, 5).map((g) => `${g.player.name} ${signed.format(g.delta)}`).join(', ') })}</p>
                      )}
                      {measured.down.length > 0 && (
                        <p className="mt-1 text-xs text-corail">{t('fm.train.coach.yieldDown', { list: measured.down.slice(0, 5).map((g) => `${g.player.name} ${signed.format(g.delta)}`).join(', ') })}</p>
                      )}
                    </>
                  ) : (
                    <p className="mt-1 text-sm text-brun">{t('fm.train.coach.yieldSoon', { count: Math.max(1, missingDays) })}</p>
                  )}
                  <More>{t('fm.train.coach.yieldHelp')}</More>
                </div>
              </Panel>

              <details className="rounded-2xl bg-white/40 ring-1 ring-canard/10">
                <summary className="cursor-pointer select-none px-4 py-3 text-sm font-bold text-canard/70 hover:text-canard">
                  {t('fm.train.settings')} <span className="font-normal text-brun">· {settingsSummary}</span>
                </summary>
              <Panel title={t('fm.train.title')}>
                <div className="flex flex-wrap items-end gap-4">
                  <div className={label}>
                    {t('fm.train.which')}
                    <div className="mt-1">
                      <Chips
                        value={offset}
                        options={[
                          ['0', t('fm.train.thisWeek')],
                          ['1', t('fm.train.nextWeek')],
                          ...(Number(offset) > 1 ? ([[offset, t('fm.train.weekOfDate', { date: dayMonth.format(new Date(`${monday}T00:00:00Z`)) })]] as [string, string][]) : []),
                        ]}
                        onChange={(v) => {
                          setOffset(v);
                          resetWeek();
                          setWeek(null);
                        }}
                      />
                    </div>
                  </div>
                  <label className={label}>
                    {t('fm.train.phaseLabel')}
                    <select
                      className="input mt-1"
                      value={phaseOverride ?? ''}
                      onChange={(e) => {
                        setPhase((e.target.value || null) as TrainingPhase | null);
                        setWeek(null);
                        resetWeek();
                      }}
                    >
                      <option value="">{t('fm.train.auto', { code: `${t(`fm.train.phase.${auto.phase}`)} ${auto.week}` })}</option>
                      {TRAINING_PHASES.map((p) => (
                        <option key={p} value={p}>
                          {t(`fm.train.phase.${p}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={label}>
                    {t('fm.train.cycleWeek')}
                    <select className="input mt-1" value={week} onChange={(e) => setWeek(Number(e.target.value) as CycleWeek)}>
                      {[1, 2, 3, 4].map((w) => (
                        <option key={w} value={w}>
                          {phase}
                          {w}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={label}>
                    {t('fm.train.seasonStart')}
                    <select className="input mt-1" value={seasonStart} onChange={(e) => setCoach({ seasonStart: Number(e.target.value) })}>
                      {months.map((m) => (
                        <option key={m} value={m}>
                          {monthName.format(new Date(2026, m - 1, 1))}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className={label}>
                    {t('fm.train.clubStatus')}
                    <div className="mt-1">
                      <Chips value={clubStatus} options={CLUB_STATUSES.map((c) => [c, t(`fm.train.status.${c}`)] as [ClubStatus, string])} onChange={(v) => setCoach({ clubStatus: v })} />
                    </div>
                  </div>
                  <div className={label}>
                    <span className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={!!winterBreak}
                        onChange={(e) => {
                          setCoach({ winterBreak: e.target.checked ? { from: '12-28', to: '02-08' } : null });
                          setPhase(null);
                          setWeek(null);
                        }}
                      />
                      {t('fm.train.winterBreak')}
                    </span>
                    {winterBreak && (
                      <span className="mt-1 flex items-center gap-1.5 font-normal">
                        <input
                          type="date"
                          className="input"
                          aria-label={t('fm.train.winterFrom')}
                          value={`${monday.slice(0, 4)}-${winterBreak.from}`}
                          onChange={(e) => e.target.value && setCoach({ winterBreak: { ...winterBreak, from: e.target.value.slice(5) } })}
                        />
                        →
                        <input
                          type="date"
                          className="input"
                          aria-label={t('fm.train.winterTo')}
                          value={`${monday.slice(0, 4)}-${winterBreak.to}`}
                          onChange={(e) => e.target.value && setCoach({ winterBreak: { ...winterBreak, to: e.target.value.slice(5) } })}
                        />
                      </span>
                    )}
                  </div>
                </div>

                {trainingDays && (
                  <div className="mt-4">
                    <p className="text-xs font-bold text-canard/70">{t('fm.train.trainingDays')}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setCoach({ trainingDays: trainingDays.includes(d) ? trainingDays.filter((x) => x !== d) : [...trainingDays, d].sort() })}
                          className={`chip ${trainingDays.includes(d) ? 'chip-on' : ''}`}
                        >
                          {t(`fm.train.days.${d}`)}
                        </button>
                      ))}
                    </div>
                    <More>{t('fm.train.trainingDaysHelp')}</More>
                  </div>
                )}

                <div className="mt-4">
                  <p className="text-xs font-bold text-canard/70">
                    {t('fm.train.matches')} {hasCalendar && manualDays == null && <span className="font-normal text-brun">({t('fm.train.fromCalendar')})</span>}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggleDay(d)}
                        className={`chip ${matchDays.includes(d) ? 'chip-on' : ''}`}
                      >
                        {t(`fm.train.days.${d}`)}
                      </button>
                    ))}
                    <label className="ml-2 flex items-center gap-1.5 text-sm">
                      <input type="checkbox" checked={before} onChange={(e) => setEve(e.target.checked)} />
                      {t('fm.train.eve')}
                    </label>
                  </div>
                  {!hasCalendar && <p className="mt-1 text-xs text-brun">{t('fm.train.manual')}</p>}
                </div>
              </Panel>
              </details>

              <Panel title={t('fm.train.code', { code: plan.code })}>
                <p className="text-sm">
                  <b>{t(`fm.train.phase.${plan.phase}`)}</b>
                  {plan.theme && <> · {t(`fm.train.theme.${plan.theme}`)}</>}
                  {plan.variant != null && <> · {plan.congested ? t('fm.train.congested') : t(`fm.train.variant_${plan.variant}`)}</>}
                </p>
                {weakest.length > 0 && <p className="mt-1 text-xs text-brun">{t('fm.train.weakest', { list: weakest.map((a) => t(`fm.train.session.${a}`)).join(', ') })}</p>}
                {priorities.length > 0 && <p className="mt-1 text-xs text-brun">{t('fm.train.priorities', { list: priorities.map((a) => t(`fm.train.session.${a}`)).join(', ') })}</p>}

                <div className="mt-3 grid gap-2 sm:grid-cols-4 lg:grid-cols-7">
                  {plan.days.map((d) => (
                    <div key={d.date} className={`rounded-xl p-2 ${d.kind === 'match' ? 'bg-eau/15' : d.kind === 'off' ? 'bg-creme/60 opacity-70' : 'bg-white/60'} ring-1 ring-canard/10`}>
                      <p className="text-sm font-bold">
                        {t(`fm.train.days.${d.weekday}`)} <span className="font-normal text-brun">{dayMonth.format(new Date(`${d.date}T00:00:00Z`))}</span>
                      </p>
                      <p className="mb-1.5 text-xs text-brun">
                        {t(`fm.train.kind.${d.kind}`)}
                        {d.kind === 'match' && cal.opponents[d.weekday] ? ` · ${cal.opponents[d.weekday]}` : ''}
                      </p>
                      <div className="space-y-1">
                        {d.sessions.map((s, i) =>
                          s ? (
                            <div key={i}>
                              {d.kind !== 'match' && <span className="text-[10px] uppercase tracking-wide text-canard/50">{t(`fm.train.slot.${i}`)}</span>}
                              <Session id={s} />
                              {d.why?.[i] && <span className="mt-0.5 block text-[10px] leading-tight text-brun">{t(`fm.train.why.${d.why[i]}`)}</span>}
                            </div>
                          ) : d.kind !== 'match' ? (
                            // Créneau vide : le jeu y affiche « Repos ».
                            <div key={i}>
                              <span className="text-[10px] uppercase tracking-wide text-canard/50">{t(`fm.train.slot.${i}`)}</span>
                              <span className="block rounded-lg px-2 py-1 text-xs leading-tight text-brun ring-1 ring-canard/10">{t('fm.train.session.rest')}</span>
                            </div>
                          ) : null,
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="font-bold text-canard/70">{t('fm.train.load')} :</span>
                  {CATS.filter((c) => load[c]).map((c) => (
                    <span key={c} className={`rounded-full px-2 py-0.5 font-bold ${CAT_CLS[c]}`}>
                      {t(`fm.train.cat.${c}`)} × {load[c]}
                    </span>
                  ))}
                </div>
                <More>{plan.theme == null && seasonal ? t('fm.train.coachHelp') : t(`fm.train.phaseHelp.${plan.phase}`)}</More>
              </Panel>

              <Panel title={t('fm.train.teamIntensity')}>
                <div className="grid gap-2 sm:grid-cols-5">
                  {CONDITION_LEVELS.map((c) => (
                    <div key={c} className="rounded-xl bg-white/60 p-2 ring-1 ring-canard/10">
                      <p className="text-xs text-brun">{t(`fm.train.condition.${c}`)}</p>
                      <Tag tone={INTENSITY_TONE[teamIntensity[c]]}>{t(`fm.train.intensityLevel.${teamIntensity[c]}`)}</Tag>
                    </div>
                  ))}
                </div>
                <More>{t('fm.train.teamIntensityCoach')}</More>
              </Panel>

              <details className="rounded-2xl bg-white/40 ring-1 ring-canard/10">
                <summary className="cursor-pointer select-none px-4 py-3 text-sm font-bold text-canard/70 hover:text-canard">{t('fm.train.yield.title')}</summary>
              <Panel title={t('fm.train.yield.title')}>
                <p className="text-sm">{t('fm.train.yield.intro', { best: nf1.format(HARVEST_WEEK_YIELD) })}</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {(['physical', 'ball', 'tactical'] as const).map((g) => (
                    <div key={g} className="rounded-xl bg-white/60 p-2 ring-1 ring-canard/10">
                      <p className="text-xs font-bold text-canard/70">{t(`fm.train.yield.${g}`)}</p>
                      <ul className="mt-1 space-y-0.5 text-sm">
                        {YIELD_GROUPS[g].map((id) => (
                          <li key={id} className="flex justify-between gap-2">
                            <span>{t(`fm.train.session.${id}`)}</span>
                            <b className="tabular-nums text-canard">{nf1.format(SESSION_YIELD[id] ?? 0)}</b>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
                <More>{t('fm.train.yield.help')}</More>
              </Panel>
              </details>
            </>
          ),
        },
        {
          id: 'season',
          label: t('fm.train.sections.season'),
          node: season.length > 0 ? (
            <>
              <Panel title={t('fm.train.season.title', { count: season.length })}>
                <p className="mb-2 text-sm text-brun">{calendarComplete ? t('fm.train.season.leadFull') : t('fm.train.season.lead', { known: season.filter((w) => !w.estimated).length })}</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-canard/70">
                      <tr>
                        <th className="px-2 py-1">{t('fm.train.weekOf')}</th>
                        <th className="px-2 py-1">{t('fm.train.season.kindCol')}</th>
                        <th className="px-2 py-1">{t('fm.train.planCol')}</th>
                        <th className="px-2 py-1">{t('fm.train.season.matchesCol')}</th>
                        <th className="px-2 py-1">{t('fm.train.scheduleFocus')}</th>
                        <th className="px-2 py-1">{t('fm.train.workloadCol')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(allSeason ? season : season.slice(0, SEASON_PREVIEW)).map((w, i, list) => {
                        const month = w.monday.slice(0, 7);
                        const newMonth = i > 0 && list[i - 1]!.monday.slice(0, 7) !== month;
                        return (
                          <tr
                            key={w.monday}
                            onClick={() => {
                              setOffset(String(i));
                              resetWeek();
                              setPhase(null);
                              setWeek(null);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            title={t('fm.train.season.open')}
                            className={`cursor-pointer border-t hover:bg-orange-clair/40 ${newMonth ? 'border-canard/25' : 'border-canard/5'} ${w.monday === monday ? 'bg-orange-clair/60' : ''}`}
                          >
                            <td className="whitespace-nowrap px-2 py-1.5">
                              {dayMonth.format(new Date(`${w.monday}T00:00:00Z`))}
                            </td>
                            <td className="px-2 py-1.5">
                              <Tag tone={KIND_TONE[w.kind]}>{t(`fm.train.season.kind.${w.kind}`)}</Tag>
                            </td>
                            <td className="px-2 py-1.5">
                              <b>{w.plan.code}</b> <span className="text-xs text-brun">{t(`fm.train.phase.${w.plan.phase}`)}</span>
                            </td>
                            <td className="px-2 py-1.5">
                              {w.estimated ? (
                                <span className="text-xs italic text-brun">{w.matches ? t('fm.train.season.assumed', { count: w.matches }) : '–'}</span>
                              ) : w.opponents.length ? (
                                <span className="text-xs">
                                  {w.opponents.map((o) => `${t(`fm.train.days.${o.weekday}`)} ${o.name ?? '?'}`).join(' · ')}
                                  {w.competitions.length ? <span className="text-brun"> ({w.competitions.join(', ')})</span> : null}
                                </span>
                              ) : (
                                '–'
                              )}
                            </td>
                            <td className="px-2 py-1.5 font-bold">{w.kind === 'offseason' ? '–' : t(`fm.train.preset.${w.preset}`)}</td>
                            <td className="px-2 py-1.5">{w.workload && w.kind !== 'offseason' ? <Tag tone={w.workload === 'heavy' ? 'good' : w.workload === 'medium' ? 'info' : 'warn'}>{t(`fm.train.workload.${w.workload}`)}</Tag> : '–'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {season.length > SEASON_PREVIEW ? (
                  <button type="button" className="btn-secondary mt-2 text-sm" onClick={() => setAllSeason(!allSeason)}>
                    {allSeason ? t('fm.train.season.less') : t('fm.train.season.more', { count: season.length })}
                  </button>
                ) : null}
                <More>{t('fm.train.season.help')}</More>
              </Panel>
            </>
          ) : null,
        },
        {
          id: 'individual',
          label: t('fm.train.sections.individual'),
          node: setups.rows.length > 0 ? (
            <>
              <Panel
                title={t('fm.train.individual')}
                action={
                  todoCount > 0 ? (
                    <button type="button" className="btn-secondary text-sm" onClick={() => setups.mark(setups.rows.filter((r) => r.status !== 'ok').map((r) => r.plan.player.id), true)}>
                      {t('fm.train.markAll')}
                    </button>
                  ) : undefined
                }
              >
                <p className="mb-2 text-sm">
                  <b>{t('fm.train.setupDone', { done: setups.rows.length - todoCount, total: setups.rows.length })}</b>
                  {changeCount > 0 && (
                    <>
                      {' '}
                      <Tag tone="warn">{t('fm.train.setupChanges', { count: changeCount })}</Tag>
                    </>
                  )}
                </p>
                <div className="table-scroll">
                  <table className="data-table wide">
                    <thead className="text-left text-canard/70">
                      <tr>
                        <th className="px-2 py-1">{t('fm.prog.player')}</th>
                        <th className="px-2 py-1">{t('fm.train.inGame')}</th>
                        <th className="px-2 py-1">{t('fm.train.roleIp')}</th>
                        <th className="px-2 py-1">{t('fm.train.roleOop')}</th>
                        <th className="px-2 py-1">{t('fm.train.focusCol')}</th>
                        <th className="px-2 py-1">{t('fm.train.intensity')}</th>
                        <th className="px-2 py-1 text-right">{t('fm.proj.fit')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {setups.rows.map(({ plan: x, rec, advice: a, status, changed, focusFromStats }) => {
                        const ip = rec.ip ? engine.roles.get(rec.ip) : null;
                        const oop = rec.oop ? engine.roles.get(rec.oop) : null;
                        const was = setups.applied[x.player.id];
                        const label = (f: SetupField, v: IndividualSetup) => {
                          const val = v[f];
                          if (val == null) return '–';
                          if (f === 'focus') return t(`fm.train.focus.${val}`);
                          if (f === 'intensity') return t(`fm.train.intensityLevel.${val}`);
                          const r = engine.roles.get(val);
                          return r ? names.role(r) : '–';
                        };
                        const cell = (f: SetupField, content: ReactNode) =>
                          changed.includes(f) && was ? (
                            <span>
                              <span className="text-xs text-brun line-through">{label(f, was)}</span>
                              <br />
                              {content}
                            </span>
                          ) : (
                            content
                          );
                        return (
                          <tr key={x.player.id} className={`border-t border-canard/5 ${status === 'change' ? 'bg-ambre/10' : ''}`}>
                            <td className="px-2 py-1.5 font-bold">
                              <PlayerLink player={x.player} /> <Pos player={x.player} />
                            </td>
                            <td className="px-2 py-1.5">
                              <label className="flex items-center gap-1.5">
                                <input type="checkbox" checked={status === 'ok'} onChange={(e) => setups.mark([x.player.id], e.target.checked)} />
                                {status === 'change' ? <Tag tone="warn">{t('fm.train.setupStatus.change')}</Tag> : status === 'todo' ? <span className="whitespace-nowrap text-xs text-brun">{t('fm.train.setupStatus.todo')}</span> : null}
                              </label>
                            </td>
                            <td className="px-2 py-1.5">{cell('ip', ip ? names.role(ip) : '–')}</td>
                            <td className="px-2 py-1.5">{cell('oop', oop ? names.role(oop) : '–')}</td>
                            <td className="px-2 py-1.5">
                              {cell('focus', rec.focus ? <b>{t(`fm.train.focus.${rec.focus}`)}</b> : '–')}
                              {focusFromStats && (
                                <>
                                  {' '}
                                  <Tag>{t('fm.train.focusFromStats')}</Tag>
                                </>
                              )}
                              <span className="ml-1.5 text-xs text-brun">{x.weak.map((w) => `${attr(w.key)} ${Math.round(w.value)}`).join(', ')}</span>
                            </td>
                            <td className="px-2 py-1.5" title={[t(`fm.train.reason.${a.reason}`), a.rusty ? t('fm.train.rusty') : null].filter(Boolean).join(' · ')}>
                              {cell('intensity', <Tag tone={INTENSITY_TONE[a.intensity]}>{t(`fm.train.intensityLevel.${a.intensity}`)}</Tag>)}
                            </td>
                            <td className="px-2 py-1.5 text-right">
                              <Fit value={x.fit} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <More>
                  <p>{t('fm.train.setupHelp')}</p>
                  <p className="mt-1">{t('fm.train.individualHelp')}</p>
                  <p className="mt-1">{t('fm.train.reasonHint')}</p>
                </More>
              </Panel>
            </>
          ) : null,
        },
        {
          id: 'youth',
          label: t('fm.train.sections.youth'),
          node: (
            <>
              <YouthPanel
                engine={engine}
                players={players}
                week={youthWeek({ gameDate: snap.gameDate, seasonStart, winterBreak, trainingDays, priorities, style: style?.id, method })}
              />

              <Panel title={t('fm.train.mentoring')}>
                {mentoring.groups.length ? (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {mentoring.groups.map((g) => (
                      <div key={g.mentor.id} className="rounded-xl bg-white/60 p-3 ring-1 ring-canard/10">
                        <p className="text-xs font-bold uppercase tracking-wide text-canard/50">{t('fm.train.mentor')}</p>
                        <p className="font-bold">
                          {g.mentor.name} <Pos player={g.mentor} />
                        </p>
                        <p className="text-xs text-brun">{[g.mentor.personality, g.mentor.hierarchy, g.mentor.age != null ? t('fm.train.age', { count: g.mentor.age }) : null].filter(Boolean).join(' · ')}</p>
                        <p className="mt-2 text-xs font-bold uppercase tracking-wide text-canard/50">{t('fm.train.mentees')}</p>
                        {g.mentees.map((y) => (
                          <p key={y.id} className="text-sm">
                            {y.name} <Pos player={y} /> <span className="text-xs text-brun">{[y.personality, y.age != null ? t('fm.train.age', { count: y.age }) : null].filter(Boolean).join(' · ')}</span>
                          </p>
                        ))}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-brun">{t('fm.train.noMentoring')}</p>
                )}
                {mentoring.avoid.length > 0 && (
                  <p className="mt-3 text-sm">
                    <Tag tone="warn">{t('fm.train.avoid')}</Tag> {mentoring.avoid.map((p) => `${p.name} (${p.personality})`).join(', ')}
                  </p>
                )}
                {mentoring.unassigned.length > 0 && <p className="mt-2 text-xs text-brun">{t('fm.train.unassigned', { list: mentoring.unassigned.map((p) => p.name).join(', ') })}</p>}
                <More>{t('fm.train.mentoringHelp')}</More>
              </Panel>

              <details className="rounded-2xl bg-white/40 ring-1 ring-canard/10">
                <summary className="cursor-pointer select-none px-4 py-3 text-sm font-bold text-canard/70 hover:text-canard">{t('fm.train.rules')}</summary>
              <Panel title={t('fm.train.rules')}>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <li key={i}>{t(`fm.train.rule${i}`)}</li>
                  ))}
                </ul>
                <More>{t('fm.train.source')}</More>
              </Panel>
              </details>
            </>
          ),
        },
      ]}
    />
  );
}

const YOUTH_TONE: Record<YouthStatus, 'good' | 'info' | 'warn' | 'bad'> = { promote: 'good', loan: 'warn', develop: 'info', low: 'bad' };

/**
 * Jeunes et équipe B : semaine type orientée progression, puis pour chaque joueur le rôle du projet à apprendre, la
 * priorité individuelle et ce qu'il faut en faire (monter, prêter, garder, libérer). Calendrier des jeunes non lu.
 */
function YouthPanel({ engine, week, players }: { engine: TacticEngine; week: ReturnType<typeof youthWeek>; players: FmPlayer[] }) {
  const { t } = useTranslation();
  const names = useNames();
  const [coach] = useCoach();
  const reserve = useContext(ReserveContext);
  const list = useMemo(() => reserve.filter((p) => Object.keys(p.attributes).length > 0), [reserve]);
  const project = useMemo(() => (list.length ? buildProject(engine, list, coach) : null), [engine, list, coach]);
  // Repère : niveau des titulaires de l'équipe première dans le même projet de jeu.
  const bar = useMemo(() => {
    const first = buildProject(engine, players.filter((p) => !p.team && Object.keys(p.attributes).length > 0), coach);
    return first ? firstTeamBar(first.slots) : null;
  }, [engine, players, coach]);
  const teams = useMemo(() => (project ? youthTeams(project.plans, bar ?? project.threshold) : []), [project, bar]);
  const [picked, setPicked] = useState<string | null>(null);
  const attr = (k: string) => t(`fm.attr.${k}`, { defaultValue: k });
  if (!teams.length) return null;
  const team = teams.find((x) => x.team === picked) ?? teams[0]!;
  const summary = (['promote', 'loan', 'low'] as const).filter((k) => team.counts[k] > 0).map((k) => t(`fm.train.youth.count.${k}`, { count: team.counts[k] }));
  return (
    <Panel title={t('fm.train.youth.title')}>
      {teams.length > 1 && (
        <div className="mb-3">
          <Chips value={team.team} options={teams.map((x) => [x.team, `${x.team} (${x.rows.length})`] as [string, string])} onChange={setPicked} />
        </div>
      )}
      <p className="text-sm">
        {t('fm.train.youth.week', {
          code: week.plan.code,
          preset: t(`fm.train.preset.${week.preset}`),
          workload: week.workload ? t(`fm.train.workload.${week.workload}`) : t('fm.train.youth.noWorkload'),
        })}
      </p>
      {summary.length > 0 && <p className="mt-1 text-sm font-bold">{summary.join(' · ')}</p>}
      <div className="table-scroll mt-3">
        <table className="data-table wide">
          <thead className="text-left text-canard/70">
            <tr>
              <th className="px-2 py-1">{t('fm.prog.player')}</th>
              <th className="px-2 py-1">{t('fm.train.youth.statusCol')}</th>
              <th className="px-2 py-1">{t('fm.train.youth.roleCol')}</th>
              <th className="px-2 py-1">{t('fm.train.focusCol')}</th>
              <th className="px-2 py-1 text-right">{t('fm.train.youth.potentialCol')}</th>
              <th className="px-2 py-1 text-right">{t('fm.proj.fit')}</th>
            </tr>
          </thead>
          <tbody>
            {team.rows.map(({ plan: x, status, focus }) => (
              <tr key={x.player.id} className="border-t border-canard/5">
                <td className="px-2 py-1.5 font-bold">
                  <PlayerLink player={x.player} /> <Pos player={x.player} />{' '}
                  {x.player.age != null && <span className="text-xs font-normal text-brun">{t('fm.train.age', { count: x.player.age })}</span>}
                </td>
                <td className="px-2 py-1.5" title={t(`fm.train.youth.statusHint.${status}`)}>
                  <Tag tone={YOUTH_TONE[status]}>{t(`fm.train.youth.status.${status}`)}</Tag>
                </td>
                <td className="px-2 py-1.5">{x.role ? names.role(x.role) : '–'}</td>
                <td className="px-2 py-1.5">
                  {focus ? <b>{t(`fm.train.focus.${focus}`)}</b> : '–'}
                  <span className="ml-1.5 text-xs text-brun">{x.weak.map((w) => `${attr(w.key)} ${Math.round(w.value)}`).join(', ')}</span>
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{x.player.stars?.potential != null ? `★ ${x.player.stars.potential}` : '–'}</td>
                <td className="px-2 py-1.5 text-right">
                  <Fit value={x.fit} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <More>{t('fm.train.youth.help')}</More>
    </Panel>
  );
}
