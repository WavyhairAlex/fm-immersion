import { contrast, inkOn, type BigMatch } from '@fm-immersion/module-fm';
import type { TFunction } from 'i18next';
import { clubArt, drawCrest } from './club-look';
import { grain, solid } from './gazette-page';
import { paperName } from './gazette-text';
import { fit, roundRect, wrap } from './gazette-une';

/**
 * Affiche du choc (1200 × 675, le format des aperçus Discord), quelques jours avant un match qui compte : les deux
 * moitiés aux couleurs des clubs, séparées en biais, les deux écussons face à face, le rang de chacun, puis la date,
 * le lieu, les buteurs à suivre (avec la photo du nôtre), l'entraîneur adverse et l'avis du jeu.
 */
const W = 1200;
const H = 675;
const M = 48;
const C = { paper: '#F4F1EA', ink: '#25282D', grey: '#5C6067', orange: '#F26B1D', orangeDark: '#C2410C' };
const SERIF = '"Fraunces Variable", Georgia, serif';
const SANS = '"Nunito Variable", system-ui, sans-serif';
const font = (weight: number, size: number, family = SANS) => `${weight} ${size}px ${family}`;

/** Textes de l'affiche : bandeau, titre, date et lieu, rangs. */
export function bigMatchText(t: TFunction, m: BigMatch, lang?: string) {
  const date = new Date(`${m.date}T12:00:00`).toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long' });
  const place = m.home == null ? '' : m.home ? t('bigmatch.home', { club: m.club }) : t('bigmatch.away', { club: m.opponent });
  const ord = (n: number | null) => (n == null ? null : t(n === 1 ? 'bigmatch.rank1' : 'bigmatch.rank', { n }));
  return {
    tag: t(`bigmatch.tag.${m.kind}`),
    // Le club qui reçoit d'abord, comme dans le calendrier.
    title: t(`bigmatch.title.${m.kind}`, m.home === false ? { club: m.opponent, opponent: m.club } : { club: m.club, opponent: m.opponent }),
    when: [date.charAt(0).toLocaleUpperCase(lang) + date.slice(1), place].filter(Boolean).join(' · '),
    countdown: m.inDays === 0 ? t('bigmatch.today') : t('bigmatch.inDays', { count: m.inDays }),
    ours: ord(m.position),
    theirs: ord(m.opponentPosition),
  };
}

/** Photo ronde (visage du jeu) ou initiales sur un disque à la couleur du club. */
function avatar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, name: string, face: CanvasImageSource | null, color: string) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = color;
  ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  if (face) {
    const fw = Number((face as { width?: number }).width) || 1;
    const fh = Number((face as { height?: number }).height) || 1;
    const side = Math.min(fw, fh);
    ctx.drawImage(face, (fw - side) / 2, 0, side, side, x - r, y - r, 2 * r, 2 * r);
  } else {
    ctx.font = font(900, Math.round(r * 0.8), SERIF);
    ctx.fillStyle = inkOn(color);
    ctx.textAlign = 'center';
    ctx.fillText(name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toLocaleUpperCase(), x, y + r * 0.3);
    ctx.textAlign = 'left';
  }
  ctx.restore();
}

