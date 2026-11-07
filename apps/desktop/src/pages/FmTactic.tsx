import {
  FORMATIONS,
  POS_LABEL,
  STYLE_FORMS,
  TacticEngine,
  bestTactic,
  rankTactics,
  knownFormation,
  mergeReference,
  opponentReport,
  rankForMatch,
  matchPlan,
  styleOfGameTactic,
  SWITCH_POINTS,
  phaseXY,
  planFromLineup,
  playerInstructions,
  instructionBudget,
  tactAbility,
  shapeOf,
  spreadXY,
  unavailable,
  styleBlock,
  tacticReferenceSchema,
  type BalanceCheck,
  type FmPlayer,
  type FmSnapshot,
  type GameSlot,
  type Phase,
  type TacticReference,
} from '@fm-immersion/module-fm';
import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { createContext, useContext, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PosBadge } from './FmFoot';
import { readScoped, useFmSaveScope, writeScoped } from '../lib/save-store';
import { fitPct, More, PlayerLink, setFitScale, TeamCards, useCoach } from './FmUi';

// v2 : le choix automatique (meilleure tactique applicable) devient la valeur par défaut.
const PREFS_KEY = 'fmi.tactic.v2';
interface Prefs {
  style?: string;
  form?: string;
  phase?: Phase;
  /** Onze affiché : celui lu dans le jeu (par défaut quand il existe) ou celui calculé par FM Immersion. */
  source?: 'game' | 'simloom';
}

/** Repères locaux (`simloom-roles.json` dans le dossier du plugin) s'ils existent et sont valides. */
async function loadLocalReference(folder: string): Promise<{ ref: TacticReference | null; error: boolean }> {
  if (!folder) return { ref: null, error: false };
  try {
    const text = await invoke<string | null>('fm_read_reference', { folder });
    if (!text) return { ref: null, error: false };
    return { ref: tacticReferenceSchema.parse(JSON.parse(text)), error: false };
  } catch {
    return { ref: null, error: true };
  }
}

/** Moteur tactique avec les repères maison, remplacés par les repères locaux du joueur s'il en a. */
export function useTacticEngine(folder: string, players: FmPlayer[] = []) {
  const { data: local } = useQuery({ queryKey: ['fm', 'reference', folder], queryFn: () => loadLocalReference(folder), staleTime: 60_000 });
  // Notes calculées ramenées à l'échelle des étoiles lues dans le jeu pour cet effectif.
  const engine = useMemo(() => {
    const e = new TacticEngine(mergeReference(local?.ref)).calibrate(players);
    setFitScale(!!e.cal);
    return e;
  }, [local?.ref, players]);
  return { engine, local };
}

/**
 * Style, schéma et onze choisis en Tactique > Composition (retenus d'une vue à l'autre) :
 * les autres vues de l'effectif s'appuient dessus pour rester cohérentes.
 */
/** Réserve et jeunes du club (joueurs avec `team`), fournis par l'écran de la partie : appelés quand un poste reste vide. */
export const ReserveContext = createContext<FmPlayer[]>([]);

