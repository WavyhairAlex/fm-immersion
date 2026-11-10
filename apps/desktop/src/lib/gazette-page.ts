import { competitionKind, contrast, inkOn, type GazetteIssue, type GazetteStory, type SeasonReview } from '@fm-immersion/module-fm';
import type { TFunction } from 'i18next';
import { clubArt, drawCrest, type ClubArt } from './club-look';
import { articleText, headlineText, editorialText, paperName, storyText, weekLabel } from './gazette-text';
import { drawFace, figureTiles, fit, roundRect, streak, wrap, type Outcome } from './gazette-une';

/**
 * Page complète de la gazette en une seule image **en paysage** (1920 × 960 à 1200), pour Discord : un journal en
 * hauteur devenait une vignette illisible dans le salon, en largeur il occupe tout l'encart. Mise en page de quotidien
 * sportif : manchette avec ses deux « oreilles » (numéro, forme) et double filet sur toute la largeur, puis trois
 * colonnes. À gauche la une (gros titre, chapô, portrait de l'homme du match), le score sur les couleurs des deux
 * équipes, le match en chiffres et les chiffres de la saison ; au centre le récit avec lettrine, « Le chiffre » et le
 * billet ; à droite « En bref » avec visages et le prochain rendez-vous. Une semaine très chargée raccourcit les textes
 * (récit, brèves) plutôt que d'allonger l'image.
 */
const W = 1920;
const M = 44;
const GUTTER = 36;
/** Largeurs des trois colonnes : la une, le récit, les brèves. */
const COL_A = 900;
const COL_B = 520;
const COL_C = W - 2 * M - 2 * GUTTER - COL_A - COL_B;
const XA = M;
const XB = XA + COL_A + GUTTER;
const XC = XB + COL_B + GUTTER;
/** Hauteur de l'image : au moins 2:1 (comme le direct), au plus 16:10 (on raccourcit les textes pour tenir). */
const H_MIN = 960;
const H_MAX = 1200;
const FOOT = 50;
const C = {
  paper: '#F4F1EA',
  ink: '#0F1B2D',
  grey: '#56607A',
  light: '#A9ACB2',
  orange: '#FFB547',
  orangeDark: '#8F5400',
  orangeLight: '#FFEBC7',
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
  coachFuture: '🗞️',
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

/** Hauteur du brouillon (avant recadrage) : de quoi mesurer une colonne trop longue. */
const DRAFT_H = 2600;

/**
 * Longueurs maximales (en lignes, ou en nombre de brèves), de la plus généreuse à la plus serrée. Chaque colonne
 * prend son propre niveau : seule celle qui dépasse `H_MAX` est raccourcie (une semaine chargée en brèves ne coupe
 * pas le récit).
 */
interface Limits {
  deck: number;
  story: number;
  edito: number;
  briefs: number;
  briefTitle: number;
  briefBody: number;
  next: number;
  cups: boolean;
}
const LIMITS: Limits[] = [
  { deck: 3, story: 99, edito: 99, briefs: 99, briefTitle: 3, briefBody: 4, next: 5, cups: true },
  { deck: 3, story: 14, edito: 6, briefs: 99, briefTitle: 2, briefBody: 2, next: 4, cups: true },
  { deck: 2, story: 10, edito: 4, briefs: 8, briefTitle: 2, briefBody: 1, next: 3, cups: true },
  { deck: 2, story: 6, edito: 3, briefs: 6, briefTitle: 2, briefBody: 0, next: 2, cups: false },
];

/** Ligne justifiée : les espaces sont élargis pour remplir `width` (la dernière ligne d'un paragraphe reste à gauche). */
export function justified(ctx: CanvasRenderingContext2D, line: string, x: number, y: number, width: number, last: boolean) {
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
export function grain(ctx: CanvasRenderingContext2D, h: number, seed: number, w = 1200) {
  let a = seed >>> 0 || 1;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < (w * h) / 90; i++) {
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(60,50,30,0.05)' : 'rgba(255,255,255,0.35)';
    ctx.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
  }
}

/** Couleur principale d'un club assez soutenue pour porter du texte, sinon celle donnée. */
export function solid(art: ClubArt | null, fallback: string): string {
  const colors = art?.look?.colors ?? [];
  return colors.find((c) => contrast(c, '#FFFFFF') >= 2.2 || contrast(c, C.ink) >= 6) ?? colors[0] ?? fallback;
}

/** Statistique la plus parlante du match pour l'encadré « Le chiffre » : tirs écrasants, possession nette, sinon xG. */
function keyFigure(t: TFunction, p: GazetteStory['params'], lang?: string): { value: string; label: string } | null {
  const opponent = String(p.opponent ?? t('gazette.opponentUnknown'));
  const shots = p.shots != null ? Number(p.shots) : null;
  const shotsOpp = p.shotsOpp != null ? Number(p.shotsOpp) : null;
  if (shots != null && shotsOpp != null && shots >= 2 * shotsOpp + 3) return { value: String(shots), label: t('gazette.page.figure.shots', { them: shotsOpp, opponent }) };
  if (shots != null && shotsOpp != null && shotsOpp >= 2 * shots + 3) return { value: String(shotsOpp), label: t('gazette.page.figure.shotsAgainst', { us: shots, opponent }) };
  const poss = p.possession != null ? Math.round(Number(p.possession)) : null;
  if (poss != null && (poss >= 60 || poss <= 40)) return { value: `${poss} %`, label: t('gazette.page.figure.possession') };
  if (p.xg != null && p.xgOpp != null) {
    const dec = (v: unknown) => new Intl.NumberFormat(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v));
    return { value: dec(p.xg), label: t('gazette.page.figure.xg', { them: dec(p.xgOpp), opponent }) };
  }
  return null;
}

