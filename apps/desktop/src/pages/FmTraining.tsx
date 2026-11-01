import {
  TRAINING_PHASES,
  addDays,
  autoPhase,
  buildTrainingWeek,
  defaultMatchDays,
  mondayOf,
  sessionCategory,
  trainingFor,
  weekLoad,
  weekMatches,
  type CycleWeek,
  type FmSnapshot,
  type SessionCategory,
  type SessionId,
  type TrainingPhase,
} from '@simloom/module-fm';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTacticEngine } from './FmTactic';
import { Chips, Panel, useCoach } from './FmUi';

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

/** Semaine d'entraînement type (méthode « Freedom » de FM Scout) adaptée au calendrier et au style visé. */
export function FmTraining({ snap, folder }: { snap: FmSnapshot; folder: string }) {
  const { t, i18n } = useTranslation();
  const { engine } = useTacticEngine(folder);
  const [coach, setCoach] = useCoach();
  const seasonStart = coach.seasonStart ?? 8;
  const [offset, setOffset] = useState<'0' | '1'>('0');
  const [phaseOverride, setPhase] = useState<TrainingPhase | null>(null);
  const [weekOverride, setWeek] = useState<CycleWeek | null>(null);
  const [manualDays, setManualDays] = useState<number[] | null>(null);
  const [eve, setEve] = useState<boolean | null>(null);

  const monday = addDays(mondayOf(snap.gameDate), offset === '1' ? 7 : 0);
  const auto = autoPhase(monday, seasonStart);
  const phase = phaseOverride ?? auto.phase;
  const week = weekOverride ?? (phaseOverride && phaseOverride !== auto.phase ? 1 : auto.week);
  const hasCalendar = Array.isArray(snap.fixtures) && snap.fixtures.length > 0;
  const cal = useMemo(() => weekMatches(snap.fixtures, monday), [snap.fixtures, monday]);
  const matchDays = manualDays ?? (hasCalendar ? cal.days : defaultMatchDays(phase, week, phase === 'A' || phase === 'B' || phase === 'C' ? 1 : 0));
  const before = eve ?? (hasCalendar ? cal.before : false);

  const style = engine.ref.styles.find((s) => s.id === coach.style) ?? engine.ref.styles[0];
  const priorities = style ? trainingFor(style) : [];
  const plan = useMemo(
    () => buildTrainingWeek({ monday, phase, week, matchDays, matchBeforeMonday: before, priorities, style: style?.id }),
    [monday, phase, week, matchDays.join(), before, priorities.join(), style?.id],
  );
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
            {t('fm.train.seasonStart')}
            <select className="input mt-1" value={seasonStart} onChange={(e) => setCoach({ seasonStart: Number(e.target.value) })}>
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthName.format(new Date(2026, m - 1, 1))}
                </option>
              ))}
            </select>
          </label>
        </div>

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
          {plan.variant != null && <> · {t(`fm.train.variant_${plan.variant}`)}</>}
        </p>
        <p className="mt-1 text-xs text-brun">{t(`fm.train.phaseHelp.${plan.phase}`)}</p>
        {priorities.length > 0 && <p className="mt-1 text-xs text-brun">{t('fm.train.priorities', { list: priorities.map((a) => t(`fm.train.session.${a}`)).join(', ') })}</p>}

        <div className="mt-3 grid gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {plan.days.map((d) => (
            <div key={d.date} className={`rounded-xl p-2 ${d.kind === 'match' ? 'bg-eau/15' : 'bg-white/60'} ring-1 ring-canard/10`}>
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

      <Panel title={t('fm.train.rules')}>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {[1, 2, 3, 4, 5].map((i) => (
            <li key={i}>{t(`fm.train.rule${i}`)}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-brun">{t('fm.train.source')}</p>
      </Panel>
    </div>
  );
}
