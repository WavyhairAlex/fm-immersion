import { fmLiveSchema, liveIsFresh, liveKey, liveNews, parseScorers, type FmLive } from '@fm-immersion/module-fm';
import { invoke } from '@tauri-apps/api/core';
import type { TFunction } from 'i18next';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { editDiscord, getLiveEnabled, getWebhook, isWebhook, postDiscord } from './discord';

const LIVE_RED = 0xd93c3c;
const GOOD = 0x2e9e5b;
const ORANGE = 0xf26b1d;

const score = (l: FmLive) => `${l.homeScore ?? 0} - ${l.awayScore ?? 0}`;

/** Minute de jeu (« 62 min. » → 62, « 90+3' » → 93), ou null (« FDM », vide). */
export function minuteOf(text: string | null | undefined): number | null {
  const m = /(\d+)(?:\s*\+\s*(\d+))?/.exec(text ?? '');
  return m ? Number(m[1]) + Number(m[2] ?? 0) : null;
}

/** Barre de progression du match sur 90 minutes : « ▰▰▰▰▰▰▱▱▱▱ ». */
export function progressBar(minute: number | null, slots = 10) {
  const n = minute == null ? 0 : Math.max(0, Math.min(slots, Math.round((minute / 90) * slots)));
  return '▰'.repeat(n) + '▱'.repeat(slots - n);
}

/** Un but du déroulé : minute, équipe, buteur. */
export interface TimelineGoal {
  minute: number;
  side: 'home' | 'away';
  name: string;
  time: string;
}

/**
 * Buts dans l'ordre du match. Le jeu liste les buteurs de l'équipe à domicile d'abord, autant que de buts marqués ;
 * null si le texte ne correspond pas au score (le jeu ne l'a pas encore mis à jour).
 */
export function timeline(l: FmLive): TimelineGoal[] | null {
  const goals = parseScorers(l.scorers);
  const h = l.homeScore ?? 0;
  if (goals.length !== h + (l.awayScore ?? 0)) return null;
  return goals
    .map((g, i) => ({ minute: minuteOf(g.time) ?? 0, side: i < h ? ('home' as const) : ('away' as const), name: g.name, time: g.time }))
    .sort((a, b) => a.minute - b.minute);
}

/** Club du joueur dans ce match : 'home', 'away' ou null s'il n'y joue pas. */
const mySide = (l: FmLive, club: string | null) => (club === l.home ? 'home' : club === l.away ? 'away' : null);

/** Nombre de variantes de chaque phrase de commentateur dans les fichiers de langue. */
const VARIANTS = 3;

/** Petit hachage stable : la même phrase reste affichée tant que rien ne se passe. */
function pick(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return Math.abs(h) % VARIANTS;
}

/** Situation après un but, vue par l'équipe qui marque : ouverture du score, égalisation, prise d'avance, break, réduction de l'écart. */
export function goalSituation(forGoals: number, against: number) {
  if (forGoals === 1 && against === 0) return 'opener';
  if (forGoals === against) return 'equalise';
  if (forGoals === against + 1) return 'lead';
  if (forGoals > against) return 'extend';
  return 'reduce';
}

/** Moment du match, pour le commentaire quand aucun but ne vient de tomber. */
export function matchPhase(minute: number | null) {
  if (minute == null || minute < 3) return 'kickoff';
  if (minute < 25) return 'early';
  if (minute < 44) return 'mid';
  if (minute <= 46) return 'half';
  if (minute < 75) return 'second';
  if (minute < 90) return 'late';
  return 'stoppage';
}

/** Un but reste « l'actualité » du commentateur pendant ces minutes de jeu, puis il reparle du match. */
const GOAL_NEWS_MINUTES = 6;

/**
 * Phrase du commentateur : but qui vient de tomber (pour ou contre le club du joueur, selon la situation), sinon le
 * moment du match (début, mi-temps, money time…) et le score, ou la fin du match (victoire, nul, défaite). Choisie
 * parmi plusieurs variantes, stable pendant une dizaine de minutes pour ne pas changer à chaque relevé.
 */
