import { contrast, inkOn, type GazetteIssue, type GazetteStory, type SeasonReview } from '@fm-immersion/module-fm';
import type { TFunction } from 'i18next';
import { clubArt, drawCrest, type ClubArt } from './club-look';
import { articleText, headlineText, figuresLine, paperName, storyText, weekLabel } from './gazette-text';

/**
 * Une de la gazette en image (1200 × 675), dessinée sur le PC dans un canvas, pour l'envoi sur Discord.
 * Mise en page de journal : bandeau (numéro, semaine, compétition), titre du journal, filets, une à gauche
 * (pastille, gros titre, score, buteurs, homme du match, forme), « En bref » à droite, prochain match en pied.
 * Aux couleurs du club quand le plugin les lit (bandeau, filets, pied) et avec les logos du pack de logos du joueur
 * (titre du journal, score) ; sinon aux couleurs de FM Immersion, avec des écussons à défaut de logo.
 */
export type Outcome = 'W' | 'D' | 'L';

const W = 1200;
const H = 675;
const M = 48;
const C = {
  paper: '#F4F1EA',
  ink: '#0F1B2D',
  grey: '#56607A',
  orange: '#FFB547',
  orangeDark: '#8F5400',
  orangeLight: '#FFEBC7',
  green: '#2E9E5B',
  red: '#D93C3C',
  dash: '#B9B6AD',
};
const SERIF = '"Fraunces Variable", Georgia, serif';
const SANS = '"Nunito Variable", system-ui, sans-serif';
const font = (weight: number, size: number, family = SANS) => `${weight} ${size}px ${family}`;
const outcomeColor = (o: Outcome) => (o === 'W' ? C.green : o === 'L' ? C.red : C.grey);

/** Coupe un texte en lignes d'au plus `width` pixels ; la dernière ligne autorisée finit par « … » si besoin. */
export function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, maxLines = 99): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width <= width || !line) line = next;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1]!;
  while (last && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1);
  kept[maxLines - 1] = `${last.trimEnd()}…`;
  return kept;
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

