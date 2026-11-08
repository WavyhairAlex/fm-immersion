import type { SeasonMoment, SeasonReview } from '@fm-immersion/module-fm';
import type { TFunction } from 'i18next';
import { fit, roundRect, wrap } from './gazette-une';
import { paperName } from './gazette-text';
import { loadFace } from './player-face';
import { ordinal, verdict } from './season-une';

/**
 * Carte de fin de saison à partager (1080 × 1440, format portrait des réseaux et de Discord), sur fond anthracite :
 * club et verdict, place finale et sa courbe, chiffres clés, équipe type sur le terrain avec les photos (facepack ou
 * portraits photoréalistes, initiales sinon), trois meilleurs buteurs et moment fort de la saison.
 */
const W = 1080;
const H = 1440;
const M = 48;
const C = {
  bg: '#25282D',
  panel: '#30343A',
  pitch: '#2B2F35',
  line: 'rgba(255,255,255,0.13)',
  ink: '#FFFFFF',
  soft: '#B9BCC2',
  orange: '#F26B1D',
  orangeDark: '#C2410C',
  orangeLight: '#FFE4D3',
  dark: '#25282D',
  green: '#2E9E5B',
};
const SERIF = '"Fraunces Variable", Georgia, serif';
const SANS = '"Nunito Variable", system-ui, sans-serif';
const font = (weight: number, size: number, family = SANS) => `${weight} ${size}px ${family}`;

export type Faces = Map<string, CanvasImageSource>;

/** Identifiants des personnes dont la carte montre la photo. */
export function cardPeople(r: SeasonReview): string[] {
  const ids = [...(r.team?.slots.map((s) => s.player?.id) ?? []), ...r.topScorers.map((p) => p.id), r.moment?.kind === 'hatTrick' ? r.moment.id : null];
  return [...new Set(ids.filter((x): x is string => !!x))];
}

/** Photos disponibles sur ce PC pour la carte (les absents sont dessinés avec leurs initiales). */
export async function cardFaces(r: SeasonReview): Promise<Faces> {
  const out: Faces = new Map();
  await Promise.all(
    cardPeople(r).map(async (id) => {
      const img = await loadFace(id);
      if (img) out.set(id, img);
    }),
  );
  return out;
}

/** Nom court sous le médaillon : le nom de famille (« Marek Fábry » → « Fábry »). */
export const shortName = (name: string) => {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(1).join(' ') : name.trim();
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .filter((_, i, arr) => i === 0 || i === arr.length - 1)
    .join('');

function medal(ctx: CanvasRenderingContext2D, img: CanvasImageSource | undefined, name: string, cx: number, cy: number, r: number) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = C.orangeLight;
  ctx.fill();
  if (img) {
    const w = Number((img as { width?: number }).width) || 1;
    const h = Number((img as { height?: number }).height) || 1;
    const side = Math.min(w, h);
    ctx.clip();
    ctx.drawImage(img, (w - side) / 2, 0, side, side, cx - r, cy - r, r * 2, r * 2);
  } else {
    ctx.fillStyle = C.dark;
    ctx.font = font(900, Math.round(r * 0.75));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials(name), cx, cy + 1);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.lineWidth = 4;
  ctx.strokeStyle = C.orange;
  ctx.stroke();
}

function pill(ctx: CanvasRenderingContext2D, cx: number, y: number, text: string, bg: string, color = '#FFFFFF') {
  ctx.font = font(900, 15);
  const w = ctx.measureText(text).width + 18;
  roundRect(ctx, cx - w / 2, y, w, 24, 12, bg);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.fillText(text, cx, y + 17);
  ctx.textAlign = 'left';
}

function curve(ctx: CanvasRenderingContext2D, r: SeasonReview, x: number, y: number, w: number, h: number) {
  const pts = r.positions;
  if (pts.length < 2) return;
  const worst = Math.max(...pts.map((p) => p.position));
  const best = Math.min(...pts.map((p) => p.position));
  const span = Math.max(4, worst - best);
  const px = (i: number) => x + (w * i) / (pts.length - 1);
  const py = (p: number) => y + (h * (p - best + (span - (worst - best)) / 2)) / span;
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(px(i), py(p.position)) : ctx.moveTo(px(i), py(p.position))));
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(px(pts.length - 1), py(pts.at(-1)!.position), 6, 0, Math.PI * 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
}

