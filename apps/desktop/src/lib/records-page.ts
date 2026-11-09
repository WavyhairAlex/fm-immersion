import { contrast, inkOn, type RecordNews } from '@fm-immersion/module-fm';
import type { TFunction } from 'i18next';
import { drawPanel } from './breaking-page';
import { clubArt, drawCrest } from './club-look';
import { grain } from './gazette-page';
import { paperName } from './gazette-text';
import { fit, roundRect, wrap } from './gazette-une';

/**
 * Édition record en image (1200 × 675, comme les dépêches) : bandeau doré, à gauche le visage de l'auteur du triplé ou
 * le chiffre de l'exploit en très grand (série, score, matchs sans victoire), à droite le titre, le match et le récit.
 */
const W = 1200;
const H = 675;
const M = 48;
const C = { paper: '#F4F1EA', ink: '#0F1B2D', grey: '#56607A', gold: '#B8860B', orangeDark: '#8F5400' };
const SERIF = '"Fraunces Variable", Georgia, serif';
const SANS = '"Nunito Variable", system-ui, sans-serif';
const font = (weight: number, size: number, family = SANS) => `${weight} ${size}px ${family}`;

const ICON = { hatTrick: '⚽', streak: '🔥', bigWin: '💥', runEnded: '🌤️' } as const;

/** Textes d'un exploit : rubrique, titre, ligne du match, récit, chiffre et légende du cadre de gauche. */
export function recordText(t: TFunction, n: RecordNews, lang?: string) {
  const m = n.match;
  const opponent = m.opponent ?? t('records.opponentUnknown');
  const score = `${m.goalsFor}-${m.goalsAgainst}`;
  const vars = {
    club: n.club,
    opponent,
    score,
    margin: m.goalsFor - m.goalsAgainst,
    name: n.kind === 'hatTrick' ? n.name : '',
    goals: n.kind === 'hatTrick' ? n.goals : 0,
    count: n.kind === 'streak' || n.kind === 'runEnded' ? n.count : n.kind === 'hatTrick' ? n.goals : m.goalsFor - m.goalsAgainst,
  };
  // Le match dans l'ordre du terrain : le club qui reçoit d'abord.
  const [a, b, ga, gb] = m.home === false ? [opponent, n.club, m.goalsAgainst, m.goalsFor] : [n.club, opponent, m.goalsFor, m.goalsAgainst];
  const where = m.home == null ? '' : t(m.home ? 'records.home' : 'records.away');
  const title = n.kind === 'hatTrick' && n.goals > 3 ? t('records.title.many', vars) : t(`records.title.${n.kind}`, vars);
  return {
    tag: t(`records.tag.${n.kind}`),
    title,
    line: `${a} ${ga}-${gb} ${b}`,
    where: [m.competition, where].filter(Boolean).join(' · '),
    body: t(`records.body.${n.kind}`, vars),
    big: n.kind === 'bigWin' ? score : String(vars.count),
    caption: t(`records.caption.${n.kind}`, vars),
    date: new Date(`${n.date.slice(0, 10)}T12:00:00`).toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' }),
    icon: ICON[n.kind],
  };
}

