import type { GazetteIssue, SeasonReview, GazetteStory } from '@fm-immersion/module-fm';
import type { TFunction } from 'i18next';

/** Une brève mise en mots : titre court et texte. */
export interface StoryText {
  title: string;
  body: string;
}

const str = (v: unknown) => (v == null || v === '' ? null : String(v));

/** Note sur 10 avec une décimale, à la française ou à l'anglaise. */
const rating = (v: unknown, lang?: string) =>
  v == null || v === '' || Number.isNaN(Number(v))
    ? '-'
    : new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Number(v));

/** Nombre à une ou deux décimales dans la langue de l'interface (xG). */
const dec = (v: unknown, lang?: string, digits = 2) => new Intl.NumberFormat(lang, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(v));

/**
 * Chiffres du match écrits par le jeu, en une ligne (« Possession 47 % · Tirs 5 (3) – 12 (5) · xG 1,06 – 0,49 »),
 * ou null si l'instantané ne les donne pas. Même ligne sur la une, dans l'encart Discord et dans le journal.
 */
export function figuresLine(t: TFunction, p: GazetteStory['params'], lang?: string): string | null {
  const parts: string[] = [];
  if (p.possession != null) parts.push(t('gazette.figures.possession', { us: Math.round(Number(p.possession)) }));
  if (p.shots != null && p.shotsOpp != null) {
    const on = (v: unknown) => (v == null ? '' : t('gazette.figures.onTarget', { count: Number(v) }));
    parts.push(t('gazette.figures.shots', { us: `${p.shots}${on(p.onTarget)}`, them: `${p.shotsOpp}${on(p.onTargetOpp)}` }));
  }
  if (p.xg != null && p.xgOpp != null) parts.push(t('gazette.figures.xg', { us: dec(p.xg, lang), them: dec(p.xgOpp, lang) }));
  return parts.length ? parts.join(' · ') : null;
}

/** Morceaux du compte rendu d'un match : lieu et compétition, buteurs, meilleur joueur, chiffres (vides s'ils sont inconnus). */
function resultParts(t: TFunction, s: GazetteStory, lang?: string) {
  const p = s.params;
  const place = p.home == null ? '' : t(p.home ? 'gazette.home' : 'gazette.away');
  const comp = p.friendly ? t('gazette.friendlyMatch') : p.competition ? t('gazette.inCompetition', { competition: p.competition }) : '';
  return {
    venue: [place, comp].filter(Boolean).join(', '),
    scorers: p.scorers ? t('gazette.scorers', { names: p.scorers }) : '',
    best: p.best ? t('gazette.best', { name: p.best, rating: rating(p.rating, lang) }) : '',
    figures: figuresLine(t, p, lang),
  };
}

/** Présentation du prochain adversaire d'après le rapport du jeu : classement, entraîneur et schéma, buteur. */
function opponentPreview(t: TFunction, p: GazetteStory['params']): string {
  const bits: string[] = [];
  if (p.position) bits.push(t('gazette.story.nextMatch.previewPosition', { position: p.position }));
  if (p.manager) bits.push(t(p.formation ? 'gazette.story.nextMatch.previewManagerFormation' : 'gazette.story.nextMatch.previewManager', { manager: p.manager, formation: p.formation }));
  if (p.scorer) bits.push(p.scorerGoals ? t('gazette.story.nextMatch.previewScorer', { scorer: p.scorer, count: Number(p.scorerGoals) }) : t('gazette.story.nextMatch.previewScorerNoGoals', { scorer: p.scorer }));
  const sentence = bits.length ? `${t('gazette.story.nextMatch.previewLead', { opponent: p.opponent })} ${bits.join(', ')}.` : '';
  return [sentence, p.threat ? String(p.threat) : ''].filter(Boolean).join(' ');
}