export function commentary(t: TFunction, l: FmLive, club: string | null, goal: TimelineGoal | null): string {
  const side = mySide(l, club);
  const minute = minuteOf(l.minute);
  const vars = { home: l.home, away: l.away, score: score(l) };
  if (l.final) {
    const k = pick(`${liveKey(l)}|${score(l)}|f`);
    if (!side) return t(`live.say.final_${k}`, vars);
    const mine = (side === 'home' ? l.homeScore : l.awayScore) ?? 0;
    const theirs = (side === 'home' ? l.awayScore : l.homeScore) ?? 0;
    const o = mine > theirs ? 'W' : mine < theirs ? 'L' : 'D';
    return t(`live.say.final${o}_${k}`, { ...vars, club, opponent: side === 'home' ? l.away : l.home });
  }
  if (goal && (minute == null || minute - goal.minute <= GOAL_NEWS_MINUTES)) {
    const k = pick(`${liveKey(l)}|${score(l)}|${goal.time}`);
    const team = goal.side === 'home' ? l.home : l.away;
    const f = (goal.side === 'home' ? l.homeScore : l.awayScore) ?? 0;
    const a = (goal.side === 'home' ? l.awayScore : l.homeScore) ?? 0;
    const who = side && side !== goal.side ? 'against' : 'for';
    return t(`live.say.${who}_${goalSituation(f, a)}_${k}`, { ...vars, team, scorer: goal.name, minute: goal.time });
  }
  const phase = matchPhase(minute);
  const k = pick(`${liveKey(l)}|${score(l)}|${phase}|${Math.floor((minute ?? 0) / 10)}`);
  if (phase === 'kickoff') return t(`live.say.kickoff_${k}`, vars);
  const h = l.homeScore ?? 0;
  const a = l.awayScore ?? 0;
  if (h === a) return t(`live.say.${phase}_level_${k}`, { ...vars, minute });
  const [leader, trailer] = h > a ? [l.home, l.away] : [l.away, l.home];
  // Score dit du côté de l'équipe qui mène : « Malženice mène 2 - 1 ».
  return t(`live.say.${phase}_lead_${k}`, { ...vars, score: `${Math.max(h, a)} - ${Math.min(h, a)}`, minute, leader, trailer });
}

/** Dernier but du déroulé (le plus tardif), ou null. */
const lastOf = (tl: TimelineGoal[] | null) => (tl && tl.length ? tl[tl.length - 1]! : null);

/** Encart du direct, modifié à chaque relevé. `club` = club du joueur (couleur et ton du commentaire). */
export function scoreboardPayload(t: TFunction, l: FmLive, club: string | null, opts: { image?: boolean } = {}) {
  const tl = timeline(l);
  const side = mySide(l, club);
  let color = LIVE_RED;
  if (l.final && side) {
    const mine = (side === 'home' ? l.homeScore : l.awayScore) ?? 0;
    const theirs = (side === 'home' ? l.awayScore : l.homeScore) ?? 0;
    color = mine > theirs ? GOOD : mine < theirs ? LIVE_RED : ORANGE;
  }
  const minute = minuteOf(l.minute);
  const clock = l.final ? `🏁 ${t('live.ended')}` : minute != null ? `⏱️ ${minute}'  ${progressBar(minute)}` : `⏱️ ${t('live.kickoff')}`;
  const lines = (tl ?? []).map((g) => {
    const mine = side ? g.side === side : true;
    return `\`${g.time.replace(/^pen\.?\s*/i, '').padStart(5)}\` ${mine ? '⚽' : '🥅'} **${g.name}** · ${g.side === 'home' ? l.home : l.away}${/^pen/i.test(g.time) ? ` (${t('live.penalty')})` : ''}`;
  });
  return {
    username: 'FM Immersion',
    embeds: [
      {
        author: { name: l.final ? t('live.finalTag') : t('live.liveTag') },
        title: `${l.home}  ${score(l)}  ${l.away}`,
        description: [clock, `🎙️ *${commentary(t, l, club, lastOf(tl))}*`].join('\n\n'),
        color,
        fields: lines.length
          ? [{ name: t('live.timeline'), value: lines.join('\n').slice(0, 1000) }]
          : l.scorers
            ? [{ name: t('live.scorers'), value: l.scorers.slice(0, 1000) }]
            : [],
        ...(opts.image ? { image: { url: 'attachment://direct.png' } } : {}),
        footer: {
          text: [l.gameDate && new Date(`${l.gameDate}T12:00:00`).toLocaleDateString(), 'FM Immersion'].filter(Boolean).join('  ·  '),
        },
      },
    ],
    ...(opts.image ? { attachments: [{ id: 0, filename: 'direct.png' }] } : {}),
  };
}

/** Image du tableau de score (PNG), dessinée par l'interface ; absente dans les tests. */
export type LiveRender = (l: FmLive, club: string | null, comment: string) => Promise<Uint8Array | null>;

