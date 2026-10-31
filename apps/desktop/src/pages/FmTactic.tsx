import {
  FORMATIONS,
  POS_LABEL,
  STYLE_FORMS,
  TacticEngine,
  knownFormation,
  mergeReference,
  phaseXY,
  planFromLineup,
  playerInstructions,
  rolePos,
  shapeOf,
  spreadXY,
  styleBlock,
  tacticReferenceSchema,
  type BalanceCheck,
  type FmPlayer,
  type GameSlot,
  type Phase,
  type TacticReference,
} from '@simloom/module-fm';
import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

const PREFS_KEY = 'simloom.fm.tactic';
interface Prefs {
  style?: string;
  form?: string;
  phase?: Phase;
  /** Onze affiché : celui lu dans le jeu (par défaut quand il existe) ou celui calculé par Simloom. */
  source?: 'game' | 'simloom';
}
const readPrefs = (): Prefs => {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Prefs;
  } catch {
    return {};
  }
};
const writePrefs = (p: Prefs) => {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* stockage indisponible : les choix ne sont pas retenus */
  }
};

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
export function useTacticEngine(folder: string) {
  const { data: local } = useQuery({ queryKey: ['fm', 'reference', folder], queryFn: () => loadLocalReference(folder), staleTime: 60_000 });
  const engine = useMemo(() => new TacticEngine(mergeReference(local?.ref)), [local?.ref]);
  return { engine, local };
}

/**
 * Style, schéma et onze choisis en Tactique > Composition (retenus d'une vue à l'autre) :
 * les autres vues de l'effectif s'appuient dessus pour rester cohérentes.
 */
export function useTacticChoice(players: FmPlayer[], folder: string, gameFormation: string | null, lineup: GameSlot[] | null = null) {
  const { engine, local } = useTacticEngine(folder);
  const [prefs, setPrefs] = useState<Prefs>(readPrefs);
  const update = (p: Prefs) => {
    const next = { ...prefs, ...p };
    setPrefs(next);
    writePrefs(next);
  };
  const avail = useMemo(() => players.filter((p) => !p.injury && Object.keys(p.attributes).length > 0), [players]);
  const ranked = useMemo(() => engine.rankStyles(avail), [engine, avail]);
  const style = ranked.find((r) => r.style.id === prefs.style)?.style ?? ranked[0]?.style;
  const gameForm = knownFormation(gameFormation);
  const natural = (style && STYLE_FORMS[style.id]?.filter((f) => FORMATIONS[f])) || ['4-3-3'];
  const form = prefs.form && FORMATIONS[prefs.form] ? prefs.form : (gameForm ?? natural[0] ?? '4-3-3');
  const plans = useMemo(
    () => (style ? Object.keys(FORMATIONS).map((f) => engine.formationPlan(f, style, avail)).sort((a, b) => b.score - a.score) : []),
    [engine, style, avail],
  );
  const gamePlan = useMemo(() => (lineup ? planFromLineup(engine, lineup, players, gameForm ?? gameFormation) : null), [engine, lineup, players, gameForm, gameFormation]);
  const fromGame = !!gamePlan && prefs.source !== 'simloom';
  const plan = fromGame ? gamePlan : plans.find((p) => p.form === form);
  return { engine, local, prefs, update, avail, ranked, style, natural, form: fromGame ? gamePlan.form || form : form, plans, plan, gamePlan, fromGame };
}

const DOT: Record<BalanceCheck['status'], string> = { good: 'bg-eau', warn: 'bg-ambre', bad: 'bg-corail' };

