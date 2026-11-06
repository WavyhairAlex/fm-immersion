import {
  CLUB_STATUSES,
  TRAINING_METHODS,
  metaProgramme,
  CONDITION_LEVELS,
  TEAM_INTENSITY,
  PART_TIME_DAYS,
  TRAINING_PHASES,
  addDays,
  autoPhase,
  buildProject,
  buildTrainingWeek,
  effectiveness,
  individualAdvice,
  individualFocus,
  matchStats,
  statsBoard,
  mentoringGroups,
  upcomingWeeks,
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
} from '@simloom/module-fm';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { readScoped, useFmSaveScope, writeScoped } from '../lib/save-store';
import { useTacticEngine } from './FmTactic';
import { Chips, Fit, Panel, Pos, Tag, useCoach, useNames, More, PlayerLink } from './FmUi';

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
const CATS: SessionCategory[] = ['tactical', 'ballWork', 'matchPrep', 'physical', 'individual', 'extra'];

function Session({ id }: { id: SessionId }) {
  const { t } = useTranslation();
  return <span className={`block rounded-lg px-2 py-1 text-xs font-bold leading-tight ${CAT_CLS[sessionCategory(id)]}`}>{t(`fm.train.session.${id}`)}</span>;
}

/**
 * Réglages individuels notés comme faits en jeu, par partie (retenus sur ce PC).
 * Ils étaient rangés par dossier du plugin, commun à toutes les parties : la plus ancienne partie les reprend.
 */
const SETUP_KEY = 'simloom.fm.individual';
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
          focus: fromStats ?? individualFocus(x.weak, x.player.positions[0] === 'GB'),
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

