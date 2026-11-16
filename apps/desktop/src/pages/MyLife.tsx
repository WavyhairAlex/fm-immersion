import {
  CAR_COST,
  choiceEffects,
  CONTACT_GAUGE,
  CONTACTS,
  HOUSING_COST,
  lifeFinances,
  PER_CLUB,
  type CoachLife,
  type Contact,
  type Gauge,
  type Scene,
  type SceneChoice,
  type SceneState,
} from '@fm-immersion/module-fm';
import type { TFunction } from 'i18next';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { useCoachWorld, useSaveLife } from '../lib/coach-world';
import { trophyName } from '../lib/farewell-text';
import { ordinal } from '../lib/season-une';

/*
 * « Ma vie » (maquette validée le 15/11/2026) : la messagerie des proches, les dilemmes et la page des proches avec
 * leurs jauges et ce dont ils se souviennent. Les scènes viennent de `coach-scenes.ts` et `coach-relations.ts` ;
 * les réponses sont gardées dans les réglages de la partie, rien n'est écrit dans FM27.
 */

type Tab = 'messages' | 'dilemmes' | 'proches';
const TABS: Tab[] = ['messages', 'dilemmes', 'proches'];
const TAB_KEY: Record<Tab, string> = { messages: 'messages', dilemmes: 'dilemmas', proches: 'people' };

const GREEN = '#3FBF7F';
const RED = '#F07070';
const AMBER = '#FFB547';
const gaugeColor = (v: number) => (v >= 60 ? GREEN : v >= 40 ? AMBER : RED);

export function MyLife() {
  const { t } = useTranslation();
  const w = useCoachWorld();
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.includes(params.get('vue') as Tab) ? (params.get('vue') as Tab) : 'messages';
  const dilemmas = w.st.pending.filter((s) => s.dilemma).length;
  return (
    <div className="page">
      <p className="text-xs font-bold uppercase tracking-wide text-canard/50">{t('topbar.career')}</p>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-cond text-4xl font-bold">{t('myLife.title')}</h1>
          <p className="help mt-1 max-w-3xl">{t('myLife.intro')}</p>
        </div>
        <div className="flex gap-1.5" role="tablist">
          {TABS.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setParams(k === 'messages' ? {} : { vue: k }, { replace: true })}
              className={`chip gap-1.5 px-3.5 py-1.5 ${tab === k ? 'chip-on' : ''}`}
            >
              {t(`myLife.tabs.${TAB_KEY[k]}`)}
              {k === 'messages' && !!w.st.pending.length && <Count n={w.st.pending.length} on={tab === k} />}
              {k === 'dilemmes' && !!dilemmas && <Count n={dilemmas} on={tab === k} />}
            </button>
          ))}
        </div>
      </div>
      {!w.saveId || !w.career.spells.length ? (
        <div className="card mt-6 max-w-3xl">
          <p className="text-brun">{t('myLife.noCareer')}</p>
        </div>
      ) : tab === 'messages' ? (
        <Messages w={w} />
      ) : tab === 'dilemmes' ? (
        <Dilemmas w={w} />
      ) : (
        <People w={w} />
      )}
    </div>
  );
}

type World = ReturnType<typeof useCoachWorld>;

function Count({ n, on }: { n: number; on: boolean }) {
  return <span className={`rounded-full px-1.5 text-[0.7rem] font-extrabold leading-4 ${on ? 'bg-canard text-orange' : 'bg-orange text-canard'}`}>{n}</span>;
}

/* ------------------------------------------------------------------ textes */

