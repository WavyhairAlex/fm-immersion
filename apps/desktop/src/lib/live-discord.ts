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

/** Buteurs d'une équipe : le jeu liste ceux de l'équipe à domicile d'abord, autant que de buts marqués. */
function sideScorers(l: FmLive) {
  const goals = parseScorers(l.scorers);
  const n = l.homeScore ?? 0;
  const fmt = (gs: typeof goals) => {
    const by = new Map<string, string[]>();
    for (const g of gs) by.set(g.name, [...(by.get(g.name) ?? []), g.time]);
    return [...by].map(([name, times]) => `${name} ${times.join(', ')}`).join('\n');
  };
  return goals.length === n + (l.awayScore ?? 0) ? { home: fmt(goals.slice(0, n)), away: fmt(goals.slice(n)) } : null;
}

/** Tableau de score du match, modifié à chaque relevé. `club` = club du joueur (couleur du résultat final). */
export function scoreboardPayload(t: TFunction, l: FmLive, club: string | null, lastGoal: LastGoal | null = null) {
  const s = sideScorers(l);
  let color = LIVE_RED;
  if (l.final && club && (club === l.home || club === l.away)) {
    const mine = club === l.home ? (l.homeScore ?? 0) : (l.awayScore ?? 0);
    const theirs = club === l.home ? (l.awayScore ?? 0) : (l.homeScore ?? 0);
    color = mine > theirs ? GOOD : mine < theirs ? LIVE_RED : ORANGE;
  }
  return {
    username: 'FM Immersion',
    embeds: [
      {
        author: { name: l.final ? t('live.finalTag') : t('live.liveTag') },
        title: `${l.home}  ${score(l)}  ${l.away}`,
        description: [
          l.final ? t('live.ended') : l.minute ? `⏱️ ${l.minute}` : t('live.kickoff'),
          lastGoal && t(club && club !== lastGoal.team && (club === l.home || club === l.away) ? 'live.lastGoalAgainst' : 'live.lastGoal', { ...lastGoal }),
        ]
          .filter(Boolean)
          .join('\n'),
        color,
        fields: s
          ? [
              { name: l.home, value: s.home || '—', inline: true },
              { name: l.away, value: s.away || '—', inline: true },
            ]
          : l.scorers
            ? [{ name: t('live.scorers'), value: l.scorers.slice(0, 1000) }]
            : [],
        footer: {
          text: [l.gameDate && new Date(`${l.gameDate}T12:00:00`).toLocaleDateString(), 'FM Immersion'].filter(Boolean).join('  ·  '),
        },
      },
    ],
  };
}

/** Dernier but marqué, affiché sous la minute dans le tableau. */
export interface LastGoal {
  team: string;
  scorer: string;
}

/** Où en est le direct : match suivi, message du tableau de score, dernier relevé envoyé. Gardé pour un redémarrage. */
interface LiveState {
  key: string;
  messageId: string | null;
  last: FmLive;
  done: boolean;
  lastGoal?: LastGoal | null;
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

/** Un relevé du direct : nouveau match → tableau de score ; ensuite le même message est modifié (score, minute, dernier but, fin). */
export async function liveStep(t: TFunction, l: FmLive, club: string | null, state: LiveState | null, now = Date.now()): Promise<LiveState | null> {
  if (!liveIsFresh(l, now)) return state;
  const key = liveKey(l);
  if (!state || state.key !== key) {
    if (l.final) return { key, messageId: null, last: l, done: true }; // match déjà fini quand l'appli l'a vu
    const messageId = await postDiscord(scoreboardPayload(t, l, club));
    return { key, messageId, last: l, done: false };
  }
  if (state.done) return state;
  // Un seul encart, modifié : le dernier but y est écrit plutôt qu'envoyé dans un message à part.
  let lastGoal = state.lastGoal ?? null;
  for (const n of liveNews(state.last, l))
    if (n.kind === 'goal') lastGoal = { team: n.side === 'home' ? l.home : l.away, scorer: n.scorer ? `${n.scorer.name} ${n.scorer.time}` : '' };
  const changed =
    JSON.stringify([state.last.minute, state.last.homeScore, state.last.awayScore, state.last.scorers, state.last.final, state.lastGoal]) !==
    JSON.stringify([l.minute, l.homeScore, l.awayScore, l.scorers, l.final, lastGoal]);
  let messageId = state.messageId;
  if (changed) {
    // Tableau effacé du salon (ou jamais envoyé) : on en poste un nouveau plutôt que de rester bloqué.
    const board = scoreboardPayload(t, l, club, lastGoal);
    try {
      if (!messageId) throw new Error('aucun tableau');
      await editDiscord(messageId, board);
    } catch {
      messageId = await postDiscord(board).catch(() => null);
    }
  }
  return { key, messageId, last: l, done: !!l.final, lastGoal };
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
        const statusRaw = await invoke<string | null>('fm_read_status', {
          folder,
        }).catch(() => null);
        const club = statusRaw ? ((JSON.parse(statusRaw) as { club?: string | null }).club ?? null) : null;
        const next = await liveStep(t, live.data, club, state);
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
