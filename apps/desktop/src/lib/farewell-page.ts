import { contrast, inkOn, type CoachExit, type ExitReason } from '@fm-immersion/module-fm';
import type { TFunction } from 'i18next';
import { clubArt, drawCrest } from './club-look';
import { farewellHeadline, farewellInterview, trophyName } from './farewell-text';
import { grain, justified, solid } from './gazette-page';
import { paperName } from './gazette-text';
import { fit, roundRect, wrap } from './gazette-une';
import { ordinal } from './season-une';

/**
 * Hors-série « Flash spécial » quand le coach quitte son club (limogé ou parti) : bandeau d'alerte, gros titre et
 * photo du coach (celle choisie dans la barre latérale) barrée d'un tampon, le bilan de tout le passage en chiffres, puis la fausse interview de départ à
 * gauche, les saisons et le palmarès à droite. Même format que la page de la gazette (1200 de large).
 */
const W = 1200;
const M = 48;
const GUTTER = 36;
const SIDE = 340;
const MAIN = W - 2 * M - GUTTER - SIDE;
const C = {
  paper: '#F4F1EA',
  ink: '#0F1B2D',
  grey: '#56607A',
  orange: '#FFB547',
  orangeDark: '#8F5400',
  red: '#D93C3C',
  green: '#2E9E5B',
  dash: '#C9C5BA',
};
const SERIF = '"Fraunces Variable", Georgia, serif';
const SANS = '"Nunito Variable", system-ui, sans-serif';
const font = (weight: number, size: number, family = SANS) => `${weight} ${size}px ${family}`;
const italic = (weight: number, size: number) => `italic ${font(weight, size, SERIF)}`;
const MAX_H = 4200;