/** Coupe les lignes à `max` ; la dernière gardée finit par « … » quand on a coupé. */
function cap(ctx: CanvasRenderingContext2D, lines: string[], max: number, width: number): string[] {
  if (lines.length <= max) return lines;
  const kept = lines.slice(0, Math.max(0, max));
  if (!kept.length) return kept;
  let last = kept[kept.length - 1]!;
  while (last && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1);
  kept[kept.length - 1] = `${last.trimEnd()}…`;
  return kept;
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
  await Promise.all(
    [font(900, 76, SERIF), font(800, 50, SERIF), italic(400, 22), italic(600, 22), font(400, 19), font(800, 19)].map((f) => document.fonts.load(f).catch(() => undefined)),
  );
  const head = issue.headline;
  const isResult = head.kind === 'result';
  const p = head.params;
  const all = [head, ...issue.stories];
  const next = all.find((s) => s.kind === 'nextMatch') ?? null;
  const briefs = [...issue.stories.filter((x) => x.kind === 'result'), ...issue.stories.filter((x) => x.kind !== 'nextMatch' && x.kind !== 'quiet' && x.kind !== 'result')];
  const [club, opponent, nextArt, faces] = await Promise.all([
    clubArt(issue.club),
    clubArt(isResult ? String(p.opponent ?? '') || null : null),
    clubArt(next ? String(next.params.opponent ?? '') || null : null),
    Promise.all(briefs.map((b) => (opts.faceFor && b.params.id != null ? opts.faceFor(b.params.id).catch(() => null) : Promise.resolve(null)))),
  ]);
  const art = { club, opponent, nextArt, faces, briefs, next };
  // Niveau de chaque colonne (une, récit, brèves) : on resserre seulement celles qui dépassent.
  const level = [0, 0, 0];
  const last = LIMITS.length - 1;
  for (;;) {
    const lim: Limits = {
      deck: LIMITS[level[0]!]!.deck,
      cups: LIMITS[level[0]!]!.cups,
      story: LIMITS[level[1]!]!.story,
      edito: LIMITS[level[1]!]!.edito,
      briefs: LIMITS[level[2]!]!.briefs,
      briefTitle: LIMITS[level[2]!]!.briefTitle,
      briefBody: LIMITS[level[2]!]!.briefBody,
      next: LIMITS[level[2]!]!.next,
    };
    const { canvas, ends } = paint(t, issue, opts, art, lim);
    const over = ends.map((e, i) => e + 24 + FOOT > H_MAX && level[i]! < last);
    if (!over.some(Boolean)) return canvas;
    over.forEach((o, i) => o && level[i]!++);
  }
}

