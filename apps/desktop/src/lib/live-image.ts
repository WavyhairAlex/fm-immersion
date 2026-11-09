import { contrast, visibleOn, type FmLive } from '@fm-immersion/module-fm';
import type { TFunction } from 'i18next';
import { clubArt, drawCrest, type ClubArt } from './club-look';
import { wrap } from './gazette-une';
import { liveAssists, liveCardList } from '@fm-immersion/module-fm';
import { minuteOf, timeline, type MatchStats, type TimelineGoal } from './live-discord';

/**
 * Image du tableau de score du direct, en paysage (1200 × 600, 2:1 : bien en largeur dans Discord), redessinée à chaque
 * relevé : bandeau (en direct / score final, minute, compétition), équipes et grand score, puis trois colonnes :
 * buteurs et cartons rouges dans l'ordre du match, panneau des chiffres (possession, tirs, cadrés, xG, cartons une
 * fois le match fini), homme du match avec sa photo (ou l'auteur du dernier but) ; « dernier fait » en bas.
 * Chaque équipe a son logo (pack de logos du joueur) ou son écusson à ses couleurs, le liseré du haut et les buts de
 * la frise prennent la couleur de l'équipe quand le plugin la lit.
 */
const W = 1200;
const H = 600;
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
  // Minute (ou « Fin du match ») dans un cartouche orange à droite.
  const clock = l.final ? t('live.ended') : minute != null ? `${minute}'` : t('live.kickoff');
  ctx.font = `italic ${font(900, 22, SERIF)}`;
  const cw = ctx.measureText(clock).width + 28;
  ctx.fillStyle = C.orange;
  ctx.beginPath();
  ctx.moveTo(W - M - cw + 8, 22);
  ctx.lineTo(W - M, 22);
  ctx.lineTo(W - M - 8, 56);
  ctx.lineTo(W - M - cw, 56);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = C.dark;
  ctx.textAlign = 'right';
  ctx.fillText(clock, W - M - 16, 47);
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

  // Filet orange sous les équipes, comme un bandeau de télévision.
  ctx.fillStyle = C.orange;
  ctx.fillRect(M, 214, W - 2 * M, 3);

  const colorOf = (s: 'home' | 'away') => (s === 'home' ? homeColor : awayColor);
  const tl = timeline(l) ?? [];
  const cards = liveCardList(l);
  const label = (x: number, y: number, text: string, bg = C.orangeDark) => {
    ctx.font = font(900, 14);
    const w = ctx.measureText(text).width + 22;
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, 26);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(text, x + 11, y + 18);
  };

  // Trois colonnes : buteurs (et cartons rouges) dans l'ordre du match, panneau des chiffres, homme du match ou dernier but.
  const top = 240;
  const band = 76;
  const bottom = H - band - 20;
  const leftW = 330;
  const rightW = 280;
  const px = M + leftW + 30;
  const pw = W - M - rightW - 30 - px;

  // Colonne de gauche : « 32' ⚽ A. Mojžiš », point à la couleur de l'équipe.
  label(M, top, t('live.image.moments').toLocaleUpperCase(lang));
  // Passeurs décisifs (rapport de fin de match) : « (M. Fábry) » à côté du buteur.
  const assists = liveAssists(l);
  // Retrouvé par la minute du but ; par le nom du buteur seulement s'il n'a marqué qu'une fois.
  const tlAll = timeline(l) ?? [];
  const assistOf = (e: { side: 'home' | 'away'; time: string; name: string }) => {
    const byTime = assists.find((a) => a.side === e.side && a.time === e.time);
    if (byTime) return byTime.assist;
    const once = tlAll.filter((g) => g.side === e.side && g.name === e.name).length === 1;
    return (once && assists.find((a) => a.side === e.side && a.player === e.name && !a.time)?.assist) || null;
  };
  const events = [
    ...tl.map((g) => ({ minute: g.minute, time: g.own ? `${g.time} (csc)` : g.time, side: g.side, name: g.name, red: false, yellow: false, assist: g.own ? null : assistOf(g) })),
    ...cards.map((c) => ({ minute: minuteOf(c.time) ?? 99, time: c.time ?? '', side: c.side, name: c.player ?? t(c.card === 'red' ? 'live.image.redCard' : 'live.image.yellowCard'), red: c.card === 'red', yellow: c.card === 'yellow', assist: null as string | null })),
  ].sort((a, b) => a.minute - b.minute);
  const rowH = 34;
  const max = Math.floor((bottom - top - 40) / rowH);
  const rows = events.length > max ? events.slice(0, max - 1) : events;
  rows.forEach((e, i) => {
    const y = top + 62 + i * rowH;
    ctx.fillStyle = colorOf(e.side);
    ctx.beginPath();
    ctx.arc(M + 7, y - 6, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = font(900, 19);
    ctx.fillStyle = C.orange;
    const time = e.time ? e.time.replace(/['’]?$/, "'") : '–';
    ctx.fillText(time, M + 22, y);
    const tw = Math.max(52, ctx.measureText(time).width + 12);
    if (e.red || e.yellow) {
      ctx.fillStyle = e.red ? C.red : '#F5B700';
      ctx.fillRect(M + 22 + tw, y - 18, 13, 19);
    } else {
      ctx.font = font(400, 18);
      ctx.fillText('⚽', M + 18 + tw, y);
    }
    ctx.font = font(800, 19);
    ctx.fillStyle = e.side === side ? C.ink : C.soft;
    ctx.fillText(wrap(ctx, e.name, leftW - tw - 52, 1)[0]!, M + 50 + tw, y);
    if (e.assist) {
      const nw = Math.min(ctx.measureText(e.name).width, leftW - tw - 52);
      ctx.font = font(600, 15);
      ctx.fillStyle = C.soft;
      ctx.fillText(wrap(ctx, `🅰️ ${e.assist}`, Math.max(40, leftW - tw - 60 - nw), 1)[0]!, M + 58 + tw + nw, y);
    }
  });
  if (events.length > rows.length) {
    ctx.font = font(700, 15);
    ctx.fillStyle = C.soft;
    ctx.fillText(t('live.image.more', { count: events.length - rows.length }), M + 22, top + 62 + rows.length * rowH);
  }
  if (!events.length) {
    ctx.font = font(700, 17);
    ctx.fillStyle = C.soft;
    ctx.fillText(t('live.image.noGoal'), M, top + 62);
  }

  // Panneau des chiffres : ceux du jeu une fois le match fini, sinon ce que dit le relevé (buts par mi-temps, cartons).
  label(px, top, t('live.image.stats').toLocaleUpperCase(lang));
  ctx.fillStyle = C.panel;
  ctx.beginPath();
  ctx.roundRect(px, top + 34, pw, bottom - top - 34, 8);
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
  const shown = bars.slice(0, 5);
  const room = bottom - top - 34;
  const gap = shown.length ? Math.min(54, (room - 20) / shown.length) : 0;
  const y0 = top + 34 + 34 + Math.max(0, (room - 20 - gap * shown.length) / 2);
  shown.forEach((b, i) => statBar(ctx, px + 20, y0 + i * gap, pw - 40, b.label, b.a, b.b, b.text, [homeColor, awayColor]));
  if (!shown.length) {
    ctx.font = font(700, 16);
    ctx.fillStyle = C.soft;
    ctx.textAlign = 'center';
    wrap(ctx, t(l.final ? 'live.image.statsSoon' : 'live.image.statsLater'), pw - 40, 2).forEach((line, i) => ctx.fillText(line, px + pw / 2, top + 34 + room / 2 + i * 22));
    ctx.textAlign = 'left';
  }

  // Colonne de droite : homme du match (photo, nom, note) une fois connu, sinon l'auteur du dernier but.
  const rx = W - M - rightW;
  const motm = st?.motm ?? null;
  const last = tl.at(-1) ?? null;
  const who = motm ? { name: motm.name, sub: motm.rating != null ? t('live.image.rating', { rating: motm.rating.toFixed(1).replace('.', ',') }) : '', side: (side ?? 'home') as 'home' | 'away' } : last ? { name: last.name, sub: `⚽ ${last.time.replace(/['’]?$/, "'")} · ${last.side === 'home' ? l.home : l.away}`, side: last.side } : null;
  label(rx, top, t(motm ? 'live.image.motmTitle' : 'live.image.lastGoal').toLocaleUpperCase(lang), motm ? C.orange : C.orangeDark);
  ctx.fillStyle = C.panel;
  ctx.beginPath();
  ctx.roundRect(rx, top + 34, rightW, bottom - top - 34, 8);
  ctx.fill();
  if (who) {
    const r = 62;
    const cx = rx + rightW / 2;
    const cy2 = top + 34 + 22 + r;
    avatar(ctx, cx, cy2, r, who.name, faces?.get(who.name), colorOf(who.side));
    ctx.textAlign = 'center';
    ctx.font = font(800, 24, SERIF);
    ctx.fillStyle = C.ink;
    ctx.fillText(wrap(ctx, who.name, rightW - 30, 1)[0]!, cx, cy2 + r + 40);
    if (who.sub) {
      ctx.font = `italic ${font(600, 18)}`;
      ctx.fillStyle = C.soft;
      ctx.fillText(wrap(ctx, who.sub, rightW - 30, 1)[0]!, cx, cy2 + r + 68);
    }
    ctx.textAlign = 'left';
  } else {
    ctx.font = font(700, 17);
    ctx.fillStyle = C.soft;
    ctx.textAlign = 'center';
    ctx.fillText(t('live.image.noGoal'), rx + rightW / 2, top + 34 + (bottom - top - 34) / 2);
    ctx.textAlign = 'left';
  }

  // Dernier fait : la phrase du commentateur, sur un bandeau crème.
  ctx.fillStyle = C.cream;
  ctx.fillRect(0, H - band, W, band);
  ctx.fillStyle = C.orange;
  ctx.fillRect(0, H - band, W, 4);
  const tag2 = t('live.image.lastFact').toLocaleUpperCase(lang);
  ctx.font = font(900, 14);
  const lw = ctx.measureText(tag2).width + 22;
  ctx.fillStyle = C.orangeDark;
  ctx.fillRect(M, H - band + 24, lw, 28);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(tag2, M + 11, H - band + 43);
  ctx.font = `italic ${font(600, 19, SERIF)}`;
  ctx.fillStyle = C.dark;
  const said = wrap(ctx, comment, W - 2 * M - lw - 20, 2);
  said.forEach((line, i) => ctx.fillText(line, M + lw + 20, H - band + (said.length === 1 ? 45 : 34) + i * 24));
  return canvas;
}