export async function drawFarewell(
  t: TFunction,
  x: CoachExit,
  opts: { reason: ExitReason; lang?: string; photo?: CanvasImageSource | null },
): Promise<HTMLCanvasElement> {
  const { lang, reason } = opts;
  await Promise.all([font(900, 60, SERIF), italic(500, 22), font(400, 18), font(800, 18), font(900, 28)].map((f) => document.fonts.load(f).catch(() => undefined)));
  const club = await clubArt(x.club);
  const caps = (s: string) => s.toLocaleUpperCase(lang);
  const colors = club?.look?.colors ?? [];
  const accent = colors.find((c) => contrast(c, C.paper) >= 3) ?? C.orangeDark;
  const alarm = reason === 'sacked' ? C.red : C.orangeDark;
  const r = x.total;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = MAX_H;
  const ctx = canvas.getContext('2d')!;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, W, MAX_H);
  grain(ctx, MAX_H, x.end.length * 977 + x.club.length);

  // Bandeau d'alerte : « ⚡ FLASH SPÉCIAL » sur rayures, « HORS-SÉRIE » à droite.
  ctx.fillStyle = alarm;
  ctx.fillRect(0, 0, W, 70);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, 70);
  ctx.clip();
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  for (let sx = -80; sx < W + 80; sx += 36) {
    ctx.beginPath();
    ctx.moveTo(sx, 70);
    ctx.lineTo(sx + 18, 70);
    ctx.lineTo(sx + 58, 0);
    ctx.lineTo(sx + 40, 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.font = font(900, 30);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(`⚡ ${caps(t('farewell.flash'))}`, M, 46);
  ctx.font = font(900, 15);
  const tag = caps(t('farewell.special'));
  const tw = ctx.measureText(tag).width + 28;
  roundRect(ctx, W - M - tw, 20, tw, 30, 2, '#FFFFFF');
  ctx.fillStyle = alarm;
  ctx.fillText(tag, W - M - tw + 14, 41);

  // Titre du journal.
  let y = 96;
  const name = paperName(t, x.club);
  const crest = club ? 60 : 0;
  const gap = club ? 16 : 0;
  const size = fit(ctx, name, 900, 54, 30, W - 2 * M - crest - gap, SERIF);
  const nw = ctx.measureText(name).width;
  const x0 = (W - (crest + gap + nw)) / 2;
  if (club) drawCrest(ctx, club, x0 + crest / 2, y + 30, crest, { ring: C.paper });
  ctx.font = font(900, size, SERIF);
  ctx.fillStyle = C.ink;
  ctx.fillText(name, x0 + crest + gap, y + 30 + size * 0.34);
  y += 76;
  ctx.fillRect(M, y, W - 2 * M, 4);
  ctx.fillRect(M, y + 8, W - 2 * M, 1);
  y += 40;

  // La une : surtitre, titre, chapô à gauche ; photo du coach barrée du tampon à droite.
  const head = farewellHeadline(t, x, reason, lang);
  const PANEL = 330;
  const HERO = W - 2 * M - PANEL - 36;
  const heroTop = y;
  ctx.font = font(900, 15);
  roundRect(ctx, M, y, ctx.measureText(caps(head.kicker)).width + 24, 30, 2, alarm);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(caps(head.kicker), M + 12, y + 21);
  y += 34;
  let hs = 64;
  let lines: string[] = [];
  for (; hs >= 40; hs -= 4) {
    ctx.font = font(900, hs, SERIF);
    lines = wrap(ctx, head.title, HERO, 4);
    if (lines.length <= 3) break;
  }
  ctx.fillStyle = C.ink;
  for (const l of lines) {
    y += hs * 1.02;
    ctx.fillText(l, M, y);
  }
  y += 16;
  ctx.fillStyle = accent;
  ctx.fillRect(M, y, 64, 4);
  y += 6;
  ctx.font = italic(500, 23);
  ctx.fillStyle = C.ink;
  for (const l of wrap(ctx, head.deck, HERO, 4)) {
    y += 32;
    ctx.fillText(l, M, y);
  }
  const panelH = Math.max(y - heroTop + 12, 380);
  const px = W - M - PANEL;
  const bg = solid(club, C.ink);
  roundRect(ctx, px, heroTop, PANEL, panelH, 4, bg);
  ctx.save();
  ctx.beginPath();
  ctx.rect(px, heroTop, PANEL, panelH);
  ctx.clip();
  if (opts.photo) {
    const pw = Number((opts.photo as { width?: number }).width) || 1;
    const ph = Number((opts.photo as { height?: number }).height) || 1;
    // Recadrage « cover » : la photo remplit le cadre.
    const k = Math.max(PANEL / pw, panelH / ph);
    ctx.drawImage(opts.photo, px + (PANEL - pw * k) / 2, heroTop + (panelH - ph * k) / 2, pw * k, ph * k);
  } else {
    ctx.font = font(900, 180, SERIF);
    ctx.fillStyle = inkOn(bg);
    ctx.globalAlpha = 0.25;
    ctx.textAlign = 'center';
    ctx.fillText('?', px + PANEL / 2, heroTop + panelH / 2 + 60);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  // Légende de la photo.
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(px, heroTop + panelH - 36, PANEL, 36);
  ctx.font = font(800, 14);
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'left';
  ctx.fillText(caps(t('farewell.coach')), px + 14, heroTop + panelH - 13);
  // Tampon en travers de la photo.
  ctx.save();
  ctx.translate(px + PANEL / 2, heroTop + panelH * 0.42);
  ctx.rotate(-0.26);
  const stamp = caps(t(`farewell.stamp.${reason}`));
  ctx.font = font(900, 50, SERIF);
  const sw = Math.min(ctx.measureText(stamp).width + 40, PANEL + 40);
  ctx.lineWidth = 7;
  ctx.strokeStyle = reason === 'sacked' ? C.red : C.orange;
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.fillRect(-sw / 2, -42, sw, 80);
  ctx.strokeRect(-sw / 2, -42, sw, 80);
  ctx.fillStyle = reason === 'sacked' ? C.red : C.orangeDark;
  ctx.textAlign = 'center';
  fit(ctx, stamp, 900, 50, 24, sw - 30, SERIF);
  ctx.fillText(stamp, 0, 16);
  ctx.restore();
  ctx.textAlign = 'left';
  y = heroTop + panelH + 30;

  /** Bandeau de rubrique : fond anthracite, capitales blanches, carré d'alerte. */
  const section = (label: string, sx: number, at: number, width: number) => {
    roundRect(ctx, sx, at, width, 34, 0, C.ink);
    roundRect(ctx, sx, at, 8, 34, 0, alarm);
    ctx.font = font(900, 15);
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'left';
    ctx.fillText(caps(label), sx + 20, at + 23);
    return at + 34;
  };

  // Le bilan en chiffres.
  y = section(t('farewell.record'), M, y, W - 2 * M) + 14;
  const pct = r.played ? `${Math.round((r.wins / r.played) * 100)} %` : '–';
  const tiles: [string, string][] = [
    [String(r.played), t('farewell.tile.played')],
    [`${r.wins}-${r.draws}-${r.losses}`, t('farewell.tile.record')],
    [`${r.goalsFor}-${r.goalsAgainst}`, t('farewell.tile.goals')],
    [pct, t('farewell.tile.winRate')],
    [x.bestFinish != null ? ordinal(t, x.bestFinish) : '–', t('farewell.tile.best')],
    [String(x.trophies.length), t('farewell.tile.trophies', { count: x.trophies.length })],
  ];
  const tileW = (W - 2 * M - 12 * (tiles.length - 1)) / tiles.length;
  tiles.forEach(([value, label], i) => {
    const tx = M + i * (tileW + 12);
    roundRect(ctx, tx, y, tileW, 96, 4, '#FFFFFF');
    roundRect(ctx, tx, y, tileW, 5, 0, i === 5 && x.trophies.length ? C.green : accent);
    ctx.fillStyle = C.ink;
    fit(ctx, value, 900, 40, 16, tileW - 24, SERIF);
    ctx.fillText(value, tx + 14, y + 54);
    ctx.font = font(700, 14);
    ctx.fillStyle = C.grey;
    ctx.fillText(wrap(ctx, label, tileW - 24, 1)[0]!, tx + 14, y + 80);
  });
  y += 96;
  const facts = [
    r.topScorer ? `⚽ ${t('farewell.line.topScorer', { name: r.topScorer.name, count: r.topScorer.value })}` : '',
    r.biggestWin && r.biggestWin.goalsFor > r.biggestWin.goalsAgainst
      ? `✅ ${t('farewell.line.biggestWin', { score: `${r.biggestWin.goalsFor}-${r.biggestWin.goalsAgainst}`, opponent: r.biggestWin.opponent ?? '' })}`
      : '',
    r.potm ? `⭐ ${t('farewell.line.potm', { name: r.potm.name, count: r.potm.value })}` : '',
  ].filter(Boolean);
  if (facts.length) {
    ctx.font = font(700, 17);
    ctx.fillStyle = C.ink;
    y += 10;
    for (const f of facts) {
      y += 26;
      ctx.fillText(wrap(ctx, f, W - 2 * M, 1)[0]!, M, y);
    }
  }
  y += 34;

  // L'interview à gauche.
  const top = y;
  let ly = section(t('farewell.interview'), M, top, MAIN) + 8;
  for (const { q, a } of farewellInterview(t, x, reason)) {
    ly += 16;
    ctx.font = font(800, 20, SERIF);
    ctx.fillStyle = alarm === C.red ? C.red : C.orangeDark;
    for (const l of wrap(ctx, `— ${q}`, MAIN)) {
      ly += 28;
      ctx.fillText(l, M, ly);
    }
    ctx.font = font(400, 18);
    ctx.fillStyle = C.ink;
    const al = wrap(ctx, a, MAIN);
    al.forEach((l, i) => {
      ly += 27;
      justified(ctx, l, M, ly, MAIN, i === al.length - 1);
    });
    ly += 8;
  }

  // Saisons et palmarès à droite.
  const sx = W - M - SIDE;
  let ry = section(t('farewell.seasons'), sx, top, SIDE) + 8;
  for (const s of x.seasons) {
    ry += 14;
    ctx.font = font(900, 22, SERIF);
    ctx.fillStyle = C.ink;
    ctx.fillText(s.label, sx, ry + 22);
    ctx.textAlign = 'right';
    ctx.fillStyle = s.ended && s.position === 1 ? C.green : C.ink;
    ctx.fillText(s.position != null ? ordinal(t, s.position) : '–', W - M, ry + 22);
    ctx.textAlign = 'left';
    ctx.font = font(400, 15);
    ctx.fillStyle = C.grey;
    ctx.fillText(`${s.wins}-${s.draws}-${s.losses}${s.ended ? '' : ` ${t('farewell.seasonOngoing')}`}`, sx, ry + 44);
    ry += 56;
    ctx.fillStyle = C.dash;
    ctx.fillRect(sx, ry, SIDE, 1);
  }
  ry = section(t('farewell.trophies'), sx, ry + 24, SIDE) + 8;
  if (!x.trophies.length) {
    ctx.font = font(400, 16);
    ctx.fillStyle = C.grey;
    ry += 30;
    ctx.fillText(t('farewell.noTrophy'), sx, ry);
  }
  for (const tr of x.trophies) {
    ry += 32;
    ctx.font = font(800, 17);
    ctx.fillStyle = C.ink;
    ctx.fillText(wrap(ctx, `🏆 ${trophyName(t, tr)} · ${tr.season}`, SIDE, 1)[0]!, sx, ry);
  }
  y = Math.max(ly, ry) + 16;
  ctx.fillStyle = C.ink;
  ctx.fillRect(sx - GUTTER / 2, top, 1, y - top);

  // Pied.
  y += 24;
  const foot = colors.find((c) => contrast(c, C.paper) >= 1.6) ?? C.ink;
  ctx.fillStyle = foot;
  ctx.fillRect(0, y, W, 50);
  ctx.font = font(700, 15);
  ctx.fillStyle = inkOn(foot);
  ctx.fillText(`${paperName(t, x.club)} · ${t('farewell.special')}`, M, y + 32);
  ctx.textAlign = 'right';
  ctx.fillText('FM Immersion', W - M, y + 32);
  ctx.textAlign = 'left';
  y += 50;

  const out = document.createElement('canvas');
  out.width = W;
  out.height = Math.min(MAX_H, Math.ceil(y));
  out.getContext('2d')!.drawImage(canvas, 0, 0);
  return out;
}
