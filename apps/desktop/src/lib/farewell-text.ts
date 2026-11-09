import type { CoachExit, ExitReason } from '@fm-immersion/module-fm';
import type { TFunction } from 'i18next';
import { paperName } from './gazette-text';
import { ordinal } from './season-une';

/** Graine stable : la même interview pour le même départ, quel que soit le moment où on la relit. */
function hash(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return Math.abs(h);
}

const day = (iso: string, lang?: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' });

/** Titre, surtitre et chapô du hors-série. */
export function farewellHeadline(t: TFunction, x: CoachExit, reason: ExitReason, lang?: string) {
  const r = x.total;
  const vars = { club: x.club, next: x.next, start: day(x.start, lang), end: day(x.end, lang), played: r.played, wins: r.wins, draws: r.draws, losses: r.losses };
  return {
    kicker: t(`farewell.kicker.${reason}`),
    title: t(reason === 'sacked' ? 'farewell.title.sacked' : x.next ? 'farewell.title.leftNext' : 'farewell.title.left', vars),
    deck: r.played ? t('farewell.deck', { ...vars, count: r.played }) : t('farewell.deckNone', vars),
  };
}

/** Nom d'un titre : le championnat, ou la coupe gagnée. */
export const trophyName = (t: TFunction, tr: CoachExit['trophies'][number]) => tr.competition ?? t('farewell.league');

/**
 * Fausse interview de départ : cinq questions, réponses tirées des faits du passage (titre, plus large victoire,
 * meilleur buteur, bilan) et du ton du départ (limogé ou parti de lui-même, vers un autre club ou non).
 */
export function farewellInterview(t: TFunction, x: CoachExit, reason: ExitReason): { q: string; a: string }[] {
  const seed = `${x.club}|${x.end}|${reason}`;
  const pick = (key: string, n: number, vars: Record<string, unknown> = {}) => t(`farewell.a.${key}_${hash(seed + key) % n}`, { club: x.club, next: x.next, ...vars });
  const r = x.total;
  const out: { q: string; a: string }[] = [];
  out.push({ q: t('farewell.q.feel'), a: pick(`feel_${reason}`, 3) });
  const trophy = x.trophies.at(-1);
  const win = r.biggestWin;
  out.push({
    q: t('farewell.q.memory'),
    a: trophy
      ? pick('memory_trophy', 2, { season: trophy.season, trophy: trophyName(t, trophy) })
      : win && win.goalsFor > win.goalsAgainst
        ? pick('memory_win', 2, { score: `${win.goalsFor}-${win.goalsAgainst}`, opponent: win.opponent ?? '' })
        : pick('memory_none', 2),
  });
  out.push({
    q: t('farewell.q.player'),
    a: r.topScorer && r.topScorer.value > 0 ? pick('player', 2, { name: r.topScorer.name, count: r.topScorer.value }) : pick('player_none', 1),
  });
  if (reason === 'sacked') {
    const good = r.played > 0 && r.wins / r.played >= 0.45;
    out.push({ q: t('farewell.q.whySacked'), a: pick(good ? 'why_sacked_good' : 'why_sacked_bad', 2, { wins: r.wins, played: r.played, losses: r.losses }) });
  } else out.push({ q: t('farewell.q.whyLeft'), a: pick(x.next ? 'why_left_next' : 'why_left_none', 2) });
  out.push({ q: t('farewell.q.fans'), a: pick('fans', 3) });
  return out;
}

/** Message Discord du hors-série : image de la page et court encart. */
export function farewellPayload(t: TFunction, x: CoachExit, reason: ExitReason, lang?: string) {
  const h = farewellHeadline(t, x, reason, lang);
  const r = x.total;
  const lines = [
    h.deck,
    x.trophies.length ? `🏆 ${x.trophies.map((tr) => `${trophyName(t, tr)} ${tr.season}`).join(' · ')}` : '',
    x.bestFinish != null ? `📈 ${t('farewell.tile.best')} : ${ordinal(t, x.bestFinish)}` : '',
    r.topScorer ? `⚽ ${t('farewell.line.topScorer', { name: r.topScorer.name, count: r.topScorer.value })}` : '',
  ].filter(Boolean);
  return {
    username: paperName(t, x.club).slice(0, 80),
    embeds: [
      {
        author: { name: `⚡  ${t('farewell.flash').toUpperCase()}  ·  ${t('farewell.special').toUpperCase()}` },
        title: h.title.slice(0, 256),
        description: lines.join('\n').slice(0, 4000),
        color: reason === 'sacked' ? 0xd93c3c : 0xffb547,
        image: { url: 'attachment://une.png' },
        footer: { text: `${paperName(t, x.club)}  ·  FM Immersion` },
      },
    ],
    attachments: [{ id: 0, filename: 'une.png' }],
  };
}