function useTexts(life: CoachLife) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;
  return useMemo(() => {
    const monthFmt = new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric' });
    const dateFmt = new Intl.DateTimeFormat(lang, { dateStyle: 'medium' });
    const money = new Intl.NumberFormat(lang, { style: 'currency', currency: life.currency ?? 'EUR', maximumFractionDigits: 0 });
    const partner = life.partner?.name || t('coachLife.phone.someone');
    const fromName = (from: Scene['from']) =>
      from === 'partner' ? partner : (CONTACTS as string[]).includes(from) ? life.contacts?.[from as Exclude<Contact, 'partner'>] || t(`myLife.contacts.${from}`) : t(`myLife.others.${from}`);
    const params = (sc: Scene) => ({
      club: sc.club,
      name: sc.name ?? partner,
      season: sc.season,
      trophy: trophyName(t, { season: sc.season ?? '', competition: sc.competition ?? null }),
      rival: sc.rival || t('myLife.rivalUnknown'),
      month: sc.month ? monthFmt.format(new Date(`${sc.month}-01T12:00:00Z`)) : '',
    });
    const text = (sc: Scene) => t(sc.kind === 'streak' && sc.recall ? 'coachLife.scene.streak.textRecall' : `coachLife.scene.${sc.kind}.text`, params(sc));
    const title = (sc: Scene) => (i18n.exists(`coachLife.scene.${sc.kind}.title`) ? t(`coachLife.scene.${sc.kind}.title`, params(sc)) : fromName(sc.from));
    const choice = (sc: Scene, key: string) => t(`coachLife.scene.${sc.kind}.choice.${key}`, params(sc));
    const done = (sc: Scene, key: string) => t(`coachLife.scene.${sc.kind}.done.${key}`, params(sc));
    const hint = (sc: Scene, key: string) => (i18n.exists(`coachLife.scene.${sc.kind}.hint.${key}`) ? t(`coachLife.scene.${sc.kind}.hint.${key}`, params(sc)) : null);
    const date = (d: string) => dateFmt.format(new Date(`${d.slice(0, 10)}T12:00:00Z`));
    /** Le moment de la partie qui a amené le message. */
    const trigger = (sc: Scene) => {
      const p = params(sc);
      if (sc.recall) return t('myLife.triggers.recall', { date: date(sc.recall.date) });
      switch (sc.kind) {
        case 'arrival':
        case 'car':
        case 'move':
        case 'promise':
        case 'objectives':
          return t('myLife.triggers.arrival', p);
        case 'trophy':
          return t('myLife.triggers.trophy', p);
        case 'award':
          return t('myLife.triggers.award', p);
        case 'offer':
          return sc.cause === 'trophy' ? t('myLife.triggers.trophy', p) : t('myLife.triggers.offerAward');
        case 'streak':
          return t('myLife.triggers.streak');
        case 'summer':
          return t('myLife.triggers.summer', p);
        case 'sacked':
        case 'left':
          return t('myLife.triggers.exit', p);
        case 'birth':
          return t('myLife.triggers.birth', p);
        default:
          return title(sc);
      }
    };
    return { t, lang, money, fromName, params, text, title, choice, done, hint, date, monthFmt, trigger };
  }, [t, i18n, lang, life]);
}
type Texts = ReturnType<typeof useTexts>;

