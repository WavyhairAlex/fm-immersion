import type { SeasonReview } from '@fm-immersion/module-fm';
import type { TFunction } from 'i18next';
import { paperName } from './gazette-text';
import { drawFace, fit, roundRect, wrap } from './gazette-une';

/**
 * Une du numéro spécial « Bilan de la saison » (1200 × 675), même papier que la gazette de la semaine :
 * bandeau orange, titre du journal, grande place finale et sa courbe à gauche, chiffres de la saison au centre,
 * distinctions (avec la photo du meilleur buteur quand on l'a) et mercato à droite, matchs marquants en pied.
 */
const W = 1200;
const H = 675;
const M = 48;
const C = {
  paper: '#F4F1EA',
  ink: '#25282D',
  grey: '#5C6067',
  orange: '#F26B1D',
  orangeDark: '#C2410C',
  orangeLight: '#FFE4D3',
  green: '#2E9E5B',
  red: '#D93C3C',
  dash: '#B9B6AD',
};
const SERIF = '"Fraunces Variable", Georgia, serif';
const SANS = '"Nunito Variable", system-ui, sans-serif';
const font = (weight: number, size: number, family = SANS) => `${weight} ${size}px ${family}`;

/** Clé du titre selon la place finale (la taille du championnat n'est pas connue). */
export const verdict = (r: SeasonReview) => (r.position == null ? 'done' : r.position === 1 ? 'champion' : r.position <= 3 ? 'podium' : 'finish');

/** « 4e » / « 4th ». */
export const ordinal = (t: TFunction, n: number) => t(`season.ordinal${n === 1 ? '1' : n === 2 ? '2' : n === 3 ? '3' : ''}`, { n });

const rating = (v: number, lang?: string) => new Intl.NumberFormat(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

function chart(ctx: CanvasRenderingContext2D, r: SeasonReview, x: number, y: number, w: number, h: number) {
  const pts = r.positions;
  if (pts.length < 2) return;
  const worst = Math.max(...pts.map((p) => p.position));
  const best = Math.min(...pts.map((p) => p.position));
  const span = Math.max(4, worst - best); // petites variations : courbe peu agitée
  const px = (i: number) => x + (w * i) / (pts.length - 1);
  const py = (p: number) => y + (h * (p - best + (span - (worst - best)) / 2)) / span; // 1re place en haut
  ctx.strokeStyle = C.orange;
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(px(i), py(p.position)) : ctx.moveTo(px(i), py(p.position))));
  ctx.stroke();
  pts.forEach((p, i) => {
    ctx.beginPath();
    ctx.arc(px(i), py(p.position), i === pts.length - 1 ? 7 : 4, 0, Math.PI * 2);
    ctx.fillStyle = i === pts.length - 1 ? C.orangeDark : C.orange;
    ctx.fill();
  });
}