export function FmTraining({ snap, players, folder }: { snap: FmSnapshot; players: FmPlayer[]; folder: string }) {
  const { t, i18n } = useTranslation();
  const { engine } = useTacticEngine(folder, players);
  const [coach, setCoach] = useCoach();
  const seasonStart = coach.seasonStart ?? 8;
  const clubStatus: ClubStatus = coach.clubStatus ?? 'pro';
  const method = coach.trainingMethod ?? 'metaAdapt';
  const trainingDays = clubStatus === 'pro' ? undefined : coach.trainingDays ?? PART_TIME_DAYS;
  const [offset, setOffset] = useState<'0' | '1'>('0');
  const [phaseOverride, setPhase] = useState<TrainingPhase | null>(null);
  const [weekOverride, setWeek] = useState<CycleWeek | null>(null);
  const [manualDays, setManualDays] = useState<number[] | null>(null);
  const [eve, setEve] = useState<boolean | null>(null);

  const monday = addDays(mondayOf(snap.gameDate), offset === '1' ? 7 : 0);
  const winterBreak = coach.winterBreak ?? null;
  const auto = autoPhase(monday, seasonStart, winterBreak);
  const phase = phaseOverride ?? auto.phase;
  const week = weekOverride ?? (phaseOverride && phaseOverride !== auto.phase ? 1 : auto.week);
  const fixtures = useMemo(() => snapshotFixtures(snap), [snap]);
  // Le calendrier ne couvre que les 5 prochains matchs : au-delà du dernier connu, on revient aux jours cochés.
  const hasCalendar = fixtures.some((f) => f.date >= monday);
  const cal = useMemo(() => weekMatches(fixtures, monday), [fixtures, monday]);
  const matchDays = manualDays ?? (hasCalendar ? cal.days : defaultMatchDays(phase, week, phase === 'A' || phase === 'B' || phase === 'C' ? 1 : 0));
  const before = eve ?? (hasCalendar ? cal.before : false);

  const style = engine.ref.styles.find((s) => s.id === coach.style) ?? engine.ref.styles[0];
  // Zones à travailler : la n° 1 du style visé, puis les zones les moins comprises d'après le jeu, puis le reste du style.
  const styleAreas = style ? trainingFor(style) : [];
  const weakest = effectiveness(snap)?.weakest ?? [];
  // Puis ce que montrent les matchs (centre de données : passes ratées, pressing inefficace…).
  const fromMatches = useMemo(() => statsBoard(players, matchStats(snap)).areas, [players, snap]);
  const priorities = [...new Set<EffArea>([...styleAreas.slice(0, 1), ...weakest, ...fromMatches, ...styleAreas])];
  const names = useNames();
  const mentoring = useMemo(() => mentoringGroups(players), [players]);
  const attr = (k: string) => t(`fm.attr.${k}`, { defaultValue: k });
  const upcoming = useMemo(
    () => upcomingWeeks({ gameDate: snap.gameDate, fixtures, seasonStart, winterBreak, trainingDays, priorities, style: style?.id, method }),
    [snap.gameDate, fixtures, seasonStart, winterBreak?.from, winterBreak?.to, trainingDays?.join(), priorities.join(), style?.id, method],
  );
  const plan = useMemo(
    () => buildTrainingWeek({ monday, phase, week, matchDays, matchBeforeMonday: before, priorities, style: style?.id, trainingDays, method }),
    [monday, phase, week, matchDays.join(), before, priorities.join(), style?.id, trainingDays?.join(), method],
  );
  // Programme .fmf d'AlexJeuVideal à charger : dernier match de la semaine précédente (dimanche si on le sait), puis ceux de la semaine.
  const prevLast = before ? 6 : (weekMatches(fixtures, addDays(monday, -7)).days.at(-1) ?? null);
  const metaFile = method !== 'freedom' && (phase === 'A' || phase === 'B' || phase === 'C') && !plan.congested ? metaProgramme(matchDays, prevLast) : null;
  const load = weekLoad(plan);
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

  return (
    <div className="space-y-4">
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
            {t('fm.train.method')}
            <select className="input mt-1" value={method} onChange={(e) => setCoach({ trainingMethod: e.target.value as 'metaAdapt' | 'meta' | 'freedom' })}>
              {TRAINING_METHODS.map((m) => (
                <option key={m} value={m}>
                  {t(`fm.train.methods.${m}`)}
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
                  className={`rounded-full px-3 py-1 text-sm font-bold ${trainingDays.includes(d) ? 'bg-canard text-white' : 'bg-white text-canard ring-1 ring-canard/15'}`}
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
                className={`rounded-full px-3 py-1 text-sm font-bold ${matchDays.includes(d) ? 'bg-eau-fonce text-white' : 'bg-white text-canard ring-1 ring-canard/15'}`}
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

      <Panel title={t('fm.train.code', { code: plan.code })}>
        <p className="text-sm">
          <b>{t(`fm.train.phase.${plan.phase}`)}</b>
          {plan.theme && <> · {t(`fm.train.theme.${plan.theme}`)}</>}
          {plan.variant != null && <> · {plan.congested ? t('fm.train.congested') : t(`fm.train.variant_${plan.variant}`)}</>}
        </p>
        <p className="mt-1 text-xs text-brun">{method !== 'freedom' && plan.theme == null && 'ABC'.includes(plan.phase) ? t(method === 'meta' ? 'fm.train.metaHelp' : 'fm.train.metaAdaptHelp') : t(`fm.train.phaseHelp.${plan.phase}`)}</p>
        {metaFile ? (
          <p className="mt-1 text-sm">
            {t('fm.train.metaFile')} <b className="text-canard">{metaFile.trim()}.fmf</b>
            {plan.swaps && plan.swaps.length > 0 && (
              <>
                <br />
                <span className="text-xs text-brun">
                  {t('fm.train.metaSwaps', { list: plan.swaps.map(([a, b]) => `${t(`fm.train.session.${a}`)} → ${t(`fm.train.session.${b}`)}`).join(', ') })}
                </span>
              </>
            )}
          </p>
        ) : (
          <p className="mt-1 text-xs text-brun">{t('fm.train.presetHint', { preset: t(`fm.train.preset.${nearestPreset(plan)}`) })}</p>
        )}
        {weekWorkload(plan) && <p className="mt-1 text-xs text-brun">{t('fm.train.workloadHint', { level: t(`fm.train.workload.${weekWorkload(plan)}`) })}</p>}
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
      </Panel>

      <Panel title={t('fm.train.upcoming')}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-canard/70">
              <tr>
                <th className="px-2 py-1">{t('fm.train.weekOf')}</th>
                <th className="px-2 py-1">{t('fm.train.planCol')}</th>
                <th className="px-2 py-1 text-right">{t('fm.train.matchesCol')}</th>
                <th className="px-2 py-1">{t('fm.train.scheduleFocus')}</th>
                <th className="px-2 py-1">{t('fm.train.workloadCol')}</th>
              </tr>
            </thead>
            <tbody>
              {upcoming.map((w) => (
                <tr key={w.monday} className={`border-t border-canard/5 ${w.monday === monday ? 'bg-eau/10' : ''}`}>
                  <td className="px-2 py-1.5">{dayMonth.format(new Date(`${w.monday}T00:00:00Z`))}</td>
                  <td className="px-2 py-1.5">
                    <b>{w.plan.code}</b> <span className="text-xs text-brun">{t(`fm.train.phase.${w.plan.phase}`)}</span>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{w.matches}</td>
                  <td className="px-2 py-1.5 font-bold">{w.file ? `${w.file.trim()}.fmf` : t(`fm.train.preset.${w.preset}`)}</td>
                  <td className="px-2 py-1.5">{w.workload ? <Tag tone={w.workload === 'heavy' ? 'good' : w.workload === 'medium' ? 'info' : 'warn'}>{t(`fm.train.workload.${w.workload}`)}</Tag> : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <More>{t('fm.train.upcomingHelp')}</More>
      </Panel>

      <Panel title={t('fm.train.teamIntensity')}>
        <div className="grid gap-2 sm:grid-cols-5">
          {CONDITION_LEVELS.map((c) => (
            <div key={c} className="rounded-xl bg-white/60 p-2 ring-1 ring-canard/10">
              <p className="text-xs text-brun">{t(`fm.train.condition.${c}`)}</p>
              <Tag tone={INTENSITY_TONE[TEAM_INTENSITY[c]]}>{t(`fm.train.intensityLevel.${TEAM_INTENSITY[c]}`)}</Tag>
            </div>
          ))}
        </div>
        <More>{t('fm.train.teamIntensityHelp')}</More>
      </Panel>

      {setups.rows.length > 0 && (
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
      )}

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

      <Panel title={t('fm.train.rules')}>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {[1, 2, 3, 4, 5].map((i) => (
            <li key={i}>{t(`fm.train.rule${i}`)}</li>
          ))}
        </ul>
        <More>{t('fm.train.source')}</More>
      </Panel>
    </div>
  );
}
