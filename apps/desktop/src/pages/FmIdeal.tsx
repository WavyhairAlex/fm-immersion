import {
  builtFromGame,
  builtInstructionLabels,
  EMPTY_TASTE,
  gameInstructions,
  parseTaste,
  POS_LABEL,
  proposeTactics,
  tacticSlots,
  TASTE_MUSTS,
  tasteAnswered,
  tasteOfStyle,
  type BuiltTactic,
  type FmPlayer,
  type FmSnapshot,
  type Proposal,
  type TacticProposals,
  type ProposalNote,
  type TacticScores,
  type Taste,
  type TasteMust,
} from '@fm-immersion/module-fm';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { readScoped, useFmSaveScope, writeScoped } from '../lib/save-store';
import { addBuiltTactic } from './FmBuilder';
import { TACTIC_EVENT, useTacticChoice } from './FmTactic';
import { Empty, Fit, More, Panel, PlayerLink, TeamCards, useNames } from './FmUi';

/*
 * « Ma tactique idéale » : le joueur décrit ce qu'il aime jouer (un style tout fait ou 7 questions courtes), l'appli
 * propose trois tactiques complètes pour son effectif (calcul : tactic-taste.ts). Consultatif : il recopie lui-même
 * dans FM27 ce qu'il garde ; « Ouvrir dans Construire » range la tactique dans l'éditeur pour la retoucher.
 */

const KEY = 'fmi.taste.v1';
const BALL = ['keep', 'fast', 'long'] as const;
const ATTACK = ['wide', 'centre', 'both'] as const;
const DEFEND = ['high', 'mid', 'low'] as const;
const RISK = ['cautious', 'balanced', 'positive', 'allout'] as const;
const TUNING = ['simple', 'worked'] as const;
const START = ['game', 'blank'] as const;
/** Souhaits qui s'excluent : en cocher un décoche l'autre. */
const EXCLUSIVE: Partial<Record<TasteMust, TasteMust>> = { back3: 'back4', back4: 'back3' };