export function useTacticChoice(players: FmPlayer[], folder: string, gameFormation: string | null, lineup: GameSlot[] | null = null, gameTactic: string | null = null) {
  const { engine, local } = useTacticEngine(folder, players);
  const reserveAll = useContext(ReserveContext);
  const reserve = useMemo(() => reserveAll.filter((p) => !unavailable(p) && Object.keys(p.attributes).length > 0), [reserveAll]);
  // Choix retenus par partie : chaque carrière a son style et son schéma.
  const scope = useFmSaveScope();
  const [prefs, setPrefs] = useState<Prefs>(() => readScoped<Prefs>(PREFS_KEY, scope, {}));
  const update = (p: Prefs) => {
    const next = { ...prefs, ...p };
    setPrefs(next);
    writeScoped(PREFS_KEY, scope, next);
  };
  const avail = useMemo(() => players.filter((p) => !unavailable(p) && Object.keys(p.attributes).length > 0), [players]);
  // Classement commun à tous les onglets : chaque style avec la note d'équipe de son meilleur onze.
  const ranked = useMemo(() => rankTactics(engine, avail, reserve), [engine, avail, reserve]);
  const [coach] = useCoach();
  // Sans choix du joueur : la meilleure tactique applicable, ou le projet dès qu'il devient le meilleur.
  // Tactique de base : celle jouée dans FM27 (d'après son nom), gardée tant qu'une autre ne gagne pas nettement.
  const base = useMemo(() => styleOfGameTactic(gameTactic, engine.ref.styles), [gameTactic, engine]);
  const pick = useMemo(() => bestTactic(engine, avail, coach, ranked, base), [engine, avail, coach, ranked, base]);
  const auto = !prefs.style;
  const style = (auto ? pick?.style : ranked.find((r) => r.style.id === prefs.style)?.style) ?? ranked[0]?.style;
  const gameForm = knownFormation(gameFormation);
  const natural = (style && STYLE_FORMS[style.id]?.filter((f) => FORMATIONS[f])) || ['4-3-3'];
  const form = prefs.form && FORMATIONS[prefs.form] ? prefs.form : auto && pick ? pick.form : (gameForm ?? natural[0] ?? '4-3-3');
  const plans = useMemo(() => ranked.find((r) => r.style.id === style?.id)?.plans ?? [], [ranked, style]);
  const gamePlan = useMemo(() => (lineup ? planFromLineup(engine, lineup, players, gameForm ?? gameFormation) : null), [engine, lineup, players, gameForm, gameFormation]);
  const fromGame = !!gamePlan && prefs.source !== 'simloom';
  const plan = fromGame ? gamePlan : plans.find((p) => p.form === form);
  return { engine, local, prefs, update, avail, reserve, ranked, style, natural, form: fromGame ? gamePlan.form || form : form, plans, plan, gamePlan, fromGame, auto, pick };
}

const DOT: Record<BalanceCheck['status'], string> = { good: 'bg-eau', warn: 'bg-ambre', bad: 'bg-corail' };