/** Met une brève de la gazette en mots (FR/EN), avec le nom du club pour les titres. */
export function storyText(t: TFunction, club: string, s: GazetteStory, lang?: string): StoryText {
  const p = s.params;
  const k = (key: string, extra: Record<string, unknown> = {}) => t(`gazette.story.${s.kind}.${key}`, { club, ...p, ...extra });
  switch (s.kind) {
    case 'result': {
      const opponent = str(p.opponent) ?? t('gazette.opponentUnknown');
      const score = p.goalsFor != null && p.goalsAgainst != null ? `${p.goalsFor}-${p.goalsAgainst}` : '';
      const parts = resultParts(t, s, lang);
      // Match décisif d'un tour de coupe : le titre dit l'élimination ou la qualification, pas seulement le score.
      const cup = p.cup === 'out' ? 'cupOut' : p.cup === 'through' ? 'cupThrough' : null;
      const agg = `${p.aggFor}-${p.aggAgainst}`;
      const round = cup ? k(`${cup}${Number(p.legs) === 2 ? 'Legs' : ''}`, { opponent, agg, count: Number(p.rounds) }) : '';
      return {
        title: k(`title_${cup ?? p.outcome}`, { opponent, score }),
        body: [round, parts.venue && `${parts.venue}.`, parts.scorers, parts.best, parts.figures && `${parts.figures}.`].filter(Boolean).join(' '),
      };
    }
    case 'streak':
      return { title: k(`title_${p.outcome}`, { count: Number(p.count) }), body: k(`body_${p.outcome}`, { count: Number(p.count) }) };
    case 'coachFuture': {
      // Avenir du coach : un titre et un texte par type (entretien, offre, intérêt, rumeur de presse).
      const vars = { coach: str(p.coach) ?? t('breaking.coach'), other: str(p.other) ?? t('breaking.otherClub') };
      return { title: k(`title_${p.type}`, vars), body: k(`body_${p.type}`, vars) };
    }
    case 'job':
    case 'fans':
    case 'nextMatch': {
      const extra: string[] = [];
      if (s.kind === 'nextMatch') {
        if (p.competition) extra.push(String(p.competition));
        if (p.location) extra.push(String(p.location));
        if (p.inDays) extra.push(String(p.inDays));
      }
      return { title: k('title'), body: [k('body'), extra.join(' · '), s.kind === 'nextMatch' ? opponentPreview(t, p) : ''].filter(Boolean).join(' ') };
    }
    case 'cupOut':
    case 'cupThrough': {
      const score = `${p.goalsFor}-${p.goalsAgainst}`;
      const opponent = str(p.opponent) ?? t('gazette.opponentUnknown');
      const legs = Number(p.legs) === 2 ? 'Legs' : '';
      return { title: k('title'), body: k(`body${legs}`, { opponent, score, count: Number(p.rounds) }) };
    }
    case 'press': {
      // Paroles du coach en conférence de presse, citées telles qu'il les a dites (ou son refus de répondre).
      const opponent = str(p.opponent) ?? t('gazette.opponentUnknown');
      return { title: k(`title_${p.moment === 'pre' ? 'pre' : 'post'}`, { opponent }), body: p.quote ? k('body', { quote: p.quote }) : k('noComment') };
    }
    case 'injury': {
      const days = Number(p.days);
      return { title: k('title'), body: days > 0 ? k('body', { count: days }) : k('bodyNoDate') };
    }
    default:
      return { title: k('title'), body: k('body') };
  }
}

/** La une mise en mots : le gros titre écrit par l'IA quand la gazette a été rédigée par elle, sinon celui des phrases toutes faites. */
export function headlineText(t: TFunction, issue: GazetteIssue, lang?: string): StoryText {
  const base = storyText(t, issue.club, issue.headline, lang);
  return issue.written?.title ? { ...base, title: issue.written.title } : base;
}

/** Semaine de jeu en toutes lettres (« Semaine du 19 oct. au 25 oct. 2026 »), dans la langue de l'interface. */
export function weekLabel(t: TFunction, lang: string | undefined, from: string, to: string) {
  const d = (iso: string, year: boolean) =>
    new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC' }).format(
      new Date(`${iso}T00:00:00Z`),
    );
  return t('gazette.week', { from: d(from, from.slice(0, 4) !== to.slice(0, 4)), to: d(to, true) });
}

/** Petit hachage stable : la même variante de phrase pour une même gazette, d'un rendu à l'autre. */
function hash(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return Math.abs(h);
}

/** Nombre de variantes de chaque phrase d'article dans les fichiers de langue. */
const ARTICLE_VARIANTS = 3;

/**
 * L'article de la une quand c'est un match : un vrai récit en quelques phrases (issue du match et lieu, buteurs,
 * lecture des chiffres du jeu, homme du match, série ou classement, prochain rendez-vous), avec des tournures qui
 * varient d'une semaine à l'autre. Null quand la une n'est pas un match (le corps de la brève suffit).
 */
