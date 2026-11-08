import {
  analyseBuiltTactic,
  defaultOption,
  builtFromGame,
  FORMATIONS,
  MENTALITIES_FM27,
  newBuiltTactic,
  parseBuiltTactics,
  POS_LABEL,
  POS_ORDER,
  rolesAt,
  spreadXY,
  styleInstructions,
  tacticSlots,
  TEAM_INSTRUCTIONS_FM27,
  unavailable,
  type Area,
  type BuiltTactic,
  type Finding,
  type FmPlayer,
  type FmSnapshot,
  type Phase,
  type PosCode,
} from '@fm-immersion/module-fm';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { readScoped, useFmSaveScope, writeScoped } from '../lib/save-store';
import { useTacticEngine } from './FmTactic';
import { Empty, Fit, More, Panel, useNames } from './FmUi';

/*
 * Construire une tactique de zéro : onze postes et rôles avec et sans ballon, mentalité et consignes d'équipe,
 * puis forces et faiblesses calculées par FM Immersion. Consultatif : le joueur reporte lui-même sa tactique
 * dans FM27, rien n'est écrit dans le jeu. Les tactiques sont retenues sur ce PC, par partie.
 */

const KEY = 'fmi.builder.v1';
interface Stored {
  list: unknown[];
  current?: string;
}

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `t${Date.now()}`);
const TONE_DOT = { good: 'bg-eau', warn: 'bg-ambre', bad: 'bg-corail' } as const;
const AREAS: Area[] = ['roles', 'lanes', 'centre', 'rest', 'attack', 'transition', 'press', 'coherence', 'squad'];
const STAGES = ['ip', 'transition', 'oop'] as const;

