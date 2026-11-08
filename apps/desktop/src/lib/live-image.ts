import { contrast, visibleOn, type FmLive } from '@fm-immersion/module-fm';
import type { TFunction } from 'i18next';
import { clubArt, drawCrest, type ClubArt } from './club-look';
import { wrap } from './gazette-une';
import { liveCardList } from '@fm-immersion/module-fm';
import { minuteOf, timeline, type MatchStats, type TimelineGoal } from './live-discord';

/**
 * Image du tableau de score du direct, en paysage (1200 × 675, le format des aperçus Discord), redessinée à chaque
 * relevé : bandeau (en direct / score final, minute, compétition), équipes et grand score, frise du match avec buts
 * et cartons rouges à leur minute, buteurs de chaque équipe avec leur photo (nos joueurs), panneau des chiffres au
 * centre (possession, tirs, cadrés, xG, cartons, homme du match une fois le match fini), phrase du commentateur.
 * Chaque équipe a son logo (pack de logos du joueur) ou son écusson à ses couleurs, le liseré du haut et les buts de
 * la frise prennent la couleur de l'équipe quand le plugin la lit.
 */
const W = 1200;
const H = 675;
const M = 44;
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

/** Taille des logos à côté des noms d'équipe. */
const CREST = 92;

/** Photo ronde d'un buteur (visage du jeu) ou ses initiales sur un disque à la couleur de l'équipe. */
function avatar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, name: string, face: CanvasImageSource | null | undefined, color: string) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = C.panel;
  ctx.fill();
  ctx.clip();
  if (face) {
    const fw = Number((face as { width?: number }).width) || 1;
    const fh = Number((face as { height?: number }).height) || 1;
    const side = Math.min(fw, fh);
    ctx.drawImage(face, (fw - side) / 2, 0, side, side, x - r, y - r, r * 2, r * 2);
  } else {
    ctx.fillStyle = color;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.font = font(900, Math.round(r * 0.8), SERIF);
    ctx.fillStyle = contrast(color, '#FFFFFF') >= 3 ? '#FFFFFF' : C.dark;
    ctx.textAlign = 'center';
    const initials = name.replace(/\./g, ' ').split(/\s+/).filter(Boolean).map((w) => w[0]).slice(-2).join('');
    ctx.fillText(initials.toLocaleUpperCase(), x, y + r * 0.3);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.stroke();
}

/** Buteurs d'une équipe, regroupés (« M. Fábry 11', 90+1' »), dans l'ordre de leur premier but. */
function scorersOf(tl: TimelineGoal[], side: 'home' | 'away') {
  const merged = new Map<string, string[]>();
  for (const g of tl.filter((x) => x.side === side)) merged.set(g.name, [...(merged.get(g.name) ?? []), g.own ? `${g.time} (csc)` : g.time]);
  return [...merged].map(([name, times]) => ({ name, times: times.join(', ') }));
}

/** Barre de comparaison du panneau des chiffres : libellé au centre, valeurs aux deux bouts, part de chaque équipe. */
function statBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, label: string, a: number, b: number, text: [string, string], colors: [string, string]) {
  ctx.font = font(800, 15);
  ctx.fillStyle = C.soft;
  ctx.textAlign = 'center';
  ctx.fillText(label.toLocaleUpperCase(), x + w / 2, y);
  ctx.font = font(900, 20);
  ctx.fillStyle = C.ink;
  ctx.textAlign = 'left';
  ctx.fillText(text[0], x, y);
  ctx.textAlign = 'right';
  ctx.fillText(text[1], x + w, y);
  ctx.textAlign = 'left';
  const total = a + b;
  const share = total > 0 ? a / total : 0.5;
  ctx.fillStyle = C.track;
  ctx.beginPath();
  ctx.roundRect(x, y + 9, w, 8, 4);
  ctx.fill();
  ctx.fillStyle = colors[0];
  ctx.beginPath();
  ctx.roundRect(x, y + 9, Math.max(4, w * share - 2), 8, 4);
  ctx.fill();
  ctx.fillStyle = colors[1];
  ctx.beginPath();
  ctx.roundRect(x + w * share + 2, y + 9, Math.max(4, w * (1 - share) - 2), 8, 4);
  ctx.fill();
}