export function articleText(t: TFunction, issue: GazetteIssue, lang?: string): string | null {
  if (issue.written?.article) return issue.written.article;
  const head = issue.headline;
  if (head.kind !== 'result' || !head.params.outcome) return null;
  const p = head.params;
  const club = issue.club;
  const seed = `${club}|${issue.weekStart}|${p.date ?? ''}`;
  const v = (key: string, vars: Record<string, unknown> = {}) => t(`gazette.article.${key}_${hash(seed + key) % ARTICLE_VARIANTS}`, { club, ...vars });
  const opponent = str(p.opponent) ?? t('gazette.opponentUnknown');
  const score = p.goalsFor != null && p.goalsAgainst != null ? `${p.goalsFor}-${p.goalsAgainst}` : '';
  const margin = p.goalsFor != null && p.goalsAgainst != null ? Math.abs(Number(p.goalsFor) - Number(p.goalsAgainst)) : 0;
  const where = p.home == null ? '' : t(p.home ? 'gazette.article.atHome' : 'gazette.article.away');
  const comp = p.friendly ? t('gazette.article.friendly') : p.competition ? t('gazette.article.inComp', { competition: p.competition }) : '';
  // L'ouverture suit l'enjeu : un tour de coupe perdu ou gagné se raconte comme tel, un match de coupe ne rapporte
  // pas de points, un match de championnat si.
  const cup = p.cup === 'out' ? 'cupOut' : p.cup === 'through' ? 'cupThrough' : null;
  const cupMatch = p.compKind === 'cup' || p.compKind === 'europe';
  const opener = cup ?? `${p.outcome}${margin >= 3 && p.outcome !== 'D' ? 'Big' : cupMatch ? 'Cup' : ''}`;
  const out: string[] = [v(`open_${opener}`, { opponent, score, where, comp, competition: p.competition ?? '' })];
  if (cup && Number(p.legs) === 2) out.push(t('gazette.article.aggregate', { agg: `${p.aggFor}-${p.aggAgainst}` }));
  if (p.scorers) out.push(v('scorers', { scorers: p.scorers }));

  // Lecture des chiffres : la possession et les xG racontent si le score est logique, cruel ou volé.
  const poss = p.possession != null ? Number(p.possession) : null;
  const xgDiff = p.xg != null && p.xgOpp != null ? Number(p.xg) - Number(p.xgOpp) : null;
  const nums = { opponent, possession: poss != null ? Math.round(poss) : '', xg: p.xg != null ? dec(p.xg, lang) : '', xgOpp: p.xgOpp != null ? dec(p.xgOpp, lang) : '', shots: p.shots ?? '', shotsOpp: p.shotsOpp ?? '' };
  let stat: string | null = null;
  if (xgDiff != null && xgDiff >= 0.5 && p.outcome === 'L') stat = 'unlucky';
  else if (xgDiff != null && xgDiff <= -0.5 && p.outcome === 'W') stat = 'lucky';
  else if (poss != null && poss >= 55 && p.outcome === 'W') stat = 'dominantWin';
  else if (poss != null && poss >= 55 && p.outcome !== 'W') stat = 'sterile';
  else if (poss != null && poss <= 45 && p.outcome === 'W') stat = 'clinical';
  else if (poss != null && poss <= 45 && p.outcome === 'L') stat = 'overrun';
  else if (poss != null && xgDiff != null) stat = 'balanced';
  if (stat) out.push(v(`stat_${stat}`, nums));
  if (p.best) out.push(v('best', { best: p.best, rating: rating(p.rating, lang) }));
  if (cup) out.push(v(`${cup}After`, { competition: p.competition ?? '', count: Number(p.rounds) }));

  // Ce que ce match change : série en cours, sinon mouvement au classement, sinon siège du coach.
  const stories = issue.stories;
  const streak = stories.find((s) => s.kind === 'streak');
  const position = stories.find((s) => s.kind === 'position');
  const job = stories.find((s) => s.kind === 'job' && s.weight >= 70);
  if (streak) out.push(t(`gazette.article.streak_${streak.params.outcome}`, { club, count: Number(streak.params.count) }));
  else if (position) out.push(t(Number(position.params.to) < Number(position.params.from) ? 'gazette.article.climb' : 'gazette.article.drop', { club, from: position.params.from, to: position.params.to }));
  else if (job) out.push(t('gazette.article.job', { club, status: job.params.status }));

  const next = stories.find((s) => s.kind === 'nextMatch');
  if (next?.params.opponent) {
    const loc = next.params.location ? String(next.params.location).toLocaleLowerCase(lang) : '';
    out.push(v('next', { opponent: next.params.opponent, where: loc ? ` (${loc})` : '', inDays: next.params.inDays ? String(next.params.inDays).toLocaleLowerCase(lang) : '' }));
  }
  return out.join(' ');
}