/** Tactique : style conseillé, schéma, onze par rôles, formes avec et sans ballon, équilibre. */
export function FmTactic({ snap, players, folder, gameFormation, lineup, lineupStatus, go, part }: { snap?: FmSnapshot; players: FmPlayer[]; folder: string; gameFormation: string | null; lineup: GameSlot[] | null; lineupStatus?: string | null; go?: (view: string) => void; part?: 'lineup' | 'instructions' }) {
  // Sous-onglet affiché : le onze (et ses consignes d'équipe) ou les consignes individuelles ; les deux sans `part`.
  const showLineup = part !== 'instructions';
  const showPi = part !== 'lineup';
  const gameTactic = typeof snap?.tactic?.name === 'string' ? snap.tactic.name : null;
  const { t, i18n } = useTranslation();
  const en = i18n.resolvedLanguage === 'en';
  const { engine, local, prefs, update, avail, reserve, ranked, style, natural, form, plans, plan: planA, gamePlan, fromGame, auto, pick } = useTacticChoice(players, folder, gameFormation, lineup, gameTactic);
  const phase: Phase = prefs.phase ?? 'ip';
  // Équipe B : le meilleur onze possible sans les titulaires de l'équipe A, même schéma et même style
  // (rotation, coupes, matchs rapprochés). Au poste, toujours le meilleur joueur restant.
  const [team, setTeam] = useState<'A' | 'B'>('A');
  const planB = useMemo(() => {
    if (!planA || !style) return null;
    const starters = new Set(planA.slots.flatMap((sl) => (sl.player ? [sl.player.id] : [])));
    const bForm = FORMATIONS[form] ? form : (pick?.form ?? '4-3-3');
    return engine.formationPlan(bForm, style, avail.filter((p) => !starters.has(p.id)), reserve.filter((p) => !starters.has(p.id)));
  }, [engine, planA, style, form, pick, avail, reserve]);
  const plan = team === 'B' && planB ? planB : planA;
  const opp = useMemo(() => (snap ? opponentReport(snap) : null), [snap]);
  // Tactique du match : la meilleure combinaison style × schéma contre le prochain adversaire.
  // Une base, des ajustements : on part de la tactique de base, un changement doit rapporter plus qu'il ne coûte.
  const forMatch = useMemo(() => (opp ? rankForMatch(ranked, opp, pick ? { style: pick.style.id, form: pick.form } : null) : []), [ranked, opp, pick]);
  const best = forMatch[0];
  // Réglages du match : consignes d'équipe, mentalité et marquage à changer contre cet adversaire, dans le style retenu.
  const threat = typeof (snap?.nextMatch as { threatLevel?: unknown } | null | undefined)?.threatLevel === 'string' ? ((snap!.nextMatch as { threatLevel: string }).threatLevel) : null;
  const adjust = useMemo(() => (opp && style && planA ? matchPlan(style, opp, planA, threat) : null), [opp, style, planA, threat]);
  const baseKey = pick ? `${pick.style.id}|${pick.form}` : null;
  // Poste survolé : mis en évidence à la fois sur le terrain et dans la liste.
  const [hover, setHover] = useState<number | null>(null);

  if (!avail.length || !style || !plan) return <p className="card mt-6 text-brun">{t('fm.tac.noAttributes')}</p>;

  const block = styleBlock(style);
  // Complexité : moins l'effectif lit le jeu, moins on charge chaque joueur de consignes individuelles.
  const budget = instructionBudget(style, tactAbility(avail));
  // Rôle avec ballon : FM27 fixe la mission d'après le rôle, on l'affiche à côté (« Milieu axial (Soutien) »).
  const roleName = (code: string, ph?: Phase) => {
    const r = engine.roles.get(code);
    const name = (en ? r?.en : r?.fr) ?? r?.fr ?? code;
    return ph === 'ip' && r?.duty ? `${name} (${t(`fm.tac.duty.${r.duty}`)})` : name;
  };
  const styleName = (s: typeof style) => (en && s.nameEn ? s.nameEn : s.name);
  const nf = new Intl.NumberFormat(i18n.resolvedLanguage, { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat(i18n.resolvedLanguage, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  // Avec des étoiles lues dans le jeu, les notes sont sur l'échelle du jeu : on les montre en étoiles (10 = 0, 20 = 5).
  const note = fitPct;
  const field = plan.slots.filter((s) => s.pos !== 'GB');
  const shape = (ph: Phase) => shapeOf(field.map((s) => phaseXY(s, ph, block)));
  // Écarts minimum entre deux joueurs (en % du terrain) à la taille des pastilles, gardées dans le terrain.
  const shown = spreadXY(plan.slots.map((s) => phaseXY(s, phase, block)), 23, 14).map(([x, y]) => [Math.min(88, Math.max(12, x)), Math.min(91, Math.max(7, y))] as [number, number]);
  const other: Phase = phase === 'ip' ? 'oop' : 'ip';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 whitespace-nowrap text-sm font-bold" title={style.summary ?? undefined}>
          {t('fm.tac.style')}
          <select className="input py-1.5 font-normal" value={auto ? '' : style.id} onChange={(e) => update({ style: e.target.value || undefined, form: undefined })}>
            <option value="">{t('fm.tac.auto')}</option>
            {ranked.map((r) => (
              <option key={r.style.id} value={r.style.id}>
                {styleName(r.style)} · {note(r.fit)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 whitespace-nowrap text-sm font-bold">
          {t('fm.tac.formation')}
          <select className="input py-1.5 font-normal" value={form} disabled={fromGame} onChange={(e) => update({ form: e.target.value })}>
            {fromGame && !FORMATIONS[form] && <option value={form}>{form || gameFormation}</option>}
            {plans.map((p) => (
              <option key={p.form} value={p.form}>
                {p.form} · {note(p.score)}
              </option>
            ))}
          </select>
        </label>
        {gamePlan && (
          <div className="flex gap-1" role="tablist">
            {(['game', 'simloom'] as const).map((src) => (
              <button
                key={src}
                type="button"
                role="tab"
                aria-selected={(src === 'game') === fromGame}
                onClick={() => update({ source: src })}
                className={`chip ${(src === 'game') === fromGame ? 'chip-on' : ''}`}
              >
                {t(`fm.tac.source.${src}`)}
              </button>
            ))}
          </div>
        )}
        {auto && pick && !fromGame && (
          <span className="rounded-md bg-eau/20 px-1.5 py-0.5 text-xs font-bold text-canard">{t(pick.kept ? 'fm.tac.baseKept' : pick.project ? 'fm.tac.projectBest' : 'fm.tac.bestNow')}</span>
        )}
        {auto && pick?.kept && !fromGame && (
          <div className="-mt-2 w-full">
            <More>{t('fm.tac.baseKeptHelp', { other: `${pick.kept.form} ${styleName(pick.kept.style)}`, gain: nf1.format(Math.max(0, pick.kept.gain) / 2), need: nf1.format(SWITCH_POINTS / 2) })}</More>
          </div>
        )}
        {gameFormation && <span className="rounded-md bg-eau/20 px-1.5 py-0.5 text-xs text-canard">{t('fm.tac.inGame', { form: gameFormation })}</span>}
        {local?.ref && <span className="rounded-md bg-eau/20 px-1.5 py-0.5 text-xs text-canard">{t('fm.tac.localRef')}</span>}
        {local?.error && <span className="rounded-md bg-corail/15 px-1.5 py-0.5 text-sm text-canard">{t('fm.tac.localRefError')}</span>}
      </div>
      

      {showLineup && (
      <>
      {opp && best && !fromGame && (
        <section className="card">
          <h2 className="text-xl font-semibold">{t('fm.tac.matchTitle', { name: opp.name ?? t('fm.opp.club') })}</h2>
          {pick && `${best.style.id}|${best.form}` === baseKey ? (
            <p className="mt-1 text-sm">{t('fm.tac.matchSame', { form: pick.form, style: styleName(pick.style) })}</p>
          ) : (
            <p className="mt-1 text-sm">
              {t('fm.tac.matchBest', { form: best.form, style: styleName(best.style), base: pick ? `${pick.form} ${styleName(pick.style)}` : '–' })}
            </p>
          )}
          <p className="mt-1 text-xs text-brun">
            {t('fm.tac.matchScore', { base: note(best.base), bonus: (best.bonus >= 0 ? '+' : '') + nf1.format(best.bonus) })}
          </p>
          {best.reasons.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              {best.reasons.map((r) => (
                <li key={r.id}>• {t(`fm.tac.why.${r.id}`, { every: r.every, minutes: r.minutes })}</li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {(prefs.style !== best.style.id || form !== best.form) && (
              <button type="button" className="btn-primary px-3 py-1.5 text-sm" onClick={() => update({ style: best.style.id, form: best.form, source: 'simloom' })}>
                {t('fm.tac.matchShow')}
              </button>
            )}
            {!auto && (
              <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={() => update({ style: undefined, form: undefined })}>
                {t('fm.tac.matchBase')}
              </button>
            )}
          </div>
          <More>{t(opp.formations.faced?.length ? 'fm.tac.matchHelpMeasured' : 'fm.tac.matchHelp')}</More>
        </section>
      )}

      {opp && adjust && !fromGame && (
        <section className="card">
          <h2 className="text-xl font-semibold">{t('fm.tac.adjust.title', { name: opp.name ?? t('fm.opp.club') })}</h2>
          <p className="mt-1 text-sm text-brun">{t('fm.tac.adjust.intro')}</p>
          {!adjust.mentality && !adjust.team.length && !adjust.marking.length ? (
            <p className="mt-2 text-sm">{t('fm.tac.adjust.none')}</p>
          ) : (
            <div className="mt-3 grid gap-4 lg:grid-cols-2">
              <div>
                {adjust.mentality && (
                  <p className="mb-2 text-sm">
                    <b>{t('fm.tac.adjust.mentality', { to: adjust.mentality.to, from: adjust.mentality.from })}</b>
                    <span className="ml-1 text-xs text-brun">{t(`fm.tac.adjust.reason.${adjust.mentality.reason}`)}</span>
                  </p>
                )}
                {adjust.team.length > 0 && (
                  <>
                    <p className="text-xs font-bold uppercase tracking-wide text-canard/50">{t('fm.tac.adjust.teamTitle')}</p>
                    <ul className="mt-1 space-y-1.5 text-sm">
                      {adjust.team.map((a) => (
                        <li key={a.title} className="rounded-xl bg-creme/50 px-3 py-2">
                          <span className="mr-2 rounded-md bg-eau/20 px-1.5 py-0.5 text-xs font-bold text-canard">{t(`fm.style.${a.phase}`)}</span>
                          <span className="text-brun">{a.title} :</span> <b>{a.label}</b>
                          {a.replaces && <span className="ml-1 text-xs text-brun">{t('fm.tac.adjust.replaces', { label: a.replaces })}</span>}
                          <span className="block text-xs text-brun">{t(`fm.tac.adjust.reason.${a.reason}`)}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
              {adjust.marking.length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-canard/50">{t('fm.tac.adjust.markingTitle')}</p>
                  <ul className="mt-1 space-y-1.5 text-sm">
                    {adjust.marking.map((mk) => (
                      <li key={mk.target} className="rounded-xl bg-creme/50 px-3 py-2">
                        {t(`fm.tac.adjust.marking.${mk.reason}${mk.player ? '' : 'NoSlot'}`, { target: mk.target, positions: mk.positions ?? '', player: mk.player ?? '' })}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <More>{t('fm.tac.adjust.help')}</More>
        </section>
      )}

      {/* Le onze : terrain compact à gauche, liste prête à appliquer dans FM27 à droite. Survoler l'un met l'autre en évidence. */}
      <section className="card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">
              {team === 'B' ? plan.form : form} · {styleName(style)} <span className="text-sm font-normal text-brun">{t('fm.tac.fit', { value: note(plan.score) })}</span>
            </h2>
            <div className="flex gap-1" role="tablist" aria-label={t('fm.tac.team.label')}>
              {(['A', 'B'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={team === k}
                  onClick={() => setTeam(k)}
                  className={`chip ${team === k ? 'chip-on' : ''}`}
                >
                  {t(`fm.tac.team.${k}`)}
                </button>
              ))}
            </div>
          </div>
          {team === 'B' && planB && planA && (
            <p className="mt-1 text-sm text-brun">{t('fm.tac.team.help', { a: note(planA.score), b: note(planB.score) })}</p>
          )}
          <p className="mt-1 text-sm text-brun">
            <span className="mr-2 rounded-md bg-eau/20 px-1.5 py-0.5 text-xs font-bold text-canard">{t(fromGame ? 'fm.tac.fromGame' : 'fm.tac.suggested')}</span>
            {t(fromGame ? 'fm.tac.fromGameHelp' : gamePlan ? 'fm.tac.suggestedHelpGame' : 'fm.tac.suggestedHelp')}
          </p>
          {!gamePlan && lineupStatus && lineupStatus !== 'lue' && <p className="mt-1 text-xs text-brun">{t('fm.tac.lineupStatus', { status: lineupStatus })}</p>}

        <div className="mt-4 grid gap-6 xl:grid-cols-[minmax(18rem,26rem)_minmax(0,1fr)]">
          <div>
            <div className="relative mx-auto aspect-[3/4] w-full max-w-[26rem] overflow-hidden rounded-2xl bg-eau-fonce/90">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
                <g fill="none" stroke="white" strokeOpacity="0.35" strokeWidth="0.4">
                  <rect x="3" y="2" width="94" height="96" />
                  <line x1="3" y1="50" x2="97" y2="50" />
                  <circle cx="50" cy="50" r="9" />
                  <rect x="25" y="2" width="50" height="15" />
                  <rect x="25" y="83" width="50" height="15" />
                </g>
                <g stroke="white" strokeOpacity="0.6" strokeWidth="0.35" strokeDasharray="1 1">
                  {plan.slots.map((sl, i) => {
                    const [x1, y1] = phaseXY(sl, other, block);
                    const [x2, y2] = shown[i] ?? [x1, y1];
                    return Math.hypot(x1 - x2, y1 - y2) > 2 ? <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} /> : null;
                  })}
                </g>
              </svg>
              {plan.slots.map((sl, i) => {
                const [x, y] = shown[i] ?? [sl.x, sl.y];
                const code = phase === 'ip' ? sl.ip : sl.oop;
                const fit = sl.player ? engine.roleFit(sl.player, code, phase, sl.pos) : null;
                const off = !!sl.player && !sl.player.positions.includes(sl.pos);
                return (
                  <button
                    key={i}
                    type="button"
                    title={`${roleName(code, phase)}${off ? ` · ${t('fm.tac.offPos')}` : ''}`}
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                    className="absolute flex w-[23%] -translate-x-1/2 -translate-y-1/2 flex-col items-center transition-all duration-500"
                    style={{ left: `${x}%`, top: `${y}%` }}
                  >
                    <span
                      className={`whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-xs font-bold text-canard shadow ring-2 ${hover === i ? 'ring-ambre' : off ? 'ring-corail' : 'ring-white/0'}`}
                    >
                      {/* Le poste FM27 du créneau : le rôle déplace la pastille sur le terrain, jamais le poste. */}
                      {POS_LABEL[sl.pos]}
                    </span>
                    <span className="mt-0.5 max-w-full truncate rounded bg-canard/85 px-1.5 text-xs font-bold text-white">{sl.player ? shortName(sl.player.name) : t('fm.tac.nobody')}</span>
                    {fit != null && <span className="text-xs font-bold text-white/90">{note(fit)}</span>}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap justify-center gap-2" role="tablist">
              {(['ip', 'oop'] as const).map((ph) => (
                <button
                  key={ph}
                  type="button"
                  role="tab"
                  aria-selected={phase === ph}
                  onClick={() => update({ phase: ph })}
                  className={`chip ${phase === ph ? 'chip-on' : ''}`}
                >
                  {t(`fm.tac.phase.${ph}`)} {shape(ph)}
                </button>
              ))}
            </div>
          </div>

          <div className="min-w-0">
            <h3 className="font-semibold">{t('fm.tac.xi.title')}</h3>
            <div className="mt-2 overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('fm.tac.xi.pos')}</th>
                    <th>{t('fm.tac.xi.player')}</th>
                    <th>{t('fm.tac.phase.ip')}</th>
                    <th>{t('fm.tac.phase.oop')}</th>
                    <th>{t('fm.tac.xi.backup')}</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.slots.map((sl, i) => {
                    const p = sl.player;
                    const fitOf = (ph: Phase) => (p ? engine.roleFit(p, ph === 'ip' ? sl.ip : sl.oop, ph, sl.pos) : null);
                    return (
                      <tr key={i} className={hover === i ? 'bg-creme/70' : ''} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                        <td>
                          <PosBadge pos={sl.pos} />
                        </td>
                        <td className="font-bold text-canard">
                          {p ? <PlayerLink player={p} /> : <span className="text-corail">{t('fm.tac.nobody')}</span>}
                          {p?.team && <span className="ml-2 text-xs font-normal text-orange-fonce">{t('fm.tac.fromTeam', { team: p.team })}</span>}
                          {p && !p.positions.includes(sl.pos) && <span className="ml-2 text-xs font-normal text-brun">{t('fm.tac.offPos')}</span>}
                        </td>
                        {(['ip', 'oop'] as const).map((ph) => (
                          <td key={ph}>
                            <span className="text-canard">{roleName(ph === 'ip' ? sl.ip : sl.oop, ph)}</span>
                            {p && <span className="ml-2 text-xs font-bold text-brun">{note(fitOf(ph))}</span>}
                          </td>
                        ))}
                        <td className="text-brun">
                          {(plan.subs[i] ?? [])[0]?.name ?? '–'}
                          {(plan.subs[i] ?? [])[0]?.team && <span className="ml-1 text-xs text-orange-fonce">{t('fm.tac.fromTeam', { team: (plan.subs[i] ?? [])[0]!.team })}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <More>{t(fromGame ? 'fm.tac.pitchHelpGame' : 'fm.tac.pitchHelp')}</More>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h2 className="text-xl font-semibold">{t('fm.tac.balance')}</h2>
          <ul className="mt-3 space-y-3">
            {engine.balance(plan, style).map((c) => (
              <li key={c.id} className="flex gap-3">
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${DOT[c.status]}`} aria-hidden />
                <div className="text-sm">
                  <b className="text-canard">{t(`fm.tac.check.${c.id}.title`)}</b>{' '}
                  <span className="text-brun">{checkText(t, c, (x) => nf1.format(x))}</span>
                  {c.status !== 'good' && t(`fm.tac.check.${c.id}.tip`, { defaultValue: '' }) && (
                    <div className="mt-0.5 text-canard">→ {t(`fm.tac.check.${c.id}.tip`)}</div>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <More>{t('fm.tac.balanceHelp')}</More>

          <h3 className="mt-6 font-semibold">{t('fm.tac.forms')}</h3>
          <ol className="mt-2 space-y-1 text-sm">
            {plans.slice(0, 6).map((p) => (
              <li key={p.form}>
                <button
                  type="button"
                  onClick={() => update({ form: p.form, source: 'simloom' })}
                  className={`flex w-full items-center justify-between rounded-lg px-2 py-1 text-left ${p.form === form ? 'bg-eau/20' : 'hover:bg-creme'}`}
                >
                  <span className="font-bold text-canard">
                    {p.form}
                    {natural.includes(p.form) && <span className="ml-2 text-xs font-normal text-eau-fonce">{t('fm.tac.natural')}</span>}
                    {p.holes > 0 && <span className="ml-2 text-xs font-normal text-corail">{t('fm.tac.holes', { count: p.holes })}</span>}
                  </span>
                  <span className="text-brun">{note(p.score)}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
        <section className="card">
          <h2 className="text-xl font-semibold">{t('fm.tac.teamTitle', { style: styleName(style) })}</h2>
          {style.mentality && <p className="mt-1 text-sm">{t('fm.style.mentality', { value: style.mentality })}</p>}
          <div className="mt-3">
            <TeamCards inPossession={style.inPossession} outOfPossession={style.outOfPossession} />
          </div>
          <p className="mt-3 text-xs text-brun">{t('fm.tac.teamHelp')}</p>
        </section>
      </div>

      </>
      )}

      {showPi && (
      <section className="card">
        <h2 className="text-xl font-semibold">{t('fm.pi.title')}</h2>
        <p className="mt-1 text-sm text-brun">{budget < 3 ? t('fm.pi.budgetLow', { count: budget }) : t('fm.pi.budgetFull')}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {plan.slots
            .filter((sl) => sl.player)
            .map((sl, i) => {
              const adv = playerInstructions(engine, sl, style, plan.slots, budget);
              return (
                <div key={i} className="rounded-xl bg-creme/50 px-3 py-2 text-sm">
                  <div className="flex items-baseline gap-2">
                    <PosBadge pos={sl.pos} />
                    <PlayerLink player={sl.player!} className="font-bold text-canard" />
                  </div>
                  <p className="mb-1 mt-0.5 text-xs text-brun">
                    {roleName(sl.ip, 'ip')} · {roleName(sl.oop)}
                    {sl.game?.custom && <span className="ml-1 rounded-full bg-canard/10 px-1.5 text-canard">{t('fm.pi.custom')}</span>}
                  </p>
                  {sl.game && (sl.game.instructions.ip.length > 0 || sl.game.instructions.oop.length > 0) && (
                    <p className="mb-1 text-xs text-canard">
                      <b>{t('fm.pi.inGame')}</b> {[...sl.game.instructions.ip, ...sl.game.instructions.oop].join(' · ')}
                    </p>
                  )}
                  {adv.list.length ? (
                    adv.list.map((x) => (
                      <div key={x.id} className="py-0.5">
                        <span className={`mr-1 rounded-md px-1.5 py-0.5 text-xs font-bold ${x.phase === 'ip' ? 'bg-eau/30 text-canard' : 'bg-canard/10 text-canard'}`}>
                          {t(`fm.pi.${x.phase}`)}
                        </span>
                        <b className="text-canard">{t(`fm.pi.id.${x.id}`)}</b>{' '}
                        <span className="text-xs text-brun">{t(`fm.pi.why.${x.why}`, fmtVals(x.vals, nf1))}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-brun">{t('fm.pi.nothing')}</p>
                  )}
                  {adv.switches.map((w) => (
                    <p key={w.to} className="mt-1 text-xs text-canard">
                      →{' '}
                      {t('fm.pi.switch', {
                        phase: t(w.phase === 'ip' ? 'fm.pi.phaseIp' : 'fm.pi.phaseOop'),
                        from: roleName(w.from),
                        to: roleName(w.to),
                        what: t(`fm.pi.id.${w.unlocks}`),
                      })}
                    </p>
                  ))}
                </div>
              );
            })}
        </div>
        <p className="mt-3 text-xs text-brun">{t('fm.pi.help')}</p>
        <More>{t('fm.pi.locks')}</More>
      </section>
      )}
    </div>
  );
}

/** Nom court pour le terrain : « A. Guardado Navarrete » plutôt que le nom complet. */
const shortName = (name: string) => {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]![0]}. ${parts.slice(1).join(' ')}` : name;
};

/** Valeurs d'une raison : les notes sur 20 au format de la langue. */
const fmtVals = (vals: Record<string, number | string>, nf: Intl.NumberFormat) =>
  Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, typeof v === 'number' ? nf.format(v) : v]));

/** Détail d'un contrôle d'équilibre, avec ses valeurs. */
function checkText(t: (k: string, o?: Record<string, unknown>) => string, c: BalanceCheck, fmt: (x: number) => string): string {
  const p = c.params;
  const v = (x: unknown) => (typeof x === 'number' ? fmt(x) : '–');
  switch (c.id) {
    case 'width':
      return p.side ? t(`fm.tac.check.width.missing.${String(p.side)}`) : t('fm.tac.check.width.ok');
    case 'creation':
    case 'cover':
      return t(`fm.tac.check.${c.id}.text`, { count: p.count as number });
    case 'box':
      return t('fm.tac.check.box.text', { count: p.count as number }) + (p.finisher ? t('fm.tac.check.box.finisher', { name: p.finisher, value: v(p.value) }) : '');
    case 'pace':
      return t(p.highLine ? 'fm.tac.check.pace.textHigh' : 'fm.tac.check.pace.text', { value: v(p.value) });
    case 'press':
    case 'aerial':
      return t(`fm.tac.check.${c.id}.text`, { value: v(p.value) });
    case 'fitness': {
      const names = (p.names as string[]) ?? [];
      return names.length ? t('fm.tac.check.fitness.tired', { names: names.join(', ') }) : t('fm.tac.check.fitness.ok');
    }
  }
}
