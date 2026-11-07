import type { GazetteIssue, GazetteStory } from '@fm-immersion/module-fm';
import type { TFunction } from 'i18next';
import { paperName, storyText, weekLabel } from './gazette-text';

/**
 * Une de la gazette en image (1200 × 675), dessinée sur le PC dans un canvas, pour l'envoi sur Discord.
 * Mise en page de journal : bandeau (numéro, semaine, compétition), titre du journal, filets, une à gauche
 * (pastille, gros titre, score, buteurs, homme du match, forme), « En bref » à droite, prochain match en pied.
 */
export type Outcome = 'W' | 'D' | 'L';

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

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

/** Plus grande taille de police (≤ max) pour que le texte tienne sur `width`. */
function fit(ctx: CanvasRenderingContext2D, text: string, weight: number, max: number, min: number, width: number, family: string) {
  let size = max;
  ctx.font = font(weight, size, family);
  while (size > min && ctx.measureText(text).width > width) ctx.font = font(weight, --size, family);
  return size;
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
};

export async function drawUne(t: TFunction, issue: GazetteIssue, opts: { form: Outcome[]; lang?: string }): Promise<HTMLCanvasElement> {
  const { lang } = opts;
  await Promise.all(
    [font(900, 76, SERIF), font(800, 50, SERIF), font(400, 19), font(800, 19)].map((f) => document.fonts.load(f).catch(() => undefined)),
  );
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, W, H);

  const head = issue.headline;
  const headText = storyText(t, issue.club, head, lang);
  const all = [head, ...issue.stories];
  const next = all.find((s) => s.kind === 'nextMatch');
  const competition = next?.params.competition ? String(next.params.competition) : '';

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

  // Titre du journal.
  const name = paperName(t, issue.club);
  const size = fit(ctx, name, 900, 76, 40, W - 2 * M, SERIF);
  ctx.textAlign = 'center';
  ctx.fillStyle = C.ink;
  ctx.fillText(name, W / 2, 62 + size * 0.8);
  // Filets.
  ctx.fillRect(M, 141, W - 2 * M, 3);
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
    ? `${t(`gazette.une.kicker_${p.outcome}`)}${p.home == null ? '' : ` ${t(p.home ? 'gazette.une.atHome' : 'gazette.une.away')}`}`
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
    const boxW = Math.min(colW, 22 + lw + 18 + sw + 18 + rw + 22);
    roundRect(ctx, M, y, boxW, 74, 10, C.ink);
    ctx.font = font(800, 22);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(team(left), M + 22, y + 45);
    ctx.font = font(900, 46, SERIF);
    ctx.fillStyle = C.orange;
    ctx.fillText(score, M + 22 + lw + 18, y + 54);
    ctx.font = font(800, 22);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(team(right), M + 22 + lw + 18 + sw + 18, y + 45);
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
  } else if (headText.body) {
    ctx.font = font(400, 19);
    ctx.fillStyle = C.ink;
    for (const l of wrap(ctx, headText.body, colW, 3)) {
      y += 26;
      ctx.fillText(l, M, y);
    }
    y += 10;
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
    ctx.font = font(900, r.length > 3 ? 20 : 24, SERIF);
    ctx.fillStyle = C.orangeDark;
    ctx.textAlign = 'center';
    ctx.fillText(r, x + 31, rowY + 39);
    ctx.textAlign = 'left';
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
  roundRect(ctx, sx, 233, ctx.measureText(t('gazette.une.briefs')).width, 3, 0, C.orange);
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

  // Pied : prochain match.
  ctx.fillStyle = C.ink;
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
    piece(`${t('gazette.une.next')} : `, '#FFFFFF');
    piece(String(next.params.opponent), C.orange, 800);
    const extra = [next.params.location, next.params.inDays].filter(Boolean).map(String).join(' · ');
    if (extra) piece(` · ${extra}`, '#FFFFFF');
  }
  ctx.font = font(400, 14);
  ctx.fillStyle = 'rgba(255,255,255,0.67)';
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