/** Climat de la semaine, pour le ton du billet et des réactions. */
export function climateOf(issue: GazetteIssue): 'crisis' | 'cupOut' | 'hot' | 'win' | 'draw' | 'loss' | 'quiet' {
  const all = [issue.headline, ...issue.stories];
  const streak = all.find((s) => s.kind === 'streak');
  if (streak && (streak.params.outcome === 'L' || streak.params.outcome === 'winless')) return 'crisis';
  // Élimination en coupe : un moment marquant, qui donne le ton de la semaine (sauf en pleine crise).
  if ((issue.headline.kind === 'result' && issue.headline.params.cup === 'out') || issue.headline.kind === 'cupOut') return 'cupOut';
  if (streak && (streak.params.outcome === 'W' || streak.params.outcome === 'unbeaten')) return 'hot';
  const results = all.filter((s) => s.kind === 'result' && !s.params.friendly && s.params.outcome).sort((a, b) => String(b.params.date ?? '').localeCompare(String(a.params.date ?? '')));
  const last = results[0];
  if (!last) return 'quiet';
  return last.params.outcome === 'W' ? 'win' : last.params.outcome === 'D' ? 'draw' : 'loss';
}

const lower = (s: string, lang?: string) => (s.length ? s[0]!.toLocaleLowerCase(lang) + s.slice(1) : s);

/**
 * Le billet : l'avis de la rédaction en quelques phrases, puis ce qu'on entend dans les tribunes et du côté de la
 * direction. Les textes du jeu (confiance des supporters, sécurité de l'emploi, objectif de la saison) sont repris
 * quand le plugin les lit ; sinon le ton suit la semaine (série, dernier résultat).
 */
export function editorialText(t: TFunction, issue: GazetteIssue, lang?: string): { title: string; body: string; fans: string; board: string } | null {
  if (issue.written?.editorial) return { title: t('gazette.editorial.title'), body: issue.written.editorial, fans: issue.written.fans, board: issue.written.board };
  const climate = climateOf(issue);
  if (climate === 'quiet' && issue.headline.kind === 'quiet') return null;
  const all = [issue.headline, ...issue.stories];
  const seed = `${issue.club}|${issue.weekStart}|billet`;
  const v = (key: string, vars: Record<string, unknown> = {}) => t(`gazette.editorial.${key}_${hash(seed + key) % ARTICLE_VARIANTS}`, { club: issue.club, ...vars });
  const streak = all.find((s) => s.kind === 'streak');
  const last = all.find((s) => s.kind === 'result' && !s.params.friendly && s.params.outcome);
  const vars = { opponent: str(last?.params.opponent) ?? t('gazette.opponentUnknown'), count: Number(streak?.params.count ?? 0) };
  const body = v(`tone_${climate}`, vars);
  const fansStory = all.find((s) => s.kind === 'fans');
  const fans = fansStory ? t('gazette.editorial.fansGame', { mood: fansStory.params.mood }) : v(`fans_${climate}`, vars);
  const jobStory = all.find((s) => s.kind === 'job');
  const board = jobStory
    ? t('gazette.editorial.boardGame', { status: jobStory.params.status })
    : issue.board
      ? t(`gazette.editorial.boardObjective_${climate === 'crisis' || climate === 'cupOut' ? 'worried' : climate === 'hot' ? 'pleased' : 'neutral'}`, { objective: lower(issue.board, lang) })
      : v(`board_${climate}`, vars);
  return { title: t('gazette.editorial.title'), body, fans, board };
}

/** Nom du journal pour un club. */
export const paperName = (t: TFunction, club: string) => t('gazette.paper', { club });

/** Pictogramme de chaque type de brève, pour les titres sur Discord. */
const ICON: Record<GazetteStory['kind'], string> = {
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
  nextMatch: '📅',
  cupOut: '💔',
  cupThrough: '🏆',
  press: '🎙️',
  quiet: '☕',
};

/** Pictogramme d'une brève : un match décisif de coupe prend celui de l'élimination ou de la qualification. */
const iconOf = (s: GazetteStory) => (s.kind === 'result' && s.params.cup === 'out' ? ICON.cupOut : s.kind === 'result' && s.params.cup === 'through' ? ICON.cupThrough : ICON[s.kind]);

/** Couleur du liseré : vert après une victoire à la une, rouge après une défaite, orange sinon. */
function accent(s: GazetteStory) {
  if (s.kind === 'result' && s.params.outcome === 'W') return 0x2e9e5b;
  if (s.kind === 'result' && s.params.outcome === 'L') return 0xd93c3c;
  if (s.kind === 'position' && Number(s.params.to) < Number(s.params.from)) return 0x2e9e5b;
  if (s.kind === 'streak') return s.params.outcome === 'W' || s.params.outcome === 'unbeaten' ? 0x2e9e5b : 0xd93c3c;
  return 0xffb547;
}