export async function drawSeason(t: TFunction, r: SeasonReview, opts: { face?: CanvasImageSource | null; lang?: string } = {}): Promise<HTMLCanvasElement> {
  await Promise.all([font(900, 150, SERIF), font(800, 44, SERIF), font(400, 18), font(800, 18)].map((f) => document.fonts.load(f).catch(() => undefined)));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, W, H);

  // Bandeau.
  ctx.fillStyle = C.orangeDark;
  ctx.fillRect(0, 0, W, 44);
  ctx.font = font(900, 16);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(t('season.special').toUpperCase(), M, 28);
  ctx.textAlign = 'right';
  ctx.fillText(t('season.label', { season: r.label }).toUpperCase(), W - M, 28);
  ctx.textAlign = 'left';

  // Titre du journal et gros titre.
  ctx.fillStyle = C.ink;
  fit(ctx, paperName(t, r.club), 800, 40, 24, W - 2 * M, SERIF);
  ctx.fillText(paperName(t, r.club), M, 98);
  ctx.fillStyle = C.ink;
  ctx.fillRect(M, 114, W - 2 * M, 3);
  ctx.fillRect(M, 120, W - 2 * M, 1);
  const pos = r.position != null ? ordinal(t, r.position) : '';
  const title = t(`season.headline.${verdict(r)}`, { club: r.club, position: pos });
  ctx.fillStyle = C.ink;
  fit(ctx, title, 800, 44, 26, W - 2 * M, SERIF);
  ctx.fillText(title, M, 172);

  // Colonne gauche : place finale et sa courbe.
  const colY = 200;
  roundRect(ctx, M, colY, 300, 380, 18, C.ink);
  ctx.font = font(800, 14);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText(t('season.finalPosition').toUpperCase(), M + 24, colY + 36);
  ctx.font = font(900, 150, SERIF);
  ctx.fillStyle = C.orange;
  ctx.fillText(r.position != null ? String(r.position) : '–', M + 20, colY + 186);
  if (r.position != null) {
    const nw = ctx.measureText(String(r.position)).width;
    ctx.font = font(800, 40, SERIF);
    ctx.fillText(pos.replace(String(r.position), ''), M + 24 + nw, colY + 110);
  }
  if (r.positions.length >= 2) {
    ctx.font = font(700, 13);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(t('season.curve').toUpperCase(), M + 24, colY + 236);
    chart(ctx, r, M + 34, colY + 262, 232, 90);
  }

  // Colonne centrale : chiffres.
  const cx = M + 330;
  const cw = 400;
  const fmt1 = (v: number) => new Intl.NumberFormat(opts.lang, { maximumFractionDigits: 1 }).format(v);
  const tile = (x: number, y: number, w: number, value: string, label: string, color = C.ink) => {
    roundRect(ctx, x, y, w, 92, 12, '#FFFFFF');
    ctx.fillStyle = color;
    fit(ctx, value, 900, 40, 20, w - 24, SERIF);
    ctx.fillText(value, x + 12, y + 46);
    ctx.font = font(700, 13);
    ctx.fillStyle = C.grey;
    wrap(ctx, label, w - 24, 2).forEach((l, i) => ctx.fillText(l, x + 12, y + 68 + i * 16));
  };
  const tw = (cw - 20) / 3;
  const tiles: [string, string, string?][] = [
    [String(r.played), t('season.played')],
    [`${r.wins}-${r.draws}-${r.losses}`, t('season.record'), C.orangeDark],
    [String(r.points), t('season.points', { ppm: r.played ? fmt1(r.points / r.played) : '–' })],
    [`${r.goalsFor}-${r.goalsAgainst}`, t('season.goals')],
    [String(r.cleanSheets), t('season.cleanSheets')],
    [String(r.unbeaten), t('season.unbeaten'), C.green],
  ];
  tiles.forEach(([value, label, color], i) => tile(cx + (i % 3) * (tw + 10), colY + Math.floor(i / 3) * 102, tw, value, label, color));
  // Lignes de détail : domicile / extérieur, xG, cartons, matchs marquants.
  let my = colY + 232;
  const line = (label: string, value: string, color = C.grey) => {
    ctx.font = font(800, 13);
    ctx.fillStyle = color;
    const lab = `${label.toUpperCase()}  `;
    ctx.fillText(lab, cx, my);
    const lw = ctx.measureText(lab).width;
    ctx.font = font(700, 16);
    ctx.fillStyle = C.ink;
    ctx.fillText(wrap(ctx, value, cw - lw, 1)[0]!, cx + lw, my);
    my += 30;
  };
  const rec = (x: { wins: number; draws: number; losses: number }) => `${x.wins}-${x.draws}-${x.losses}`;
  line(t('season.homeAway'), `${t('season.home')} ${rec(r.home)}  ·  ${t('season.away')} ${rec(r.away)}`);
  const extra = [r.xg != null && `xG ${fmt1(r.xg)}`, t('season.cards', { yellow: r.yellow, red: r.red })].filter(Boolean).join('  ·  ');
  line(t('season.more'), extra);
  if (r.biggestWin) line(t('season.biggestWin'), `${r.biggestWin.goalsFor}-${r.biggestWin.goalsAgainst} · ${r.biggestWin.opponent ?? ''}`, C.green);
  if (r.worstLoss) line(t('season.worstLoss'), `${r.worstLoss.goalsFor}-${r.worstLoss.goalsAgainst} · ${r.worstLoss.opponent ?? ''}`, C.red);
  if (r.untracked) {
    ctx.font = font(400, 13);
    ctx.fillStyle = C.grey;
    ctx.fillText(wrap(ctx, t('season.untracked', { count: r.untracked }), cw, 1)[0]!, cx, colY + 372);
  }

  // Colonne droite : distinctions et mercato.
  const rx = cx + cw + 28;
  const rw = W - M - rx;
  ctx.font = font(900, 15);
  ctx.fillStyle = C.orangeDark;
  ctx.fillText(t('season.awards').toUpperCase(), rx, colY + 14);
  let ry = colY + 30;
  if (opts.face && r.topScorer) drawFace(ctx, opts.face, rx + 34, ry + 32, 32);
  const awards = [
    r.topScorer && [t('season.topScorer'), t('season.goalsCount', { count: r.topScorer.value, name: r.topScorer.name })],
    r.potm && [t('season.potm'), t('season.potmCount', { count: r.potm.value, name: r.potm.name })],
    r.bestRated && [t('season.bestRated'), `${r.bestRated.name} (${rating(r.bestRated.value, opts.lang)})`],
    r.mostUsed && [t('season.mostUsed'), t('season.minutes', { name: r.mostUsed.name, minutes: r.mostUsed.value })],
  ].filter((x): x is [string, string] => !!x);
  awards.forEach(([label, value], i) => {
    const x = i === 0 && opts.face ? rx + 78 : rx;
    const w = rw - (x - rx);
    ctx.font = font(800, 12);
    ctx.fillStyle = C.grey;
    ctx.fillText(label.toUpperCase(), x, ry + 20);
    ctx.font = font(800, 18, SERIF);
    ctx.fillStyle = C.ink;
    ctx.fillText(wrap(ctx, value, w, 1)[0]!, x, ry + 44);
    ry += i === 0 && opts.face ? 70 : 58;
  });
  if (r.arrivals.length || r.departures.length) {
    ctx.fillStyle = C.dash;
    ctx.fillRect(rx, ry + 4, rw, 1);
    ry += 30;
    ctx.font = font(900, 15);
    ctx.fillStyle = C.orangeDark;
    ctx.fillText(t('season.mercato').toUpperCase(), rx, ry);
    ctx.font = font(400, 15);
    ctx.fillStyle = C.ink;
    const text = [
      r.arrivals.length && `${t('season.arrivals')} ${r.arrivals.slice(0, 4).join(', ')}`,
      r.departures.length && `${t('season.departures')} ${r.departures.slice(0, 4).join(', ')}`,
    ]
      .filter(Boolean)
      .join(' · ');
    wrap(ctx, text, rw, 2).forEach((l) => ctx.fillText(l, rx, (ry += 22)));
  }

  // Pied.
  ctx.fillStyle = C.ink;
  ctx.fillRect(0, H - 52, W, 52);
  ctx.font = font(700, 15);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(t('season.footer', { club: r.club, season: r.label }), M, H - 21);
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,0.67)';
  ctx.fillText('FM Immersion', W - M, H - 21);
  ctx.textAlign = 'left';
  return canvas;
}