/** Pastilles d'effet d'un choix : coût, loyer ou voiture par mois, jauges, diplôme. */
function Effects({ c, x }: { c: SceneChoice; x: Texts }) {
  const chips: { text: string; tone: 'up' | 'down' | 'neutral' }[] = [];
  if (c.cost) chips.push({ text: x.t('myLife.cost', { amount: x.money.format(c.cost) }), tone: 'down' });
  if (c.housing) chips.push({ text: x.t('coachLife.phone.perMonth', { amount: x.money.format(HOUSING_COST[c.housing]) }), tone: 'neutral' });
  if (c.car) chips.push({ text: x.t('coachLife.phone.perMonth', { amount: x.money.format(CAR_COST[c.car]) }), tone: 'neutral' });
  for (const [g, n] of Object.entries(choiceEffects(c)) as [Gauge, number][])
    if (n) chips.push({ text: x.t('myLife.effect', { gauge: x.t(`myLife.gauges.${g}`), n: n > 0 ? `+${n}` : `${n}` }), tone: n > 0 ? 'up' : 'down' });
  if (c.badge) chips.push({ text: x.t('myLife.startsBadge'), tone: 'neutral' });
  if (c.promise) chips.push({ text: x.t('myLife.promiseChip'), tone: 'neutral' });
  return (
    <span className="flex flex-wrap gap-1">
      {chips.map((ch, i) => (
        <span
          key={i}
          className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-extrabold ${ch.tone === 'up' ? 'bg-[#3FBF7F]/15 text-[#3FBF7F]' : ch.tone === 'down' ? 'bg-[#F07070]/15 text-[#F07070]' : 'bg-orange/15 text-orange'}`}
        >
          {ch.text}
        </span>
      ))}
    </span>
  );
}

/** Barre d'une jauge, avec la part que le choix ajoute (vert) ou retire (rouge). */
function Bar({ value, delta = 0, h = 'h-1.5', color }: { value: number; delta?: number; h?: string; color?: string }) {
  const next = Math.min(100, Math.max(0, value + delta));
  const lo = Math.min(value, next);
  const hi = Math.max(value, next);
  return (
    <div className={`relative ${h} overflow-hidden rounded-full bg-white/10`}>
      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${lo}%`, background: color ?? gaugeColor(value) }} />
      {hi > lo && <div className="absolute inset-y-0 rounded-full opacity-60" style={{ left: `${lo}%`, width: `${hi - lo}%`, background: delta > 0 ? GREEN : RED }} />}
    </div>
  );
}

function Avatar({ label, size = 40, accent = false, ring }: { label: string; size?: number; accent?: boolean; ring?: string }) {
  const initials = label
    .replace(/^(ton|ta|la|le|your|the)\s+/i, '')
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-extrabold ${accent ? 'bg-orange text-canard' : 'bg-[#1E3150] text-white'}`}
      style={{ width: size, height: size, fontSize: size * 0.34, boxShadow: ring ? `0 0 0 2px #0C1626, 0 0 0 4px ${ring}` : undefined }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

function Clock() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={AMBER} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

/** Rappel d'une réponse d'avant : « Se souvient de ta réponse du … ». */
function Recall({ sc, st, x }: { sc: Scene; st: SceneState; x: Texts }) {
  if (!sc.recall) return null;
  const old = st.scenes.find((s) => s.id === sc.recall!.id);
  if (!old) return null;
  return (
    <div className="flex items-center gap-1.5 self-center rounded-full bg-orange/10 px-3 py-1 text-xs font-extrabold text-orange">
      <Clock /> {x.t('myLife.remembers', { date: x.date(sc.recall.date), text: x.done(old, sc.recall.choice) })}
    </div>
  );
}

/* --------------------------------------------------------------- messages */

interface Item {
  scene: Scene;
  choice: SceneChoice | null;
}

function Messages({ w }: { w: World }) {
  const { st, life, saveId, gameDate } = w;
  const x = useTexts(life);
  const save = useSaveLife(saveId);
  // Fils de discussion : un par expéditeur, réponses données et messages en attente, dans l'ordre des dates.
  const threads = useMemo(() => {
    const by = new Map<Scene['from'], Item[]>();
    for (const a of st.answered) by.set(a.scene.from, [...(by.get(a.scene.from) ?? []), { scene: a.scene, choice: a.choice }]);
    for (const p of st.pending) by.set(p.from, [...(by.get(p.from) ?? []), { scene: p, choice: null }]);
    return [...by.entries()]
      .map(([from, items]) => ({ from, items: items.sort((a, b) => (a.scene.date < b.scene.date ? -1 : a.scene.date > b.scene.date ? 1 : 0)) }))
      .map((th) => ({ ...th, unread: th.items.filter((i) => !i.choice).length, last: th.items.at(-1)!.scene.date }))
      .sort((a, b) => b.unread - a.unread || (a.last < b.last ? 1 : -1));
  }, [st]);
  const [open, setOpen] = useState<Scene['from'] | null>(null);
  const thread = threads.find((th) => th.from === open) ?? threads[0];
  const next = thread?.items.find((i) => !i.choice)?.scene ?? null;
  const [picked, setPicked] = useState<string | null>(null);
  const pick = next?.choices.find((c) => c.key === picked) ?? null;
  const answer = () => {
    if (!next || !pick) return;
    save.mutate((cur) => ({ answers: { ...(cur.answers ?? {}), [next.id]: { choice: pick.key, date: gameDate?.slice(0, 10) ?? next.date } } }));
    setPicked(null);
  };
  const unread = st.pending.length;

  if (!thread)
    return (
      <div className="card mt-6 max-w-3xl">
        <p className="text-brun">{x.t('myLife.noThread')}</p>
      </div>
    );
  const isContact = (CONTACTS as string[]).includes(thread.from);
  return (
    <div className="mt-6 grid overflow-hidden rounded-xl bg-[#101D31] ring-1 ring-white/5 xl:grid-cols-[290px_minmax(0,1fr)_300px]">
      <div className="flex flex-col gap-1 border-b border-white/10 p-3 xl:border-b-0 xl:border-r">
        <div className="flex items-baseline justify-between px-2 pb-2">
          <span className="font-cond text-2xl font-bold">{x.t('myLife.tabs.messages')}</span>
          <span className="text-xs text-white/60">{x.t('myLife.unread', { count: unread })}</span>
        </div>
        {threads.map((th) => {
          const on = th.from === thread.from;
          const lastItem = th.items.at(-1)!;
          return (
            <button
              key={th.from}
              type="button"
              onClick={() => {
                setOpen(th.from);
                setPicked(null);
              }}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left ${on ? 'bg-[#1E3150] shadow-[inset_3px_0_0_#FFB547]' : 'hover:bg-white/5'}`}
            >
              <Avatar label={x.fromName(th.from)} accent={th.from === 'partner'} />
              <span className="min-w-0 flex-1">
                <span className="flex justify-between gap-2">
                  <span className="truncate font-extrabold">{x.fromName(th.from)}</span>
                  <span className="shrink-0 text-xs text-white/50">{x.date(th.last)}</span>
                </span>
                <span className="flex justify-between gap-2">
                  <span className="truncate text-sm text-white/60">{x.text(lastItem.scene)}</span>
                  {!!th.unread && <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-orange px-1 text-[0.7rem] font-extrabold text-canard">{th.unread}</span>}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex min-w-0 flex-col">
        <div className="flex items-center gap-3 border-b border-white/10 px-6 py-4">
          <Avatar label={x.fromName(thread.from)} size={42} accent={thread.from === 'partner'} ring={isContact ? gaugeColor(st.gauges[CONTACT_GAUGE[thread.from as Contact]]) : undefined} />
          <div>
            <p className="font-extrabold">{x.fromName(thread.from)}</p>
            {isContact && (
              <p className="text-sm text-white/60">
                {x.t(`myLife.gauges.${CONTACT_GAUGE[thread.from as Contact]}`)} {st.gauges[CONTACT_GAUGE[thread.from as Contact]]}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-2.5 px-6 py-5">
          {thread.items.map((it, i) => {
            const prev = thread.items[i - 1];
            return (
              <div key={it.scene.id} className="flex flex-col gap-2.5">
                {(!prev || prev.scene.date !== it.scene.date) && <p className="self-center text-xs font-bold text-white/50">{x.date(it.scene.date)}</p>}
                <Recall sc={it.scene} st={st} x={x} />
                <p className="max-w-[72%] self-start rounded-2xl rounded-bl-sm bg-[#1E3150] px-4 py-2.5 leading-snug">{x.text(it.scene)}</p>
                {it.choice && <p className="max-w-[72%] self-end rounded-2xl rounded-br-sm bg-orange px-4 py-2.5 font-semibold leading-snug text-canard">{x.choice(it.scene, it.choice.key)}</p>}
              </div>
            );
          })}
        </div>
        {next && (
          <div className="flex flex-col gap-2 border-t border-white/10 px-6 pb-5 pt-4">
            <p className="text-[0.7rem] font-extrabold uppercase tracking-widest text-white/50">{x.t('myLife.reply')}</p>
            {next.choices.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setPicked(c.key)}
                aria-pressed={picked === c.key}
                className={`flex flex-wrap items-center gap-3 rounded-lg border px-4 py-2.5 text-left ${picked === c.key ? 'border-orange bg-orange/10' : 'border-white/10 bg-white/[0.04] hover:border-white/30'}`}
              >
                <span className="min-w-[12rem] flex-1 font-bold">{x.choice(next, c.key)}</span>
                <Effects c={c} x={x} />
              </button>
            ))}
            <div className="flex items-center justify-between gap-3 pt-1">
              <p className="text-xs text-white/50">{x.t('myLife.note')}</p>
              <button type="button" className="btn-primary" disabled={!pick || save.isPending} onClick={answer}>
                {x.t('myLife.send')}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4 border-t border-white/10 bg-white/[0.015] p-5 xl:border-l xl:border-t-0">
        {next && pick ? (
          <>
            <p className="text-[0.7rem] font-extrabold uppercase tracking-widest text-white/50">{x.t('myLife.ifAnswer', { choice: x.choice(next, pick.key) })}</p>
            <Preview c={pick} st={st} x={x} club={next.club} />
            {x.hint(next, pick.key) && <p className="rounded-lg bg-[#16263E] px-3.5 py-3 text-sm text-white/75">{x.hint(next, pick.key)}</p>}
          </>
        ) : (
          <p className="text-sm text-white/60">{next ? x.t('myLife.pick') : x.t('myLife.answered')}</p>
        )}
        <div className="mt-auto rounded-lg bg-[#16263E] px-3.5 py-3">
          <p className="text-[0.7rem] font-extrabold uppercase tracking-widest text-orange">{x.t('myLife.trigger')}</p>
          <p className="mt-1 text-sm">{x.trigger(thread.items.at(-1)!.scene)}</p>
          <p className="text-xs text-white/50">{x.date(thread.items.at(-1)!.scene.date)}</p>
        </div>
      </div>
    </div>
  );
}

/** Ce que le choix change sur chaque jauge touchée, avant de répondre. */
function Preview({ c, st, x, club }: { c: SceneChoice; st: SceneState; x: Texts; club?: string }) {
  const fx = Object.entries(choiceEffects(c)).filter(([, n]) => n) as [Gauge, number][];
  return (
    <div className="flex flex-col gap-3.5">
      {!fx.length && !c.cost && <p className="text-sm text-white/60">{x.t('myLife.noEffect')}</p>}
      {fx.map(([g, n]) => {
        const v = st.gauges[g];
        const counts = !PER_CLUB.includes(g) || !!club;
        return (
          <div key={g} className="flex flex-col gap-1.5">
            <div className="flex justify-between text-sm">
              <span className="font-bold text-white/60">{x.t(`myLife.gauges.${g}`)}</span>
              <span className="font-extrabold tabular-nums">
                {v}
                {counts && <span style={{ color: n > 0 ? GREEN : RED }}> → {Math.min(100, Math.max(0, v + n))}</span>}
              </span>
            </div>
            <Bar value={v} delta={n} />
          </div>
        );
      })}
      {!!c.cost && (
        <div className="flex justify-between text-sm">
          <span className="font-bold text-white/60">{x.t('myLife.people.savings')}</span>
          <span className="font-extrabold text-[#F07070]">{x.t('myLife.cost', { amount: x.money.format(c.cost) })}</span>
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- dilemmes */

function Dilemmas({ w }: { w: World }) {
  const { st, life, saveId, gameDate, career, game } = w;
  const x = useTexts(life);
  const save = useSaveLife(saveId);
  const current = st.pending.find((s) => s.dilemma) ?? null;
  const past = st.answered.filter((a) => a.scene.dilemma).reverse();
  const spell = career.spells.at(-1)!;
  const season = spell.seasons.at(-1);
  const answer = (sc: Scene, key: string) => save.mutate((cur) => ({ answers: { ...(cur.answers ?? {}), [sc.id]: { choice: key, date: gameDate?.slice(0, 10) ?? sc.date } } }));
  const facts = [
    season && { label: x.t('myLife.dilemma.record'), value: `${season.wins}-${season.draws}-${season.losses}` },
    season?.position != null && { label: x.t('myLife.dilemma.position'), value: `${season.position}` },
    { label: x.t('myLife.dilemma.titles'), value: String(spell.trophies.length) },
    game.wages[spell.club] && { label: x.t('myLife.dilemma.wage'), value: x.t('coachLife.phone.perMonth', { amount: x.money.format((game.wages[spell.club]! * 52) / 12) }) },
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <div className="mt-6 flex flex-col gap-5">
      {!current ? (
        <div className="card max-w-3xl">
          <p className="text-brun">{x.t('myLife.dilemma.none')}</p>
        </div>
      ) : (
        <>
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#1B2F4F] via-[#132440] to-[#2A2414] px-8 py-7">
            <svg className="pointer-events-none absolute -right-4 -top-2 opacity-[0.12]" width="320" height="200" viewBox="0 0 320 200" aria-hidden>
              <g fill="none" stroke="#fff" strokeWidth="3">
                <rect x="20" y="30" width="280" height="150" rx="6" />
                <line x1="160" y1="30" x2="160" y2="180" />
                <circle cx="160" cy="105" r="32" />
                <rect x="20" y="70" width="40" height="70" />
                <rect x="260" y="70" width="40" height="70" />
              </g>
            </svg>
            <p className="text-[0.7rem] font-extrabold uppercase tracking-widest text-orange">{x.t('myLife.dilemma.eyebrow', { from: x.fromName(current.from), date: x.date(current.date) })}</p>
            <h2 className="mt-2 font-cond text-5xl font-bold leading-none">{x.title(current)}</h2>
            {current.kind === 'offer' && current.cause && (
              <p className="mt-2 text-sm font-bold text-white/70">
                {current.cause === 'trophy' ? x.t('coachLife.scene.offer.causeTrophy', x.params(current)) : x.t('coachLife.scene.offer.causeAward')}
              </p>
            )}
            <p className="mt-3 max-w-3xl text-lg leading-relaxed">« {x.text(current)} »</p>
            <Recall sc={current} st={st} x={x} />
            {!!facts.length && (
              <div className="mt-4 flex flex-wrap gap-2.5">
                {facts.map((f) => (
                  <div key={f.label} className="min-w-[9rem] flex-1 rounded-lg bg-white/[0.06] px-4 py-2.5">
                    <p className="text-xs font-bold text-white/60">{f.label}</p>
                    <p className="font-cond text-xl font-semibold">{f.value}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {current.choices.map((c, i) => {
              const fx = Object.entries(choiceEffects(c)).filter(([, n]) => n) as [Gauge, number][];
              return (
                <div key={c.key} className="flex flex-col gap-3.5 rounded-xl bg-[#16263E] p-5 ring-1 ring-white/5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange font-cond text-lg font-bold text-canard">{'ABC'[i]}</span>
                    <span className="font-cond text-2xl font-bold leading-tight">{x.choice(current, c.key)}</span>
                  </div>
                  <div className="flex flex-col gap-2.5">
                    {fx.map(([g, n]) => (
                      <div key={g} className="grid grid-cols-[6.5rem_1fr_2.5rem] items-center gap-2.5 text-sm">
                        <span className="font-bold text-white/60">{x.t(`myLife.gauges.${g}`)}</span>
                        <Bar value={st.gauges[g]} delta={n} color="rgba(255,255,255,0.35)" />
                        <span className="text-right font-extrabold tabular-nums" style={{ color: n > 0 ? GREEN : RED }}>
                          {n > 0 ? `+${n}` : n}
                        </span>
                      </div>
                    ))}
                    {!!c.cost && (
                      <div className="grid grid-cols-[6.5rem_1fr] text-sm">
                        <span className="font-bold text-white/60">{x.t('myLife.people.savings')}</span>
                        <span className="text-right font-extrabold text-[#F07070]">{x.t('myLife.cost', { amount: x.money.format(c.cost) })}</span>
                      </div>
                    )}
                  </div>
                  {x.hint(current, c.key) && <p className="border-t border-white/10 pt-3 text-sm font-bold">{x.hint(current, c.key)}</p>}
                  <button type="button" className={`mt-auto ${i === 0 ? 'btn-primary' : 'btn-secondary'} justify-center`} disabled={save.isPending} onClick={() => answer(current, c.key)}>
                    {x.t('myLife.dilemma.choose')}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-3 rounded-lg bg-orange/10 px-4 py-3 text-sm">
            <Clock />
            <span>
              <strong>{x.t('myLife.dilemma.returns')}</strong> {x.t('myLife.dilemma.returnsText')}
            </span>
          </div>
        </>
      )}
      {!!past.length && (
        <div className="card">
          <h3 className="text-xl font-semibold">{x.t('myLife.dilemma.past')}</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {past.map((a) => (
              <li key={a.scene.id} className="flex flex-wrap gap-x-3">
                <span className="w-28 shrink-0 text-xs font-bold leading-5 text-white/50">{x.date(a.scene.date)}</span>
                <span className="font-bold">{x.title(a.scene)}</span>
                <span className="text-white/70">{x.done(a.scene, a.choice.key)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- proches */

function Spark({ values, color }: { values: number[]; color: string }) {
  const pts = values.length > 1 ? values : [values[0] ?? 60, values[0] ?? 60];
  const W = 110;
  const H = 32;
  const lo = Math.min(...pts) - 4;
  const hi = Math.max(...pts) + 4;
  const xy = pts.map((v, i) => [(i * W) / (pts.length - 1), H - ((v - lo) / (hi - lo)) * H] as const);
  return (
    <svg width={W} height={H} viewBox={`-3 -3 ${W + 6} ${H + 6}`} aria-hidden>
      <polyline points={xy.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={xy.at(-1)![0]} cy={xy.at(-1)![1]} r="3" fill={color} />
    </svg>
  );
}

function People({ w }: { w: World }) {
  const { st, life, saveId, career, game } = w;
  const x = useTexts(life);
  const save = useSaveLife(saveId);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [draft, setDraft] = useState('');
  const cur = career.spells.at(-1)!;
  const clubNow = cur.current ? cur.club : null;
  const rename = (c: Exclude<Contact, 'partner'>) => {
    const name = draft.trim();
    save.mutate((l) => {
      const contacts = { ...(l.contacts ?? {}) };
      if (name) contacts[c] = name;
      else delete contacts[c];
      return { contacts };
    });
    setEditing(null);
  };
  const outcomeText = (o: SceneState['outcomes'][number]) =>
    x.t(`myLife.outcome.${o.kind}`, {
      trophy: trophyName(x.t as TFunction, { season: o.season ?? '', competition: o.competition ?? null }),
      club: o.club,
      month: o.month ? x.monthFmt.format(new Date(`${o.month}-01T12:00:00Z`)) : '',
      objective: o.objective ? x.t(`myLife.objective.${o.objective}`) : '',
      position: o.position != null ? ordinal(x.t as TFunction, o.position) : '',
    });
  // Souvenir montré : la dernière réponse, ou pour le président le dernier fait du jeu s'il est plus récent.
  const memoryOf = (c: Contact) => {
    const m = st.memories[c];
    const o = c === 'chairman' ? st.outcomes.filter((y) => y.club === clubNow).at(-1) : undefined;
    if (o && (!m || o.date >= m.scene.date)) return outcomeText(o);
    if (m && (!PER_CLUB.includes(CONTACT_GAUGE[c]) || m.scene.club === clubNow)) return x.done(m.scene, m.choice.key);
    return null;
  };
  const finances = lifeFinances(career.spells, life, st.spending.total, game.wages);
  const badge = st.badges.find((b) => !b.done);
  const awards = career.spells.reduce((n, s) => n + (s.awards?.length ?? 0), 0);
  const journal = [
    ...st.answered.map((a) => ({ date: a.scene.date, text: x.done(a.scene, a.choice.key), sign: Object.values(choiceEffects(a.choice)).reduce((s, n) => s + (n ?? 0), 0) })),
    ...st.outcomes.map((o) => ({ date: o.date, text: outcomeText(o), sign: o.delta })),
  ]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 10);

  return (
    <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-white/60">{x.t('myLife.people.curve')}</p>
        {CONTACTS.map((c) => {
          const g = CONTACT_GAUGE[c];
          const v = st.gauges[g];
          const hist = st.history[g].map((h) => h.value).slice(-8);
          const trend = v - (hist.at(-4) ?? hist[0] ?? v);
          const color = gaugeColor(v);
          const name = x.fromName(c);
          const mem = memoryOf(c);
          if (c === 'partner' && !life.partner?.name)
            return (
              <div key={c} className="flex items-center gap-4 rounded-xl bg-[#16263E] px-5 py-4">
                <Avatar label="♥" accent />
                <p className="flex-1 text-sm text-white/70">{x.t('myLife.people.noPartner')}</p>
                <Link to="/carriere" className="btn-secondary">
                  {x.t('careerPage.title')}
                </Link>
              </div>
            );
          return (
            <div key={c} className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-4 rounded-xl bg-[#16263E] px-5 py-4 md:grid-cols-[44px_minmax(0,1fr)_110px_130px]">
              <Avatar label={name} size={44} accent={c === 'partner'} ring={color} />
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-baseline gap-x-2.5">
                  {editing === c ? (
                    <form
                      className="flex gap-1.5"
                      onSubmit={(e) => {
                        e.preventDefault();
                        rename(c as Exclude<Contact, 'partner'>);
                      }}
                    >
                      <input className="input w-44 py-0.5 text-sm" value={draft} autoFocus onChange={(e) => setDraft(e.target.value)} placeholder={x.t(`myLife.contacts.${c}`)} />
                      <button type="submit" className="chip">
                        {x.t('myLife.people.save')}
                      </button>
                    </form>
                  ) : (
                    <>
                      <span className="font-extrabold">{name}</span>
                      {c !== 'partner' && (
                        <button
                          type="button"
                          className="text-xs font-bold text-orange hover:underline"
                          onClick={() => {
                            setEditing(c);
                            setDraft(life.contacts?.[c as Exclude<Contact, 'partner'>] ?? '');
                          }}
                        >
                          {x.t('myLife.people.rename')}
                        </button>
                      )}
                    </>
                  )}
                  <span className="text-xs text-white/50">
                    {c === 'chairman' ? (clubNow ? x.t('myLife.roles.chairman', { club: clubNow }) : x.t('myLife.roles.chairmanFree')) : x.t(`myLife.roles.${c}`)}
                    {PER_CLUB.includes(g) && ` · ${x.t('myLife.people.perClub')}`}
                  </span>
                </div>
                <p className="text-sm leading-snug text-white/60">
                  <span className="font-extrabold text-orange">{x.t('myLife.people.remembers')}</span> {mem ?? x.t('myLife.people.noMemory')}
                </p>
              </div>
              <div className="hidden md:block">
                <Spark values={hist} color={color} />
              </div>
              <div className="col-span-2 flex flex-col gap-1 md:col-span-1">
                <span className="text-[0.7rem] font-extrabold uppercase tracking-wider text-white/50">{x.t(`myLife.gauges.${g}`)}</span>
                <span className="font-cond text-3xl font-bold leading-none">
                  {v}
                  <span className="text-base text-white/50"> /100</span>
                  {!!trend && (
                    <span className="text-base" style={{ color: trend > 0 ? GREEN : RED }}>
                      {' '}
                      {trend > 0 ? `+${trend}` : trend}
                    </span>
                  )}
                </span>
                <Bar value={v} h="h-1" />
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-4">
        <div className="rounded-xl bg-[#16263E] px-5 py-4">
          <p className="text-[0.7rem] font-extrabold uppercase tracking-widest text-orange">{x.t('myLife.people.life')}</p>
          <dl className="mt-2 text-sm">
            {[
              [x.t('myLife.gauges.morale'), `${st.gauges.morale} /100`],
              [x.t('myLife.people.savings'), x.money.format(finances.savings)],
              [x.t('myLife.people.badge'), badge ? `${x.t(`coachLife.badges.level.${badge.level}`)} · ${x.date(badge.end)}` : x.t('myLife.people.badgeNone')],
              [x.t('myLife.people.awards'), `×${awards}`],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-white/[0.08] py-1.5 last:border-0">
                <dt className="text-white/60">{k}</dt>
                <dd className="text-right font-bold">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="rounded-xl bg-[#16263E] px-5 py-4">
          <p className="text-[0.7rem] font-extrabold uppercase tracking-widest text-orange">{x.t('myLife.people.promises')}</p>
          {!st.promises.length ? (
            <p className="mt-2 text-sm text-white/60">{x.t('myLife.people.noPromise')}</p>
          ) : (
            <ul className="mt-2 space-y-1.5 text-sm">
              {st.promises.map((p) => (
                <li key={p.scene.id}>
                  <span className="font-bold">{x.t(`myLife.promise.${p.kind}`, { club: p.scene.club })}</span>
                  <span className="text-white/50"> · {x.date(p.date)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {!!journal.length && (
          <div className="rounded-xl bg-[#16263E] px-5 py-4">
            <p className="text-[0.7rem] font-extrabold uppercase tracking-widest text-orange">{x.t('myLife.people.journal')}</p>
            <ol className="mt-3 space-y-3">
              {journal.map((j, i) => (
                <li key={i} className="grid grid-cols-[12px_1fr] gap-3">
                  <span className="mt-1.5 h-2.5 w-2.5 rounded-full" style={{ background: j.sign > 0 ? GREEN : j.sign < 0 ? RED : AMBER }} />
                  <span>
                    <span className="block text-xs font-bold text-white/50">{x.date(j.date)}</span>
                    <span className="block text-sm leading-snug">{j.text}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