/** Où en est le direct : match suivi, message du tableau de score, dernier relevé envoyé. Gardé pour un redémarrage. */
interface LiveState {
  key: string;
  messageId: string | null;
  last: FmLive;
  done: boolean;
}

const STATE_KEY = 'fmi.discord.liveState';

function loadState(): LiveState | null {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    return raw ? (JSON.parse(raw) as LiveState) : null;
  } catch {
    return null;
  }
}

function saveState(s: LiveState) {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(s));
  } catch {
    /* sans stockage : on garde l'état en mémoire */
  }
}

/** Envoie (sans identifiant) ou modifie l'encart, avec son image quand on sait la dessiner. Renvoie l'identifiant du message. */
async function publish(t: TFunction, l: FmLive, club: string | null, messageId: string | null, render?: LiveRender): Promise<string | null> {
  const png = render ? await render(l, club, commentary(t, l, club, lastOf(timeline(l)))).catch(() => null) : null;
  if (png) {
    return invoke<string>('discord_live_image', {
      webhook: getWebhook(),
      messageId,
      payload: scoreboardPayload(t, l, club, { image: true }),
      png: Array.from(png),
    });
  }
  const board = scoreboardPayload(t, l, club);
  if (!messageId) return postDiscord(board);
  await editDiscord(messageId, board);
  return messageId;
}

/** Un relevé du direct : nouveau match → encart ; ensuite le même message est modifié (score, minute, commentaire, fin). */
export async function liveStep(
  t: TFunction,
  l: FmLive,
  club: string | null,
  state: LiveState | null,
  now = Date.now(),
  render?: LiveRender,
): Promise<LiveState | null> {
  if (!liveIsFresh(l, now)) return state;
  const key = liveKey(l);
  if (!state || state.key !== key) {
    if (l.final) return { key, messageId: null, last: l, done: true }; // match déjà fini quand l'appli l'a vu
    const messageId = await publish(t, l, club, null, render);
    return { key, messageId, last: l, done: false };
  }
  if (state.done) return state;
  const changed =
    liveNews(state.last, l).length > 0 ||
    JSON.stringify([state.last.minute, state.last.homeScore, state.last.awayScore, state.last.scorers, state.last.final]) !==
      JSON.stringify([l.minute, l.homeScore, l.awayScore, l.scorers, l.final]);
  let messageId = state.messageId;
  if (changed) {
    try {
      if (!messageId) throw new Error('aucun tableau');
      messageId = await publish(t, l, club, messageId, render);
    } catch {
      // Encart effacé du salon (ou jamais envoyé) : on en poste un nouveau plutôt que de rester bloqué.
      messageId = await publish(t, l, club, null, render).catch(() => null);
    }
  }
  return { key, messageId, last: l, done: !!l.final };
}

/**
 * Direct des matchs sur Discord, monté une fois pour toute l'appli : toutes les 10 s, lit le relevé du plugin
 * (archivix-live.json) si le joueur a activé le direct et relié un salon. Rien n'est lu ni envoyé sinon.
 */
export function useLiveDiscord() {
  const { t } = useTranslation();
  const busy = useRef(false);
  useEffect(() => {
    let state = loadState();
    const render: LiveRender = async (l, club, comment) => {
      const { drawLiveBoard } = await import('./live-image');
      const { canvasPng } = await import('./gazette-une');
      return canvasPng(await drawLiveBoard(t, l, club, comment));
    };
    const tick = async () => {
      if (busy.current || !getLiveEnabled() || !isWebhook(getWebhook())) return;
      busy.current = true;
      try {
        const folder = await invoke<string | null>('fm_default_folder');
        if (!folder) return;
        const raw = await invoke<string | null>('fm_read_live', { folder });
        if (!raw) return;
        const live = fmLiveSchema.safeParse(JSON.parse(raw));
        if (!live.success) return;
        const statusRaw = await invoke<string | null>('fm_read_status', { folder }).catch(() => null);
        const club = statusRaw ? ((JSON.parse(statusRaw) as { club?: string | null }).club ?? null) : null;
        const next = await liveStep(t, live.data, club, state, Date.now(), render);
        if (next && next !== state) {
          state = next;
          saveState(next);
        }
      } catch (e) {
        console.warn('Direct Discord :', e);
      } finally {
        busy.current = false;
      }
    };
    const id = window.setInterval(tick, 10_000);
    void tick();
    return () => window.clearInterval(id);
  }, [t]);
}
