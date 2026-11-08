import { contrast, inkOn, type GazetteIssue, type GazetteStory, type SeasonReview } from '@fm-immersion/module-fm';
import type { TFunction } from 'i18next';
import { clubArt, drawCrest, type ClubArt } from './club-look';
import { articleText, headlineText, editorialText, paperName, storyText, weekLabel } from './gazette-text';
import { drawFace, figureTiles, fit, roundRect, streak, wrap, type Outcome } from './gazette-une';

/**
 * Page complète de la gazette en une seule image (1200 de large, hauteur selon le contenu), pour Discord : tout le
 * journal se lit sur l'image, le message n'a plus qu'un court encart. Mise en page de quotidien sportif : manchette
 * avec ses deux « oreilles » (numéro, forme), double filet, la une (gros titre, chapô en italique, portrait de
 * l'homme du match aux couleurs du club), le score sur les couleurs des deux équipes, le match en chiffres en
 * barres, puis deux colonnes (le récit avec lettrine et le billet à gauche, « En bref » avec visages à droite), les
 * chiffres de la saison et le prochain rendez-vous en pied.
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
  light: '#A9ACB2',
  orange: '#F26B1D',
  orangeDark: '#C2410C',
  orangeLight: '#FFE4D3',
  green: '#2E9E5B',
  red: '#D93C3C',
  amber: '#F5B700',
  dash: '#C9C5BA',
};
const SERIF = '"Fraunces Variable", Georgia, serif';
const SANS = '"Nunito Variable", system-ui, sans-serif';
const font = (weight: number, size: number, family = SANS) => `${weight} ${size}px ${family}`;
const italic = (weight: number, size: number) => `italic ${font(weight, size, SERIF)}`;
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

/** Couleur de rubrique d'une brève (pastille et surtitre). */
function briefColor(s: GazetteStory): string {
  if (s.kind === 'result') return s.params.cup === 'out' ? C.red : s.params.cup === 'through' ? C.green : outcomeColor(s.params.outcome as Outcome);
  if (s.kind === 'injury' || s.kind === 'departure') return s.kind === 'injury' ? C.red : C.grey;
  if (s.kind === 'return' || s.kind === 'arrival' || s.kind === 'youthIntake' || s.kind === 'extension') return C.green;
  if (s.kind === 'fans') return C.amber;
  if (s.kind === 'job') return C.ink;
  return C.orangeDark;
}

/** Hauteur maximale dessinée avant recadrage (une semaine très chargée reste lisible sans être coupée). */
const MAX_H = 4200;

/** Ligne justifiée : les espaces sont élargis pour remplir `width` (la dernière ligne d'un paragraphe reste à gauche). */
function justified(ctx: CanvasRenderingContext2D, line: string, x: number, y: number, width: number, last: boolean) {
  const words = line.split(' ');
  if (last || words.length < 2) {
    ctx.fillText(line, x, y);
    return;
  }
  const room = width - words.reduce((n, w) => n + ctx.measureText(w).width, 0);
  const space = room / (words.length - 1);
  if (space > ctx.measureText(' ').width * 3) {
    ctx.fillText(line, x, y);
    return;
  }
  let at = x;
  for (const w of words) {
    ctx.fillText(w, at, y);
    at += ctx.measureText(w).width + space;
  }
}

/** Grain du papier : petits points clairs et sombres, toujours les mêmes pour un numéro donné. */
function grain(ctx: CanvasRenderingContext2D, h: number, seed: number) {
  let a = seed >>> 0 || 1;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < (W * h) / 90; i++) {
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(60,50,30,0.05)' : 'rgba(255,255,255,0.35)';
    ctx.fillRect(rnd() * W, rnd() * h, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
  }
}

/** Couleur principale d'un club assez soutenue pour porter du texte, sinon celle donnée. */
function solid(art: ClubArt | null, fallback: string): string {
  const colors = art?.look?.colors ?? [];
  return colors.find((c) => contrast(c, '#FFFFFF') >= 2.2 || contrast(c, C.ink) >= 6) ?? colors[0] ?? fallback;
}