/** Tactique : style conseillé, schéma, onze par rôles, formes avec et sans ballon, équilibre. */
export function FmTactic({ players, folder, gameFormation, lineup, lineupStatus }: { players: FmPlayer[]; folder: string; gameFormation: string | null; lineup: GameSlot[] | null; lineupStatus?: string | null }) {
  const { t, i18n } = useTranslation();
  const en = i18n.resolvedLanguage === 'en';
  const { engine, local, prefs, update, avail, ranked, style, natural, form, plans, plan, gamePlan, fromGame } = useTacticChoice(players, folder, gameFormation, lineup);
  const phase: Phase = prefs.phase ?? 'ip';

  if (!avail.length || !style || !plan) return <p className="card mt-6 text-brun">{t('fm.tac.noAttributes')}</p>;

  const block = styleBlock(style);
  const roleName = (code: string) => {
    const r = engine.roles.get(code);
    return (en ? r?.en : r?.fr) ?? r?.fr ?? code;
  };
  const styleName = (s: typeof style) => (en && s.nameEn ? s.nameEn : s.name);
  const nf = new Intl.NumberFormat(i18n.resolvedLanguage, { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat(i18n.resolvedLanguage, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const pct = (f: number | null) => (f == null ? '–' : `${nf.format((f / 20) * 100)} %`);
  const field = plan.slots.filter((s) => s.pos !== 'GB');
  const shape = (ph: Phase) => shapeOf(field.map((s) => phaseXY(s, ph, block)));
  const shown = spreadXY(plan.slots.map((s) => phaseXY(s, phase, block)));
  const other: Phase = phase === 'ip' ? 'oop' : 'ip';

  return (
    <div className="mt-6 space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <label className="text-sm font-bold">
          {t('fm.tac.style')}
          <select className="input mt-1 block font-normal" value={style.id} onChange={(e) => update({ style: e.target.value, form: undefined })}>
            {ranked.map((r) => (
              <option key={r.style.id} value={r.style.id}>
                {styleName(r.style)} · {pct(r.fit)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-bold">
          {t('fm.tac.formation')}
          <select className="input mt-1 block font-normal" value={form} disabled={fromGame} onChange={(e) => update({ form: e.target.value })}>
            {fromGame && !FORMATIONS[form] && <option value={form}>{form || gameFormation}</option>}
            {plans.map((p) => (
              <option key={p.form} value={p.form}>
                {p.form} · {pct(p.score)}
              </option>
            ))}
          </select>
        </label>
        {gamePlan && (
          <div className="flex gap-1 self-end" role="tablist">
            {(['game', 'simloom'] as const).map((src) => (
              <button
                key={src}
                type="button"
                role="tab"
                aria-selected={(src === 'game') === fromGame}
                onClick={() => update({ source: src })}
                className={`rounded-full px-3 py-1.5 text-sm font-bold ${(src === 'game') === fromGame ? 'bg-canard text-white' : 'bg-white text-canard ring-1 ring-canard/15'}`}
              >
                {t(`fm.tac.source.${src}`)}
              </button>
            ))}
          </div>
        )}
        {gameFormation && <span className="rounded-full bg-eau/20 px-3 py-1 text-sm text-canard">{t('fm.tac.inGame', { form: gameFormation })}</span>}
        {local?.ref && <span className="rounded-full bg-eau/20 px-3 py-1 text-sm text-canard">{t('fm.tac.localRef')}</span>}
        {local?.error && <span className="rounded-full bg-corail/15 px-3 py-1 text-sm text-canard">{t('fm.tac.localRefError')}</span>}
      </div>
      {style.summary && <p className="text-sm text-brun">{style.summary}</p>}

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr] 2xl:grid-cols-2">
        <section className="card">
          <h2 className="text-xl font-semibold">
            {form} · {styleName(style)} <span className="text-sm font-normal text-brun">{t('fm.tac.fit', { value: pct(plan.score) })}</span>
          </h2>
          <p className="mt-1 text-sm text-brun">
            <span className="mr-2 rounded-full bg-eau/20 px-2 py-0.5 text-xs font-bold text-canard">{t(fromGame ? 'fm.tac.fromGame' : 'fm.tac.suggested')}</span>
            {t(fromGame ? 'fm.tac.fromGameHelp' : gamePlan ? 'fm.tac.suggestedHelpGame' : 'fm.tac.suggestedHelp')}
          </p>
          {!gamePlan && lineupStatus && lineupStatus !== 'lue' && <p className="mt-1 text-xs text-brun">{t('fm.tac.lineupStatus', { status: lineupStatus })}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2" role="tablist">
            {(['ip', 'oop'] as const).map((ph) => (
              <button
                key={ph}
                type="button"
                role="tab"
                aria-selected={phase === ph}
                onClick={() => update({ phase: ph })}
                className={`rounded-full px-3 py-1 text-sm font-bold ${phase === ph ? 'bg-canard text-white' : 'bg-white text-canard ring-1 ring-canard/15'}`}
              >
                {t(`fm.tac.phase.${ph}`)} {shape(ph)}
              </button>
            ))}
          </div>

          {/* Le terrain tient dans la hauteur de la fenêtre, sans défiler. */}
          <div className="relative mx-auto mt-4 aspect-[3/4] w-full overflow-hidden rounded-2xl bg-eau-fonce/90" style={{ maxWidth: 'max(20rem, calc((100vh - 12rem) * 0.75))' }}>
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
              const subs = plan.subs[i] ?? [];
              const title = [
                t('fm.tac.otherPhase', { phase: t(`fm.tac.phase.${other}`), role: roleName(phase === 'ip' ? sl.oop : sl.ip) }),
                subs.length ? t('fm.tac.subs', { names: subs.map((p) => p.name).join(', ') }) : '',
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <div
                  key={i}
                  title={title}
                  className="absolute w-[24%] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white/95 px-2 py-1 text-center text-xs shadow transition-all duration-500"
                  style={{ left: `${x}%`, top: `${y}%` }}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-bold text-canard">{POS_LABEL[rolePos(sl, phase)]}</span>
                    {fit != null && <span className="text-brun">{pct(fit)}</span>}
                  </div>
                  <div className="truncate text-brun">{roleName(code)}</div>
                  <div className="truncate font-bold text-canard">{sl.player?.name ?? t('fm.tac.nobody')}</div>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-brun">{t(fromGame ? 'fm.tac.pitchHelpGame' : 'fm.tac.pitchHelp')}</p>
        </section>

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
          <p className="mt-3 text-xs text-brun">{t('fm.tac.balanceHelp')}</p>

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
                  <span className="text-brun">{pct(p.score)}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section className="card">
        <h2 className="text-xl font-semibold">{t('fm.pi.title')}</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {plan.slots
            .filter((sl) => sl.player)
            .map((sl, i) => {
              const adv = playerInstructions(engine, sl, style, plan.slots);
              return (
                <div key={i} className="rounded-xl bg-creme/50 px-3 py-2 text-sm">
                  <div className="flex items-baseline gap-2">
                    <span className="rounded-full bg-eau/20 px-2 py-0.5 text-xs font-bold text-canard">{POS_LABEL[sl.pos]}</span>
                    <b className="text-canard">{sl.player!.name}</b>
                  </div>
                  <p className="mb-1 mt-0.5 text-xs text-brun">
                    {roleName(sl.ip)} · {roleName(sl.oop)}
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
                        <span className={`mr-1 rounded-full px-2 py-0.5 text-xs font-bold ${x.phase === 'ip' ? 'bg-eau/30 text-canard' : 'bg-canard/10 text-canard'}`}>
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
        <p className="mt-1 text-xs text-brun">{t('fm.pi.locks')}</p>
      </section>
    </div>
  );
}

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