export function FmBuilder({ snap, players, folder }: { snap?: FmSnapshot; players: FmPlayer[]; folder: string }) {
  const { t } = useTranslation();
  const names = useNames();
  const scope = useFmSaveScope();
  const { engine } = useTacticEngine(folder, players);
  const avail = useMemo(() => players.filter((p) => !unavailable(p) && Object.keys(p.attributes).length > 0), [players]);
  const game = useMemo(() => tacticSlots(snap?.tactic), [snap]);
  const gameName = typeof snap?.tactic?.name === 'string' ? snap.tactic.name : null;

  const [store, setStore] = useState<{ list: BuiltTactic[]; current?: string }>(() => {
    const s = readScoped<Stored>(KEY, { ...scope, inheritsLegacy: false }, { list: [] });
    return { list: parseBuiltTactics(s.list), current: s.current };
  });
  const save = (list: BuiltTactic[], current?: string) => {
    const next = { list, current };
    setStore(next);
    writeScoped(KEY, scope, next);
  };
  const cur = store.list.find((x) => x.id === store.current) ?? store.list[0] ?? null;
  const put = (x: BuiltTactic) => save(store.list.some((y) => y.id === x.id) ? store.list.map((y) => (y.id === x.id ? { ...x, updatedAt: new Date().toISOString() } : y)) : [...store.list, x], x.id);

  const [form, setForm] = useState('4-3-3');
  const [phase, setPhase] = useState<Phase>('ip');
  const [hover, setHover] = useState<number[] | null>(null);
  const analysis = useMemo(() => (cur ? analyseBuiltTactic(engine, cur, avail) : null), [engine, cur, avail]);

  const create = () => put(newBuiltTactic(engine, form, newId(), t('fm.builder.defaultName', { form })));
  const fromGame = () => {
    const x = game && builtFromGame(engine, game, newId(), gameName ?? t('fm.builder.gameName'));
    if (x) put(x);
  };

  const starters = (
    <div className="flex flex-wrap items-center gap-2">
      <select className="input w-auto py-1.5" value={form} onChange={(e) => setForm(e.target.value)} aria-label={t('fm.tac.formation')}>
        {Object.keys(FORMATIONS).map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>
      <button type="button" className="btn-primary px-3 py-1.5 text-sm" onClick={create}>
        {t('fm.builder.new')}
      </button>
      {game && (
        <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={fromGame}>
          {t('fm.builder.fromGame')}
        </button>
      )}
    </div>
  );

  if (!cur || !analysis)
    return (
      <Panel title={t('fm.builder.title')}>
        <p className="mb-3 text-sm text-brun">{t('fm.builder.empty')}</p>
        {starters}
      </Panel>
    );

  const setSlot = (i: number, p: Partial<BuiltTactic['slots'][number]>) => {
    const slots = cur.slots.map((s, k) => (k === i ? { ...s, ...p } : s));
    // Poste changé : le rôle reste s'il existe au nouveau poste, sinon le premier rôle proposé.
    const fix = (ph: Phase) => {
      const list = rolesAt(engine, slots.map((s) => ({ pos: ph === 'ip' ? s.pos : s.posOOP })), i, ph);
      const code = slots[i]![ph];
      if (!list.some((r) => r.code === code)) slots[i] = { ...slots[i]!, [ph]: (list.find((r) => r.phase === 'both') ?? list[0])?.code ?? code };
    };
    if (p.pos) fix('ip');
    if (p.posOOP || p.pos) fix('oop');
    put({ ...cur, slots });
  };
  const roleLabel = (code: string, ph: Phase) => {
    const r = engine.roles.get(code);
    return r ? `${names.role(r)}${ph === 'ip' && r.duty ? ` (${t(`fm.tac.duty.${r.duty}`)})` : ''}` : code;
  };
  const posOptions = (gk: boolean) => (gk ? (['GB'] as PosCode[]) : POS_ORDER.filter((p) => p !== 'GB'));
  const pts = spreadXY(analysis.xy[phase], 21, 12).map(([x, y]) => [Math.min(88, Math.max(12, x)), Math.min(91, Math.max(7, y))] as [number, number]);
  const sideName = (s: unknown) => t(`fm.builder.side.${String(s)}`);
  const text = (f: Finding) =>
    t(`fm.builder.f.${f.id}`, {
      ...f.params,
      side: f.params.side != null ? sideName(f.params.side) : undefined,
      phase: f.params.phase != null ? t(`fm.tac.phase.${String(f.params.phase)}`) : undefined,
      zone: f.params.zone != null ? t(`fm.builder.zone.${String(f.params.zone)}`) : undefined,
      names: Array.isArray(f.params.names) ? (f.params.names as string[]).join(', ') : undefined,
    });
  const pros = analysis.findings.filter((f) => f.tone === 'good');
  const cons = analysis.findings.filter((f) => f.tone !== 'good').sort((a, b) => (a.tone === b.tone ? 0 : a.tone === 'bad' ? -1 : 1));
  const item = (f: Finding, k: number) => (
    <li
      key={`${f.id}-${k}`}
      className="flex gap-2 rounded-lg px-2 py-1 hover:bg-creme"
      onMouseEnter={() => setHover(f.slots ?? null)}
      onMouseLeave={() => setHover(null)}
    >
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TONE_DOT[f.tone]}`} aria-hidden />
      <span>
        <span className="mr-1 text-xs font-bold uppercase text-canard/60">{t(`fm.builder.area.${f.area}`)}</span>
        {text(f)}
      </span>
    </li>
  );
  const gauge = (label: string, v: number, invert = false) => {
    const tone = invert ? (v >= 65 ? 'bg-corail' : v >= 40 ? 'bg-ambre' : 'bg-eau') : v >= 60 ? 'bg-eau' : v >= 35 ? 'bg-ambre' : 'bg-corail';
    return (
      <div>
        <div className="flex justify-between text-sm">
          <span className="font-bold">{label}</span>
          <span>{v}</span>
        </div>
        <div className="mt-1 h-2 rounded-full bg-canard/10">
          <div className={`h-2 rounded-full ${tone}`} style={{ width: `${v}%` }} />
        </div>
      </div>
    );
  };
  const stageDefs = (st: (typeof STAGES)[number]) => TEAM_INSTRUCTIONS_FM27.filter((d) => d.phase === st);
  const setTi = (id: number, o: number, def: number) => {
    const ti = { ...cur.ti };
    if (o === def) delete ti[id];
    else ti[id] = o;
    put({ ...cur, ti });
  };

  return (
    <div className="space-y-4">
      {/* Tactiques retenues, nom, nouvelle tactique. */}
      <section className="card flex flex-wrap items-center gap-3">
        <select className="input w-auto max-w-[16rem] py-1.5" value={cur.id} onChange={(e) => save(store.list, e.target.value)} aria-label={t('fm.builder.saved')}>
          {store.list.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        <input className="input w-auto max-w-[16rem] py-1.5" value={cur.name} onChange={(e) => put({ ...cur, name: e.target.value })} aria-label={t('fm.builder.name')} maxLength={60} />
        <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={() => put({ ...cur, id: newId(), name: t('fm.builder.copyName', { name: cur.name }) })}>
          {t('fm.builder.duplicate')}
        </button>
        <button
          type="button"
          className="px-2 py-1.5 text-sm font-bold text-corail hover:underline"
          onClick={() => {
            if (window.confirm(t('fm.builder.deleteConfirm', { name: cur.name }))) save(store.list.filter((x) => x.id !== cur.id));
          }}
        >
          {t('fm.builder.delete')}
        </button>
        <div className="ml-auto">{starters}</div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]">
        {/* Terrain : forme avec ou sans ballon, rôles appliqués. */}
        <section className="card">
          <div className="relative mx-auto aspect-[3/4] w-full max-w-[24rem] overflow-hidden rounded-2xl bg-eau-fonce/90">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
              <g fill="none" stroke="white" strokeOpacity="0.35" strokeWidth="0.4">
                <rect x="3" y="2" width="94" height="96" />
                <line x1="3" y1="50" x2="97" y2="50" />
                <circle cx="50" cy="50" r="9" />
                <rect x="25" y="2" width="50" height="15" />
                <rect x="25" y="83" width="50" height="15" />
              </g>
            </svg>
            {cur.slots.map((s, i) => {
              const [x, y] = pts[i]!;
              const code = phase === 'ip' ? s.ip : s.oop;
              const pos = phase === 'ip' ? s.pos : s.posOOP;
              const lit = hover?.includes(i);
              return (
                <div key={i} className="absolute flex w-[24%] -translate-x-1/2 -translate-y-1/2 flex-col items-center transition-all duration-500" style={{ left: `${x}%`, top: `${y}%` }}>
                  <span className={`whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-xs font-bold text-canard shadow ring-2 ${lit ? 'ring-ambre' : 'ring-white/0'}`}>{POS_LABEL[pos]}</span>
                  <span className="mt-0.5 max-w-full truncate rounded bg-canard/85 px-1.5 text-[0.7rem] font-bold text-white">{engine.roles.get(code)?.code ?? code}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap justify-center gap-2" role="tablist">
            {(['ip', 'oop'] as const).map((ph) => (
              <button key={ph} type="button" role="tab" aria-selected={phase === ph} onClick={() => setPhase(ph)} className={`chip ${phase === ph ? 'chip-on' : ''}`}>
                {t(`fm.tac.phase.${ph}`)} {analysis.shape[ph]}
              </button>
            ))}
          </div>
        </section>

        {/* L'analyse : jauges, risque, forces et faiblesses, duos. */}
        <Panel title={t('fm.builder.analysis')} className="min-w-0">
          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
            {gauge(t('fm.builder.score.penetration'), analysis.scores.penetration)}
            {gauge(t('fm.builder.score.support'), analysis.scores.support)}
            {gauge(t('fm.builder.score.solidity'), analysis.scores.solidity)}
            {gauge(t('fm.builder.score.risk'), analysis.risk, true)}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {AREAS.filter((a) => a !== 'squad' || analysis.squad).map((a) => (
              <span key={a} className="inline-flex items-center gap-1.5 rounded-md bg-creme px-2 py-0.5 text-sm">
                <span className={`h-2 w-2 rounded-full ${TONE_DOT[analysis.areas[a]]}`} aria-hidden />
                {t(`fm.builder.area.${a}`)}
              </span>
            ))}
          </div>
          <div className="mt-4 grid gap-4 2xl:grid-cols-2">
            <div>
              <h3 className="font-bold">{t('fm.builder.cons', { count: cons.length })}</h3>
              {cons.length ? <ul className="mt-1 space-y-0.5 text-sm">{cons.map(item)}</ul> : <p className="text-sm text-brun">{t('fm.builder.noCons')}</p>}
            </div>
            <div>
              <h3 className="font-bold">{t('fm.builder.pros', { count: pros.length })}</h3>
              {pros.length ? <ul className="mt-1 space-y-0.5 text-sm">{pros.map(item)}</ul> : <p className="text-sm text-brun">{t('fm.builder.noPros')}</p>}
            </div>
          </div>
          {analysis.partnerships.length > 0 && (
            <div className="mt-4">
              <h3 className="font-bold">{t('fm.builder.pairs')}</h3>
              <ul className="mt-1 flex flex-wrap gap-2 text-sm">
                {analysis.partnerships.map((p) => (
                  <li
                    key={p.zone}
                    className="inline-flex items-center gap-1.5 rounded-md bg-creme px-2 py-0.5"
                    onMouseEnter={() => setHover(p.slots)}
                    onMouseLeave={() => setHover(null)}
                  >
                    <span className={`h-2 w-2 rounded-full ${p.status === 'balanced' ? 'bg-eau' : p.status === 'overloading' ? 'bg-ambre' : 'bg-corail'}`} aria-hidden />
                    {t(`fm.builder.zone.${p.zone}`)} · {t(`fm.builder.pairStatus.${p.status}`)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!analysis.squad && <p className="mt-3 text-sm text-brun">{t('fm.builder.noSquad')}</p>}
          <More>{t('fm.builder.help')}</More>
        </Panel>
      </div>

      {/* Les onze créneaux : poste et rôle avec ballon, puis sans ballon. */}
      <section className="card overflow-x-auto">
        <h2 className="text-lg font-semibold">{t('fm.builder.slots')}</h2>
        <p className="mb-2 text-sm text-brun">{t('fm.builder.slotsHelp')}</p>
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-canard/60">
              <th className="py-1">{t('fm.builder.posIp')}</th>
              <th>{t('fm.builder.roleIp')}</th>
              <th>{t('fm.builder.posOop')}</th>
              <th>{t('fm.builder.roleOop')}</th>
              {analysis.squad && <th>{t('fm.builder.player')}</th>}
            </tr>
          </thead>
          <tbody>
            {cur.slots.map((s, i) => {
              const gk = s.pos === 'GB';
              const ipRoles = rolesAt(engine, cur.slots, i, 'ip');
              const oopRoles = rolesAt(engine, cur.slots.map((x) => ({ pos: x.posOOP })), i, 'oop');
              const sq = analysis.squad?.xi[i];
              const lit = hover?.includes(i);
              return (
                <tr key={i} className={`border-t border-canard/10 ${lit ? 'bg-ambre/15' : ''}`}>
                  <td className="py-1 pr-2">
                    <select className="input py-1" value={s.pos} disabled={gk} onChange={(e) => setSlot(i, { pos: e.target.value as PosCode, posOOP: e.target.value === 'MOG' ? 'MG' : e.target.value === 'MOD' ? 'MD' : (e.target.value as PosCode) })}>
                      {posOptions(gk).map((p) => (
                        <option key={p} value={p}>
                          {POS_LABEL[p]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="pr-2">
                    <select className="input w-full py-1" value={s.ip} onChange={(e) => setSlot(i, { ip: e.target.value })}>
                      {!ipRoles.some((r) => r.code === s.ip) && <option value={s.ip}>{roleLabel(s.ip, 'ip')} ⚠</option>}
                      {ipRoles.map((r) => (
                        <option key={r.code} value={r.code}>
                          {roleLabel(r.code, 'ip')}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="pr-2">
                    <select className="input py-1" value={s.posOOP} disabled={gk} onChange={(e) => setSlot(i, { posOOP: e.target.value as PosCode })}>
                      {posOptions(gk).map((p) => (
                        <option key={p} value={p}>
                          {POS_LABEL[p]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="pr-2">
                    <select className="input w-full py-1" value={s.oop} onChange={(e) => setSlot(i, { oop: e.target.value })}>
                      {!oopRoles.some((r) => r.code === s.oop) && <option value={s.oop}>{roleLabel(s.oop, 'oop')} ⚠</option>}
                      {oopRoles.map((r) => (
                        <option key={r.code} value={r.code}>
                          {roleLabel(r.code, 'oop')}
                        </option>
                      ))}
                    </select>
                  </td>
                  {analysis.squad && (
                    <td className="whitespace-nowrap">
                      {sq?.player ? (
                        <span className="flex items-center gap-2">
                          <span className="max-w-[9rem] truncate">{sq.player.name}</span>
                          <Fit value={sq.fit} />
                        </span>
                      ) : (
                        <span className="text-corail">{t('fm.tac.nobody')}</span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* Le style : mentalité, consignes d'équipe comme à l'écran du jeu. */}
      <Panel title={t('fm.builder.styleTitle')}>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-bold">
            {t('fm.builder.mentality')}
            <select className="input py-1.5 font-normal" value={cur.mentality} onChange={(e) => put({ ...cur, mentality: e.target.value })}>
              {MENTALITIES_FM27.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm font-bold">
            {t('fm.builder.preset')}
            <select
              className="input py-1.5 font-normal"
              value=""
              onChange={(e) => {
                const st = engine.ref.styles.find((s) => s.id === e.target.value);
                if (!st) return;
                const x = styleInstructions(st);
                put({ ...cur, ti: x.ti, mentality: x.mentality ?? cur.mentality });
              }}
            >
              <option value="">{t('fm.builder.presetPick')}</option>
              {engine.ref.styles.map((s) => (
                <option key={s.id} value={s.id}>
                  {names.style(s)}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="text-sm font-bold text-orange-fonce hover:underline" onClick={() => put({ ...cur, ti: {} })}>
            {t('fm.builder.resetTi')}
          </button>
          <span className="text-sm text-brun">{t('fm.builder.tiCount', { count: analysis.instructions })}</span>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {STAGES.map((st) => (
            <div key={st}>
              <p className="text-xs font-bold uppercase text-canard/60">{t(`fm.builder.stage.${st}`)}</p>
              <ul className="mt-1 space-y-1 text-sm">
                {stageDefs(st).map((d) => {
                  const o = cur.ti[d.id] ?? defaultOption(d);
                  const set = cur.ti[d.id] != null && cur.ti[d.id] !== defaultOption(d);
                  return (
                    <li key={d.id} className="flex items-center justify-between gap-2">
                      <span className={set ? 'font-bold' : 'text-brun'}>{d.title}</span>
                      <select className={`input max-w-[12rem] py-0.5 text-sm ${set ? 'font-bold' : ''}`} value={o} onChange={(e) => setTi(d.id, Number(e.target.value), defaultOption(d))}>
                        {d.short.map((label, k) => (
                          <option key={k} value={k}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </Panel>

      {!avail.length && players.length > 0 && <Empty>{t('fm.tac.noAttributes')}</Empty>}
    </div>
  );
}