const cut = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/**
 * Court encart Discord au-dessus de la page complète en image (`gazette-page.ts`) : le journal se lit sur l'image,
 * le message ne donne que le nom du journal, le numéro et le gros titre.
 */
export function discordPagePayload(t: TFunction, issue: GazetteIssue, lang?: string) {
  const head = headlineText(t, issue, lang);
  return {
    username: paperName(t, issue.club).slice(0, 80),
    embeds: [
      {
        author: { name: cut(`📰  ${paperName(t, issue.club).toUpperCase()}  ·  ${t('gazette.issue', { number: issue.number })}`, 256) },
        title: cut(`${iconOf(issue.headline)}  ${head.title}`, 256),
        color: accent(issue.headline),
        image: { url: 'attachment://une.png' },
        footer: { text: `${weekLabel(t, lang, issue.weekStart, issue.weekEnd)}  ·  FM Immersion` },
      },
    ],
    attachments: [{ id: 0, filename: 'une.png' }],
  };
}

/**
 * Message Discord (webhook) pour une gazette, façon journal : bandeau du titre et du numéro, la une en grand
 * (pictogramme, titre, chapeau en citation), puis les brèves une par une et le prochain match en dernier.
 */
export function discordPayload(t: TFunction, issue: GazetteIssue, lang?: string, figures?: SeasonReview | null) {
  const head = headlineText(t, issue, lang);
  const all = issue.stories.slice(0, 12);
  const lead = (() => {
    if (issue.headline.kind !== 'result') return head.body ? `> ${head.body}` : '';
    const r = resultParts(t, issue.headline, lang);
    const article = articleText(t, issue, lang);
    return [article && `> ${article}`, r.scorers && `🥅 ${r.scorers}`, r.best && `⭐ ${r.best}`, r.figures && `📊 ${r.figures}`].filter(Boolean).join('\n');
  })();
  const next = all.filter((s) => s.kind === 'nextMatch');
  const briefs = all.filter((s) => s.kind !== 'nextMatch' && s.kind !== 'quiet').slice(0, 9);
  const field = (s: GazetteStory, inline = false) => {
    const x = storyText(t, issue.club, s, lang);
    return { name: cut(`${iconOf(s)}  ${x.title}`, 256), value: cut(x.body || '​', 1024), inline };
  };
  const fig = figures && (figures.played || figures.position != null) ? figures : null;
  const figLine = fig
    ? [
        fig.position != null && `🏆 ${t(`season.ordinal${fig.position <= 3 ? fig.position : ''}`, { n: fig.position })}`,
        fig.played && `📋 ${fig.wins}-${fig.draws}-${fig.losses} · ${fig.points} pts`,
        fig.played && `⚽ ${fig.goalsFor}-${fig.goalsAgainst}`,
        fig.topScorer && `🔥 ${fig.topScorer.name} (${fig.topScorer.value})`,
      ]
        .filter(Boolean)
        .join('  ·  ')
    : '';
  const edito = editorialText(t, issue, lang);
  const fields = [
    ...(edito ? [{ name: `✍️  ${edito.title}`, value: cut([edito.body, `📣 ${edito.fans}`, `🏛️ ${edito.board}`].join('\n'), 1024) }] : []),
    ...(briefs.length ? [{ name: '​', value: `**${t('gazette.discord.briefs')}**` }] : []),
    ...briefs.map((s) => field(s)),
    ...(figLine ? [{ name: `📊  ${t('gazette.une.figures', { season: fig!.label })}`, value: cut(figLine, 1024) }] : []),
    ...next.map((s) => field(s)),
  ];
  return {
    username: paperName(t, issue.club).slice(0, 80),
    embeds: [
      {
        author: { name: cut(`📰  ${paperName(t, issue.club).toUpperCase()}  ·  ${t('gazette.issue', { number: issue.number })}`, 256) },
        title: cut(`${iconOf(issue.headline)}  ${head.title}`, 256),
        description: cut([lead, '━━━━━━━━━━━━━━━━━━━━'].filter(Boolean).join('\n'), 4000),
        color: accent(issue.headline),
        fields,
        footer: { text: `${weekLabel(t, lang, issue.weekStart, issue.weekEnd)}  ·  FM Immersion` },
      },
    ],
  };
}