function paint(
  t: TFunction,
  issue: GazetteIssue,
  opts: { form: Outcome[]; lang?: string; face?: CanvasImageSource | null; figures?: SeasonReview | null },
  art: { club: ClubArt | null; opponent: ClubArt | null; nextArt: ClubArt | null; faces: (CanvasImageSource | null)[]; briefs: GazetteStory[]; next: GazetteStory | null },
  lim: Limits,
): { canvas: HTMLCanvasElement; ends: [number, number, number] } {
  const { lang } = opts;
  const { club, opponent, nextArt, faces, next } = art;
  const head = issue.headline;
  const isResult = head.kind === 'result';
  const p = head.params;
  const colors = club?.look?.colors ?? [];
  const band = colors.find((c) => contrast(c, C.paper) >= 1.6) ?? null;
  const stripe = colors.find((c) => c !== band && contrast(c, C.paper) >= 1.6 && contrast(c, band ?? C.paper) >= 1.4) ?? null;
  // Couleur d'accent lisible sur le papier (filets, lettrine, surtitres) : celle du club, sinon l'ambre foncé.
  const accent = colors.find((c) => contrast(c, C.paper) >= 3) ?? C.orangeDark;
  const caps = (s: string) => s.toLocaleUpperCase(lang);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = DRAFT_H;
  const ctx = canvas.getContext('2d')!;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, W, DRAFT_H);
  grain(ctx, DRAFT_H, issue.number * 7919 + issue.club.length, W);
  if (band) {
    ctx.fillStyle = band;
    ctx.fillRect(0, 0, W, 12);
    if (stripe) {
      ctx.fillStyle = stripe;
      ctx.fillRect(0, 12, W, 5);
    }
  }

  /** Bandeau de rubrique : fond bleu nuit, capitales blanches, carré d'accent. */
  const section = (label: string, x: number, at: number, width: number) => {
    roundRect(ctx, x, at, width, 34, 0, C.ink);
    roundRect(ctx, x, at, 8, 34, 0, accent === C.ink || contrast(accent, C.ink) < 1.5 ? C.orange : accent);
    ctx.font = font(900, 15);
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'left';
    ctx.fillText(caps(wrap(ctx, label, width - 36, 1)[0] ?? ''), x + 20, at + 23);
    return at + 34;
  };

  // Manchette : oreille gauche (numéro et semaine), titre du journal au centre, oreille droite (forme).
  const EAR = 230;
  const earTop = 30;
  const earH = 92;
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 1;
  ctx.strokeRect(M + 0.5, earTop + 0.5, EAR, earH);
  ctx.strokeRect(W - M - EAR + 0.5, earTop + 0.5, EAR, earH);
  ctx.textAlign = 'center';
  ctx.font = font(900, 36, SERIF);
  ctx.fillStyle = accent;
  ctx.fillText(t('gazette.issue', { number: issue.number }), M + EAR / 2, earTop + 44);
  ctx.font = font(800, 13);
  ctx.fillStyle = C.grey;
  wrap(ctx, caps(weekLabel(t, lang, issue.weekStart, issue.weekEnd)), EAR - 20, 2).forEach((l, i) => ctx.fillText(l, M + EAR / 2, earTop + 66 + i * 16));
  const ex = W - M - EAR / 2;
  ctx.font = font(800, 13);
  ctx.fillStyle = C.grey;
  ctx.fillText(caps(t('gazette.une.form')), ex, earTop + 22);
  const form = opts.form.slice(0, 5).reverse();
  form.forEach((o, i) => {
    const px = ex - (form.length * 32 - 4) / 2 + i * 32;
    roundRect(ctx, px, earTop + 32, 28, 28, 3, outcomeColor(o));
    ctx.font = font(900, 15);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(t(`gazette.une.letter_${o}`), px + 14, earTop + 51);
  });
  const s = streak(opts.form);
  if (s) {
    ctx.font = font(800, 13);
    ctx.fillStyle = s.outcome === 'L' ? C.red : s.outcome === 'W' ? C.green : C.grey;
    ctx.fillText(wrap(ctx, t(`gazette.une.streak_${s.outcome}`, { count: s.count }), EAR - 16, 1)[0]!, ex, earTop + 80);
  }

  const name = paperName(t, issue.club);
  const crest = club ? 80 : 0;
  const gap = club ? 20 : 0;
  const room = W - 2 * M - 2 * (EAR + 32);
  const size = fit(ctx, name, 900, 76, 34, room - crest - gap, SERIF);
  const nameW = ctx.measureText(name).width;
  const x0 = (W - (crest + gap + nameW)) / 2;
  const mid = earTop + earH / 2;
  if (club) drawCrest(ctx, club, x0 + crest / 2, mid, crest, { ring: C.paper });
  ctx.font = font(900, size, SERIF);
  ctx.textAlign = 'left';
  ctx.fillStyle = C.ink;
  ctx.fillText(name, x0 + crest + gap, mid + size * 0.34);

  // Double filet, puis la ligne de date (compétition, devise, prix).
  let y = earTop + earH + 14;
  ctx.fillStyle = C.ink;
  ctx.fillRect(M, y, W - 2 * M, 4);
  ctx.fillRect(M, y + 8, W - 2 * M, 1);
  const competition = String((isResult && !p.friendly ? p.competition : null) ?? next?.params.competition ?? '');
  ctx.font = font(800, 14);
  ctx.fillStyle = C.ink;
  ctx.fillText(wrap(ctx, caps(competition), 520, 1)[0] ?? '', M, y + 31);
  ctx.textAlign = 'right';
  ctx.fillText(caps(t('gazette.page.price')), W - M, y + 31);
  ctx.textAlign = 'center';
  ctx.font = italic(500, 19);
  ctx.fillText(t('gazette.une.tagline'), W / 2, y + 32);
  ctx.textAlign = 'left';
  ctx.fillRect(M, y + 44, W - 2 * M, 1);
  const top = y + 66;

  // ───────────── Colonne A : la une, le score, le match en chiffres, la saison ─────────────
  y = top;
  const headText = headlineText(t, issue, lang);
  const article = articleText(t, issue, lang);
  // Le chapô reprend la première phrase du récit (qui continue ensuite dans la colonne du milieu), sinon le texte de la une.
  // Fin de phrase : ponctuation après autre chose qu'un chiffre (« 2. slovenská liga » n'en est pas une), puis majuscule.
  const sentences = article ? article.split(/(?<=[^\d\s][.!?])\s+(?=[\p{Lu}«"])/u).map((x) => x.trim()).filter(Boolean) : [];
  const deck = sentences.length > 1 ? sentences[0]! : !article ? headText.body : '';
  const story = sentences.length > 1 ? sentences.slice(1).join(' ') : article;
  const motm = isResult && p.best;
  const PANEL = motm ? 300 : 0;
  const HERO = COL_A - (motm ? PANEL + 28 : 0);
  const heroTop = y;
  // Filigrane : le logo du club (s'il est dans le pack de logos) en très grand, à peine visible, derrière le titre.
  if (club?.logo) {
    ctx.save();
    ctx.globalAlpha = 0.07;
    drawCrest(ctx, club, XA + HERO - 140, heroTop + 170, 280, { ring: C.paper });
    ctx.restore();
  }
  const kicker = isResult
    ? `${t(`gazette.une.kicker_${p.cup === 'out' ? 'cupOut' : p.cup === 'through' ? 'cupThrough' : p.outcome}`)}${p.home == null ? '' : ` ${t(p.home ? 'gazette.une.atHome' : 'gazette.une.away')}`}`
    : t(`gazette.une.section.${head.kind}`, { defaultValue: t('gazette.une.section.default') });
  ctx.font = font(900, 16);
  roundRect(ctx, XA, y, ctx.measureText(caps(kicker)).width + 26, 32, 2, isResult ? outcomeColor(p.outcome as Outcome) : C.ink);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(caps(kicker), XA + 13, y + 22);
  y += 36;
  let hs = 72;
  let lines: string[] = [];
  for (; hs >= 44; hs -= 4) {
    ctx.font = font(900, hs, SERIF);
    lines = wrap(ctx, headText.title, HERO, 4);
    if (lines.length <= 3) break;
  }
  ctx.fillStyle = C.ink;
  for (const l of lines) {
    y += hs * 1.02;
    ctx.fillText(l, XA, y);
  }
  if (deck) {
    y += 16;
    ctx.fillStyle = accent;
    ctx.fillRect(XA, y, 64, 4);
    y += 6;
    ctx.font = italic(500, 23);
    ctx.fillStyle = C.ink;
    for (const l of wrap(ctx, deck, HERO, lim.deck)) {
      y += 32;
      ctx.fillText(l, XA, y);
    }
  }
  y += 12;
  if (motm) {
    // Portrait en couverture de magazine : photo pleine largeur sur trame de points aux couleurs du club, nom en
    // grand dessous, note dans une grosse pastille.
    const panelH = Math.max(y - heroTop, 360);
    const px = XA + COL_A - PANEL;
    const bg = solid(club, C.ink);
    const ink = inkOn(bg);
    roundRect(ctx, px, heroTop, PANEL, panelH, 4, bg);
    ctx.save();
    ctx.beginPath();
    ctx.rect(px, heroTop, PANEL, panelH);
    ctx.clip();
    // Trame d'imprimerie : points qui grossissent vers le bas.
    ctx.fillStyle = ink === '#FFFFFF' ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';
    for (let gy = heroTop + 6; gy < heroTop + panelH; gy += 9) {
      const rr = 0.6 + ((gy - heroTop) / panelH) * 2.6;
      for (let gx = px + ((gy / 9) % 2 ? 4.5 : 0); gx < px + PANEL; gx += 9) {
        ctx.beginPath();
        ctx.arc(gx, gy, rr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const photoH = 262;
    if (opts.face) {
      const fw = Number((opts.face as { width?: number }).width) || 1;
      const fh = Number((opts.face as { height?: number }).height) || 1;
      const side = Math.min(fw, fh);
      ctx.drawImage(opts.face, (fw - side) / 2, 0, side, side, px, heroTop, PANEL, photoH);
      // Fondu du bas de la photo vers la couleur du club.
      const g = ctx.createLinearGradient(0, heroTop + photoH * 0.55, 0, heroTop + photoH);
      g.addColorStop(0, `${bg}00`);
      g.addColorStop(1, bg);
      ctx.fillStyle = g;
      ctx.fillRect(px, heroTop + photoH * 0.55, PANEL, photoH * 0.45 + 1);
    } else {
      const initials = String(p.best).split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('');
      ctx.font = font(900, 150, SERIF);
      ctx.fillStyle = ink;
      ctx.globalAlpha = 0.9;
      ctx.textAlign = 'center';
      ctx.fillText(initials, px + PANEL / 2, heroTop + 190);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    // Bandeau « Homme du match » en haut à gauche de la photo.
    ctx.font = font(900, 14);
    const tag = caps(t('gazette.une.motm'));
    roundRect(ctx, px, heroTop + 16, ctx.measureText(tag).width + 28, 30, 0, C.orange);
    ctx.fillStyle = C.ink;
    ctx.textAlign = 'left';
    ctx.fillText(tag, px + 14, heroTop + 36);
    const note = p.rating == null ? null : new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Number(p.rating));
    ctx.textAlign = 'center';
    if (note) {
      const bx = px + PANEL - 52;
      const by = heroTop + photoH - 34;
      ctx.beginPath();
      ctx.arc(bx, by, 40, 0, Math.PI * 2);
      ctx.fillStyle = C.orangeDark;
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#FFFFFF';
      ctx.stroke();
      ctx.font = font(900, note.length > 3 ? 24 : 30, SERIF);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(note, bx, by + 11);
    }
    // Nom : prénom en petit, nom de famille en très grand.
    const parts = String(p.best).trim().split(/\s+/);
    const last = parts.length > 1 ? parts.slice(1).join(' ') : parts[0]!;
    const first = parts.length > 1 ? parts[0]! : '';
    ctx.textAlign = 'left';
    let ny = heroTop + photoH + 24;
    if (first) {
      ctx.font = font(800, 19);
      ctx.fillStyle = ink;
      ctx.fillText(caps(first), px + 20, ny);
    }
    const ls = fit(ctx, caps(last), 900, 46, 22, PANEL - 40, SERIF);
    ny += ls * 0.95 + 4;
    ctx.fillStyle = ink;
    ctx.fillText(caps(last), px + 20, ny);
    if (stripe && stripe !== bg) roundRect(ctx, px, heroTop + panelH - 8, PANEL, 8, 0, stripe);
    // Tampon du classement quand le club a bougé : « 4e », « +3 places », penché comme un coup de tampon.
    const move = issue.stories.find((x) => x.kind === 'position');
    const from = Number(move?.params.from);
    const to = Number(move?.params.to);
    if (move && from > 0 && to > 0 && from !== to) {
      const up = to < from;
      ctx.save();
      ctx.translate(px + PANEL - 58, heroTop + 80);
      ctx.rotate(-0.2);
      ctx.beginPath();
      ctx.arc(0, 0, 50, 0, Math.PI * 2);
      ctx.fillStyle = up ? C.green : C.red;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(0, 0, 44, 0, Math.PI * 2);
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#FFFFFF';
      const rank = t(`season.ordinal${to <= 3 ? to : ''}`, { n: to });
      fit(ctx, rank, 900, 34, 18, 72, SERIF);
      ctx.fillText(rank, 0, 6);
      ctx.font = font(900, 11);
      ctx.fillText(caps(t(up ? 'gazette.page.stampUp' : 'gazette.page.stampDown', { count: Math.abs(from - to) })), 0, 26);
      ctx.restore();
    }
    ctx.textAlign = 'left';
    y = Math.max(y, heroTop + panelH);
  }
  y += 24;

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
    const bh = 108;
    const x1 = XA;
    const x2 = XA + COL_A;
    const cx = XA + COL_A / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x1, y, x2 - x1, bh);
    ctx.clip();
    ctx.fillStyle = leftBg;
    ctx.fillRect(x1, y, cx - x1 + 36, bh);
    ctx.fillStyle = rightBg;
    ctx.beginPath();
    ctx.moveTo(cx + 36, y);
    ctx.lineTo(x2, y);
    ctx.lineTo(x2, y + bh);
    ctx.lineTo(cx - 36, y + bh);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    const plate = 210;
    roundRect(ctx, cx - plate / 2 - 4, y - 12, plate + 8, bh + 24, 8, C.paper);
    roundRect(ctx, cx - plate / 2, y - 8, plate, bh + 16, 6, C.ink);
    roundRect(ctx, cx - plate / 2, y + bh + 2, plate, 6, 0, C.orange);
    ctx.font = font(900, 68, SERIF);
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.fillText(score, cx, y + 72);
    ctx.font = font(800, 12);
    ctx.fillStyle = '#C9CCD1';
    ctx.fillText(caps(t('gazette.page.fullTime')), cx, y + 97);
    const logo = 70;
    if (leftArt) drawCrest(ctx, leftArt, x1 + 22 + logo / 2, y + bh / 2, logo, { ring: leftBg });
    if (rightArt) drawCrest(ctx, rightArt, x2 - 22 - logo / 2, y + bh / 2, logo, { ring: rightBg });
    const nameRoom = cx - plate / 2 - x1 - 22 - (leftArt || rightArt ? logo + 16 : 0) - 14;
    const lx = x1 + 22 + (leftArt ? logo + 16 : 0);
    const rx = x2 - 22 - (rightArt ? logo + 16 : 0);
    ctx.fillStyle = inkOn(leftBg);
    fit(ctx, caps(left), 900, 28, 13, nameRoom, SANS);
    ctx.textAlign = 'left';
    ctx.fillText(caps(left), lx, y + bh / 2 + 10);
    ctx.fillStyle = inkOn(rightBg);
    fit(ctx, caps(right), 900, 28, 13, nameRoom, SANS);
    ctx.textAlign = 'right';
    ctx.fillText(caps(right), rx, y + bh / 2 + 10);
    ctx.textAlign = 'left';
    y += bh + 12;
    // Nos buteurs sous notre moitié du bandeau.
    if (p.scorers) {
      ctx.font = font(700, 18);
      ctx.fillStyle = C.ink;
      const txt = wrap(ctx, `⚽ ${p.scorers}`, COL_A / 2 - plate / 2 - 8, 2);
      ctx.textAlign = usLeft ? 'left' : 'right';
      txt.forEach((l, i) => ctx.fillText(l, usLeft ? x1 : x2, y + 24 + i * 24));
      ctx.textAlign = 'left';
      y += 24 * txt.length;
    }
    y += 22;

    // Le match en chiffres : barres face à face sur une seule rangée, notre couleur contre celle de l'adversaire.
    const rows: [string, number, number, (v: number) => string][] = [];
    const dec = (v: number) => new Intl.NumberFormat(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
    if (p.possession != null) rows.push([t('gazette.page.stat.possession'), Number(p.possession), p.possessionOpp != null ? Number(p.possessionOpp) : 100 - Number(p.possession), (v) => `${Math.round(v)} %`]);
    if (p.shots != null && p.shotsOpp != null) rows.push([t('gazette.page.stat.shots'), Number(p.shots), Number(p.shotsOpp), (v) => String(v)]);
    if (p.onTarget != null && p.onTargetOpp != null) rows.push([t('gazette.page.stat.onTarget'), Number(p.onTarget), Number(p.onTargetOpp), (v) => String(v)]);
    if (p.xg != null && p.xgOpp != null) rows.push([t('gazette.page.stat.xg'), Number(p.xg), Number(p.xgOpp), dec]);
    if (rows.length) {
      y = section(t('gazette.page.stats'), XA, y, COL_A) + 12;
      const cols = rows.length;
      const cw = (COL_A - 32 * (cols - 1)) / cols;
      const usColor = contrast(accent, C.paper) >= 3 ? accent : C.orangeDark;
      rows.forEach(([label, us, them, show], i) => {
        const cx = XA + i * (cw + 32);
        const [lv, rv] = usLeft ? [us, them] : [them, us];
        const [lc, rc] = usLeft ? [usColor, C.light] : [C.light, usColor];
        ctx.textAlign = 'center';
        ctx.font = font(800, 14);
        ctx.fillStyle = C.grey;
        ctx.fillText(caps(wrap(ctx, label, cw, 1)[0]!), cx + cw / 2, y + 18);
        ctx.font = font(900, 26, SERIF);
        ctx.fillStyle = C.ink;
        ctx.textAlign = 'left';
        ctx.fillText(show(lv), cx, y + 50);
        ctx.textAlign = 'right';
        ctx.fillText(show(rv), cx + cw, y + 50);
        ctx.textAlign = 'left';
        const total = lv + rv || 1;
        const lw = (cw - 6) * (lv / total);
        roundRect(ctx, cx, y + 60, Math.max(lw, 4), 12, 6, lc);
        roundRect(ctx, cx + lw + 6, y + 60, Math.max(cw - 6 - lw, 4), 12, 6, rc);
      });
      y += 72 + 8;
    }
  } else if (headText.body && deck !== headText.body) {
    ctx.font = font(400, 20);
    ctx.fillStyle = C.ink;
    for (const l of wrap(ctx, headText.body, COL_A, 4)) {
      ctx.fillText(l, XA, y);
      y += 28;
    }
  }

  // Les chiffres de la saison, en pied de la colonne de la une.
  const fig = opts.figures;
  if (fig && (fig.played || fig.position != null)) {
    y = section(t('gazette.une.figures', { season: fig.label }), XA, y + 14, COL_A) + 12;
    // Un encadré par compétition : d'abord le championnat (place, bilan, buts, buteur), puis chaque coupe engagée.
    const leagueName =
      [head, ...issue.stories].map((x) => (x.kind === 'result' || x.kind === 'nextMatch' ? x.params.competition : null)).find((c) => c && competitionKind(String(c)) === 'league') ??
      t('gazette.page.league');
    ctx.font = font(900, 14);
    ctx.fillStyle = C.ink;
    ctx.fillText(`🏟️ ${caps(String(leagueName))}`, XA, y + 14);
    y += 24;
    const tiles = figureTiles(t, fig);
    const tw = (COL_A - 14 * (tiles.length - 1)) / tiles.length;
    tiles.forEach(([value, label], i) => {
      const tx = XA + i * (tw + 14);
      roundRect(ctx, tx, y, tw, 90, 4, '#FFFFFF');
      roundRect(ctx, tx, y, tw, 5, 0, i === 0 ? C.orange : accent);
      ctx.fillStyle = i === 0 ? C.orangeDark : C.ink;
      fit(ctx, value, 900, 40, 16, tw - 28, SERIF);
      ctx.fillText(value, tx + 16, y + 52);
      ctx.fillStyle = C.grey;
      fit(ctx, label, 700, 14, 12, tw - 28, SANS);
      ctx.fillText(wrap(ctx, label, tw - 28, 1)[0]!, tx + 16, y + 77);
    });
    y += 90;
    const cups = lim.cups ? (fig.cups ?? []) : [];
    if (cups.length) {
      // Coupes en cartes basses : compétition en petit, puis l'état et le bilan sur une ligne.
      y += 12;
      const per = Math.min(3, cups.length);
      const cw = (COL_A - 14 * (per - 1)) / per;
      cups.forEach((c, i) => {
        const cx = XA + (i % per) * (cw + 14);
        const cy = y + Math.floor(i / per) * 72;
        const color = c.status === 'won' ? C.green : c.status === 'out' ? C.red : C.orangeDark;
        roundRect(ctx, cx, cy, cw, 62, 4, '#FFFFFF');
        roundRect(ctx, cx, cy, 6, 62, 0, color);
        ctx.font = font(900, 12);
        ctx.fillStyle = C.grey;
        ctx.fillText(`${c.kind === 'europe' ? '🌍' : '🏆'} ${caps(wrap(ctx, c.competition, cw - 40, 1)[0]!)}`, cx + 20, cy + 22);
        const status = t(`gazette.page.cup.${c.status}`, { opponent: c.outBy?.opponent ?? '?', count: c.ties.length });
        ctx.font = font(900, 19, SERIF);
        const sw = Math.min(ctx.measureText(status).width, cw - 140);
        // Bilan avec sa légende (« V-N-D 2-0-0 · 2 tours joués ») s'il tient, sinon les chiffres seuls.
        ctx.font = font(800, 14);
        const full = t('gazette.page.cup.line', { record: `${c.wins}-${c.draws}-${c.losses}`, count: c.ties.length });
        const record = ctx.measureText(full).width <= cw - 56 - sw ? full : `${c.wins}-${c.draws}-${c.losses}`;
        const rw = ctx.measureText(record).width;
        ctx.textAlign = 'right';
        ctx.fillText(record, cx + cw - 16, cy + 48);
        ctx.textAlign = 'left';
        ctx.font = font(900, 19, SERIF);
        ctx.fillStyle = color;
        ctx.fillText(wrap(ctx, status, cw - 56 - rw, 1)[0]!, cx + 20, cy + 49);
      });
      y += Math.ceil(cups.length / per) * 72 - 10;
    }
  }
  const endA = y;

  // ───────────── Colonne B : le récit, « Le chiffre », le billet ─────────────
  let ly = top;
  if (story) {
    ly = section(t('gazette.page.story'), XB, ly, COL_B) + 16;
    // Lettrine sur trois lignes, puis texte justifié.
    const LH = 29;
    ctx.font = font(900, 92, SERIF);
    const first = story[0]!;
    const capW = ctx.measureText(first).width + 8;
    ctx.fillStyle = accent;
    ctx.fillText(first, XB, ly + LH * 3 - 6);
    ctx.font = font(400, 19);
    const words = story.slice(1).split(/\s+/).filter(Boolean);
    let linesOut: [string, number, number][] = [];
    let line = '';
    let width = COL_B - capW;
    let x = XB + capW;
    for (const w of words) {
      const nx = line ? `${line} ${w}` : w;
      if (ctx.measureText(nx).width <= width || !line) line = nx;
      else {
        linesOut.push([line, x, width]);
        line = w;
        if (linesOut.length >= 3) {
          width = COL_B;
          x = XB;
        }
      }
    }
    if (line) linesOut.push([line, x, width]);
    const cut = linesOut.length > Math.max(lim.story, 3);
    if (cut) {
      linesOut = linesOut.slice(0, Math.max(lim.story, 3));
      const [l, lx, lw] = linesOut[linesOut.length - 1]!;
      linesOut[linesOut.length - 1] = [cap(ctx, [l, ''], 1, lw)[0]!, lx, lw];
    }
    ctx.fillStyle = C.ink;
    linesOut.forEach(([l, lx, lw], i) => {
      ly += LH;
      justified(ctx, l, lx, ly, lw, i === linesOut.length - 1);
    });
    ly = Math.max(ly, top + 50 + LH * 3) + 28;
  }
  // « Le chiffre » : la statistique la plus parlante du match, en très grand.
  const big = isResult ? keyFigure(t, p, lang) : null;
  if (big) {
    roundRect(ctx, XB, ly, COL_B, 112, 4, '#FFFFFF');
    roundRect(ctx, XB, ly, 8, 112, 0, C.orange);
    ctx.font = font(900, 13);
    ctx.fillStyle = C.orangeDark;
    ctx.fillText(caps(t('gazette.page.keyFigure')), XB + 28, ly + 30);
    const vs = fit(ctx, big.value, 900, 60, 30, 170, SERIF);
    ctx.fillStyle = C.ink;
    ctx.fillText(big.value, XB + 28, ly + 30 + vs * 0.95);
    const vw = ctx.measureText(big.value).width;
    ctx.font = font(700, 18);
    ctx.fillStyle = C.grey;
    const bl = wrap(ctx, big.label, COL_B - vw - 76, 3);
    bl.forEach((l, i) => ctx.fillText(l, XB + 28 + vw + 24, ly + 66 - (bl.length - 1) * 12 + i * 24));
    ly += 112 + 24;
  }
  const edito = editorialText(t, issue, lang);
  if (edito) {
    // Le billet : grand guillemet, texte en italique, tribunes et direction en deux cases l'une sous l'autre.
    ctx.fillStyle = accent;
    ctx.fillRect(XB, ly, COL_B, 3);
    ctx.font = font(900, 100, SERIF);
    ctx.fillText('“', XB - 4, ly + 86);
    ctx.font = font(900, 25, SERIF);
    ctx.fillStyle = C.ink;
    ctx.fillText(wrap(ctx, edito.title, COL_B - 58, 1)[0] ?? '', XB + 58, ly + 42);
    let by = ly + 42;
    ctx.font = italic(500, 20);
    const eb = wrap(ctx, edito.body, COL_B - 58, lim.edito);
    eb.forEach((l, i) => {
      by += 29;
      justified(ctx, l, XB + 58, by, COL_B - 58, i === eb.length - 1);
    });
    by += 22;
    (
      [
        [t('gazette.une.section.fans'), '📣', edito.fans, C.orangeLight],
        [t('gazette.page.board'), '🏛️', edito.board, '#FFFFFF'],
      ] as const
    ).forEach(([label, icon, text, fill]) => {
      ctx.font = font(400, 16);
      const body = wrap(ctx, text, COL_B - 32, Math.max(2, Math.min(4, lim.edito)));
      const boxH = 44 + body.length * 22 + 8;
      roundRect(ctx, XB, by, COL_B, boxH, 6, fill);
      ctx.font = font(900, 13);
      ctx.fillStyle = C.orangeDark;
      ctx.fillText(`${icon} ${caps(label)}`, XB + 16, by + 26);
      ctx.font = font(400, 16);
      ctx.fillStyle = C.ink;
      body.forEach((l, i) => ctx.fillText(l, XB + 16, by + 50 + i * 22));
      by += boxH + 10;
    });
    ly = by;
  }
  const endB = ly;

  // ───────────── Colonne C : « En bref », puis le prochain rendez-vous ─────────────
  let ry = section(t('gazette.une.briefs'), XC, top, COL_C) + 4;
  const shown = art.briefs.slice(0, lim.briefs);
  shown.forEach((b, i) => {
    const txt = storyText(t, issue.club, b, lang);
    const color = briefColor(b);
    const by = ry + 16;
    const face = faces[i];
    if (face) {
      ctx.beginPath();
      ctx.arc(XC + 24, by + 24, 26, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      drawFace(ctx, face, XC + 24, by + 24, 22);
    } else {
      ctx.beginPath();
      ctx.arc(XC + 24, by + 24, 22, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.font = font(400, 20);
      ctx.textAlign = 'center';
      ctx.fillText((b.kind === 'result' && b.params.cup === 'out' ? ICON.cupOut : b.kind === 'result' && b.params.cup === 'through' ? ICON.cupThrough : ICON[b.kind]) ?? '•', XC + 24, by + 31);
      ctx.textAlign = 'left';
    }
    const tx = XC + 60;
    const tw = COL_C - 60;
    let ty = by + 12;
    ctx.font = font(900, 12);
    ctx.fillStyle = color === C.amber ? '#8A6500' : color;
    ctx.fillText(caps(wrap(ctx, t(`gazette.une.section.${b.kind}`, { defaultValue: t('gazette.une.section.default') }), tw, 1)[0] ?? ''), tx, ty);
    ctx.font = font(800, 17);
    ctx.fillStyle = C.ink;
    for (const l of wrap(ctx, txt.title, tw, lim.briefTitle)) {
      ty += 22;
      ctx.fillText(l, tx, ty);
    }
    if (txt.body && lim.briefBody > 0) {
      ctx.font = font(400, 15);
      ctx.fillStyle = C.grey;
      for (const l of wrap(ctx, txt.body, tw, lim.briefBody)) {
        ty += 20;
        ctx.fillText(l, tx, ty);
      }
    }
    ry = Math.max(ty, by + 50) + 14;
    ctx.fillStyle = C.dash;
    ctx.fillRect(XC, ry, COL_C, 1);
  });
  if (!shown.length) {
    ctx.font = font(400, 15);
    ctx.fillStyle = C.grey;
    ctx.fillText(t('gazette.une.noBriefs'), XC, ry + 34);
    ry += 40;
  }

  // Prochain rendez-vous : encadré sombre, les deux logos face à face au-dessus du nom de l'adversaire.
  if (next) {
    ry += 22;
    const nt = storyText(t, issue.club, next, lang);
    const nw = COL_C - 48;
    const meta = [next.params.competition, next.params.location, next.params.inDays].filter(Boolean).map(String).join(' · ');
    const preview = meta && nt.body.startsWith(meta) ? nt.body.slice(meta.length).trim() : nt.body;
    ctx.font = font(900, 24, SERIF);
    const opp = wrap(ctx, String(next.params.opponent ?? nt.title), nw, 2);
    ctx.font = font(800, 15);
    const metaLines = meta ? wrap(ctx, meta, nw, 2) : [];
    ctx.font = font(400, 15);
    const body = preview ? wrap(ctx, preview, nw, lim.next) : [];
    const crests = club && nextArt ? 64 : nextArt ? 64 : 0;
    const boxH = 22 + 18 + (crests ? crests + 18 : 6) + opp.length * 28 + metaLines.length * 21 + body.length * 21 + 22;
    roundRect(ctx, XC, ry, COL_C, boxH, 4, C.ink);
    roundRect(ctx, XC, ry, 8, boxH, 0, C.orange);
    const nx = XC + 28;
    let ny = ry + 34;
    ctx.font = font(900, 13);
    ctx.fillStyle = C.orange;
    ctx.fillText(caps(t('gazette.une.next')), nx, ny);
    if (crests) {
      const cy = ny + 14 + crests / 2;
      if (club && nextArt) {
        drawCrest(ctx, club, nx + 32, cy, crests, { ring: C.ink });
        ctx.font = font(900, 20, SERIF);
        ctx.fillStyle = C.orange;
        ctx.textAlign = 'center';
        ctx.fillText(t('gazette.page.vs'), nx + 84, cy + 7);
        ctx.textAlign = 'left';
        drawCrest(ctx, nextArt, nx + 136, cy, crests, { ring: C.ink });
      } else if (nextArt) drawCrest(ctx, nextArt, nx + 32, cy, crests, { ring: C.ink });
      ny += crests + 18;
    }
    ctx.textBaseline = 'alphabetic';
    ctx.font = font(900, 24, SERIF);
    ctx.fillStyle = '#FFFFFF';
    for (const l of opp) {
      ny += 28;
      ctx.fillText(l, nx, ny);
    }
    ctx.font = font(800, 15);
    for (const l of metaLines) {
      ny += 21;
      ctx.fillText(l, nx, ny);
    }
    ctx.font = font(400, 15);
    ctx.fillStyle = '#D9DBDF';
    for (const l of body) {
      ny += 21;
      ctx.fillText(l, nx, ny);
    }
    ry += boxH;
  }
  const endC = ry;

  // Filets verticaux entre les colonnes, puis pied aux couleurs du club en bas de l'image.
  const bottom = Math.max(endA, endB, endC) + 24;
  const H = Math.max(H_MIN, Math.ceil(bottom + FOOT));
  ctx.fillStyle = C.ink;
  ctx.fillRect(XB - GUTTER / 2, top, 1, H - FOOT - 24 - top);
  ctx.fillRect(XC - GUTTER / 2, top, 1, H - FOOT - 24 - top);
  const fy = H - FOOT;
  const foot = band ?? C.ink;
  const footInk = inkOn(foot);
  ctx.fillStyle = foot;
  ctx.fillRect(0, fy, W, FOOT);
  if (stripe) {
    ctx.fillStyle = stripe;
    ctx.fillRect(0, fy, W, 4);
  }
  ctx.font = font(700, 15);
  ctx.fillStyle = footInk;
  ctx.textAlign = 'left';
  ctx.fillText(`${paperName(t, issue.club)} · ${t('gazette.issue', { number: issue.number })}`, M, fy + 32);
  ctx.textAlign = 'right';
  ctx.fillText('FM Immersion', W - M, fy + 32);
  ctx.textAlign = 'left';

  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  out.getContext('2d')!.drawImage(canvas, 0, 0);
  return { canvas: out, ends: [endA, endB, endC] };
}
