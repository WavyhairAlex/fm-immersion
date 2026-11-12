import { reliability, FORMATIONS, POS_LABEL, TARGETS, buildProject, evolutionPlan, recruitAttrs, styleOfGameTactic, switchAnalysis, trainingFor, type FmPlayer, type FmSnapshot, type SquadAt } from '@fm-immersion/module-fm';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { clubPath } from '../lib/club-nav';
import { useTranslation } from 'react-i18next';
import { PosBadge } from './FmFoot';
import { useLeaving } from './FmLeaving';
import { useTacticEngine } from './FmTactic';
import { Empty, Fit, Kpi, Panel, Pos, Tag, useCoach, useNames, More, PlayerLink, SectionTabs, ReliabilityLine } from './FmUi';

const STATUS_TONE = { ready: 'good', develop: 'info', recruit: 'bad' } as const;
const ICON = { good: '✓', warn: '~', bad: '✗' } as const;
const ICON_CLS = { good: 'bg-eau/30', warn: 'bg-ambre/40', bad: 'bg-corail/25' } as const;

/** Recrutement et entraînement : style aimé du coach → onze cible, bascule, profils à recruter, plan d'entraînement. */
export function FmProject({ snap, players, folder, history }: { snap: FmSnapshot; players: FmPlayer[]; folder: string; history: SquadAt[] }) {
  const { t, i18n } = useTranslation();
  const names = useNames();
  const { engine } = useTacticEngine(folder, players);
  const [coach, setCoach] = useCoach();
  // Projet de jeu = la tactique choisie dans Tactique : style et schéma ne se règlent plus ici.
  const tpl = coach.template ?? null;
  const navigate = useNavigate();
  const list = useMemo(() => players.filter((p) => Object.keys(p.attributes).length), [players]);
  const pr = useMemo(() => buildProject(engine, list, coach), [engine, list, coach]);
  const sw = useMemo(() => switchAnalysis(engine, list, coach, history), [engine, list, coach, history]);
  const gameTactic = typeof snap.tactic?.name === 'string' ? snap.tactic.name : null;
  const base = useMemo(() => styleOfGameTactic(gameTactic, engine.ref.styles), [gameTactic, engine]);
  // Les partants signalés quittent l'effectif à la première fenêtre du plan.
  const { ids: leavingIds, loanUntil } = useLeaving();
  const evo = useMemo(() => evolutionPlan(engine, list, snap.gameDate, coach, history, base, 4, leavingIds, loanUntil), [engine, list, snap.gameDate, coach, history, base, leavingIds, loanUntil]);
  if (!list.length || !pr || !sw) return <Empty>{t('fm.tac.noAttributes')}</Empty>;

  const nf1 = new Intl.NumberFormat(i18n.resolvedLanguage, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const month = new Intl.DateTimeFormat(i18n.resolvedLanguage, { month: 'short', year: 'numeric' });
  const when = (y: number) => {
    const d = new Date(snap.gameDate);
    d.setMonth(d.getMonth() + Math.round(y * 12));
    return month.format(d);
  };
  const attr = (k: string) => t(`fm.attr.${k}`, { defaultValue: k });
  const count = (s: string) => pr.slots.filter((x) => x.status === s).length;
  const now = sw.now;
  const missing = Math.max(0, 7 - now.target.ready);
  const checkValue = (c: (typeof now.checks)[number], st: typeof now.target) =>
    c.id === 'fit' ? `${c.gap != null && c.gap >= 0 ? '+' : ''}${c.gap == null ? '–' : nf1.format(c.gap)} pt` : c.id === 'ready' ? `${st.ready} / 11` : `${st.ability == null ? '–' : nf1.format(st.ability)} / ${nf1.format(st.need)}`;
  const select = 'input mt-1 min-w-[10rem]';

  const dateOf = (iso: string) => month.format(new Date(`${iso}T00:00:00Z`));
  const pct = (v: number) => nf1.format(v);

  return (
    <SectionTabs
      id="project"
      sections={[
        {
          id: 'plan',
          label: t('fm.proj.sections.plan'),
          node: (
            <>
              <Panel title={t('fm.proj.coach')}>
                {tpl && (
                  <p className="mb-3 rounded-xl bg-orange-clair px-3 py-2 text-sm text-canard">
                    {t('fm.proj.fromTactic', { style: names.style(tpl.style), form: tpl.form, source: t(`fm.proj.source.${tpl.source}`) })}{' '}
                    <button type="button" className="font-bold text-orange-fonce hover:underline" onClick={() => navigate(clubPath('tactic'))}>
                      {t('fm.proj.changeTactic')}
                    </button>
                  </p>
                )}
                <div className="flex flex-wrap gap-3">
                  {!tpl && (
                  <>
                  <label className="flex flex-col text-xs font-bold text-canard/70">
                    {t('fm.proj.style')}
                    <select className={select} value={pr.style.id} onChange={(e) => setCoach({ style: e.target.value, form: null })}>
                      {engine.ref.styles.map((s) => (
                        <option key={s.id} value={s.id}>
                          {names.style(s)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col text-xs font-bold text-canard/70">
                    {t('fm.tac.formation')}
                    <select className={select} value={pr.form} onChange={(e) => setCoach({ form: e.target.value })}>
                      {Object.keys(FORMATIONS).map((f) => (
                        <option key={f}>{f}</option>
                      ))}
                    </select>
                  </label>
                  </>
                  )}
                  <label className="flex flex-col text-xs font-bold text-canard/70">
                    {t('fm.proj.target')}
                    <select className={select} value={pr.target} onChange={(e) => setCoach({ target: Number(e.target.value) })}>
                      {TARGETS.map((v) => (
                        <option key={v} value={v}>
                          {t('fm.proj.targetOpt', { value: nf1.format(v / 5) })}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {!tpl && <p className="mt-2 text-xs text-brun">{t('fm.proj.help', { forms: pr.forms.join(', ') })}</p>}
                <ReliabilityLine r={reliability(players, { snapshots: history.length })} />
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Kpi label={t('fm.proj.ready')} value={`${count('ready')} / 11`} sub={t('fm.proj.readySub', { value: nf1.format(pr.target / 5) })} />
                  <Kpi label={t('fm.proj.develop')} value={count('develop')} sub={t('fm.proj.developSub')} />
                  <Kpi label={t('fm.proj.recruit')} value={count('recruit')} tone={count('recruit') ? 'bad' : undefined} sub={t('fm.proj.recruitSub')} />
                  {!tpl && <Kpi label={t('fm.style.ability')} value={now.target.ability == null ? '–' : nf1.format(now.target.ability)} sub={t('fm.style.abilitySub', { value: nf1.format(now.target.need) })} />}
                </div>
              </Panel>

              {!tpl && (
              <Panel title={t('fm.proj.switch', { style: names.style(sw.target) })}>
                <p
                  className={`-mt-1 mb-3 rounded-xl px-3 py-2 font-semibold ${now.verdict === 'go' ? 'bg-eau/25' : now.verdict === 'step' ? 'bg-canard/10' : 'bg-corail/15'}`}
                >
                  {t(`fm.proj.verdict.${now.verdict}`, { target: names.style(sw.target), rec: names.style(sw.rec) })}
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  {[
                    [t('fm.proj.recNow'), sw.rec, now.rec],
                    [t('fm.proj.yourProject'), sw.target, now.target],
                  ].map(([label, st, s]) => (
                    <div key={String(label)} className="rounded-xl bg-creme/50 px-3 py-2 text-sm">
                      <p className="text-xs text-brun">{String(label)}</p>
                      <b>{names.style(st as typeof sw.target)}</b>
                      <div className="mt-1 flex justify-between">
                        <span>{t('fm.proj.c.fit')}</span>
                        {/* Profil du groupe face au style (moyenne d'attributs sur 20), pas une note de rôle : en %, comme l'écart en points. */}
                        <b className="tabular-nums">{(s as typeof now.target).fit == null ? '–' : pct((s as typeof now.target).fit!)}</b>
                      </div>
                      <div className="flex justify-between">
                        <span>{t('fm.proj.c.ready')}</span>
                        <span>{(s as typeof now.target).ready} / 11</span>
                      </div>
                    </div>
                  ))}
                </div>
                <h3 className="mb-1 mt-4 font-semibold">{t('fm.proj.conditions')}</h3>
                {now.checks.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-3 border-b border-canard/5 py-1.5 text-sm last:border-0">
                    <span>
                      <span className={`mr-2 inline-block w-5 rounded-full text-center text-xs font-bold ${ICON_CLS[c.status]}`}>{ICON[c.status]}</span>
                      {t(`fm.proj.c.${c.id}`)} <span className="text-xs text-brun">{t(`fm.proj.c.${c.id}Help`)}</span>
                    </span>
                    <b>{checkValue(c, now.target)}</b>
                  </div>
                ))}
                <h3 className="mb-1 mt-4 font-semibold">{t('fm.proj.timeline')}</h3>
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead className="text-left text-canard/70">
                      <tr>
                        <th className="px-2 py-1">{t('fm.proj.when')}</th>
                        {now.checks.map((c) => (
                          <th key={c.id} className="px-2 py-1">
                            {t(`fm.proj.c.${c.id}`)}
                          </th>
                        ))}
                        <th className="px-2 py-1">{t('fm.proj.verdictCol')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sw.timeline.map((s) => (
                        <tr key={s.years} className="border-t border-canard/5">
                          <td className="px-2 py-1.5">{s.years === 0 ? t('fm.proj.today') : when(s.years)}</td>
                          {s.checks.map((c) => (
                            <td key={c.id} className="px-2 py-1.5">
                              <span className={`mr-1 inline-block w-5 rounded-full text-center text-xs font-bold ${ICON_CLS[c.status]}`}>{ICON[c.status]}</span>
                              {checkValue(c, s.target)}
                            </td>
                          ))}
                          <td className="px-2 py-1.5">
                            <Tag tone={s.verdict === 'go' ? 'good' : s.verdict === 'step' ? 'warn' : 'bad'}>{t(`fm.proj.short.${s.verdict}`)}</Tag>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 space-y-1 text-sm">
                  <p>
                    {sw.firstGo
                      ? sw.firstGo.years > 0 && t('fm.proj.eta', { date: when(sw.firstGo.years) })
                      : t('fm.proj.etaNever')}
                    {sw.firstStep && (!sw.firstGo || sw.firstStep.years < sw.firstGo.years) && sw.firstStep.years > 0 ? ` ${t('fm.proj.etaStep', { date: when(sw.firstStep.years) })}` : ''}
                  </p>
                  {missing > 0 && <p>▸ {t('fm.proj.tipRecruit', { count: missing })}</p>}
                  {sw.bridge && sw.bridge.style.id !== sw.rec.id && <p>▸ {t('fm.proj.tipBridge', { bridge: names.style(sw.bridge.style), rec: names.style(sw.rec) })}</p>}
                  <p>▸ {t('fm.proj.tipGauge')}</p>
                </div>
                <p className="mt-2 text-xs text-brun">{t('fm.proj.switchHelp')}</p>
              </Panel>
              )}
            </>
          ),
        },
        {
          id: 'xi',
          label: t('fm.proj.sections.xi'),
          node: (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <Panel title={t('fm.proj.xi', { form: pr.form })}>
                  {pr.slots.map((sl, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 border-b border-canard/5 py-1.5 text-sm last:border-0">
                      <span className="min-w-0">
                        <PosBadge pos={sl.pos} /> <span className="text-brun">{names.role(engine.roles.get(sl.ip))}</span>
                        <br />
                        {sl.player ? <PlayerLink player={sl.player} /> : <span className="text-brun">{t('fm.tac.nobody')}</span>}
                      </span>
                      <span className="flex items-center gap-2">
                        <Fit value={sl.fit} />
                        <Tag tone={sl.status === 'recruit' ? sl.tone : STATUS_TONE[sl.status]}>{t(`fm.proj.status.${sl.status}`)}</Tag>
                      </span>
                    </div>
                  ))}
                </Panel>
                <Panel title={t('fm.proj.profiles')}>
                  {pr.slots.filter((s) => s.status === 'recruit').length ? (
                    pr.slots
                      .filter((s) => s.status === 'recruit')
                      .map((sl, i) => (
                        <div key={i} className="border-b border-canard/5 py-2 text-sm last:border-0">
                          <div className="flex justify-between gap-2">
                            <b>
                              {POS_LABEL[sl.pos]} · {names.role(engine.roles.get(sl.ip))}
                            </b>
                            <span className="text-xs text-brun">{names.role(engine.roles.get(sl.oop))}</span>
                          </div>
                          <p>{t('fm.proj.priorities', { list: recruitAttrs(engine, sl).map(attr).join(', ') })}</p>
                          <p className="text-xs text-brun">{sl.player ? t('fm.proj.current', { name: sl.player.name, fit: nf1.format(sl.fit ?? 0) }) : t('fm.proj.currentNone')}</p>
                        </div>
                      ))
                  ) : (
                    <Empty>{t('fm.proj.noRecruit')}</Empty>
                  )}
                  <p className="mt-2 text-xs text-brun">
                    {t('fm.proj.recruitAll', {
                      list: Object.entries(pr.style.weights)
                        .filter(([, w]) => w > 0)
                        .map(([k]) => t(`fm.signal.${k}`))
                        .join(', '),
                    })}
                  </p>
                </Panel>
              </div>

              <Panel title={t('fm.proj.training')}>
                <p className="text-sm">
                  <b>{t('fm.proj.collective')}</b> {trainingFor(pr.style).map((a, i) => `${i + 1}. ${t(`fm.areaSession.${a}`)}`).join(' · ')}. {t('fm.proj.collectiveMore')}
                </p>
                <p className="mt-2 text-sm text-brun">{t('fm.proj.trainingDetail')}</p>
              </Panel>
            </>
          ),
        },
        {
          id: 'evo',
          label: t('fm.proj.sections.evo'),
          node: evo ? (
            <>
              <Panel title={t('fm.evo.title')}>
                <More>{t('fm.evo.help')}</More>
                {evo.extend.length > 0 && (
                  <p className="mb-3 rounded-xl bg-canard/10 px-3 py-2 text-sm">
                    <b>{t('fm.evo.extendFirst')}</b> {evo.extend.map((a) => `${a.player.name} (${a.player.contractEnd ? dateOf(a.player.contractEnd.slice(0, 10)) : '–'})`).join(', ')}
                  </p>
                )}
                <ol className="space-y-3">
                  {evo.stages.map((s, i) => (
                    <li key={s.date} className="rounded-xl bg-creme/50 px-3 py-2 text-sm">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <b className="text-canard">{s.kind === 'now' ? t('fm.proj.today') : t(`fm.evo.window.${s.kind}`, { date: dateOf(s.date) })}</b>
                        <span className="flex items-center gap-2">
                          {names.style(s.tactic.style)} · {s.tactic.form}
                          {i > 0 && <Tag tone={s.changed ? 'warn' : 'good'}>{t(s.changed ? 'fm.evo.changed' : 'fm.evo.same')}</Tag>}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-brun">
                        <span>{t('fm.evo.score', { value: pct(s.score) })}</span>
                        <span title={t('fm.evo.perPlayerHelp', { ability: s.ability == null ? '–' : nf1.format(s.ability), need: nf1.format(s.need) })}>{t('fm.evo.perPlayer', { count: s.perPlayer })}</span>
                        <span>{t('fm.evo.ready', { count: s.ready, style: names.style(pr.style) })}</span>
                      </div>
                      {s.changed && <p className="mt-1">▸ {t('fm.evo.changeTip')}</p>}
                      {s.left.length > 0 && <p className="mt-1">▸ {t('fm.evo.left', { list: s.left.map((p) => p.name).join(', ') })}</p>}
                      {s.newStarters.map((c) => (
                        <p key={c.player.id} className="mt-1">
                          ▸ {c.replaces ? t('fm.evo.replaces', { name: c.player.name, other: c.replaces.name, pos: POS_LABEL[c.pos] }) : t('fm.evo.starts', { name: c.player.name, pos: POS_LABEL[c.pos] })}
                        </p>
                      ))}
                      {s.recruit.length > 0 && <p className="mt-1">▸ {t('fm.evo.recruit', { list: [...new Set(s.recruit.map((r) => POS_LABEL[r.pos]))].join(', ') })}</p>}
                    </li>
                  ))}
                </ol>
                <More>{t('fm.evo.foot')}</More>
              </Panel>
            </>
          ) : null,
        },
      ]}
    />
  );
}