export async function drawPage(
  t: TFunction,
  issue: GazetteIssue,
  opts: {
    form: Outcome[];
    lang?: string;
    face?: CanvasImageSource | null;
    figures?: SeasonReview | null;
    /** Visage d'un joueur pour les brèves (blessé, recrue…), ou null. */
    faceFor?: (id: string | number) => Promise<CanvasImageSource | null>;
  },
): Promise<HTMLCanvasElement> {
  const { lang } = opts;
  await Promise.all(
    [font(900, 76, SERIF), font(800, 50, SERIF), italic(400, 22), italic(600, 22), font(400, 19), font(800, 19)].map((f) => document.fonts.load(f).catch(() => undefined)),
  );
  const head = issue.headline;
  const isResult = head.kind === 'result';
  const p = head.params;
  const all = [head, ...issue.stories];
  const next = all.find((s) => s.kind === 'nextMatch');
  const briefs = [...issue.stories.filter((x) => x.kind === 'result'), ...issue.stories.filter((x) => x.kind !== 'nextMatch' && x.kind !== 'quiet' && x.kind !== 'result')];
  const [club, opponent, nextArt, faces] = await Promise.all([
    clubArt(issue.club),
    clubArt(isResult ? String(p.opponent ?? '') || null : null),
    clubArt(next ? String(next.params.opponent ?? '') || null : null),
    Promise.all(briefs.map((b) => (opts.faceFor && b.params.id != null ? opts.faceFor(b.params.id).catch(() => null) : Promise.resolve(null)))),
  ]);
  const colors = club?.look?.colors ?? [];
  const band = colors.find((c) => contrast(c, C.paper) >= 1.6) ?? null;
  const stripe = colors.find((c) => c !== band && contrast(c, C.paper) >= 1.6 && contrast(c, band ?? C.paper) >= 1.4) ?? null;
  // Couleur d'accent lisible sur le papier (filets, lettrine, surtitres) : celle du club, sinon l'orange.
  const accent = colors.find((c) => contrast(c, C.paper) >= 3) ?? C.orangeDark;
  const caps = (s: string) => s.toLocaleUpperCase(lang);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = MAX_H;
  const ctx = canvas.getContext('2d')!;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, W, MAX_H);
  grain(ctx, MAX_H, issue.number * 7919 + issue.club.length);
  if (band) {
    ctx.fillStyle = band;
    ctx.fillRect(0, 0, W, 12);
    if (stripe) {
      ctx.fillStyle = stripe;
      ctx.fillRect(0, 12, W, 5);
    }
  }

  /** Bandeau de rubrique : fond anthracite, capitales blanches, carré d'accent. */
  const section = (label: string, x: number, at: number, width: number) => {
    roundRect(ctx, x, at, width, 34, 0, C.ink);
    roundRect(ctx, x, at, 8, 34, 0, accent === C.ink || contrast(accent, C.ink) < 1.5 ? C.orange : accent);
    ctx.font = font(900, 15);
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'left';
    ctx.fillText(caps(label), x + 20, at + 23);
    return at + 34;
  };

  // Manchette : oreille gauche (numéro et semaine), titre du journal au centre, oreille droite (forme).
  const EAR = 196;
  const earTop = 34;
  const earH = 98;
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 1;
  ctx.strokeRect(M + 0.5, earTop + 0.5, EAR, earH);
  ctx.strokeRect(W - M - EAR + 0.5, earTop + 0.5, EAR, earH);
  ctx.textAlign = 'center';
  ctx.font = font(900, 36, SERIF);
  ctx.fillStyle = accent;
  ctx.fillText(t('gazette.issue', { number: issue.number }), M + EAR / 2, earTop + 46);
  ctx.font = font(800, 12);
  ctx.fillStyle = C.grey;
  wrap(ctx, caps(weekLabel(t, lang, issue.weekStart, issue.weekEnd)), EAR - 20, 2).forEach((l, i) => ctx.fillText(l, M + EAR / 2, earTop + 68 + i * 16));
  const ex = W - M - EAR / 2;
  ctx.font = font(800, 12);
  ctx.fillStyle = C.grey;
  ctx.fillText(caps(t('gazette.une.form')), ex, earTop + 22);
  const form = opts.form.slice(0, 5).reverse();
  form.forEach((o, i) => {
    const px = ex - (form.length * 30 - 4) / 2 + i * 30;
    roundRect(ctx, px, earTop + 32, 26, 26, 3, outcomeColor(o));
    ctx.font = font(900, 14);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(t(`gazette.une.letter_${o}`), px + 13, earTop + 50);
  });
  const s = streak(opts.form);
  if (s) {
    ctx.font = font(800, 12);
    ctx.fillStyle = s.outcome === 'L' ? C.red : s.outcome === 'W' ? C.green : C.grey;
    ctx.fillText(wrap(ctx, t(`gazette.une.streak_${s.outcome}`, { count: s.count }), EAR - 16, 1)[0]!, ex, earTop + 80);
  }

  const name = paperName(t, issue.club);
  const crest = club ? 78 : 0;
  const gap = club ? 18 : 0;
  const room = W - 2 * M - 2 * (EAR + 24);
  const size = fit(ctx, name, 900, 70, 34, room - crest - gap, SERIF);
  const nameW = ctx.measureText(name).width;
  const x0 = (W - (crest + gap + nameW)) / 2;
  const mid = earTop + earH / 2;
  if (club) drawCrest(ctx, club, x0 + crest / 2, mid, crest, { ring: C.paper });
  ctx.font = font(900, size, SERIF);
  ctx.textAlign = 'left';
  ctx.fillStyle = C.ink;
  ctx.fillText(name, x0 + crest + gap, mid + size * 0.34);

  // Double filet, puis la ligne de date (compétition, devise, prix).
  let y = earTop + earH + 16;
  ctx.fillStyle = C.ink;
  ctx.fillRect(M, y, W - 2 * M, 4);
  ctx.fillRect(M, y + 8, W - 2 * M, 1);
  const competition = String((isResult && !p.friendly ? p.competition : null) ?? next?.params.competition ?? '');
  ctx.font = font(800, 13);
  ctx.fillStyle = C.ink;
  ctx.fillText(wrap(ctx, caps(competition), 340, 1)[0] ?? '', M, y + 32);
  ctx.textAlign = 'right';
  ctx.fillText(caps(t('gazette.page.price')), W - M, y + 32);
  ctx.textAlign = 'center';
  ctx.font = italic(500, 18);
  ctx.fillText(t('gazette.une.tagline'), W / 2, y + 33);
  ctx.textAlign = 'left';
  ctx.fillRect(M, y + 46, W - 2 * M, 1);
  y += 78;

  // La une : surtitre, gros titre et chapô à gauche, portrait de l'homme du match à droite.
  const headText = headlineText(t, issue, lang);
  const article = articleText(t, issue, lang);
  // Le chapô reprend la première phrase du récit (qui continue ensuite dans la colonne), sinon le texte de la une.
  // Fin de phrase : ponctuation après autre chose qu'un chiffre (« 2. slovenská liga » n'en est pas une), puis majuscule.
  const sentences = article ? article.split(/(?<=[^\d\s][.!?])\s+(?=[\p{Lu}«"])/u).map((x) => x.trim()).filter(Boolean) : [];
  const deck = sentences.length > 1 ? sentences[0]! : !article ? headText.body : '';
  const story = sentences.length > 1 ? sentences.slice(1).join(' ') : article;
  const motm = isResult && p.best;
  const PANEL = motm ? 300 : 0;
  const HERO = W - 2 * M - (motm ? PANEL + 36 : 0);
  const heroTop = y;
  const kicker = isResult
    ? `${t(`gazette.une.kicker_${p.cup === 'out' ? 'cupOut' : p.cup === 'through' ? 'cupThrough' : p.outcome}`)}${p.home == null ? '' : ` ${t(p.home ? 'gazette.une.atHome' : 'gazette.une.away')}`}`
    : t(`gazette.une.section.${head.kind}`, { defaultValue: t('gazette.une.section.default') });
  ctx.font = font(900, 15);
  roundRect(ctx, M, y, ctx.measureText(caps(kicker)).width + 24, 30, 2, isResult ? outcomeColor(p.outcome as Outcome) : C.ink);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(caps(kicker), M + 12, y + 21);
  y += 34;
  let hs = 66;
  let lines: string[] = [];
  for (; hs >= 40; hs -= 4) {
    ctx.font = font(900, hs, SERIF);
    lines = wrap(ctx, headText.title, HERO, 4);
    if (lines.length <= 3) break;
  }
  ctx.fillStyle = C.ink;
  for (const l of lines) {
    y += hs * 1.02;
    ctx.fillText(l, M, y);
  }
  if (deck) {
    y += 16;
    ctx.fillStyle = accent;
    ctx.fillRect(M, y, 64, 4);
    y += 6;
    ctx.font = italic(500, 23);
    ctx.fillStyle = C.ink;
    for (const l of wrap(ctx, deck, HERO, 4)) {
      y += 32;
      ctx.fillText(l, M, y);
    }
  }
  y += 12;
  if (motm) {
    // Portrait sur fond aux couleurs du club, note dans une pastille.
    const panelH = Math.max(y - heroTop, 300);
    const px = W - M - PANEL;
    const bg = solid(club, C.ink);
    const ink = inkOn(bg);
    roundRect(ctx, px, heroTop, PANEL, panelH, 4, bg);
    if (stripe && stripe !== bg) roundRect(ctx, px, heroTop + panelH - 8, PANEL, 8, 0, stripe);
    ctx.textAlign = 'center';
    ctx.font = font(900, 13);
    ctx.fillStyle = ink;
    ctx.fillText(caps(t('gazette.une.motm')), px + PANEL / 2, heroTop + 34);
    const r = 82;
    const cy = heroTop + 54 + r;
    const note = p.rating == null ? null : new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Number(p.rating));
    if (opts.face) {
      ctx.beginPath();
      ctx.arc(px + PANEL / 2, cy, r + 6, 0, Math.PI * 2);
      ctx.fillStyle = ink;
      ctx.fill();
      drawFace(ctx, opts.face, px + PANEL / 2, cy, r);
    } else {
      ctx.beginPath();
      ctx.arc(px + PANEL / 2, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = ink;
      ctx.lineWidth = 3;
      ctx.stroke();
      const initials = String(p.best).split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('');
      ctx.font = font(900, 64, SERIF);
      ctx.fillStyle = ink;
      ctx.fillText(initials, px + PANEL / 2, cy + 22);
    }
    if (note) {
      const bx = px + PANEL / 2 + r * 0.72;
      const by = cy + r * 0.72;
      ctx.beginPath();
      ctx.arc(bx, by, 32, 0, Math.PI * 2);
      ctx.fillStyle = C.orangeDark;
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#FFFFFF';
      ctx.stroke();
      ctx.font = font(900, note.length > 3 ? 20 : 24, SERIF);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(note, bx, by + 8);
    }
    ctx.font = font(900, 26, SERIF);
    ctx.fillStyle = ink;
    const nameLines = wrap(ctx, String(p.best), PANEL - 32, 2);
    nameLines.forEach((l, i) => ctx.fillText(l, px + PANEL / 2, cy + r + 46 + i * 30));
    ctx.textAlign = 'left';
    y = Math.max(y, heroTop + panelH);
  }
  y += 22;

  if (isResult && p.goalsFor != null && p.goalsAgainst != null) {
    // Le score sur les couleurs des deux équipes, coupées en biais, plaque sombre au centre.
    const opp = String(p.opponent ?? t('gazette.opponentUnknown'));
    const usLeft = p.home !== 0;
    const [left, right] = usLeft ? [issue.club, opp] : [opp, issue.club];
    const [leftArt, rightArt] = usLeft ? [club, opponent] : [opponent, club];
    const leftBg = solid(leftArt, usLeft ? C.ink : '#4A4E56');
    let rightBg = solid(rightArt, usLeft ? '#4A4E56' : C.ink);
    if (contrast(leftBg, rightBg) < 1.3) rightBg = contrast(rightBg, '#FFFFFF') > 8 ? '#4A4E56' : C.ink;
    const score = usLeft ? `${p.goalsFor} – ${p.goalsAgainst}` : `${p.goalsAgainst} – ${p.goalsFor}`;
    const bh = 132;
    const x1 = M;
    const x2 = W - M;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x1, y, x2 - x1, bh);
    ctx.clip();
    ctx.fillStyle = leftBg;
    ctx.fillRect(x1, y, W / 2 - x1 + 40, bh);
    ctx.fillStyle = rightBg;
    ctx.beginPath();
    ctx.moveTo(W / 2 + 40, y);
    ctx.lineTo(x2, y);
    ctx.lineTo(x2, y + bh);
    ctx.lineTo(W / 2 - 40, y + bh);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    const plate = 230;
    roundRect(ctx, W / 2 - plate / 2 - 4, y - 14, plate + 8, bh + 28, 8, C.paper);
    roundRect(ctx, W / 2 - plate / 2, y - 10, plate, bh + 20, 6, C.ink);
    roundRect(ctx, W / 2 - plate / 2, y + bh + 4, plate, 6, 0, C.orange);
    ctx.font = font(900, 72, SERIF);
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.fillText(score, W / 2, y + 86);
    ctx.font = font(800, 12);
    ctx.fillStyle = '#C9CCD1';
    ctx.fillText(caps(t('gazette.page.fullTime')), W / 2, y + 114);
    const logo = 84;
    if (leftArt) drawCrest(ctx, leftArt, x1 + 26 + logo / 2, y + bh / 2, logo, { ring: leftBg });
    if (rightArt) drawCrest(ctx, rightArt, x2 - 26 - logo / 2, y + bh / 2, logo, { ring: rightBg });
    const nameRoom = W / 2 - plate / 2 - x1 - 26 - logo - 20 - 16;
    ctx.fillStyle = inkOn(leftBg);
    fit(ctx, caps(left), 900, 28, 13, nameRoom, SANS);
    ctx.textAlign = 'left';
    ctx.fillText(caps(left), x1 + 26 + logo + 20, y + bh / 2 + 10);
    ctx.fillStyle = inkOn(rightBg);
    fit(ctx, caps(right), 900, 28, 13, nameRoom, SANS);
    ctx.textAlign = 'right';
    ctx.fillText(caps(right), x2 - 26 - logo - 20, y + bh / 2 + 10);
    ctx.textAlign = 'left';
    y += bh + 14;
    // Nos buteurs sous notre moitié du bandeau.
    if (p.scorers) {
      ctx.font = font(700, 18);
      ctx.fillStyle = C.ink;
      const txt = wrap(ctx, `⚽ ${p.scorers}`, W / 2 - plate / 2 - M - 8, 2);
      ctx.textAlign = usLeft ? 'left' : 'right';
      txt.forEach((l, i) => ctx.fillText(l, usLeft ? M : W - M, y + 24 + i * 24));
      ctx.textAlign = 'left';
      y += 24 * txt.length;
    }
    y += 22;

    // Le match en chiffres : barres face à face, notre couleur contre celle de l'adversaire.
    const rows: [string, number, number, (v: number) => string][] = [];
    const dec = (v: number) => new Intl.NumberFormat(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
    if (p.possession != null) rows.push([t('gazette.page.stat.possession'), Number(p.possession), p.possessionOpp != null ? Number(p.possessionOpp) : 100 - Number(p.possession), (v) => `${Math.round(v)} %`]);
    if (p.shots != null && p.shotsOpp != null) rows.push([t('gazette.page.stat.shots'), Number(p.shots), Number(p.shotsOpp), (v) => String(v)]);
    if (p.onTarget != null && p.onTargetOpp != null) rows.push([t('gazette.page.stat.onTarget'), Number(p.onTarget), Number(p.onTargetOpp), (v) => String(v)]);
    if (p.xg != null && p.xgOpp != null) rows.push([t('gazette.page.stat.xg'), Number(p.xg), Number(p.xgOpp), dec]);
    if (rows.length) {
      y = section(t('gazette.page.stats'), M, y, W - 2 * M) + 14;
      const cols = rows.length > 1 ? 2 : 1;
      const cw = (W - 2 * M - 48 * (cols - 1)) / cols;
      const usColor = contrast(accent, C.paper) >= 3 ? accent : C.orangeDark;
      rows.forEach(([label, us, them, show], i) => {
        const cx = M + (i % cols) * (cw + 48);
        const ry = y + Math.floor(i / cols) * 62;
        const [lv, rv] = usLeft ? [us, them] : [them, us];
        const [lc, rc] = usLeft ? [usColor, C.light] : [C.light, usColor];
        ctx.font = font(900, 24, SERIF);
        ctx.fillStyle = C.ink;
        ctx.textAlign = 'left';
        ctx.fillText(show(lv), cx, ry + 24);
        ctx.textAlign = 'right';
        ctx.fillText(show(rv), cx + cw, ry + 24);
        ctx.textAlign = 'center';
        ctx.font = font(800, 14);
        ctx.fillStyle = C.grey;
        ctx.fillText(caps(label), cx + cw / 2, ry + 21);
        ctx.textAlign = 'left';
        const total = lv + rv || 1;
        const lw = (cw - 6) * (lv / total);
        roundRect(ctx, cx, ry + 34, Math.max(lw, 4), 12, 6, lc);
        roundRect(ctx, cx + lw + 6, ry + 34, Math.max(cw - 6 - lw, 4), 12, 6, rc);
      });
      y += Math.ceil(rows.length / cols) * 62 + 8;
    }
  } else if (headText.body && deck !== headText.body) {
    ctx.font = font(400, 20);
    ctx.fillStyle = C.ink;
    for (const l of wrap(ctx, headText.body, W - 2 * M, 4)) {
      ctx.fillText(l, M, y);
      y += 28;
    }
  }

  // Deux colonnes.
  y += 18;
  const top = y;
  let ly = top;
  if (story) {
    ly = section(t('gazette.page.story'), M, ly, MAIN) + 16;
    // Lettrine sur trois lignes, puis texte justifié.
    const LH = 29;
    ctx.font = font(900, 92, SERIF);
    const first = story[0]!;
    const capW = ctx.measureText(first).width + 8;
    ctx.fillStyle = accent;
    ctx.fillText(first, M, ly + LH * 3 - 6);
    ctx.font = font(400, 19);
    const rest = story.slice(1);
    const words = rest.split(/\s+/).filter(Boolean);
    const linesOut: [string, number, number][] = [];
    let line = '';
    let width = MAIN - capW;
    let x = M + capW;
    for (const w of words) {
      const nx = line ? `${line} ${w}` : w;
      if (ctx.measureText(nx).width <= width || !line) line = nx;
      else {
        linesOut.push([line, x, width]);
        line = w;
        if (linesOut.length >= 3) {
          width = MAIN;
          x = M;
        }
      }
    }
    if (line) linesOut.push([line, x, width]);
    ctx.fillStyle = C.ink;
    linesOut.forEach(([l, lx, lw], i) => {
      ly += LH;
      justified(ctx, l, lx, ly, lw, i === linesOut.length - 1);
    });
    ly = Math.max(ly, top + 50 + LH * 3) + 30;
  }
  const edito = editorialText(t, issue, lang);
  if (edito) {
    // Le billet : grand guillemet, texte en italique entre deux filets, tribunes et direction en deux cases.
    ly += 6;
    ctx.fillStyle = accent;
    ctx.fillRect(M, ly, MAIN, 3);
    ctx.font = font(900, 110, SERIF);
    ctx.fillText('“', M - 4, ly + 92);
    ctx.font = font(900, 26, SERIF);
    ctx.fillStyle = C.ink;
    ctx.fillText(edito.title, M + 62, ly + 44);
    let by = ly + 44;
    ctx.font = italic(500, 21);
    for (const l of wrap(ctx, edito.body, MAIN - 62)) {
      by += 31;
      justified(ctx, l, M + 62, by, MAIN - 62, false);
    }
    by += 26;
    const half = (MAIN - 18) / 2;
    ctx.font = font(400, 16);
    const fans = wrap(ctx, edito.fans, half - 32);
    const board = wrap(ctx, edito.board, half - 32);
    const boxH = 50 + Math.max(fans.length, board.length) * 22 + 14;
    (
      [
        [t('gazette.une.section.fans'), '📣', fans, M, C.orangeLight],
        [t('gazette.page.board'), '🏛️', board, M + half + 18, '#FFFFFF'],
      ] as const
    ).forEach(([label, icon, body, bx, fill]) => {
      roundRect(ctx, bx, by, half, boxH, 6, fill);
      ctx.font = font(900, 13);
      ctx.fillStyle = C.orangeDark;
      ctx.fillText(`${icon} ${caps(label)}`, bx + 16, by + 28);
      ctx.font = font(400, 16);
      ctx.fillStyle = C.ink;
      body.forEach((l, i) => ctx.fillText(l, bx + 16, by + 54 + i * 22));
    });
    ly = by + boxH + 20;
  }

  // Colonne « En bref » : visage du joueur ou pastille de rubrique, surtitre en couleur, titre, texte.
  const sx = W - M - SIDE;
  let ry = section(t('gazette.une.briefs'), sx, top, SIDE) + 4;
  briefs.forEach((b, i) => {
    const txt = storyText(t, issue.club, b, lang);
    const color = briefColor(b);
    const by = ry + 18;
    const face = faces[i];
    if (face) {
      ctx.beginPath();
      ctx.arc(sx + 26, by + 26, 28, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      drawFace(ctx, face, sx + 26, by + 26, 24);
    } else {
      ctx.beginPath();
      ctx.arc(sx + 26, by + 26, 24, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.font = font(400, 22);
      ctx.textAlign = 'center';
      ctx.fillText((b.kind === 'result' && b.params.cup === 'out' ? ICON.cupOut : b.kind === 'result' && b.params.cup === 'through' ? ICON.cupThrough : ICON[b.kind]) ?? '•', sx + 26, by + 34);
      ctx.textAlign = 'left';
    }
    const tx = sx + 66;
    const tw = SIDE - 66;
    let ty = by + 12;
    ctx.font = font(900, 12);
    ctx.fillStyle = color === C.amber ? '#8A6500' : color;
    ctx.fillText(caps(t(`gazette.une.section.${b.kind}`, { defaultValue: t('gazette.une.section.default') })), tx, ty);
    ctx.font = font(800, 17);
    ctx.fillStyle = C.ink;
    for (const l of wrap(ctx, txt.title, tw, 3)) {
      ty += 22;
      ctx.fillText(l, tx, ty);
    }
    if (txt.body) {
      ctx.font = font(400, 15);
      ctx.fillStyle = C.grey;
      for (const l of wrap(ctx, txt.body, tw, 5)) {
        ty += 20;
        ctx.fillText(l, tx, ty);
      }
    }
    ry = Math.max(ty, by + 56) + 16;
    ctx.fillStyle = C.dash;
    ctx.fillRect(sx, ry, SIDE, 1);
  });
  if (!briefs.length) {
    ctx.font = font(400, 15);
    ctx.fillStyle = C.grey;
    ctx.fillText(t('gazette.une.noBriefs'), sx, ry + 34);
    ry += 40;
  }
  y = Math.max(ly, ry) + 10;
  ctx.fillStyle = C.ink;
  ctx.fillRect(sx - GUTTER / 2, top, 1, y - top);

  // Les chiffres de la saison, sur toute la largeur.
  const fig = opts.figures;
  if (fig && (fig.played || fig.position != null)) {
    y = section(t('gazette.une.figures', { season: fig.label }), M, y + 16, W - 2 * M) + 14;
    const tiles = figureTiles(t, fig);
    const tw = (W - 2 * M - 14 * (tiles.length - 1)) / tiles.length;
    tiles.forEach(([value, label], i) => {
      const tx = M + i * (tw + 14);
      roundRect(ctx, tx, y, tw, 96, 4, '#FFFFFF');
      roundRect(ctx, tx, y, tw, 5, 0, i === 0 ? C.orange : accent);
      ctx.fillStyle = i === 0 ? C.orangeDark : C.ink;
      fit(ctx, value, 900, 42, 16, tw - 28, SERIF);
      ctx.fillText(value, tx + 16, y + 56);
      ctx.font = font(700, 14);
      ctx.fillStyle = C.grey;
      ctx.fillText(wrap(ctx, label, tw - 28, 1)[0]!, tx + 16, y + 82);
    });
    y += 96;
  }

  // Prochain rendez-vous : encadré sombre, les deux logos face à face.
  if (next) {
    y += 28;
    const nt = storyText(t, issue.club, next, lang);
    const duo = club && nextArt;
    const nx = M + 28 + (duo ? 190 : nextArt ? 84 : 0);
    const nw = W - M - 28 - nx;
    const meta = [next.params.competition, next.params.location, next.params.inDays].filter(Boolean).map(String).join(' · ');
    const preview = meta && nt.body.startsWith(meta) ? nt.body.slice(meta.length).trim() : nt.body;
    ctx.font = font(400, 17);
    const body = wrap(ctx, preview, nw);
    const boxH = Math.max(136, 30 + 34 + (meta ? 26 : 0) + body.length * 24 + 26);
    roundRect(ctx, M, y, W - 2 * M, boxH, 4, C.ink);
    roundRect(ctx, M, y, 8, boxH, 0, C.orange);
    const cy = y + boxH / 2;
    if (duo) {
      drawCrest(ctx, club, M + 28 + 36, cy, 68, { ring: C.ink });
      ctx.font = font(900, 20, SERIF);
      ctx.fillStyle = C.orange;
      ctx.textAlign = 'center';
      ctx.fillText(t('gazette.page.vs'), M + 28 + 86, cy + 7);
      ctx.textAlign = 'left';
      drawCrest(ctx, nextArt, M + 28 + 136, cy, 68, { ring: C.ink });
    } else if (nextArt) drawCrest(ctx, nextArt, M + 28 + 34, cy, 64, { ring: C.ink });
    ctx.textBaseline = 'alphabetic';
    let ny = y + 34;
    ctx.font = font(900, 13);
    ctx.fillStyle = C.orange;
    ctx.fillText(caps(t('gazette.une.next')), nx, ny);
    ny += 30;
    ctx.font = font(900, 26, SERIF);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(wrap(ctx, String(next.params.opponent ?? nt.title), nw, 1)[0]!, nx, ny);
    if (meta) {
      ny += 26;
      ctx.font = font(800, 16);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(wrap(ctx, meta, nw, 1)[0]!, nx, ny);
    }
    ctx.font = font(400, 17);
    ctx.fillStyle = '#D9DBDF';
    body.forEach((l) => {
      ny += 24;
      ctx.fillText(l, nx, ny);
    });
    y += boxH;
  }

  // Pied : bandeau aux couleurs du club.
  y += 28;
  const foot = band ?? C.ink;
  const footInk = inkOn(foot);
  ctx.fillStyle = foot;
  ctx.fillRect(0, y, W, 50);
  if (stripe) {
    ctx.fillStyle = stripe;
    ctx.fillRect(0, y, W, 4);
  }
  ctx.font = font(700, 15);
  ctx.fillStyle = footInk;
  ctx.textAlign = 'left';
  ctx.fillText(`${paperName(t, issue.club)} · ${t('gazette.issue', { number: issue.number })}`, M, y + 32);
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
