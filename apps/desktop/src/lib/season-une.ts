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
  const cw = 380;
  const tile = (x: number, y: number, w: number, value: string, label: string, color = C.ink) => {
    roundRect(ctx, x, y, w, 110, 14, '#FFFFFF');
    ctx.font = font(900, 46, SERIF);
    ctx.fillStyle = color;
    fit(ctx, value, 900, 46, 24, w - 32, SERIF);
    ctx.fillText(value, x + 16, y + 62);
    ctx.font = font(700, 14);
    ctx.fillStyle = C.grey;
    ctx.fillText(label, x + 16, y + 92);
  };
  const half = (cw - 14) / 2;
  tile(cx, colY, half, String(r.played), t('season.played'));
  tile(cx + half + 14, colY, half, `${r.wins}-${r.draws}-${r.losses}`, t('season.record'), C.orangeDark);
  tile(cx, colY + 124, half, `${r.goalsFor} – ${r.goalsAgainst}`, t('season.goals'));
  tile(cx + half + 14, colY + 124, half, String(r.unbeaten), t('season.unbeaten'), C.green);
  // Matchs marquants.
  ctx.font = font(800, 14);
  let my = colY + 268;
  for (const [key, m, color] of [
    ['season.biggestWin', r.biggestWin, C.green],
    ['season.worstLoss', r.worstLoss, C.red],
  ] as const) {
    if (!m) continue;
    ctx.font = font(800, 13);
    ctx.fillStyle = color;
    ctx.fillText(t(key).toUpperCase(), cx, my);
    ctx.font = font(700, 18);
    ctx.fillStyle = C.ink;
    ctx.fillText(wrap(ctx, `${m.goalsFor}-${m.goalsAgainst} · ${m.opponent ?? ''}`, cw, 1)[0]!, cx, my + 26);
    my += 58;
  }
  if (r.untracked) {
    ctx.font = font(400, 13);
    ctx.fillStyle = C.grey;
    ctx.fillText(wrap(ctx, t('season.untracked', { count: r.untracked }), cw, 1)[0]!, cx, colY + 378);
  }

  // Colonne droite : distinctions et mercato.
  const rx = cx + cw + 30;
  const rw = W - M - rx;
  ctx.font = font(900, 15);
  ctx.fillStyle = C.orangeDark;
  ctx.fillText(t('season.awards').toUpperCase(), rx, colY + 14);
  let ry = colY + 44;
  if (opts.face && r.topScorer) {
    drawFace(ctx, opts.face, rx + 40, ry + 34, 38);
  }
  const awards = [
    r.topScorer && [t('season.topScorer'), t('season.goalsCount', { count: r.topScorer.value, name: r.topScorer.name })],
    r.potm && [t('season.potm'), t('season.potmCount', { count: r.potm.value, name: r.potm.name })],
    r.bestRated && [t('season.bestRated'), `${r.bestRated.name} (${rating(r.bestRated.value, opts.lang)})`],
  ].filter((x): x is [string, string] => !!x);
  awards.forEach(([label, value], i) => {
    const x = i === 0 && opts.face ? rx + 92 : rx;
    const w = rw - (x - rx);
    ctx.font = font(800, 13);
    ctx.fillStyle = C.grey;
    ctx.fillText(label.toUpperCase(), x, ry + 20);
    ctx.font = font(800, 19, SERIF);
    ctx.fillStyle = C.ink;
    ctx.fillText(wrap(ctx, value, w, 1)[0]!, x, ry + 46);
    ry += i === 0 && opts.face ? 84 : 64;
  });
  if (r.arrivals.length || r.departures.length) {
    ctx.fillStyle = C.dash;
    ctx.fillRect(rx, ry, rw, 1);
    ry += 30;
    ctx.font = font(900, 15);
    ctx.fillStyle = C.orangeDark;
    ctx.fillText(t('season.mercato').toUpperCase(), rx, ry);
    ctx.font = font(400, 16);
    ctx.fillStyle = C.ink;
    for (const [key, names] of [
      ['season.arrivals', r.arrivals],
      ['season.departures', r.departures],
    ] as const) {
      if (!names.length) continue;
      const lines = wrap(ctx, `${t(key)} ${names.slice(0, 4).join(', ')}`, rw, 2);
      lines.forEach((l) => ctx.fillText(l, rx, (ry += 26)));
    }
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
