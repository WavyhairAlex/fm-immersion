import { contrast, inkOn, type GazetteIssue, type GazetteStory, type SeasonReview } from '@fm-immersion/module-fm';
import type { TFunction } from 'i18next';
import { clubArt, drawCrest } from './club-look';
import { articleText, headlineText, editorialText, figuresLine, paperName, storyText, weekLabel } from './gazette-text';
import { drawFace, figureTiles, fit, roundRect, streak, wrap, type Outcome } from './gazette-une';

/**
 * Page complète de la gazette en une seule image (1200 de large, hauteur selon le contenu), pour Discord : tout le
 * journal se lit sur l'image, le message n'a plus qu'un court encart. De haut en bas : titre du journal aux couleurs
 * du club, la une (gros titre, score avec logos, buteurs, chiffres, homme du match, forme), puis deux colonnes
 * (à gauche le récit du match et le billet, à droite « En bref » en entier), les chiffres de la saison, et le
 * prochain rendez-vous avec l'adversaire en pied.
 */
const W = 1200;
const M = 48;
const GUTTER = 36;
const SIDE = 360;
const MAIN = W - 2 * M - GUTTER - SIDE;
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
const outcomeColor = (o: Outcome) => (o === 'W' ? C.green : o === 'L' ? C.red : C.grey);

const ICON: Partial<Record<GazetteStory['kind'], string>> = {
  result: '⚽',
  results: '📋',
  streak: '🔁',
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
  cupOut: '💔',
  cupThrough: '🏆',
};

/** Hauteur maximale dessinée avant recadrage (une semaine très chargée reste lisible sans être coupée). */
const MAX_H = 4000;

