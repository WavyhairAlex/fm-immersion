import { contrast, inkOn, type BreakingNews } from '@fm-immersion/module-fm';
import type { TFunction } from 'i18next';
import { clubArt, drawCrest, type ClubArt } from './club-look';
import { grain, solid } from './gazette-page';
import { paperName } from './gazette-text';
import { fit, roundRect, wrap } from './gazette-une';

/**
 * Dépêche en image (1200 × 675, le format des aperçus Discord) : bandeau de la rubrique (« Officiel », « Départ »,
 * « Flash infirmerie »), visage du joueur sur trame aux couleurs du club à gauche, son nom en très grand et la
 * nouvelle à droite.
 */
const W = 1200;
const H = 675;
const M = 48;
const C = { paper: '#F4F1EA', ink: '#0F1B2D', grey: '#56607A', green: '#2E9E5B', red: '#D93C3C', orange: '#FFB547', orangeDark: '#8F5400' };
const SERIF = '"Fraunces Variable", Georgia, serif';
const SANS = '"Nunito Variable", system-ui, sans-serif';
const font = (weight: number, size: number, family = SANS) => `${weight} ${size}px ${family}`;

export const breakingColor = (n: BreakingNews) => (n.kind === 'signing' ? C.green : n.kind === 'injury' ? C.red : C.ink);
const ICON = { signing: '✍️', exit: '👋', injury: '🚑' } as const;

/** Textes d'une dépêche : rubrique, titre, ligne d'identité, nouvelle et mot sur son importance. */
export function breakingText(t: TFunction, n: BreakingNews, lang?: string) {
  const vars = { club: n.club, name: n.name, days: n.days ?? '?', injury: n.injury?.trim() || t('breaking.injuryUnknown'), rank: n.rank, count: n.rank };
  const parts = n.name.trim().split(/\s+/);
  const last = parts.length > 1 ? parts.slice(1).join(' ') : n.name;
  const id = [n.age != null ? t('breaking.age', { count: n.age }) : '', n.position ?? ''].filter(Boolean).join(' · ');
  return {
    tag: t(`breaking.tag.${n.kind}`),
    title: t(`breaking.title.${n.kind}`, vars),
    // Titre court de l'image (« Bačík rejoint Malženice ») et son passage en couleur (« 35 jours »).
    headline: t(n.kind === 'injury' && n.days == null ? 'breaking.headline.injuryNoDays' : `breaking.headline.${n.kind}`, { ...vars, last }),
    highlight: n.kind === 'injury' && n.days != null ? t('breaking.highlight', { days: n.days }) : '',
    id,
    body: t(`breaking.body.${n.kind}`, vars),
    weight: t(n.rank <= 3 ? `breaking.weight.top_${n.kind}` : `breaking.weight.starter_${n.kind}`, vars),
    date: new Date(`${n.date.slice(0, 10)}T12:00:00`).toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' }),
    icon: ICON[n.kind],
  };
}

/**
 * Cadre de gauche des dépêches : fond aux couleurs du club, trame de points qui grossit vers le bas et, s'il y en a
 * un, le visage du joueur posé en bas. Renvoie la couleur du fond, pour écrire dessus.
 */