/** Encart Discord qui accompagne l'image. */
export function seasonPayload(t: TFunction, r: SeasonReview, lang?: string) {
  const pos = r.position != null ? ordinal(t, r.position) : '';
  const lines = [
    `🏟️ ${t('season.played')} : **${r.played}**  ·  ${t('season.record')} : **${r.wins}-${r.draws}-${r.losses}**  ·  ${t('season.goals')} : **${r.goalsFor}-${r.goalsAgainst}**`,
    r.topScorer && `⚽ ${t('season.topScorer')} : **${r.topScorer.name}** (${r.topScorer.value})`,
    r.potm && `⭐ ${t('season.potm')} : **${r.potm.name}** (${r.potm.value})`,
    r.bestRated && `📈 ${t('season.bestRated')} : **${r.bestRated.name}** (${rating(r.bestRated.value, lang)})`,
    `🏠 ${t('season.home')} ${r.home.wins}-${r.home.draws}-${r.home.losses}  ·  ✈️ ${t('season.away')} ${r.away.wins}-${r.away.draws}-${r.away.losses}  ·  🧤 ${t('season.cleanSheets')} : ${r.cleanSheets}`,
    `🟨 ${r.yellow}  🟥 ${r.red}${r.xg != null ? `  ·  xG ${r.xg}` : ''}  ·  ${r.points} pts`,
    r.mostUsed && `⏱️ ${t('season.mostUsed')} : **${r.mostUsed.name}** (${r.mostUsed.value} min)`,
    r.biggestWin && `✅ ${t('season.biggestWin')} : ${r.biggestWin.goalsFor}-${r.biggestWin.goalsAgainst} · ${r.biggestWin.opponent ?? ''}`,
  ].filter(Boolean);
  return {
    username: paperName(t, r.club).slice(0, 80),
    embeds: [
      {
        author: { name: `📰  ${t('season.special').toUpperCase()}  ·  ${t('season.label', { season: r.label })}` },
        title: `🏆  ${t(`season.headline.${verdict(r)}`, { club: r.club, position: pos })}`.slice(0, 256),
        description: lines.join('\n').slice(0, 4000),
        color: r.position === 1 ? 0x2e9e5b : 0xf26b1d,
        image: { url: 'attachment://une.png' },
        footer: { text: `${paperName(t, r.club)}  ·  FM Immersion` },
      },
    ],
    attachments: [{ id: 0, filename: 'une.png' }],
  };
}