export async function drawBigMatch(t: TFunction, m: BigMatch, opts: { lang?: string; face?: CanvasImageSource | null } = {}): Promise<HTMLCanvasElement> {
  const { lang } = opts;
  await Promise.all([font(900, 80, SERIF), font(800, 22), font(400, 20), font(900, 30)].map((f) => document.fonts.load(f).catch(() => undefined)));
  const [ours, theirs] = await Promise.all([clubArt(m.club), clubArt(m.opponent)]);
  const tx = bigMatchText(t, m, lang);
  const caps = (s: string) => s.toLocaleUpperCase(lang);
  // Le club qui reçoit à gauche (le nôtre si le lieu est inconnu).
  const left = m.home === false ? { art: theirs, name: m.opponent, rank: tx.theirs } : { art: ours, name: m.club, rank: tx.ours };
  const right = m.home === false ? { art: ours, name: m.club, rank: tx.ours } : { art: theirs, name: m.opponent, rank: tx.theirs };
  let lc = solid(left.art, C.ink);
  let rc = solid(right.art, C.orangeDark);
  if (contrast(lc, rc) < 1.5) rc = (right.art?.look?.colors ?? []).find((c) => contrast(c, lc) >= 1.5) ?? (contrast(lc, C.ink) < 1.5 ? C.orangeDark : C.ink);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  // Deux moitiés aux couleurs des clubs, séparées en biais.
  const top = 430;
  ctx.fillStyle = lc;
  ctx.fillRect(0, 0, W, top);
  ctx.fillStyle = rc;
  ctx.beginPath();
  ctx.moveTo(W / 2 + 70, 0);
  ctx.lineTo(W, 0);
  ctx.lineTo(W, top);
  ctx.lineTo(W / 2 - 70, top);
  ctx.closePath();
  ctx.fill();
  // Trame légère pour donner du grain à l'affiche.
  for (const [color, x0, x1] of [
    [lc, 0, W / 2 + 70],
    [rc, W / 2 - 70, W],
  ] as const) {
    ctx.fillStyle = inkOn(color) === '#FFFFFF' ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
    for (let y = 8; y < top; y += 12) for (let x = x0 + ((y / 12) % 2 ? 6 : 0); x < x1; x += 12) {
      const onLeft = x < W / 2 + 70 - (y / top) * 140;
      if ((color === lc) !== onLeft) continue;
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Bandeau : « Affiche du choc · Coupe » et compte à rebours.
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 0, W, 60);
  ctx.font = font(900, 24);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(`🔥 ${caps(tx.tag)}`, M, 40);
  ctx.font = font(800, 17);
  ctx.textAlign = 'right';
  ctx.fillText(caps(tx.countdown), W - M, 38);
  ctx.textAlign = 'left';

  // Écussons face à face, noms et rangs.
  const crest = 170;
  const cy = 200;
  for (const [side, x, color] of [
    [left, W / 4, lc],
    [right, (3 * W) / 4, rc],
  ] as const) {
    const ink = inkOn(color);
    if (side.art) drawCrest(ctx, side.art, x, cy, crest, { ring: color });
    ctx.fillStyle = ink;
    ctx.textAlign = 'center';
    const size = fit(ctx, side.name, 800, 38, 22, W / 2 - 2 * M, SERIF);
    ctx.font = font(800, size, SERIF);
    ctx.fillText(side.name, x, cy + crest / 2 + 52);
    if (side.rank) {
      ctx.font = font(900, 18);
      ctx.globalAlpha = 0.85;
      ctx.fillText(caps(side.rank), x, cy + crest / 2 + 82);
      ctx.globalAlpha = 1;
    }
  }
  // « VS » au centre, sur un disque crème.
  ctx.beginPath();
  ctx.arc(W / 2, cy, 46, 0, Math.PI * 2);
  ctx.fillStyle = C.paper;
  ctx.fill();
  ctx.font = font(900, 40, SERIF);
  ctx.fillStyle = C.ink;
  ctx.textAlign = 'center';
  ctx.fillText('VS', W / 2, cy + 14);
  ctx.textAlign = 'left';

  // Bas de l'affiche, sur papier : titre, date et lieu, à suivre, avis du jeu.
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, top, W, H - top);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, top, W, H - top);
  ctx.clip();
  grain(ctx, H, m.opponent.length * 97 + m.date.length);
  ctx.restore();
  ctx.fillStyle = C.orange;
  ctx.fillRect(0, top, W, 6);
  let y = top + 52;
  ctx.font = font(900, 34, SERIF);
  ctx.fillStyle = C.ink;
  ctx.fillText(wrap(ctx, tx.title, W - 2 * M, 1)[0]!, M, y);
  y += 32;
  ctx.font = font(800, 19);
  ctx.fillStyle = C.orangeDark;
  ctx.fillText(wrap(ctx, [tx.when, m.competition].filter(Boolean).join(' · '), W - 2 * M, 1)[0]!, M, y);

  // Deux encarts « à suivre » : notre buteur (photo) et le leur, puis l'entraîneur adverse et l'avis du jeu.
  y += 26;
  const boxW = (W - 2 * M - 24) / 2;
  const boxH = H - y - 24;
  const watch: { name: string; line: string; face: CanvasImageSource | null; color: string }[] = [];
  if (m.ourScorer) watch.push({ name: m.ourScorer.name, line: t('bigmatch.ourScorer', { club: m.club, count: m.ourScorer.goals }), face: opts.face ?? null, color: solid(ours, C.ink) });
  if (m.theirScorer)
    watch.push({
      name: m.theirScorer.name,
      line: m.theirScorer.goals != null ? t('bigmatch.theirScorer', { club: m.opponent, count: m.theirScorer.goals }) : t('bigmatch.theirScorerNoGoals', { club: m.opponent }),
      face: null,
      color: solid(theirs, C.orangeDark),
    });
  const notes = [m.opponentManager ? t('bigmatch.manager', { club: m.opponent, name: m.opponentManager }) : '', m.threat ? `« ${m.threat} »` : ''].filter(Boolean);
  const boxes = watch.length + (notes.length ? 1 : 0);
  const bw = boxes >= 3 ? (W - 2 * M - 2 * 20) / 3 : boxW;
  let bx = M;
  for (const w of watch) {
    roundRect(ctx, bx, y, bw, boxH, 6, '#FFFFFF');
    const r = Math.min(34, boxH / 2 - 14);
    avatar(ctx, bx + 18 + r, y + boxH / 2, r, w.name, w.face, w.color);
    const tx0 = bx + 18 + 2 * r + 14;
    ctx.font = font(800, 13);
    ctx.fillStyle = C.grey;
    ctx.fillText(caps(t('bigmatch.watch')), tx0, y + boxH / 2 - 20);
    ctx.font = font(900, 20, SERIF);
    ctx.fillStyle = C.ink;
    ctx.fillText(wrap(ctx, w.name, bw - (tx0 - bx) - 14, 1)[0]!, tx0, y + boxH / 2 + 4);
    ctx.font = font(600, 15);
    ctx.fillStyle = C.grey;
    ctx.fillText(wrap(ctx, w.line, bw - (tx0 - bx) - 14, 1)[0]!, tx0, y + boxH / 2 + 26);
    bx += bw + (boxes >= 3 ? 20 : 24);
  }
  if (notes.length) {
    const nw = W - M - bx;
    roundRect(ctx, bx, y, nw, boxH, 6, '#FFFFFF');
    roundRect(ctx, bx, y, 6, boxH, 0, C.orange);
    ctx.font = font(600, 16);
    ctx.fillStyle = C.ink;
    const lines = notes.flatMap((n) => wrap(ctx, n, nw - 36, 2)).slice(0, 4);
    const lh = 22;
    lines.forEach((l, i) => ctx.fillText(l, bx + 22, y + boxH / 2 - ((lines.length - 1) * lh) / 2 + 6 + i * lh));
  }
  return canvas;
}

/** Message Discord de l'affiche : image et court encart. */
export function bigMatchPayload(t: TFunction, m: BigMatch, lang?: string) {
  const tx = bigMatchText(t, m, lang);
  return {
    username: paperName(t, m.club).slice(0, 80),
    embeds: [
      {
        author: { name: `🔥  ${tx.tag.toUpperCase()}` },
        title: tx.title.slice(0, 256),
        description: [tx.when, m.competition ?? '', m.threat ? `*« ${m.threat} »*` : ''].filter(Boolean).join('\n').slice(0, 4000),
        color: 0xf26b1d,
        image: { url: 'attachment://une.png' },
        footer: { text: `${paperName(t, m.club)}  ·  FM Immersion` },
      },
    ],
    attachments: [{ id: 0, filename: 'une.png' }],
  };
}
