import type { FmLive } from '@fm-immersion/module-fm';
import type { TFunction } from 'i18next';
import { wrap } from './gazette-une';
import { minuteOf, timeline, type MatchStats } from './live-discord';

/**
 * Image du tableau de score du direct (1000 × 450, 510 avec les chiffres), redessinée à chaque relevé : bandeau (en
 * direct / score final, minute, compétition), équipes et grand score, frise du match avec les buts à leur minute,
 * buteurs, chiffres du jeu après le match (possession, tirs, xG, homme du match), et phrase du commentateur.
 */
const W = 1000;
const H0 = 450;
/** Hauteur ajoutée pour les deux lignes de chiffres, une fois le match fini et les stats lues. */
const STATS_H = 60;
const M = 40;
const C = {
  bg: '#25282D',
  panel: '#30343A',
  ink: '#FFFFFF',
  soft: '#B9BCC2',
  orange: '#F26B1D',
  orangeDark: '#C2410C',
  cream: '#F2F2F0',
  dark: '#25282D',
  green: '#2E9E5B',
  red: '#D93C3C',
  track: '#4A4F57',
};
const SERIF = '"Fraunces Variable", Georgia, serif';
const SANS = '"Nunito Variable", system-ui, sans-serif';
const font = (weight: number, size: number, family = SANS) => `${weight} ${size}px ${family}`;

function pill(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, bg: string) {
  ctx.font = font(900, 15);
  const w = ctx.measureText(text).width + 24;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(x, y, w, 28, 14);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(text, x + 12, y + 19);
  return w;
}

/**
 * Nom d'équipe sur une à trois lignes, dans la plus grande taille (≤ max) où il tient en entier sur `width` et
 * `height` : les longs noms de club (« Futbalový Klub Pohronie Žiar nad Hronom Dolná Ždaňa ») passent à la ligne.
 */
function fitName(ctx: CanvasRenderingContext2D, text: string, max: number, width: number, height: number) {
  for (let size = max; ; size -= 2) {
    ctx.font = font(800, size, SERIF);
    const lines = wrap(ctx, text, width, 3);
    const lh = Math.round(size * 1.12);
    if (size <= 18 || (!lines.at(-1)!.endsWith('…') && lines.length * lh <= height)) return { lines, lh };
  }
}