const num = (v: number, lang?: string, digits = 2) => new Intl.NumberFormat(lang, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
const day = (iso: string, lang?: string) => new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${iso.slice(0, 10)}T12:00:00Z`));

/** Titre et ligne d'explication du moment fort. */
export function momentText(t: TFunction, m: SeasonMoment, lang?: string): { title: string; body: string } {
  if (m.kind === 'cupWin') return { title: t('card.moment.cupWin', { competition: m.competition }), body: t('card.moment.cupWinBody') };
  if (m.kind === 'unbeaten') return { title: t('card.moment.unbeaten', { count: m.count }), body: t('card.moment.unbeatenBody') };
  const score = `${m.match.goalsFor}-${m.match.goalsAgainst}`;
  const vs = m.match.opponent ? t('card.moment.vs', { score, opponent: m.match.opponent }) : t('card.moment.score', { score });
  if (m.kind === 'hatTrick')
    return { title: t(m.goals === 3 ? 'card.moment.hatTrick' : 'card.moment.haul', { name: m.name, count: m.goals }), body: `${vs} · ${day(m.match.date, lang)}` };
  return { title: vs, body: t('card.moment.bigWinBody', { date: day(m.match.date, lang) }) };
}

/** Pastilles des coupes : texte, et vrai pour une coupe gagnée. */
export function cupLines(t: TFunction, r: SeasonReview): [string, boolean][] {
  return (r.cups ?? []).map((c) => [
    t(`card.cup.${c.status}`, { competition: c.competition, opponent: c.outBy?.opponent ?? '?', count: c.played }),
    c.status === 'won',
  ]);
}

/** Titre de la carte : verdict de la saison, ou saison en cours. */
export function cardHeadline(t: TFunction, r: SeasonReview) {
  if (r.ongoing) return t('card.ongoingHeadline', { club: r.club, position: r.position != null ? ordinal(t, r.position) : '–' });
  return t(`season.headline.${verdict(r)}`, { club: r.club, position: r.position != null ? ordinal(t, r.position) : '' });
}

export async function drawSeasonCard(t: TFunction, r: SeasonReview, opts: { faces?: Faces; lang?: string } = {}): Promise<HTMLCanvasElement> {
  await Promise.all([font(900, 120, SERIF), font(800, 56, SERIF), font(400, 18), font(800, 18), font(900, 15)].map((f) => document.fonts.load(f).catch(() => undefined)));
  const faces = opts.faces ?? new Map();
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = C.orange;
  ctx.fillRect(0, 0, W, 8);

  // En-tête : type de carte, saison, club, verdict.
  ctx.font = font(900, 16);
  ctx.fillStyle = C.soft;
  ctx.fillText((r.ongoing ? t('card.ongoing', { count: r.played }) : t('card.kicker')).toUpperCase(), M, 52);
  ctx.textAlign = 'right';
  ctx.fillStyle = C.orange;
  ctx.fillText(t('season.label', { season: r.label }).toUpperCase(), W - M, 52);
  ctx.textAlign = 'left';
  ctx.fillStyle = C.ink;
  fit(ctx, r.club, 800, 64, 30, W - 2 * M, SERIF);
  ctx.fillText(r.club, M, 124);
  const head = cardHeadline(t, r);
  ctx.fillStyle = C.orange;
  fit(ctx, head, 800, 30, 18, W - 2 * M, SERIF);
  ctx.fillText(head, M, 168);

  // Parcours en coupes : une pastille par compétition.
  const cups = cupLines(t, r);
  let cxp = M;
  for (const [text, won] of cups) {
    ctx.font = font(800, 15);
    const w = Math.min(ctx.measureText(text).width + 28, W - M - cxp);
    if (w < 80) break;
    roundRect(ctx, cxp, 190, w, 32, 16, won ? C.orange : C.panel);
    ctx.fillStyle = won ? C.dark : C.ink;
    ctx.fillText(wrap(ctx, text, w - 28, 1)[0]!, cxp + 14, 211);
    cxp += w + 10;
  }
  const shift = cups.length ? 46 : 0;

  // Place finale (bloc orange foncé, texte blanc) et chiffres clés.
  const y0 = 196 + shift;
  const bh = 200;
  roundRect(ctx, M, y0, 330, bh, 20, C.orangeDark);
  ctx.font = font(800, 14);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText((r.ongoing ? t('card.position') : t('season.finalPosition')).toUpperCase(), M + 22, y0 + 32);
  ctx.font = font(900, 120, SERIF);
  ctx.fillStyle = '#FFFFFF';
  const posText = r.position != null ? String(r.position) : '–';
  ctx.fillText(posText, M + 18, y0 + 150);
  if (r.position != null) {
    const nw = ctx.measureText(posText).width;
    ctx.font = font(800, 34, SERIF);
    ctx.fillText(ordinal(t, r.position).replace(posText, ''), M + 22 + nw, y0 + 82);
  }
  if (r.positions.length >= 2) curve(ctx, r, M + 200, y0 + 70, 110, 90);

  const gx = M + 350;
  const gw = W - M - gx;
  const tw = (gw - 16) / 2;
  const th = (bh - 16) / 2;
  const tiles: [string, string][] = [
    [`${r.wins}-${r.draws}-${r.losses}`, t('season.record')],
    [String(r.points), t('card.points', { count: r.played })],
    [`${r.goalsFor}-${r.goalsAgainst}`, t('season.goals')],
    [String(r.unbeaten), t('season.unbeaten')],
  ];
  tiles.forEach(([value, label], i) => {
    const x = gx + (i % 2) * (tw + 16);
    const y = y0 + Math.floor(i / 2) * (th + 16);
    roundRect(ctx, x, y, tw, th, 16, C.panel);
    ctx.fillStyle = C.ink;
    fit(ctx, value, 900, 42, 22, tw - 40, SERIF);
    ctx.fillText(value, x + 20, y + 52);
    ctx.font = font(800, 14);
    ctx.fillStyle = C.soft;
    ctx.fillText(wrap(ctx, label.toUpperCase(), tw - 40, 1)[0]!, x + 20, y + 76);
  });

  // Équipe type sur le terrain (le but adverse en haut).
  const py = y0 + bh + 28;
  const ph = 690 - shift;
  roundRect(ctx, M, py, W - 2 * M, ph, 22, C.pitch);
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 2;
  const fx = M + 20;
  const fy = py + 52;
  const fw = W - 2 * M - 40;
  const fh = ph - 72;
  ctx.strokeRect(fx, fy, fw, fh);
  ctx.beginPath();
  ctx.moveTo(fx, fy + fh / 2);
  ctx.lineTo(fx + fw, fy + fh / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(fx + fw / 2, fy + fh / 2, 60, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeRect(fx + fw / 2 - 150, fy, 300, 80);
  ctx.strokeRect(fx + fw / 2 - 150, fy + fh - 80, 300, 80);
  ctx.font = font(900, 16);
  ctx.fillStyle = C.orange;
  ctx.fillText(t('card.team').toUpperCase(), M + 24, py + 34);
  if (r.team) {
    ctx.textAlign = 'right';
    ctx.fillStyle = C.soft;
    ctx.fillText(t('card.formation', { formation: r.team.formation }), W - M - 24, py + 34);
    ctx.textAlign = 'left';
    const rad = 36;
    // Lignes du schéma (postes à moins de 6 points de hauteur = même ligne), réparties à intervalles égaux.
    const ys = [...new Set(r.team.slots.map((s) => s.y))].sort((a, b) => a - b);
    const rows: number[][] = [];
    for (const y of ys) (rows.length && y - rows.at(-1)!.at(-1)! < 6 ? rows.at(-1)! : (rows[rows.length] = [])).push(y);
    const top = fy + 56;
    const step = rows.length > 1 ? (fh - 56 - 96) / (rows.length - 1) : 0;
    const rowOf = (y: number) => rows.findIndex((row) => row.includes(y));
    for (const s of r.team.slots) {
      const cx = fx + 60 + ((fw - 120) * s.x) / 100;
      const cy = top + step * rowOf(s.y);
      if (!s.player) {
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.setLineDash([6, 6]);
        ctx.lineWidth = 2;
        ctx.strokeStyle = C.soft;
        ctx.stroke();
        ctx.setLineDash([]);
        continue;
      }
      medal(ctx, faces.get(s.player.id), s.player.name, cx, cy, rad);
      pill(ctx, cx, cy + rad - 10, num(s.player.rating, opts.lang), C.orangeDark);
      ctx.font = font(800, 16);
      ctx.fillStyle = C.ink;
      ctx.textAlign = 'center';
      ctx.fillText(wrap(ctx, shortName(s.player.name), 160, 1)[0]!, cx, cy + rad + 34);
      ctx.textAlign = 'left';
    }
  } else {
    ctx.font = font(700, 18);
    ctx.fillStyle = C.soft;
    ctx.textAlign = 'center';
    wrap(ctx, t('card.noTeam'), fw - 120, 3).forEach((l, i) => ctx.fillText(l, W / 2, py + ph / 2 + i * 26));
    ctx.textAlign = 'left';
  }

  // Meilleurs buteurs et moment fort.
  const by = py + ph + 24;
  const bh2 = H - 64 - by;
  const colW = (W - 2 * M - 20) / 2;
  roundRect(ctx, M, by, colW, bh2, 20, C.panel);
  ctx.font = font(900, 16);
  ctx.fillStyle = C.orange;
  ctx.fillText(t('card.scorers').toUpperCase(), M + 22, by + 34);
  if (!r.topScorers.length) {
    ctx.font = font(700, 17);
    ctx.fillStyle = C.soft;
    ctx.fillText(t('card.noScorer'), M + 22, by + 76);
  }
  r.topScorers.forEach((p, i) => {
    const ry = by + 80 + i * 62;
    medal(ctx, faces.get(p.id), p.name, M + 50, ry, 24);
    ctx.font = font(800, 19);
    ctx.fillStyle = C.ink;
    ctx.fillText(wrap(ctx, p.name, colW - 170, 1)[0]!, M + 88, ry + 7);
    ctx.font = font(900, 30, SERIF);
    ctx.fillStyle = i === 0 ? C.orange : C.ink;
    ctx.textAlign = 'right';
    ctx.fillText(String(p.value), M + colW - 22, ry + 11);
    ctx.textAlign = 'left';
  });

  const mx = M + colW + 20;
  roundRect(ctx, mx, by, colW, bh2, 20, C.orangeDark);
  ctx.font = font(900, 16);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(t('card.moment.title').toUpperCase(), mx + 22, by + 34);
  if (r.moment) {
    const mt = momentText(t, r.moment, opts.lang);
    let tx = mx + 22;
    if (r.moment.kind === 'hatTrick') {
      medal(ctx, faces.get(r.moment.id), r.moment.name, mx + 58, by + 96, 34);
      tx = mx + 108;
    }
    ctx.font = font(800, 26, SERIF);
    ctx.fillStyle = '#FFFFFF';
    const lines = wrap(ctx, mt.title, mx + colW - 22 - tx, 2);
    lines.forEach((l, i) => ctx.fillText(l, tx, by + 92 + i * 32));
    const bodyY = Math.max(by + 104 + lines.length * 32, r.moment.kind === 'hatTrick' ? by + 160 : 0);
    ctx.font = font(700, 17);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    wrap(ctx, mt.body, colW - 44, 2).forEach((l, i) => ctx.fillText(l, mx + 22, bodyY + i * 24));
  } else {
    ctx.font = font(700, 17);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    wrap(ctx, t('card.noMoment'), colW - 44, 3).forEach((l, i) => ctx.fillText(l, mx + 22, by + 76 + i * 24));
  }

  // Pied : signature et non-affiliation.
  ctx.font = font(800, 15);
  ctx.fillStyle = C.ink;
  ctx.fillText(paperName(t, r.club), M, H - 26);
  ctx.textAlign = 'right';
  ctx.font = font(400, 13);
  ctx.fillStyle = C.soft;
  ctx.fillText(t('card.footer'), W - M, H - 26);
  ctx.textAlign = 'left';
  return canvas;
}

/** Encart Discord qui accompagne la carte. */
export function cardPayload(t: TFunction, r: SeasonReview, lang?: string) {
  const lines = [
    `🏆 ${cardHeadline(t, r)}`,
    r.topScorers.length && `⚽ ${t('card.scorers')} : ${r.topScorers.map((p) => `**${p.name}** (${p.value})`).join(', ')}`,
    r.moment && `✨ ${momentText(t, r.moment, lang).title}`,
    (r.cups ?? []).length > 0 && `🏆 ${cupLines(t, r).map(([x]) => x).join('  ·  ')}`,
  ].filter(Boolean);
  return {
    username: paperName(t, r.club).slice(0, 80),
    embeds: [
      {
        author: { name: `${t('card.kicker').toUpperCase()}  ·  ${t('season.label', { season: r.label })}` },
        title: r.club.slice(0, 256),
        description: lines.join('\n').slice(0, 4000),
        color: 0xf26b1d,
        image: { url: 'attachment://une.png' },
        footer: { text: 'FM Immersion' },
      },
    ],
    attachments: [{ id: 0, filename: 'une.png' }],
  };
}

/** Nom du fichier enregistré : « carte-saison-malzenice-2026-27 ». */
export const cardFileName = (r: SeasonReview) =>
  `carte-saison-${r.club}-${r.label}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