export async function drawLiveBoard(
  t: TFunction,
  l: FmLive,
  club: string | null,
  comment: string,
  lang?: string,
  arts?: { home: ClubArt | null; away: ClubArt | null },
  faces?: Map<string, CanvasImageSource | null>,
): Promise<HTMLCanvasElement> {
  const [homeArt, awayArt] = arts ? [arts.home, arts.away] : await Promise.all([clubArt(l.home), clubArt(l.away)]);
  await Promise.all([font(900, 110, SERIF), font(800, 34, SERIF), font(800, 18), font(400, 18), font(900, 20)].map((f) => document.fonts.load(f).catch(() => undefined)));
  const extra = l as { competition?: unknown; stats?: MatchStats | null };
  const st = l.final ? (extra.stats ?? null) : null;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  // Liseré du haut : moitié aux couleurs de chaque équipe (orange si le jeu ne les donne pas).
  const teamColor = (a: ClubArt | null, fallback: string) => visibleOn(a?.look?.colors ?? [], C.bg, fallback, 1.8);
  const homeColor = teamColor(homeArt, C.orange);
  // Extérieur : une de ses couleurs, même un peu sombre, qui se distingue du domicile ; sinon l'orange ou le crème.
  const awayColor =
    [...(awayArt?.look?.colors ?? []), C.orange, C.cream].find((c) => contrast(c, C.bg) >= 1.25 && contrast(c, homeColor) >= 1.4) ?? C.cream;
  ctx.fillStyle = homeColor;
  ctx.fillRect(0, 0, W / 2, 6);
  ctx.fillStyle = awayColor;
  ctx.fillRect(W / 2, 0, W / 2, 6);

  const side = club === l.home ? 'home' : club === l.away ? 'away' : null;
  const hs = l.homeScore ?? 0;
  const as = l.awayScore ?? 0;
  const minute = minuteOf(l.minute);

  // Bandeau : état du match à gauche, compétition au centre, minute à droite.
  let tag = t('live.image.live');
  let tagBg = C.red;
  if (l.final) {
    const mine = side === 'home' ? hs : as;
    const theirs = side === 'home' ? as : hs;
    tag = side ? t(`live.image.final${mine > theirs ? 'W' : mine < theirs ? 'L' : 'D'}`) : t('live.image.final');
    tagBg = !side ? C.orangeDark : mine > theirs ? C.green : mine < theirs ? C.red : C.orangeDark;
  }
  pill(ctx, M, 26, tag, tagBg);
  ctx.font = font(900, 24, SERIF);
  ctx.fillStyle = C.orange;
  ctx.textAlign = 'right';
  ctx.fillText(l.final ? t('live.ended') : minute != null ? `${minute}'` : t('live.kickoff'), W - M, 48);
  const competition = typeof extra.competition === 'string' ? extra.competition.replace(/<[^>]*>/g, '').trim() : '';
  if (competition) {
    ctx.font = font(700, 15);
    ctx.fillStyle = C.soft;
    ctx.textAlign = 'center';
    ctx.fillText(wrap(ctx, competition.toLocaleUpperCase(lang), 560, 1)[0]!, W / 2, 46);
  }
  ctx.textAlign = 'left';

  // Équipes et score.
  const scoreText = `${hs} – ${as}`;
  ctx.font = font(900, 110, SERIF);
  const sw = ctx.measureText(scoreText).width;
  const nameW = (W - 2 * M - sw - 70) / 2 - (CREST + 18);
  ctx.fillStyle = C.orange;
  ctx.textAlign = 'center';
  ctx.fillText(scoreText, W / 2, 178);
  const cy = 136;
  if (homeArt) drawCrest(ctx, homeArt, M + CREST / 2, cy, CREST, { ring: C.bg });
  if (awayArt) drawCrest(ctx, awayArt, W - M - CREST / 2, cy, CREST, { ring: C.bg });
  ctx.textBaseline = 'alphabetic';
  for (const [name, x, align, me] of [
    [l.home, M + CREST + 18, 'left', side === 'home'],
    [l.away, W - M - CREST - 18, 'right', side === 'away'],
  ] as const) {
    const { lines, lh } = fitName(ctx, name, 38, nameW, 124);
    ctx.textAlign = align;
    ctx.fillStyle = me ? C.ink : C.soft;
    const y0 = cy - ((lines.length - 1) * lh) / 2 + lh * 0.35;
    lines.forEach((line, i) => ctx.fillText(line, x, y0 + i * lh));
  }
  ctx.textAlign = 'left';

  // Frise du match : 0' à 90', remplie jusqu'à la minute ; buts (ronds) et cartons rouges (rectangles) à leur minute,
  // au-dessus pour le domicile, dessous pour l'extérieur.
  const ty = 236;
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
    ctx.fillText(`${mk}'`, tx0 + (tw * mk) / 90, ty + 42);
  }
  ctx.textAlign = 'left';
  const colorOf = (s: 'home' | 'away') => (s === 'home' ? homeColor : awayColor);
  const tl = timeline(l) ?? [];
  for (const g of tl) {
    const x = tx0 + tw * Math.min(1, g.minute / 90);
    const y = g.side === 'home' ? ty - 19 : ty + 19;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.fillStyle = colorOf(g.side);
    ctx.fill();
    ctx.strokeStyle = C.bg;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  const cards = liveCardList(l);
  for (const c of cards) {
    const m = minuteOf(c.time);
    if (m == null) continue;
    const x = tx0 + tw * Math.min(1, m / 90);
    const y = c.side === 'home' ? ty - 19 : ty + 19;
    ctx.fillStyle = c.card === 'red' ? C.red : '#F5B700';
    ctx.strokeStyle = C.bg;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x - 6, y - 9, 12, 18, 2);
    ctx.fill();
    ctx.stroke();
  }

  // Trois colonnes : buteurs du domicile, panneau des chiffres, buteurs de l'extérieur.
  const top = 300;
  const bottom = H - 118;
  const colW = 330;
  for (const s of ['home', 'away'] as const) {
    const list = scorersOf(tl, s);
    const x = s === 'home' ? M : W - M;
    const align = s === 'home' ? 'left' : 'right';
    const rows = Math.min(list.length, 4);
    const rowH = rows > 3 ? 56 : 66;
    const r = rows > 3 ? 22 : 26;
    list.slice(0, rows).forEach((g, i) => {
      const y = top + 8 + i * rowH + r;
      const ax = s === 'home' ? x + r : x - r;
      avatar(ctx, ax, y, r, g.name, faces?.get(g.name), colorOf(s));
      const tx = s === 'home' ? x + 2 * r + 14 : x - 2 * r - 14;
      ctx.textAlign = align;
      ctx.font = font(800, 19);
      ctx.fillStyle = C.ink;
      ctx.fillText(wrap(ctx, g.name, colW - 2 * r - 14, 1)[0]!, tx, y - 2);
      ctx.font = font(700, 15);
      ctx.fillStyle = C.soft;
      ctx.fillText(wrap(ctx, `⚽ ${g.times}`, colW - 2 * r - 14, 1)[0]!, tx, y + 19);
    });
    if (list.length > rows) {
      ctx.font = font(700, 14);
      ctx.fillStyle = C.soft;
      ctx.textAlign = align;
      ctx.fillText(`+ ${list.slice(rows).map((g) => g.name).join(', ')}`, x, top + 8 + rows * rowH + 14);
    }
  }
  ctx.textAlign = 'left';

  // Panneau des chiffres : ceux du jeu une fois le match fini, sinon ce que dit le relevé (buts par mi-temps, cartons).
  const px = M + colW + 24;
  const pw = W - 2 * px;
  ctx.fillStyle = C.panel;
  ctx.beginPath();
  ctx.roundRect(px - 18, top, pw + 36, bottom - top - 14, 10);
  ctx.fill();
  const bars: { label: string; a: number; b: number; text: [string, string] }[] = [];
  const fmt = (n: number) => new Intl.NumberFormat(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  if (st?.possession) bars.push({ label: t('live.image.possessionLabel'), a: st.possession[0], b: st.possession[1], text: [`${Math.round(st.possession[0])} %`, `${Math.round(st.possession[1])} %`] });
  if (st?.shots) bars.push({ label: t('live.image.shotsLabel'), a: st.shots[0], b: st.shots[1], text: [String(st.shots[0]), String(st.shots[1])] });
  if (st?.onTarget) bars.push({ label: t('live.image.onTargetLabel'), a: st.onTarget[0], b: st.onTarget[1], text: [String(st.onTarget[0]), String(st.onTarget[1])] });
  if (st?.xg) bars.push({ label: 'xG', a: st.xg[0], b: st.xg[1], text: [fmt(st.xg[0]), fmt(st.xg[1])] });
  const reds = (s: 'home' | 'away') => cards.filter((c) => c.side === s && c.card === 'red').length;
  const yellows = (s: 'home' | 'away') => cards.filter((c) => c.side === s && c.card === 'yellow').length;
  if (cards.length) {
    const txt = (s: 'home' | 'away') => [yellows(s) ? `🟨 ${yellows(s)}` : '', reds(s) ? `🟥 ${reds(s)}` : ''].filter(Boolean).join('  ') || '0';
    bars.push({ label: t('live.cards'), a: yellows('home') + 2 * reds('home'), b: yellows('away') + 2 * reds('away'), text: [txt('home'), txt('away')] });
  }
  if (!st) {
    const half = (first: boolean) => tl.filter((g) => (first ? g.minute <= 45 || /^45\s*\+/.test(g.time) : g.minute > 45 && !/^45\s*\+/.test(g.time)));
    const h1 = half(true);
    const h2 = half(false);
    const count = (gs: TimelineGoal[], s: 'home' | 'away') => gs.filter((g) => g.side === s).length;
    if (tl.length) bars.unshift({ label: t('live.image.firstHalf'), a: count(h1, 'home'), b: count(h1, 'away'), text: [String(count(h1, 'home')), String(count(h1, 'away'))] });
    if (tl.length && (l.final || (minute ?? 0) > 45)) bars.splice(1, 0, { label: t('live.image.secondHalf'), a: count(h2, 'home'), b: count(h2, 'away'), text: [String(count(h2, 'home')), String(count(h2, 'away'))] });
  }
  const motm = st?.motm ?? null;
  const shown = bars.slice(0, motm ? 4 : 5);
  // Barres centrées dans le panneau (l'homme du match en bas quand il est connu).
  const room = bottom - top - 14 - (motm ? 46 : 0);
  const gap = shown.length ? Math.min(52, (room - 30) / shown.length) : 0;
  const y0 = top + 34 + Math.max(0, (room - 30 - gap * shown.length) / 2);
  shown.forEach((b, i) => statBar(ctx, px, y0 + i * gap, pw, b.label, b.a, b.b, b.text, [homeColor, awayColor]));
  if (!shown.length) {
    ctx.font = font(700, 17);
    ctx.fillStyle = C.soft;
    ctx.textAlign = 'center';
    ctx.fillText(t(l.final ? 'live.image.statsSoon' : 'live.image.statsLater'), W / 2, (top + bottom) / 2);
    ctx.textAlign = 'left';
  }
  if (motm) {
    ctx.font = font(800, 16);
    ctx.fillStyle = C.orange;
    ctx.textAlign = 'center';
    const txt = motm.rating != null ? t('live.image.motm', { name: motm.name, rating: motm.rating.toFixed(1).replace('.', ',') }) : t('live.image.motmNoRating', { name: motm.name });
    ctx.fillText(`⭐ ${wrap(ctx, txt, pw - 20, 1)[0]!}`, W / 2, bottom - 34);
    ctx.textAlign = 'left';
  }

  // Phrase du commentateur, sur deux lignes au plus.
  const band = 104;
  ctx.fillStyle = C.cream;
  ctx.fillRect(0, H - band, W, band);
  ctx.fillStyle = C.orange;
  ctx.fillRect(0, H - band, 8, band);
  ctx.font = font(800, 13);
  ctx.fillStyle = C.orangeDark;
  ctx.fillText(t('live.image.commentator').toUpperCase(), M, H - band + 26);
  ctx.font = `italic ${font(600, 21, SERIF)}`;
  ctx.fillStyle = C.dark;
  const said = wrap(ctx, `« ${comment} »`, W - 2 * M, 2);
  said.forEach((line, i) => ctx.fillText(line, M, H - band + (said.length === 1 ? 64 : 54) + i * 28));
  return canvas;
}