/** Image recadrée dans un cercle (cadrage carré centré en largeur, calé en haut : le visage). */
export function drawFace(ctx: CanvasRenderingContext2D, img: CanvasImageSource, cx: number, cy: number, r: number) {
  const w = Number((img as { width?: number }).width) || 1;
  const h = Number((img as { height?: number }).height) || 1;
  const side = Math.min(w, h);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(img, (w - side) / 2, 0, side, side, cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.lineWidth = 3;
  ctx.strokeStyle = C.orange;
  ctx.stroke();
}

/** Plus grande taille de police (≤ max) pour que le texte tienne sur `width`. */
export function fit(ctx: CanvasRenderingContext2D, text: string, weight: number, max: number, min: number, width: number, family: string) {
  let size = max;
  ctx.font = font(weight, size, family);
  while (size > min && ctx.measureText(text).width > width) ctx.font = font(weight, --size, family);
  return size;
}

/** Cases de l'encadré « Les chiffres » : place, bilan, buts, meilleur buteur (valeur, légende). */
export function figureTiles(t: TFunction, f: SeasonReview): [string, string][] {
  const out: [string, string][] = [];
  if (f.position != null) out.push([t(`season.ordinal${f.position <= 3 ? f.position : ''}`, { n: f.position }), t('gazette.une.figPosition')]);
  // Championnat seul, comme le classement du jeu (une défaite en coupe ne compte pas dans le bilan de la ligue).
  const l = f.league;
  if (l.played) {
    out.push([`${l.wins}-${l.draws}-${l.losses}`, t('gazette.une.figRecord', { count: l.played })]);
    out.push([`${l.goalsFor}-${l.goalsAgainst}`, t('gazette.une.figGoals')]);
  }
  if (f.topScorer) out.push([String(f.topScorer.value), t('gazette.une.figScorer', { count: f.topScorer.value, name: f.topScorer.name })]);
  return out;
}

/** Série en cours (« 4 victoires de suite ») d'après les résultats, du plus récent au plus ancien. */
export function streak(form: Outcome[]): { outcome: Outcome; count: number } | null {
  if (!form.length) return null;
  const first = form[0]!;
  let n = 0;
  while (n < form.length && form[n] === first) n++;
  return { outcome: first, count: n };
}

const ICON: Partial<Record<GazetteStory['kind'], string>> = {
  results: '📋',
  position: '📈',
  scorer: '🔥',
  injury: '🚑',
  return: '💪',
  arrival: '✍️',
  youthIntake: '🌱',
  departure: '👋',
  extension: '🖊️',
  fans: '📣',
  job: '🪑',
  coachFuture: '🗞️',
};

export async function drawUne(
  t: TFunction,
  issue: GazetteIssue,
  opts: {
    form: Outcome[];
    lang?: string;
    /** Photo de l'homme du match (facepack du joueur), si elle existe. */
    face?: CanvasImageSource | null;
    /** Saison en cours du club (encadré « Les chiffres »). */
    figures?: SeasonReview | null;
    /** Club du journal et adversaire du match à la une (couleurs, logo) ; lus dans la table des clubs si absents. */
    club?: ClubArt | null;
    opponent?: ClubArt | null;
  },
): Promise<HTMLCanvasElement> {
  const { lang } = opts;
  const oppName = issue.headline.kind === 'result' ? String(issue.headline.params.opponent ?? '') : '';
  const [club, opponent] = await Promise.all([opts.club !== undefined ? opts.club : clubArt(issue.club), opts.opponent !== undefined ? opts.opponent : clubArt(oppName || null)]);
  // Couleurs du club : bandeau, filets et pied dans sa première couleur qui se voit sur le papier (un club blanc et
  // bleu prend son bleu), liseré fin dans une autre de ses couleurs visibles.
  const colors = club?.look?.colors ?? [];
  const band = colors.find((c) => contrast(c, C.paper) >= 1.6) ?? null;
  const stripe = colors.find((c) => c !== band && contrast(c, C.paper) >= 1.6 && contrast(c, band ?? C.paper) >= 1.4) ?? null;
  const accent = band ?? C.orange;
  await Promise.all([font(900, 76, SERIF), font(800, 50, SERIF), font(400, 19), font(800, 19)].map((f) => document.fonts.load(f).catch(() => undefined)));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, W, H);
  if (band) {
    ctx.fillStyle = band;
    ctx.fillRect(0, 0, W, 10);
    if (stripe) {
      ctx.fillStyle = stripe;
      ctx.fillRect(0, 10, W, 4);
    }
  }

  const head = issue.headline;
  const headText = headlineText(t, issue, lang);
  const all = [head, ...issue.stories];
  const next = all.find((s) => s.kind === 'nextMatch');
  // Bandeau : compétition du match à la une, sinon celle du prochain match.
  const competition = String((head.kind === 'result' && !head.params.friendly ? head.params.competition : null) ?? next?.params.competition ?? '');

  // Bandeau du haut : numéro, semaine, compétition.
  ctx.font = font(800, 15);
  ctx.fillStyle = C.grey;
  const top = 44;
  const caps = (s: string) => s.toLocaleUpperCase(lang);
  ctx.textAlign = 'left';
  ctx.fillText(caps(t('gazette.issue', { number: issue.number })), M, top);
  ctx.textAlign = 'center';
  ctx.fillText(caps(weekLabel(t, lang, issue.weekStart, issue.weekEnd)), W / 2, top);
  ctx.textAlign = 'right';
  ctx.fillText(caps(competition).slice(0, 40), W - M, top);

  // Titre du journal, précédé du logo du club (ou de son écusson).
  const name = paperName(t, issue.club);
  const crest = club ? 72 : 0;
  const gap = club ? 18 : 0;
  const size = fit(ctx, name, 900, 76, 40, W - 2 * M - 2 * (crest + gap), SERIF);
  const nameW = ctx.measureText(name).width;
  const x0 = (W - (crest + gap + nameW)) / 2;
  if (club) drawCrest(ctx, club, x0 + crest / 2, 62 + size * 0.47, crest, { ring: C.paper });
  ctx.font = font(900, size, SERIF);
  ctx.textAlign = 'left';
  ctx.fillStyle = C.ink;
  ctx.fillText(name, x0 + crest + gap, 62 + size * 0.8);
  // Filets : le gros à la couleur du club.
  ctx.fillStyle = accent;
  ctx.fillRect(M, 141, W - 2 * M, 3);
  ctx.fillStyle = C.ink;
  ctx.fillRect(M, 147, W - 2 * M, 1);
  ctx.fillRect(M, 180, W - 2 * M, 1);
  ctx.font = font(800, 15);
  ctx.textAlign = 'left';
  const s = streak(opts.form);
  if (s) {
    const label = `${t('gazette.une.form')} : `;
    ctx.fillStyle = C.ink;
    ctx.fillText(label, M, 168);
    ctx.fillStyle = s.outcome === 'L' ? C.red : s.outcome === 'W' ? C.orangeDark : C.grey;
    ctx.fillText(t(`gazette.une.streak_${s.outcome}`, { count: s.count }), M + ctx.measureText(label).width, 168);
  }
  ctx.textAlign = 'right';
  ctx.fillStyle = C.ink;
  ctx.fillText(t('gazette.une.tagline'), W - M, 168);
  ctx.textAlign = 'left';

  // Colonne principale.
  const colW = 1200 - 2 * M - 36 - 330;
  let y = 204;
  const isResult = head.kind === 'result';
  const p = head.params;
  const kicker = isResult
    ? `${t(`gazette.une.kicker_${p.cup === 'out' ? 'cupOut' : p.cup === 'through' ? 'cupThrough' : p.outcome}`)}${p.home == null ? '' : ` ${t(p.home ? 'gazette.une.atHome' : 'gazette.une.away')}`}`
    : t(`gazette.une.section.${head.kind}`, { defaultValue: t('gazette.une.section.default') });
  ctx.font = font(800, 14);
  const kw = ctx.measureText(caps(kicker)).width + 20;
  roundRect(ctx, M, y, kw, 26, 3, isResult ? outcomeColor(p.outcome as Outcome) : C.ink);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(caps(kicker), M + 10, y + 18);
  y += 30;

  // Gros titre : 2 lignes au plus, la police baisse si besoin.
  let hs = 50;
  let lines: string[] = [];
  for (; hs >= 34; hs -= 4) {
    ctx.font = font(800, hs, SERIF);
    lines = wrap(ctx, headText.title, colW, 3);
    if (lines.length <= 2) break;
  }
  lines = lines.slice(0, hs < 34 ? 3 : 2);
  ctx.fillStyle = C.ink;
  for (const l of lines) {
    y += hs * 1.02;
    ctx.fillText(l, M, y);
  }
  y += 22;

  if (isResult && p.goalsFor != null && p.goalsAgainst != null) {
    // Score : équipe à domicile à gauche.
    const opp = String(p.opponent ?? t('gazette.opponentUnknown'));
    const [left, right] = p.home === 0 ? [opp, issue.club] : [issue.club, opp];
    const score = p.home === 0 ? `${p.goalsAgainst} – ${p.goalsFor}` : `${p.goalsFor} – ${p.goalsAgainst}`;
    ctx.font = font(800, 22);
    const team = (x: string) => caps(x).slice(0, 22);
    const lw = ctx.measureText(team(left)).width;
    const rw = ctx.measureText(team(right)).width;
    ctx.font = font(900, 46, SERIF);
    const sw = ctx.measureText(score).width;
    // Logos (ou écussons) de part et d'autre, quand les deux clubs sont connus.
    const [leftArt, rightArt] = p.home === 0 ? [opponent, club] : [club, opponent];
    const logos = !!(leftArt && rightArt);
    const lg = logos ? 46 + 12 : 0;
    const boxW = Math.min(colW, 22 + lg + lw + 18 + sw + 18 + rw + lg + 22);
    roundRect(ctx, M, y, boxW, 74, 10, C.ink);
    if (logos) {
      drawCrest(ctx, leftArt!, M + 22 + 23, y + 37, 46, { ring: C.ink });
      drawCrest(ctx, rightArt!, M + boxW - 22 - 23, y + 37, 46, { ring: C.ink });
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }
    ctx.font = font(800, 22);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(team(left), M + 22 + lg, y + 45);
    ctx.font = font(900, 46, SERIF);
    ctx.fillStyle = C.orange;
    ctx.fillText(score, M + 22 + lg + lw + 18, y + 54);
    ctx.font = font(800, 22);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(team(right), M + 22 + lg + lw + 18 + sw + 18, y + 45);
    y += 74 + 36;
    if (p.scorers) {
      ctx.font = font(800, 19);
      ctx.fillStyle = C.ink;
      const label = `${t('gazette.une.scorers')} : `;
      ctx.fillText(label, M, y);
      const lw2 = ctx.measureText(label).width;
      ctx.font = font(400, 19);
      ctx.fillText(wrap(ctx, String(p.scorers), colW - lw2, 1)[0]!, M + lw2, y);
      y += 24;
    }
    // Chiffres du jeu (possession, tirs, xG) quand l'instantané les donne.
    const figures = figuresLine(t, p, lang);
    if (figures) {
      ctx.font = font(700, 16);
      ctx.fillStyle = C.grey;
      ctx.fillText(wrap(ctx, figures, colW, 1)[0]!, M, y);
      y += 22;
    }
    // Début de l'article (deux lignes), quand la place le permet avant la ligne homme du match / forme.
    const article = articleText(t, issue, lang);
    if (article && y + 52 <= 500) {
      ctx.font = `italic ${font(400, 17)}`;
      ctx.fillStyle = C.ink;
      for (const l of wrap(ctx, article, colW, 2)) {
        y += 22;
        ctx.fillText(l, M, y);
      }
      y += 4;
    }
  } else if (headText.body) {
    ctx.font = font(400, 19);
    ctx.fillStyle = C.ink;
    for (const l of wrap(ctx, headText.body, colW, 3)) {
      y += 26;
      ctx.fillText(l, M, y);
    }
    y += 10;
  }

  // Les chiffres de la saison, sous un gros titre qui n'est pas un match (semaine calme, intersaison).
  const fig = opts.figures;
  if (!isResult && fig && (fig.played || fig.position != null)) {
    y += 34;
    ctx.font = font(800, 13);
    ctx.fillStyle = C.orangeDark;
    ctx.fillText(caps(t('gazette.une.figures', { season: fig.label })), M, y);
    y += 12;
    const tiles = figureTiles(t, fig);
    const tw = (colW - 12 * (tiles.length - 1)) / tiles.length;
    tiles.forEach(([value, label], i) => {
      const tx = M + i * (tw + 12);
      roundRect(ctx, tx, y, tw, 84, 10, '#FFFFFF');
      ctx.fillStyle = i === 0 ? C.orangeDark : C.ink;
      fit(ctx, value, 900, 34, 16, tw - 24, SERIF);
      ctx.fillText(value, tx + 12, y + 44);
      ctx.font = font(700, 13);
      ctx.fillStyle = C.grey;
      ctx.fillText(wrap(ctx, label, tw - 24, 1)[0]!, tx + 12, y + 68);
    });
    y += 84;
  }

  // Homme du match et forme.
  let x = M;
  const rowY = Math.max(y + 14, 500);
  if (isResult && p.best) {
    ctx.beginPath();
    ctx.arc(x + 31, rowY + 31, 31, 0, Math.PI * 2);
    ctx.fillStyle = C.orangeLight;
    ctx.fill();
    const r = p.rating == null ? '–' : new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Number(p.rating));
    if (opts.face) {
      // Photo dans le cercle (recadrée au centre, haut du visage), note en pastille dessous.
      drawFace(ctx, opts.face, x + 31, rowY + 31, 31);
      if (p.rating != null) {
        ctx.font = font(900, 14, SERIF);
        const bw = ctx.measureText(r).width + 14;
        roundRect(ctx, x + 31 - bw / 2, rowY + 52, bw, 20, 10, C.orangeDark);
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.fillText(r, x + 31, rowY + 67);
        ctx.textAlign = 'left';
      }
    } else {
      ctx.font = font(900, r.length > 3 ? 20 : 24, SERIF);
      ctx.fillStyle = C.orangeDark;
      ctx.textAlign = 'center';
      ctx.fillText(r, x + 31, rowY + 39);
      ctx.textAlign = 'left';
    }
    ctx.font = font(800, 13);
    ctx.fillStyle = C.grey;
    ctx.fillText(caps(t('gazette.une.motm')), x + 76, rowY + 24);
    ctx.font = font(800, 20);
    ctx.fillStyle = C.ink;
    const best = wrap(ctx, String(p.best), 200, 1)[0]!;
    ctx.fillText(best, x + 76, rowY + 48);
    x += 76 + Math.max(ctx.measureText(best).width, 150) + 50;
  }
  const form = opts.form.slice(0, 5).reverse();
  if (form.length) {
    ctx.font = font(800, 13);
    ctx.fillStyle = C.grey;
    ctx.fillText(caps(t('gazette.une.lastMatches', { count: form.length })), x, rowY + 18);
    form.forEach((o, i) => {
      roundRect(ctx, x + i * 34, rowY + 28, 28, 28, 4, outcomeColor(o));
      ctx.font = font(900, 15);
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText(t(`gazette.une.letter_${o}`), x + i * 34 + 14, rowY + 47);
      ctx.textAlign = 'left';
    });
  }

  // Colonne « En bref ».
  const sx = W - M - 330;
  ctx.fillStyle = C.ink;
  ctx.fillRect(sx - 28, 204, 1, 362);
  ctx.font = font(800, 22, SERIF);
  ctx.fillText(t('gazette.une.briefs'), sx, 226);
  roundRect(ctx, sx, 233, ctx.measureText(t('gazette.une.briefs')).width, 3, 0, accent);
  let by = 236;
  const briefs = issue.stories.filter((x) => x.kind !== 'nextMatch' && x.kind !== 'quiet' && x.kind !== 'result');
  const resultsBriefs = issue.stories.filter((x) => x.kind === 'result');
  for (const b of [...resultsBriefs, ...briefs]) {
    const txt = storyText(t, issue.club, b, lang);
    ctx.font = font(800, 17);
    const hl = wrap(ctx, `${b.kind === 'result' ? '⚽' : (ICON[b.kind] ?? '•')} ${txt.title}`, 330, 2);
    ctx.font = font(400, 15);
    const bl = txt.body ? wrap(ctx, txt.body, 330, 2) : [];
    const need = 14 + hl.length * 22 + bl.length * 20 + 12;
    if (by + need > 566) break;
    by += 14;
    ctx.fillStyle = C.ink;
    ctx.font = font(800, 17);
    for (const l of hl) {
      by += 22;
      ctx.fillText(l, sx, by);
    }
    ctx.font = font(400, 15);
    ctx.fillStyle = C.grey;
    for (const l of bl) {
      by += 20;
      ctx.fillText(l, sx, by);
    }
    by += 12;
    ctx.strokeStyle = C.dash;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(sx, by + 0.5);
    ctx.lineTo(W - M, by + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (by === 236) {
    ctx.font = font(400, 15);
    ctx.fillStyle = C.grey;
    ctx.fillText(t('gazette.une.noBriefs'), sx, 270);
  }

  // Pied : prochain match, sur la couleur principale du club (texte blanc ou anthracite selon le fond).
  const foot = band ?? C.ink;
  const footInk = inkOn(foot);
  ctx.fillStyle = foot;
  ctx.fillRect(0, H - 51, W, 51);
  ctx.font = font(400, 17);
  ctx.textAlign = 'left';
  let fx = M;
  const fy = H - 19;
  const piece = (text: string, color: string, weight = 400) => {
    ctx.font = font(weight, 17);
    ctx.fillStyle = color;
    ctx.fillText(text, fx, fy);
    fx += ctx.measureText(text).width;
  };
  if (next?.params.opponent) {
    piece(`${t('gazette.une.next')} : `, footInk);
    piece(String(next.params.opponent), band ? footInk : C.orange, 800);
    const extra = [next.params.location, next.params.inDays].filter(Boolean).map(String).join(' · ');
    if (extra) piece(` · ${extra}`, footInk);
  }
  ctx.font = font(400, 14);
  ctx.fillStyle = footInk === '#FFFFFF' ? 'rgba(255,255,255,0.67)' : 'rgba(15,27,45,0.7)';
  ctx.textAlign = 'right';
  ctx.fillText('FM Immersion', W - M, fy);
  return canvas;
}

/** Résultats récents (du plus récent au plus ancien) d'après les gazettes de cette semaine et des précédentes. */
export function recentForm(issues: GazetteIssue[], from: number, max = 5): Outcome[] {
  const out: Outcome[] = [];
  for (const issue of issues.slice(from)) {
    const results = [issue.headline, ...issue.stories]
      .filter((s) => s.kind === 'result' && (s.params.outcome === 'W' || s.params.outcome === 'D' || s.params.outcome === 'L'))
      .sort((a, b) => String(b.params.date ?? '').localeCompare(String(a.params.date ?? '')));
    for (const r of results) out.push(r.params.outcome as Outcome);
    if (out.length >= max) break;
  }
  return out.slice(0, max);
}

export const canvasPng = (c: HTMLCanvasElement) =>
  new Promise<Uint8Array>((resolve, reject) =>
    c.toBlob(async (b) => (b ? resolve(new Uint8Array(await b.arrayBuffer())) : reject(new Error('image'))), 'image/png'),
  );