/** Lignes de chiffres du tableau final : possession, tirs, xG, puis l'homme du match. */
export function statsRows(t: TFunction, st: MatchStats, lang?: string): string[] {
  const xg = (n: number) => new Intl.NumberFormat(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  const first = [
    st.possession && t('live.image.possession', { home: Math.round(st.possession[0]), away: Math.round(st.possession[1]) }),
    st.shots && t('live.image.shots', { home: st.shots[0], away: st.shots[1], homeOn: st.onTarget?.[0] ?? '?', awayOn: st.onTarget?.[1] ?? '?' }),
    st.xg && t('live.image.xg', { home: xg(st.xg[0]), away: xg(st.xg[1]) }),
  ].filter((x): x is string => Boolean(x));
  const rows = first.length ? [first.join('   ·   ')] : [];
  if (st.motm) rows.push(st.motm.rating != null ? t('live.image.motm', { name: st.motm.name, rating: st.motm.rating.toFixed(1).replace('.', ',') }) : t('live.image.motmNoRating', { name: st.motm.name }));
  return rows;
}

export async function drawLiveBoard(t: TFunction, l: FmLive, club: string | null, comment: string, lang?: string): Promise<HTMLCanvasElement> {
  await Promise.all([font(900, 96, SERIF), font(800, 34, SERIF), font(800, 18), font(400, 18)].map((f) => document.fonts.load(f).catch(() => undefined)));
  const extra = l as { competition?: unknown; stats?: MatchStats | null };
  const stats = l.final && extra.stats ? statsRows(t, extra.stats, lang) : [];
  const H = H0 + (stats.length ? STATS_H : 0);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = C.orange;
  ctx.fillRect(0, 0, W, 6);

  const side = club === l.home ? 'home' : club === l.away ? 'away' : null;
  const hs = l.homeScore ?? 0;
  const as = l.awayScore ?? 0;
  const minute = minuteOf(l.minute);

  // Bandeau : état du match à gauche, minute à droite.
  let tag = t('live.image.live');
  let tagBg = C.red;
  if (l.final) {
    const mine = side === 'home' ? hs : as;
    const theirs = side === 'home' ? as : hs;
    tag = side ? t(`live.image.final${mine > theirs ? 'W' : mine < theirs ? 'L' : 'D'}`) : t('live.image.final');
    tagBg = !side ? C.orangeDark : mine > theirs ? C.green : mine < theirs ? C.red : C.orangeDark;
  }
  pill(ctx, M, 26, tag, tagBg);
  ctx.font = font(900, 22, SERIF);
  ctx.fillStyle = C.orange;
  ctx.textAlign = 'right';
  ctx.fillText(l.final ? t('live.ended') : minute != null ? `${minute}'` : t('live.kickoff'), W - M, 48);
  // Compétition au centre du bandeau (nom du jeu, tel quel).
  const competition = typeof extra.competition === 'string' ? extra.competition.replace(/<[^>]*>/g, '').trim() : '';
  if (competition) {
    ctx.font = font(700, 15);
    ctx.fillStyle = C.soft;
    ctx.textAlign = 'center';
    ctx.fillText(wrap(ctx, competition.toLocaleUpperCase(lang), 480, 1)[0]!, W / 2, 46);
  }
  ctx.textAlign = 'left';

  // Équipes et score.
  const scoreText = `${hs} – ${as}`;
  ctx.font = font(900, 96, SERIF);
  const sw = ctx.measureText(scoreText).width;
  const nameW = (W - 2 * M - sw - 60) / 2;
  ctx.fillStyle = C.orange;
  ctx.textAlign = 'center';
  ctx.fillText(scoreText, W / 2, 170);
  for (const [name, x, align, me] of [
    [l.home, M, 'left', side === 'home'],
    [l.away, W - M, 'right', side === 'away'],
  ] as const) {
    const { lines, lh } = fitName(ctx, name, 36, nameW, 120);
    ctx.textAlign = align;
    ctx.fillStyle = me ? C.ink : C.soft;
    // Bloc centré sur la hauteur du score.
    const y0 = 128 - ((lines.length - 1) * lh) / 2 + lh * 0.35;
    lines.forEach((line, i) => ctx.fillText(line, x, y0 + i * lh));
  }
  ctx.textAlign = 'left';

  // Frise du match : 0' à 90', remplie jusqu'à la minute, un point par but (au-dessus : domicile, dessous : extérieur).
  const ty = 222;
  const tx0 = M;
  const tw = W - 2 * M;
  ctx.fillStyle = C.track;
  ctx.beginPath();
  ctx.roundRect(tx0, ty - 4, tw, 8, 4);
  ctx.fill();
  const done = l.final ? 1 : Math.min(1, (minute ?? 0) / 90);
  ctx.fillStyle = C.orange;
  ctx.beginPath();
  ctx.roundRect(tx0, ty - 4, Math.max(8, tw * done), 8, 4);
  ctx.fill();
  ctx.font = font(700, 12);
  ctx.fillStyle = C.soft;
  for (const mk of [0, 45, 90]) {
    ctx.textAlign = mk === 0 ? 'left' : mk === 90 ? 'right' : 'center';
    ctx.fillText(`${mk}'`, tx0 + (tw * mk) / 90, ty + 40);
  }
  ctx.textAlign = 'left';
  const tl = timeline(l) ?? [];
  for (const g of tl) {
    const x = tx0 + tw * Math.min(1, g.minute / 90);
    const y = g.side === 'home' ? ty - 18 : ty + 18;
    const mine = side ? g.side === side : g.side === 'home';
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fillStyle = mine ? C.orange : C.cream;
    ctx.fill();
    ctx.strokeStyle = C.bg;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Buteurs sous chaque équipe.
  const by = 284;
  for (const s of ['home', 'away'] as const) {
    const list = tl.filter((g) => g.side === s);
    const merged = new Map<string, string[]>();
    for (const g of list) merged.set(g.name, [...(merged.get(g.name) ?? []), g.time]);
    const text = [...merged].map(([n, times]) => `${n} ${times.join(', ')}`).join(' · ');
    if (!text) continue;
    ctx.font = font(700, 17);
    ctx.fillStyle = C.ink;
    ctx.textAlign = s === 'home' ? 'left' : 'right';
    wrap(ctx, text, W / 2 - M - 20, 2).forEach((line, i) => ctx.fillText(line, s === 'home' ? M : W - M, by + i * 22));
  }
  ctx.textAlign = 'left';

  // Chiffres du jeu, une fois le match fini : une ligne possession / tirs / xG, une ligne homme du match.
  if (stats.length) {
    ctx.textAlign = 'center';
    stats.forEach((row, i) => {
      ctx.font = font(i === 0 ? 700 : 600, 16);
      ctx.fillStyle = i === 0 ? C.ink : C.soft;
      ctx.fillText(wrap(ctx, row, W - 2 * M, 1)[0]!, W / 2, 338 + i * 24);
    });
    ctx.textAlign = 'left';
  }

  // Phrase du commentateur, sur deux lignes au plus.
  const band = 120;
  ctx.fillStyle = C.cream;
  ctx.fillRect(0, H - band, W, band);
  ctx.fillStyle = C.orange;
  ctx.fillRect(0, H - band, 8, band);
  ctx.font = font(800, 13);
  ctx.fillStyle = C.orangeDark;
  ctx.fillText(t('live.image.commentator').toUpperCase(), M, H - band + 30);
  ctx.font = `italic ${font(600, 22, SERIF)}`;
  ctx.fillStyle = C.dark;
  const said = wrap(ctx, `« ${comment} »`, W - 2 * M, 2);
  said.forEach((line, i) => ctx.fillText(line, M, H - band + (said.length === 1 ? 74 : 62) + i * 30));
  return canvas;
}
