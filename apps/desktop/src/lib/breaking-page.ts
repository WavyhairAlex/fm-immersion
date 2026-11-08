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
const C = { paper: '#F4F1EA', ink: '#25282D', grey: '#5C6067', green: '#2E9E5B', red: '#D93C3C', orange: '#F26B1D', orangeDark: '#C2410C' };
const SERIF = '"Fraunces Variable", Georgia, serif';
const SANS = '"Nunito Variable", system-ui, sans-serif';
const font = (weight: number, size: number, family = SANS) => `${weight} ${size}px ${family}`;

export const breakingColor = (n: BreakingNews) => (n.kind === 'signing' ? C.green : n.kind === 'injury' ? C.red : C.ink);
const ICON = { signing: '✍️', exit: '👋', injury: '🚑' } as const;

/** Textes d'une dépêche : rubrique, titre, ligne d'identité, nouvelle et mot sur son importance. */
export function breakingText(t: TFunction, n: BreakingNews, lang?: string) {
  const vars = { club: n.club, name: n.name, days: n.days ?? '?', injury: n.injury?.trim() || t('breaking.injuryUnknown'), rank: n.rank, count: n.rank };
  const id = [n.age != null ? t('breaking.age', { count: n.age }) : '', n.position ?? ''].filter(Boolean).join(' · ');
  return {
    tag: t(`breaking.tag.${n.kind}`),
    title: t(`breaking.title.${n.kind}`, vars),
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

export async function drawBreaking(t: TFunction, n: BreakingNews, opts: { lang?: string; face?: CanvasImageSource | null } = {}): Promise<HTMLCanvasElement> {
  const { lang } = opts;
  await Promise.all([font(900, 72, SERIF), font(800, 22), font(400, 22), font(900, 26)].map((f) => document.fonts.load(f).catch(() => undefined)));
  const club = await clubArt(n.club);
  const caps = (s: string) => s.toLocaleUpperCase(lang);
  const tx = breakingText(t, n, lang);
  const color = breakingColor(n);
  const colors = club?.look?.colors ?? [];
  const accent = colors.find((c) => contrast(c, C.paper) >= 3) ?? C.orangeDark;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, W, H);
  grain(ctx, H, n.id.length * 131 + n.date.length);

  // Bandeau : rubrique à gauche, « Dépêche · date » à droite.
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, 72);
  ctx.font = font(900, 30);
  ctx.fillStyle = '#FFFFFF';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(`${tx.icon} ${caps(tx.tag)}`, M, 48);
  ctx.font = font(800, 16);
  ctx.textAlign = 'right';
  ctx.fillText(caps(`${t('breaking.kind')} · ${tx.date}`), W - M, 46);
  ctx.textAlign = 'left';

  // Portrait sur trame aux couleurs du club.
  const PX = M;
  const PY = 104;
  const PW = 400;
  const PH = H - PY - 92;
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
  if (club) drawCrest(ctx, club, PX + PW - 46, PY + 46, 64, { ring: bg });

  // La nouvelle à droite.
  const X = PX + PW + 44;
  const TW = W - M - X;
  let y = PY + 22;
  ctx.font = font(900, 15);
  ctx.fillStyle = accent;
  ctx.fillText(caps(paperName(t, n.club)), X, y);
  y += 16;
  const parts = n.name.trim().split(/\s+/);
  const first = parts.length > 1 ? parts[0]! : '';
  const last = parts.length > 1 ? parts.slice(1).join(' ') : parts[0]!;
  if (first) {
    ctx.font = font(800, 26);
    ctx.fillStyle = C.ink;
    y += 30;
    ctx.fillText(caps(first), X, y);
  }
  const ls = fit(ctx, caps(last), 900, 80, 36, TW, SERIF);
  y += ls * 0.92;
  ctx.fillStyle = C.ink;
  ctx.fillText(caps(last), X, y);
  if (tx.id) {
    y += 38;
    ctx.font = font(800, 20);
    ctx.fillStyle = C.grey;
    ctx.fillText(wrap(ctx, tx.id, TW, 1)[0]!, X, y);
  }
  y += 22;
  ctx.fillStyle = color;
  ctx.fillRect(X, y, 72, 5);
  y += 8;
  ctx.font = font(800, 30, SERIF);
  ctx.fillStyle = C.ink;
  for (const l of wrap(ctx, tx.title, TW, 2)) {
    y += 38;
    ctx.fillText(l, X, y);
  }
  ctx.font = font(400, 20);
  ctx.fillStyle = C.ink;
  y += 8;
  for (const l of wrap(ctx, tx.body, TW, 3)) {
    y += 29;
    ctx.fillText(l, X, y);
  }
  // Ce que pèse le joueur dans l'effectif, en encadré.
  ctx.font = font(800, 17);
  const wl = wrap(ctx, tx.weight, TW - 36, 2);
  const bh = 26 + wl.length * 24;
  const by = Math.min(y + 24, H - 92 - bh);
  roundRect(ctx, X, by, TW, bh, 4, '#FFFFFF');
  roundRect(ctx, X, by, 6, bh, 0, color);
  ctx.fillStyle = C.ink;
  wl.forEach((l, i) => ctx.fillText(l, X + 22, by + 32 + i * 24));

  // Pied aux couleurs du club.
  const foot = colors.find((c) => contrast(c, C.paper) >= 1.6) ?? C.ink;
  ctx.fillStyle = foot;
  ctx.fillRect(0, H - 56, W, 56);
  ctx.font = font(700, 16);
  ctx.fillStyle = inkOn(foot);
  ctx.fillText(`${paperName(t, n.club)} · ${t('breaking.kind')}`, M, H - 22);
  ctx.textAlign = 'right';
  ctx.fillText('FM Immersion', W - M, H - 22);
  ctx.textAlign = 'left';
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
        color: n.kind === 'signing' ? 0x2e9e5b : n.kind === 'injury' ? 0xd93c3c : 0x25282d,
        image: { url: 'attachment://une.png' },
        footer: { text: `${paperName(t, n.club)}  ·  FM Immersion` },
      },
    ],
    attachments: [{ id: 0, filename: 'une.png' }],
  };
}