export async function drawRecord(t: TFunction, n: RecordNews, opts: { lang?: string; face?: CanvasImageSource | null } = {}): Promise<HTMLCanvasElement> {
  const { lang } = opts;
  await Promise.all([font(900, 72, SERIF), font(800, 22), font(400, 22), font(900, 26)].map((f) => document.fonts.load(f).catch(() => undefined)));
  const club = await clubArt(n.club);
  const caps = (s: string) => s.toLocaleUpperCase(lang);
  const tx = recordText(t, n, lang);
  const colors = club?.look?.colors ?? [];
  const accent = colors.find((c) => contrast(c, C.paper) >= 3) ?? C.orangeDark;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, W, H);
  grain(ctx, H, n.date.length * 97 + n.kind.length);

  // Bandeau doré : rubrique à gauche, « Édition record · date » à droite.
  const band = ctx.createLinearGradient(0, 0, W, 0);
  band.addColorStop(0, '#8A6408');
  band.addColorStop(0.5, C.gold);
  band.addColorStop(1, '#8A6408');
  ctx.fillStyle = band;
  ctx.fillRect(0, 0, W, 72);
  ctx.font = font(900, 30);
  ctx.fillStyle = '#FFFFFF';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(`${tx.icon} ${caps(tx.tag)}`, M, 48);
  ctx.font = font(800, 16);
  ctx.textAlign = 'right';
  ctx.fillText(caps(`🏆 ${t('records.kind')} · ${tx.date}`), W - M, 46);
  ctx.textAlign = 'left';

  // Cadre de gauche : visage de l'auteur du triplé, sinon le chiffre de l'exploit.
  const PX = M;
  const PY = 104;
  const PW = 400;
  const PH = H - PY - 92;
  const face = n.kind === 'hatTrick' ? (opts.face ?? null) : null;
  const bg = drawPanel(ctx, club, PX, PY, PW, PH, face);
  const ink = inkOn(bg);
  if (face) {
    // Ballons du triplé en bas du portrait.
    const goals = Math.min(n.kind === 'hatTrick' ? n.goals : 0, 6);
    ctx.font = font(400, 34);
    ctx.textAlign = 'center';
    roundRect(ctx, PX + 16, PY + PH - 62, PW - 32, 48, 24, 'rgba(0,0,0,0.55)');
    ctx.fillText('⚽'.repeat(goals), PX + PW / 2, PY + PH - 26);
    ctx.textAlign = 'left';
  } else {
    ctx.fillStyle = ink;
    ctx.textAlign = 'center';
    const size = fit(ctx, tx.big, 900, 220, 90, PW - 48, SERIF);
    ctx.fillText(tx.big, PX + PW / 2, PY + PH / 2 + size * 0.3);
    ctx.font = font(800, 22);
    wrap(ctx, caps(tx.caption), PW - 56, 2).forEach((l, i) => ctx.fillText(l, PX + PW / 2, PY + PH / 2 + size * 0.3 + 52 + i * 28));
    ctx.textAlign = 'left';
  }
  if (club) drawCrest(ctx, club, PX + PW - 46, PY + 46, 64, { ring: bg });

  // Le récit à droite.
  const X = PX + PW + 44;
  const TW = W - M - X;
  let y = PY + 22;
  ctx.font = font(900, 15);
  ctx.fillStyle = accent;
  ctx.fillText(caps(paperName(t, n.club)), X, y);
  y += 10;
  ctx.fillStyle = C.ink;
  const lines = (() => {
    for (const s of [52, 46, 40, 36]) {
      ctx.font = font(900, s, SERIF);
      const l = wrap(ctx, tx.title, TW);
      if (l.length <= 3) return { l, s };
    }
    ctx.font = font(900, 36, SERIF);
    return { l: wrap(ctx, tx.title, TW, 3), s: 36 };
  })();
  for (const l of lines.l) {
    y += lines.s * 1.08;
    ctx.fillText(l, X, y);
  }
  y += 22;
  ctx.fillStyle = C.gold;
  ctx.fillRect(X, y, 72, 5);
  // Le match : score dans l'ordre du terrain, compétition et lieu.
  y += 14;
  const bh = tx.where ? 84 : 60;
  roundRect(ctx, X, y, TW, bh, 4, C.ink);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = font(900, 28, SERIF);
  ctx.fillText(wrap(ctx, tx.line, TW - 40, 1)[0]!, X + 20, y + 40);
  if (tx.where) {
    ctx.font = font(700, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(wrap(ctx, tx.where, TW - 40, 1)[0]!, X + 20, y + 68);
  }
  y += bh + 8;
  ctx.font = font(400, 20);
  ctx.fillStyle = C.ink;
  for (const l of wrap(ctx, tx.body, TW, 3)) {
    y += 29;
    ctx.fillText(l, X, y);
  }

  // Pied aux couleurs du club.
  const foot = colors.find((c) => contrast(c, C.paper) >= 1.6) ?? C.ink;
  ctx.fillStyle = foot;
  ctx.fillRect(0, H - 56, W, 56);
  ctx.font = font(700, 16);
  ctx.fillStyle = inkOn(foot);
  ctx.fillText(`${paperName(t, n.club)} · ${t('records.kind')}`, M, H - 22);
  ctx.textAlign = 'right';
  ctx.fillText('FM Immersion', W - M, H - 22);
  ctx.textAlign = 'left';
  return canvas;
}

/** Message Discord d'un exploit : image et court encart. */
export function recordPayload(t: TFunction, n: RecordNews, lang?: string) {
  const tx = recordText(t, n, lang);
  return {
    username: paperName(t, n.club).slice(0, 80),
    embeds: [
      {
        author: { name: `🏆  ${t('records.kind').toUpperCase()}  ·  ${tx.tag.toUpperCase()}` },
        title: tx.title.slice(0, 256),
        description: [`**${tx.line}**${tx.where ? `  ·  ${tx.where}` : ''}`, tx.body].join('\n').slice(0, 4000),
        color: 0xb8860b,
        image: { url: 'attachment://une.png' },
        footer: { text: `${paperName(t, n.club)}  ·  FM Immersion` },
      },
    ],
    attachments: [{ id: 0, filename: 'une.png' }],
  };
}