const nf1 = (v: number, lang?: string) => v.toLocaleString(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function FmIdeal({ snap, players, folder, go }: { snap?: FmSnapshot; players: FmPlayer[]; folder: string; go: (v: string) => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;
  const names = useNames();
  const scope = useFmSaveScope();
  const { engine, avail, reserve, ranked, update } = useTacticChoice(players, folder, null);
  const [taste, setTasteState] = useState<Taste>(() => parseTaste(readScoped<unknown>(KEY, { ...scope, inheritsLegacy: false }, null)));
  const setTaste = (next: Taste) => {
    setTasteState(next);
    writeScoped(KEY, scope, next);
  };
  // Tactique jouée dans FM27 (lue par le plugin) : point de départ et élément de comparaison.
  const game = useMemo<BuiltTactic | null>(() => {
    const slots = tacticSlots(snap?.tactic);
    if (!slots) return null;
    const name = typeof snap?.tactic?.name === 'string' ? snap.tactic.name : t('fm.builder.gameName');
    const mentality = typeof snap?.tactic?.mentality === 'string' ? snap.tactic.mentality : null;
    return builtFromGame(engine, slots, 'game', name, gameInstructions(snap), mentality);
  }, [snap, engine, t]);
  // Le calcul règle chaque proposition (une à deux secondes) : il tourne après l'affichage pour ne pas figer les réponses.
  const [result, setResult] = useState<TacticProposals | null>(null);
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    setBusy(true);
    const id = window.setTimeout(() => {
      setResult(proposeTactics({ engine, players: avail, reserve, taste, ranked, game }));
      setBusy(false);
    }, 40);
    return () => window.clearTimeout(id);
  }, [engine, avail, reserve, taste, ranked, game]);
  const [open, setOpen] = useState<Proposal['kind'] | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  if (!avail.length || !ranked.length) return <Empty>{t('fm.tac.noAttributes')}</Empty>;

  const answered = tasteAnswered(taste);
  const proposals = result?.proposals ?? [];
  const shown = proposals.find((p) => p.kind === open) ?? proposals.find((p) => p.recommended) ?? proposals[0] ?? null;

  // Une réponse du questionnaire : recliquer la réponse choisie l'efface ; le style tout fait n'est plus coché.
  const answer = <K extends 'ball' | 'attack' | 'defend' | 'risk' | 'tuning'>(key: K, v: NonNullable<Taste[K]>) =>
    setTaste({ ...taste, [key]: taste[key] === v ? null : v, ...(key === 'tuning' ? {} : { preset: null }) });
  const toggleMust = (m: TasteMust) => {
    const has = taste.musts.includes(m);
    setTaste({ ...taste, musts: has ? taste.musts.filter((x) => x !== m) : [...taste.musts.filter((x) => x !== EXCLUSIVE[m]), m] });
  };
  const pickPreset = (id: string) => {
    const style = engine.ref.styles.find((s) => s.id === id);
    if (!style) return;
    setTaste(taste.preset === id ? { ...taste, preset: null } : { ...taste, ...tasteOfStyle(style), preset: id });
  };

  const chip = (on: boolean, label: string, onClick: () => void, key: string) => (
    <button key={key} type="button" aria-pressed={on} onClick={onClick} className={`chip ${on ? 'chip-on' : ''}`}>
      {label}
    </button>
  );
  const question = (n: number, title: string, chips: React.ReactNode) => (
    <div>
      <p className="mb-1.5 flex items-center gap-2 text-sm font-bold">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange text-xs font-extrabold text-canard">{n}</span>
        {title}
      </p>
      <div className="flex flex-wrap gap-1.5">{chips}</div>
    </div>
  );
  const single = <K extends 'ball' | 'attack' | 'defend' | 'risk' | 'tuning'>(key: K, options: readonly NonNullable<Taste[K]>[]) =>
    options.map((v) => chip(taste[key] === v, t(`fm.ideal.a.${key}.${v}`), () => answer(key, v), v));

  const noteText = (n: ProposalNote) => {
    const p = n.params;
    const num = (v: unknown) => (typeof v === 'number' ? nf1(v, lang) : '');
    if (n.id === 'demand') return t(`fm.ideal.note.demand.${String(p.demand)}`, { value: num(p.value), mean: num(p.mean) });
    if (n.id === 'relaxed') return t(`fm.ideal.note.relaxed.${String(p.axis)}.${String(p.choice)}`);
    if (n.id === 'mustMissed' || n.id === 'mustDropped') return t(`fm.ideal.note.${n.id}`, { must: t(`fm.ideal.must.${String(p.must)}`) });
    return t(`fm.ideal.note.${n.id}`, p);
  };
  const bar = (label: string, v: number | null) => (
    <div className="grid grid-cols-[6.5rem_1fr_2rem] items-center gap-2 text-sm">
      <span>{label}</span>
      <div className="h-1.5 rounded-full bg-canard/10">{v != null && <div className={`h-1.5 rounded-full ${v >= 75 ? 'bg-eau' : v >= 50 ? 'bg-ambre' : 'bg-corail'}`} style={{ width: `${v}%` }} />}</div>
      <span className="text-right font-bold">{v ?? '–'}</span>
    </div>
  );
  const bars = (s: TacticScores) => (
    <div className="space-y-1">
      {bar(t('fm.ideal.score.quality'), s.quality)}
      {bar(t('fm.ideal.score.taste'), s.taste)}
      {bar(t('fm.ideal.score.squad'), s.squad)}
      {bar(t('fm.ideal.score.meta'), s.meta)}
    </div>
  );
  const pitch = (p: Proposal) => (
    <div className="relative aspect-[5/4] w-full overflow-hidden rounded-xl bg-eau-fonce/90">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
        <g fill="none" stroke="white" strokeOpacity="0.35" strokeWidth="0.5">
          <rect x="2" y="2" width="96" height="96" />
          <line x1="2" y1="50" x2="98" y2="50" />
          <circle cx="50" cy="50" r="9" />
        </g>
      </svg>
      {p.plan.slots.map((s, i) => (
        <span
          key={i}
          title={names.role(engine.roles.get(s.ip))}
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded bg-canard px-1 py-0.5 text-[0.65rem] font-bold leading-none text-white"
          style={{ left: `${Math.min(90, Math.max(10, s.x))}%`, top: `${Math.min(92, Math.max(8, s.y))}%` }}
        >
          {s.ip}
        </span>
      ))}
    </div>
  );
  const card = (p: Proposal) => (
    <article key={p.kind} className={`relative flex flex-col rounded-2xl border p-4 ${p.recommended ? 'border-2 border-orange' : 'border-canard/15'} ${shown?.kind === p.kind ? 'bg-orange-clair/20' : ''}`}>
      {p.recommended && <span className="absolute -top-2.5 left-3 rounded-full bg-orange px-2.5 py-0.5 text-[0.7rem] font-extrabold uppercase tracking-wide text-canard">{t('fm.ideal.recommended')}</span>}
      <h3 className="font-display text-lg font-bold leading-tight">
        {p.form} · {names.style(p.style)}
      </h3>
      <p className="mb-2 text-sm text-brun">{t(`fm.ideal.kind.${p.kind}${p.alt ? 'Alt' : ''}`)}</p>
      {pitch(p)}
      <div className="mt-3">{bars(p.scores)}</div>
      <p className="mt-3 text-xs font-bold uppercase tracking-wide text-canard/60">{t('fm.ideal.toKnow')}</p>
      <ul className="mt-1 flex-1 space-y-1 text-sm">
        {p.notes.slice(0, 5).map((n, i) => (
          <li key={i} className="flex gap-2">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.tone === 'good' ? 'bg-eau' : 'bg-ambre'}`} />
            <span>{noteText(n)}</span>
          </li>
        ))}
      </ul>
      <button type="button" className={`mt-3 px-3 py-1.5 text-sm ${shown?.kind === p.kind ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={shown?.kind === p.kind} onClick={() => setOpen(p.kind)}>
        {t('fm.ideal.detail')}
      </button>
    </article>
  );

  // Range la proposition parmi les tactiques construites de la partie (« Mes tactiques »).
  const keep = (p: Proposal): string => {
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `t${Date.now()}`;
    addBuiltTactic(scope, { ...p.tactic, id, name: t('fm.ideal.builtName', { form: p.form, style: names.style(p.style) }) });
    setSent(p.kind);
    return id;
  };
  const openInBuilder = (p: Proposal) => {
    keep(p);
    window.dispatchEvent(new Event(TACTIC_EVENT));
    go('builder');
  };
  // Adopter : la proposition devient la tactique de l'écran Tactique (et donc le projet de jeu de toute l'appli).
  const adopt = (p: Proposal) => {
    update({ source: 'built', built: keep(p) });
    go('tactic');
  };
  const labels = shown ? builtInstructionLabels(shown.tactic) : { ip: [], oop: [] };
  const summary = [taste.ball && t(`fm.ideal.sum.ball.${taste.ball}`), taste.attack && t(`fm.ideal.sum.attack.${taste.attack}`), taste.defend && t(`fm.ideal.sum.defend.${taste.defend}`)].filter(Boolean).join(', ');

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]">
      <Panel
        title={t('fm.ideal.tasteTitle')}
        action={
          answered ? (
            <button type="button" className="text-sm font-bold text-orange-fonce underline" onClick={() => setTaste({ ...EMPTY_TASTE, start: taste.start })}>
              {t('fm.ideal.reset')}
            </button>
          ) : undefined
        }
      >
        <p className="mb-3 text-sm text-brun">{t('fm.ideal.tasteIntro')}</p>
        <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-canard/60">{t('fm.ideal.presets')}</p>
        <div className="mb-4 flex flex-wrap gap-1.5 border-b border-canard/10 pb-4">{engine.ref.styles.map((s) => chip(taste.preset === s.id, names.style(s), () => pickPreset(s.id), s.id))}</div>
        <div className="space-y-4">
          {question(1, t('fm.ideal.q.ball'), single('ball', BALL))}
          {question(2, t('fm.ideal.q.attack'), single('attack', ATTACK))}
          {question(3, t('fm.ideal.q.defend'), single('defend', DEFEND))}
          {question(4, t('fm.ideal.q.risk'), single('risk', RISK))}
          {question(5, t('fm.ideal.q.musts'), TASTE_MUSTS.map((m) => chip(taste.musts.includes(m), t(`fm.ideal.must.${m}`), () => toggleMust(m), m)))}
          {question(6, t('fm.ideal.q.tuning'), single('tuning', TUNING))}
          {question(
            7,
            t('fm.ideal.q.start'),
            START.map((v) => chip(taste.start === v, t(`fm.ideal.a.start.${v}`), () => setTaste({ ...taste, start: v }), v)),
          )}
          {taste.start === 'game' && !game && <p className="text-sm text-brun">{t('fm.ideal.noGame')}</p>}
        </div>
      </Panel>

      <div className="min-w-0 space-y-4">
        <Panel title={t(answered ? 'fm.ideal.proposalsTitle' : 'fm.ideal.squadOnlyTitle')}>
          {answered ? (
            <div className="mb-4 flex flex-wrap gap-2 text-sm">
              {summary && (
                <span className="rounded-lg bg-canard/5 px-2.5 py-1">
                  {t('fm.ideal.yourStyle')} <b>{summary}</b>
                </span>
              )}
              <span className="rounded-lg bg-canard/5 px-2.5 py-1">
                {t('fm.ideal.closeTo')} <b>{names.style(proposals.find((p) => p.kind === 'balance')?.style)}</b>
              </span>
            </div>
          ) : (
            <p className="mb-4 text-sm text-brun">{t('fm.ideal.squadOnly')}</p>
          )}
          {busy && <p className="mb-3 text-sm font-bold text-orange-fonce">{t('fm.ideal.computing')}</p>}
          <div className={`grid gap-4 pt-2 ${busy ? 'opacity-50' : ''} ${proposals.length > 1 ? 'md:grid-cols-3' : 'max-w-sm'}`}>{proposals.map(card)}</div>
          {result?.game && game && (
            <div className="mt-4 rounded-xl border border-canard/15 p-3">
              <p className="mb-2 text-sm">
                <b>{t('fm.ideal.gameTactic')}</b> · {game.name}
              </p>
              <div className="max-w-sm">{bars(result.game.scores)}</div>
            </div>
          )}
          <p className="mt-3 text-sm text-brun">{t('fm.ideal.nothingWritten')}</p>
          <More>{t('fm.ideal.how')}</More>
        </Panel>

        {shown && (
        <Panel
          title={t('fm.ideal.detailTitle', { form: shown.form, style: names.style(shown.style) })}
          action={
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={() => openInBuilder(shown)} disabled={sent === shown.kind}>
                {t('fm.ideal.openBuilder')}
              </button>
              <button type="button" className="btn-primary px-3 py-1.5 text-sm" onClick={() => adopt(shown)} disabled={sent === shown.kind}>
                {t('fm.ideal.adopt')}
              </button>
            </div>
          }
        >
          <p className="mb-3 text-sm text-brun">{t('fm.ideal.adoptHelp')}</p>
          <p className="mb-3 text-sm">
            {t('fm.builder.mentality')} : <b>{shown.tactic.mentality}</b>
          </p>
          <div className="grid gap-5 lg:grid-cols-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-canard/60">
                  <th className="py-1 pr-2">{t('fm.ideal.col.pos')}</th>
                  <th className="py-1 pr-2">{t('fm.ideal.col.ip')}</th>
                  <th className="py-1 pr-2">{t('fm.ideal.col.oop')}</th>
                  <th className="py-1 pr-2">{t('fm.ideal.col.player')}</th>
                  <th className="py-1 text-right">{t('fm.ideal.col.fit')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-canard/10">
                {shown.plan.slots.map((s, i) => (
                  <tr key={i}>
                    <td className="py-1 pr-2 font-bold">{POS_LABEL[s.pos]}</td>
                    <td className="py-1 pr-2">{names.role(engine.roles.get(s.ip))}</td>
                    <td className="py-1 pr-2">{names.role(engine.roles.get(s.oop))}</td>
                    <td className="py-1 pr-2">{s.player ? <PlayerLink player={s.player} face={false} /> : <span className="text-corail">{t('fm.ideal.nobody')}</span>}</td>
                    <td className="py-1 text-right">
                      <Fit value={s.fit} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <TeamCards inPossession={labels.ip} outOfPossession={labels.oop} />
          </div>
        </Panel>
        )}
      </div>
    </div>
  );
}