export function drawPanel(ctx: CanvasRenderingContext2D, club: ClubArt | null, PX: number, PY: number, PW: number, PH: number, face: CanvasImageSource | null): string {
  const bg = solid(club, C.ink);
  roundRect(ctx, PX, PY, PW, PH, 4, bg);
  ctx.save();
  ctx.beginPath();
  ctx.rect(PX, PY, PW, PH);
  ctx.clip();
  ctx.fillStyle = inkOn(bg) === '#FFFFFF' ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';
  for (let gy = PY + 6; gy < PY + PH; gy += 9) {
    const rr = 0.6 + ((gy - PY) / PH) * 2.6;
    for (let gx = PX + ((gy / 9) % 2 ? 4.5 : 0); gx < PX + PW; gx += 9) {
      ctx.beginPath();
      ctx.arc(gx, gy, rr, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (face) {
    const fw = Number((face as { width?: number }).width) || 1;
    const fh = Number((face as { height?: number }).height) || 1;
    const side = Math.min(fw, fh);
    const size = Math.min(PW, PH);
    ctx.drawImage(face, (fw - side) / 2, 0, side, side, PX + (PW - size) / 2, PY + PH - size, size, size);
  }
  ctx.restore();
  return bg;
}

/**
 * Titre sur plusieurs lignes, avec un passage en couleur (« 35 jours ») : coupé mot à mot comme `wrap`, les mots du
 * passage gardent leur couleur même s'il passe à la ligne.
 */
function richTitle(ctx: CanvasRenderingContext2D, text: string, hl: string, x: number, y: number, width: number, lh: number, colors: [string, string]) {
  const start = hl ? text.indexOf(hl) : -1;
  const words: { w: string; on: boolean }[] = [];
  let at = 0;
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const i = text.indexOf(w, at);
    at = i + w.length;
    words.push({ w, on: start >= 0 && i < start + hl.length && at > start });
  }
  const lines: (typeof words)[] = [];
  let line: typeof words = [];
  for (const w of words) {
    const next = [...line, w].map((x) => x.w).join(' ');
    if (!line.length || ctx.measureText(next).width <= width) line.push(w);
    else {
      lines.push(line);
      line = [w];
    }
  }
  if (line.length) lines.push(line);
  const space = ctx.measureText(' ').width;
  lines.forEach((l, li) => {
    let cx = x;
    for (const w of l) {
      ctx.fillStyle = w.on ? colors[1] : colors[0];
      ctx.fillText(w.w, cx, y + li * lh);
      cx += ctx.measureText(w.w).width + space;
    }
  });
  return lines.length;
}

/** Nombre de lignes du titre à cette taille. */
const titleLines = (ctx: CanvasRenderingContext2D, text: string, width: number) => wrap(ctx, text, width).length;

export async function drawBreaking(t: TFunction, n: BreakingNews, opts: { lang?: string; face?: CanvasImageSource | null } = {}): Promise<HTMLCanvasElement> {
  const { lang } = opts;
  await Promise.all([font(900, 72, SERIF), `italic ${font(400, 22, SERIF)}`, font(800, 22), font(900, 26)].map((f) => document.fonts.load(f).catch(() => undefined)));
  const club = await clubArt(n.club);
  const caps = (s: string) => s.toLocaleUpperCase(lang);
  const tx = breakingText(t, n, lang);
  const color = breakingColor(n);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, W, H);
  grain(ctx, H, n.id.length * 131 + n.date.length);

  // Bandeau : rubrique à gauche, journal et date à droite.
  const BAND = 76;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, BAND);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(0, BAND - 4, W, 4);
  ctx.font = `italic ${font(900, 34)}`;
  ctx.fillStyle = '#FFFFFF';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(`${tx.icon} ${caps(tx.tag)}`, M, 51);
  ctx.font = font(800, 17);
  ctx.textAlign = 'right';
  ctx.fillText(caps(paperName(t, n.club)), W - M, 40);
  ctx.font = font(700, 14);
  ctx.globalAlpha = 0.85;
  ctx.fillText(caps(`${t('breaking.kind')} · ${tx.date}`), W - M, 60);
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';

  // Portrait sur toute la hauteur, à gauche.
  const PX = 36;
  const PY = BAND + 28;
  const PW = 430;
  const PH = H - PY - 36;
  const bg = drawPanel(ctx, club, PX, PY, PW, PH, opts.face ?? null);
  if (!opts.face) {
    const initials = n.name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('');
    ctx.font = font(900, 170, SERIF);
    ctx.fillStyle = inkOn(bg);
    ctx.globalAlpha = 0.85;
    ctx.textAlign = 'center';
    ctx.fillText(initials, PX + PW / 2, PY + PH / 2 + 60);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }
  if (club) drawCrest(ctx, club, PX + PW - 44, PY + 44, 60, { ring: bg });

  // La nouvelle à droite : titre court en très grand, nom du joueur, identité, récit en italique.
  const X = PX + PW + 40;
  const TW = W - M - X;
  let y = PY + 4;
  let size = 66;
  for (; size > 40; size -= 4) {
    ctx.font = font(900, size, SERIF);
    if (titleLines(ctx, tx.headline, TW) <= 2) break;
  }
  ctx.font = font(900, size, SERIF);
  const lh = Math.round(size * 1.02);
  const nl = richTitle(ctx, tx.headline, tx.highlight, X, y + size * 0.86, TW, lh, [C.ink, C.orangeDark]);
  y += size * 0.86 + (nl - 1) * lh + 22;
  ctx.fillStyle = color === C.ink ? C.orange : color;
  ctx.fillRect(X, y, TW, 4);
  y += 44;
  ctx.font = font(900, 30);
  ctx.fillStyle = color === C.ink ? C.ink : color;
  ctx.fillText(wrap(ctx, caps(n.name), TW, 1)[0]!, X, y);
  if (tx.id) {
    y += 30;
    ctx.font = font(700, 21);
    ctx.fillStyle = C.ink;
    ctx.fillText(wrap(ctx, tx.id, TW, 1)[0]!, X, y);
  }
  y += 20;
  ctx.fillStyle = 'rgba(15,27,45,0.18)';
  ctx.fillRect(X, y, TW, 1.5);
  ctx.font = `italic ${font(400, 21, SERIF)}`;
  ctx.fillStyle = C.ink;
  y += 4;
  for (const l of wrap(ctx, tx.body, TW, 3)) {
    y += 30;
    ctx.fillText(l, X, y);
  }
  // Ce que pèse le joueur dans l'effectif, en encadré tout en bas.
  ctx.font = font(800, 17);
  const wl = wrap(ctx, tx.weight, TW - 36, 2);
  const bh = 26 + wl.length * 24;
  const by = Math.max(y + 22, PY + PH - bh);
  roundRect(ctx, X, by, TW, bh, 4, '#FFFFFF');
  roundRect(ctx, X, by, 6, bh, 0, color);
  ctx.fillStyle = C.ink;
  wl.forEach((l, i) => ctx.fillText(l, X + 22, by + 32 + i * 24));
  return canvas;
}

/** Message Discord d'une dépêche : image et court encart. */
export function breakingPayload(t: TFunction, n: BreakingNews, lang?: string) {
  const tx = breakingText(t, n, lang);
  return {
    username: paperName(t, n.club).slice(0, 80),
    embeds: [
      {
        author: { name: `${tx.icon}  ${tx.tag.toUpperCase()}  ·  ${t('breaking.kind').toUpperCase()}` },
        title: tx.title.slice(0, 256),
        description: [tx.body, tx.weight].join('\n').slice(0, 4000),
        color: n.kind === 'signing' ? 0x2e9e5b : n.kind === 'injury' ? 0xd93c3c : 0x0f1b2d,
        image: { url: 'attachment://une.png' },
        footer: { text: `${paperName(t, n.club)}  ·  FM Immersion` },
      },
    ],
    attachments: [{ id: 0, filename: 'une.png' }],
  };
}