export async function drawPage(
  t: TFunction,
  issue: GazetteIssue,
  opts: { form: Outcome[]; lang?: string; face?: CanvasImageSource | null; figures?: SeasonReview | null },
): Promise<HTMLCanvasElement> {
  const { lang } = opts;
  await Promise.all([font(900, 76, SERIF), font(800, 50, SERIF), font(400, 19), font(800, 19), `italic ${font(400, 19)}`].map((f) => document.fonts.load(f).catch(() => undefined)));
  const head = issue.headline;
  const isResult = head.kind === 'result';
  const p = head.params;
  const all = [head, ...issue.stories];
  const next = all.find((s) => s.kind === 'nextMatch');
  const [club, opponent, nextArt] = await Promise.all([
    clubArt(issue.club),
    clubArt(isResult ? String(p.opponent ?? '') || null : null),
    clubArt(next ? String(next.params.opponent ?? '') || null : null),
  ]);
  const colors = club?.look?.colors ?? [];
  const band = colors.find((c) => contrast(c, C.paper) >= 1.6) ?? null;
  const stripe = colors.find((c) => c !== band && contrast(c, C.paper) >= 1.6 && contrast(c, band ?? C.paper) >= 1.4) ?? null;
  const accent = band ?? C.orange;
  const caps = (s: string) => s.toLocaleUpperCase(lang);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = MAX_H;
  const ctx = canvas.getContext('2d')!;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, W, MAX_H);
  if (band) {
    ctx.fillStyle = band;
    ctx.fillRect(0, 0, W, 10);
    if (stripe) {
      ctx.fillStyle = stripe;
      ctx.fillRect(0, 10, W, 4);
    }
  }

  // Bandeau : numéro, semaine, compétition.
  const competition = String((isResult && !p.friendly ? p.competition : null) ?? next?.params.competition ?? '');
  ctx.font = font(800, 15);
  ctx.fillStyle = C.grey;
  ctx.textAlign = 'left';
  ctx.fillText(caps(t('gazette.issue', { number: issue.number })), M, 44);
  ctx.textAlign = 'center';
  ctx.fillText(caps(weekLabel(t, lang, issue.weekStart, issue.weekEnd)), W / 2, 44);
  ctx.textAlign = 'right';
  ctx.fillText(caps(competition).slice(0, 40), W - M, 44);

  // Titre du journal, logo du club devant.
  const name = paperName(t, issue.club);
  const crest = club ? 72 : 0;
  const gap = club ? 18 : 0;
  const size = fit(ctx, name, 900, 76, 40, W - 2 * M - 2 * (crest + gap), SERIF);
  const nameW = ctx.measureText(name).width;
  const x0 = (W - (crest + gap + nameW)) / 2;
  if (club) drawCrest(ctx, club, x0 + crest / 2, 62 + size * 0.47, crest, { ring: C.paper });
  ctx.font = font(900, size, SERIF);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.ink;
  ctx.fillText(name, x0 + crest + gap, 62 + size * 0.8);
  ctx.fillStyle = accent;
  ctx.fillRect(M, 141, W - 2 * M, 3);
  ctx.fillStyle = C.ink;
  ctx.fillRect(M, 147, W - 2 * M, 1);
  ctx.fillRect(M, 180, W - 2 * M, 1);
  ctx.font = font(800, 15);
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

  // La une, sur toute la largeur.
  let y = 206;
  const headText = headlineText(t, issue, lang);
  const kicker = isResult
    ? `${t(`gazette.une.kicker_${p.cup === 'out' ? 'cupOut' : p.cup === 'through' ? 'cupThrough' : p.outcome}`)}${p.home == null ? '' : ` ${t(p.home ? 'gazette.une.atHome' : 'gazette.une.away')}`}`
    : t(`gazette.une.section.${head.kind}`, { defaultValue: t('gazette.une.section.default') });
  ctx.font = font(800, 14);
  roundRect(ctx, M, y, ctx.measureText(caps(kicker)).width + 20, 26, 3, isResult ? outcomeColor(p.outcome as Outcome) : C.ink);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(caps(kicker), M + 10, y + 18);
  y += 30;
  let hs = 56;
  let lines: string[] = [];
  for (; hs >= 36; hs -= 4) {
    ctx.font = font(800, hs, SERIF);
    lines = wrap(ctx, headText.title, W - 2 * M, 3);
    if (lines.length <= 2) break;
  }
  ctx.fillStyle = C.ink;
  for (const l of lines) {
    y += hs * 1.04;
    ctx.fillText(l, M, y);
  }
  y += 24;

  if (isResult && p.goalsFor != null && p.goalsAgainst != null) {
    const opp = String(p.opponent ?? t('gazette.opponentUnknown'));
    const [left, right] = p.home === 0 ? [opp, issue.club] : [issue.club, opp];
    const [leftArt, rightArt] = p.home === 0 ? [opponent, club] : [club, opponent];
    const score = p.home === 0 ? `${p.goalsAgainst} – ${p.goalsFor}` : `${p.goalsFor} – ${p.goalsAgainst}`;
    // Bandeau du score sur toute la largeur : logos aux bouts, noms, score au centre.
    const bh = 96;
    roundRect(ctx, M, y, W - 2 * M, bh, 12, C.ink);
    const logo = 64;
    if (leftArt) drawCrest(ctx, leftArt, M + 24 + logo / 2, y + bh / 2, logo, { ring: C.ink });
    if (rightArt) drawCrest(ctx, rightArt, W - M - 24 - logo / 2, y + bh / 2, logo, { ring: C.ink });
    ctx.textBaseline = 'alphabetic';
    ctx.font = font(900, 58, SERIF);
    ctx.fillStyle = C.orange;
    ctx.textAlign = 'center';
    ctx.fillText(score, W / 2, y + 70);
    const sw = ctx.measureText(score).width;
    const room = (W - 2 * M - sw) / 2 - 24 - logo - 20 - 24;
    ctx.fillStyle = '#FFFFFF';
    fit(ctx, caps(left), 800, 26, 14, room, SANS);
    ctx.textAlign = 'left';
    ctx.fillText(caps(left), M + 24 + logo + 20, y + 58);
    fit(ctx, caps(right), 800, 26, 14, room, SANS);
    ctx.textAlign = 'right';
    ctx.fillText(caps(right), W - M - 24 - logo - 20, y + 58);
    ctx.textAlign = 'left';
    y += bh + 34;
    if (p.scorers) {
      ctx.font = font(800, 19);
      ctx.fillStyle = C.ink;
      const label = `${t('gazette.une.scorers')} : `;
      ctx.fillText(label, M, y);
      const lw = ctx.measureText(label).width;
      ctx.font = font(400, 19);
      wrap(ctx, String(p.scorers), W - 2 * M - lw, 2).forEach((l, i) => ctx.fillText(l, M + lw, y + i * 24));
      y += 24 * Math.min(2, wrap(ctx, String(p.scorers), W - 2 * M - lw, 2).length);
    }
    const figures = figuresLine(t, p, lang);
    if (figures) {
      ctx.font = font(700, 17);
      ctx.fillStyle = C.grey;
      ctx.fillText(wrap(ctx, figures, W - 2 * M, 1)[0]!, M, y + 2);
      y += 26;
    }
  } else if (headText.body) {
    ctx.font = font(400, 20);
    ctx.fillStyle = C.ink;
    for (const l of wrap(ctx, headText.body, W - 2 * M, 4)) {
      ctx.fillText(l, M, y);
      y += 28;
    }
  }

  // Homme du match et forme.
  const form = opts.form.slice(0, 5).reverse();
  if ((isResult && p.best) || form.length) {
    y += 10;
    let x = M;
    if (isResult && p.best) {
      ctx.beginPath();
      ctx.arc(x + 34, y + 34, 34, 0, Math.PI * 2);
      ctx.fillStyle = C.orangeLight;
      ctx.fill();
      const r = p.rating == null ? '–' : new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Number(p.rating));
      if (opts.face) {
        drawFace(ctx, opts.face, x + 34, y + 34, 34);
        if (p.rating != null) {
          ctx.font = font(900, 14, SERIF);
          const bw = ctx.measureText(r).width + 14;
          roundRect(ctx, x + 34 - bw / 2, y + 56, bw, 20, 10, C.orangeDark);
          ctx.fillStyle = '#FFFFFF';
          ctx.textAlign = 'center';
          ctx.fillText(r, x + 34, y + 71);
          ctx.textAlign = 'left';
        }
      } else {
        ctx.font = font(900, r.length > 3 ? 20 : 24, SERIF);
        ctx.fillStyle = C.orangeDark;
        ctx.textAlign = 'center';
        ctx.fillText(r, x + 34, y + 42);
        ctx.textAlign = 'left';
      }
      ctx.font = font(800, 13);
      ctx.fillStyle = C.grey;
      ctx.fillText(caps(t('gazette.une.motm')), x + 82, y + 26);
      ctx.font = font(800, 21);
      ctx.fillStyle = C.ink;
      const best = wrap(ctx, String(p.best), 260, 1)[0]!;
      ctx.fillText(best, x + 82, y + 52);
      x += 82 + Math.max(ctx.measureText(best).width, 150) + 60;
    }
    if (form.length) {
      ctx.font = font(800, 13);
      ctx.fillStyle = C.grey;
      ctx.fillText(caps(t('gazette.une.lastMatches', { count: form.length })), x, y + 20);
      form.forEach((o, i) => {
        roundRect(ctx, x + i * 36, y + 30, 30, 30, 4, outcomeColor(o));
        ctx.font = font(900, 16);
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.fillText(t(`gazette.une.letter_${o}`), x + i * 36 + 15, y + 51);
        ctx.textAlign = 'left';
      });
    }
    y += 80;
  }

  // Filet avant les colonnes.
  y += 12;
  ctx.fillStyle = C.ink;
  ctx.fillRect(M, y, W - 2 * M, 1);
  y += 30;
  const top = y;

  // Colonne principale : le récit, puis le billet.
  let ly = top;
  const section = (label: string, x: number, at: number, width: number) => {
    ctx.font = font(800, 24, SERIF);
    ctx.fillStyle = C.ink;
    ctx.fillText(label, x, at);
    roundRect(ctx, x, at + 7, Math.min(width, ctx.measureText(label).width), 3, 0, accent);
    return at + 22;
  };
  const article = articleText(t, issue, lang);
  if (article) {
    ly = section(t('gazette.page.story'), M, ly, MAIN);
    ctx.font = font(400, 19);
    ctx.fillStyle = C.ink;
    for (const l of wrap(ctx, article, MAIN)) {
      ly += 28;
      ctx.fillText(l, M, ly);
    }
    ly += 30;
  }
  const edito = editorialText(t, issue, lang);
  if (edito) {
    // Encadré du billet : fond orange clair, texte en italique, tribunes et direction dessous.
    ctx.font = `italic ${font(400, 19)}`;
    const bodyLines = wrap(ctx, edito.body, MAIN - 40);
    ctx.font = font(400, 17);
    const fansLines = wrap(ctx, `📣 ${edito.fans}`, MAIN - 40);
    const boardLines = wrap(ctx, `🏛️ ${edito.board}`, MAIN - 40);
    const boxH = 24 + 30 + bodyLines.length * 27 + 12 + (fansLines.length + boardLines.length) * 24 + 22;
    ly += 8;
    roundRect(ctx, M, ly, MAIN, boxH, 10, C.orangeLight);
    roundRect(ctx, M, ly, 6, boxH, 0, accent);
    let by = ly + 24 + 18;
    ctx.font = font(800, 22, SERIF);
    ctx.fillStyle = C.ink;
    ctx.fillText(`✍️ ${edito.title}`, M + 22, by);
    by += 8;
    ctx.font = `italic ${font(400, 19)}`;
    for (const l of bodyLines) {
      by += 27;
      ctx.fillText(l, M + 22, by);
    }
    by += 12;
    ctx.font = font(400, 17);
    ctx.fillStyle = C.grey;
    for (const l of [...fansLines, ...boardLines]) {
      by += 24;
      ctx.fillText(l, M + 22, by);
    }
    ly += boxH + 20;
  }

  // Colonne « En bref », en entier.
  const sx = W - M - SIDE;
  let ry = section(t('gazette.une.briefs'), sx, top, SIDE);
  const briefs = [...issue.stories.filter((x) => x.kind === 'result'), ...issue.stories.filter((x) => x.kind !== 'nextMatch' && x.kind !== 'quiet' && x.kind !== 'result')];
  for (const b of briefs) {
    const txt = storyText(t, issue.club, b, lang);
    ry += 16;
    ctx.font = font(800, 17);
    ctx.fillStyle = C.ink;
    for (const l of wrap(ctx, `${(b.kind === 'result' && b.params.cup === 'out' ? ICON.cupOut : b.kind === 'result' && b.params.cup === 'through' ? ICON.cupThrough : ICON[b.kind]) ?? '•'} ${txt.title}`, SIDE, 3)) {
      ry += 23;
      ctx.fillText(l, sx, ry);
    }
    if (txt.body) {
      ctx.font = font(400, 15);
      ctx.fillStyle = C.grey;
      for (const l of wrap(ctx, txt.body, SIDE, 5)) {
        ry += 21;
        ctx.fillText(l, sx, ry);
      }
    }
    ry += 14;
    ctx.strokeStyle = C.dash;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(sx, ry + 0.5);
    ctx.lineTo(W - M, ry + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (!briefs.length) {
    ctx.font = font(400, 15);
    ctx.fillStyle = C.grey;
    ctx.fillText(t('gazette.une.noBriefs'), sx, ry + 34);
    ry += 40;
  }
  // Filet vertical entre les colonnes.
  y = Math.max(ly, ry) + 10;
  ctx.fillStyle = C.ink;
  ctx.fillRect(sx - GUTTER / 2, top - 22, 1, y - top + 12);

  // Les chiffres de la saison, sur toute la largeur.
  const fig = opts.figures;
  if (fig && (fig.played || fig.position != null)) {
    y += 28;
    ctx.font = font(800, 14);
    ctx.fillStyle = C.orangeDark;
    ctx.fillText(caps(t('gazette.une.figures', { season: fig.label })), M, y);
    y += 14;
    const tiles = figureTiles(t, fig);
    const tw = (W - 2 * M - 14 * (tiles.length - 1)) / tiles.length;
    tiles.forEach(([value, label], i) => {
      const tx = M + i * (tw + 14);
      roundRect(ctx, tx, y, tw, 90, 10, '#FFFFFF');
      ctx.fillStyle = i === 0 ? C.orangeDark : C.ink;
      fit(ctx, value, 900, 36, 16, tw - 28, SERIF);
      ctx.fillText(value, tx + 14, y + 48);
      ctx.font = font(700, 14);
      ctx.fillStyle = C.grey;
      ctx.fillText(wrap(ctx, label, tw - 28, 1)[0]!, tx + 14, y + 74);
    });
    y += 90;
  }

  // Prochain rendez-vous : encadré sombre avec l'adversaire.
  if (next) {
    y += 30;
    const nt = storyText(t, issue.club, next, lang);
    const nx = M + 24 + (nextArt ? 80 : 0);
    const nw = W - 2 * M - (nx - M) - 24;
    // Compétition, lieu et date sur une ligne, puis la présentation de l'adversaire.
    const meta = [next.params.competition, next.params.location, next.params.inDays].filter(Boolean).map(String).join(' · ');
    const preview = meta && nt.body.startsWith(meta) ? nt.body.slice(meta.length).trim() : nt.body;
    ctx.font = font(400, 17);
    const body = [...(meta && preview !== nt.body ? [meta] : []), ...wrap(ctx, preview, nw)];
    const boxH = Math.max(110, 30 + 30 + body.length * 24 + 22);
    roundRect(ctx, M, y, W - 2 * M, boxH, 12, C.ink);
    if (nextArt) drawCrest(ctx, nextArt, M + 24 + 30, y + 30 + 30, 60, { ring: C.ink });
    ctx.textBaseline = 'alphabetic';
    ctx.font = font(800, 13);
    ctx.fillStyle = C.orange;
    ctx.fillText(caps(t('gazette.une.next')), nx, y + 30);
    ctx.font = font(800, 22, SERIF);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(wrap(ctx, String(next.params.opponent ?? nt.title), nw, 1)[0]!, nx, y + 58);
    ctx.font = font(400, 17);
    ctx.fillStyle = '#D9DBDF';
    body.forEach((l, i) => {
      ctx.font = i === 0 && meta && l === meta ? font(800, 17) : font(400, 17);
      ctx.fillText(l, nx, y + 86 + i * 24);
    });
    y += boxH;
  }

  // Pied : bandeau aux couleurs du club.
  y += 28;
  const foot = band ?? C.ink;
  const footInk = inkOn(foot);
  ctx.fillStyle = foot;
  ctx.fillRect(0, y, W, 46);
  ctx.font = font(700, 15);
  ctx.fillStyle = footInk;
  ctx.textAlign = 'left';
  ctx.fillText(`${paperName(t, issue.club)} · ${t('gazette.issue', { number: issue.number })}`, M, y + 29);
  ctx.textAlign = 'right';
  ctx.fillText('FM Immersion', W - M, y + 29);
  ctx.textAlign = 'left';
  y += 46;

  const out = document.createElement('canvas');
  out.width = W;
  out.height = Math.min(MAX_H, Math.ceil(y));
  out.getContext('2d')!.drawImage(canvas, 0, 0);
  return out;
}
