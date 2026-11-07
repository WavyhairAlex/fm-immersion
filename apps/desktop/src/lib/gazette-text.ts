import type { GazetteIssue, GazetteStory } from '@fm-immersion/module-fm';
import type { TFunction } from 'i18next';

/** Une brève mise en mots : titre court et texte. */
export interface StoryText {
  title: string;
  body: string;
}

const str = (v: unknown) => (v == null || v === '' ? null : String(v));

/** Note sur 10 avec une décimale, à la française ou à l'anglaise. */
const rating = (v: unknown, lang?: string) =>
  v == null || v === '' || Number.isNaN(Number(v)) ? '-' : new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Number(v));

/** Morceaux du compte rendu d'un match : lieu, buteurs, meilleur joueur (vides s'ils sont inconnus). */
function resultParts(t: TFunction, s: GazetteStory, lang?: string) {
  const p = s.params;
  return {
    venue: p.home == null ? '' : t(p.home ? 'gazette.home' : 'gazette.away'),
    scorers: p.scorers ? t('gazette.scorers', { names: p.scorers }) : '',
    best: p.best ? t('gazette.best', { name: p.best, rating: rating(p.rating, lang) }) : '',
  };
}

/** Met une brève de la gazette en mots (FR/EN), avec le nom du club pour les titres. */
export function storyText(t: TFunction, club: string, s: GazetteStory, lang?: string): StoryText {
  const p = s.params;
  const k = (key: string, extra: Record<string, unknown> = {}) => t(`gazette.story.${s.kind}.${key}`, { club, ...p, ...extra });
  switch (s.kind) {
    case 'result': {
      const opponent = str(p.opponent) ?? t('gazette.opponentUnknown');
      const score = p.goalsFor != null && p.goalsAgainst != null ? `${p.goalsFor}-${p.goalsAgainst}` : '';
      const venue = p.home == null ? '' : t(p.home ? 'gazette.home' : 'gazette.away');
      const parts = resultParts(t, s, lang);
      return { title: k(`title_${p.outcome}`, { opponent, score }), body: [parts.venue && `${parts.venue}.`, parts.scorers, parts.best].filter(Boolean).join(' ') };
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
      return { title: k('title'), body: [k('body'), extra.join(' · ')].filter(Boolean).join(' ') };
    }
    case 'injury': {
      const days = Number(p.days);
      return { title: k('title'), body: days > 0 ? k('body', { count: days }) : k('bodyNoDate') };
    }
    default:
      return { title: k('title'), body: k('body') };
  }
}

/** Semaine de jeu en toutes lettres (« Semaine du 19 oct. au 25 oct. 2026 »), dans la langue de l'interface. */
export function weekLabel(t: TFunction, lang: string | undefined, from: string, to: string) {
  const d = (iso: string, year: boolean) =>
    new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
  return t('gazette.week', { from: d(from, from.slice(0, 4) !== to.slice(0, 4)), to: d(to, true) });
}

/** Nom du journal pour un club. */
export const paperName = (t: TFunction, club: string) => t('gazette.paper', { club });

/** Pictogramme de chaque type de brève, pour les titres sur Discord. */
const ICON: Record<GazetteStory['kind'], string> = {
  result: '⚽',
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
  nextMatch: '📅',
  quiet: '☕',
};

/** Couleur du liseré : vert après une victoire à la une, rouge après une défaite, orange sinon. */
function accent(s: GazetteStory) {
  if (s.kind === 'result' && s.params.outcome === 'W') return 0x2e9e5b;
  if (s.kind === 'result' && s.params.outcome === 'L') return 0xd93c3c;
  if (s.kind === 'position' && Number(s.params.to) < Number(s.params.from)) return 0x2e9e5b;
  return 0xf26b1d;
}

const cut = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/**
 * Message Discord (webhook) pour une gazette, façon journal : bandeau du titre et du numéro, la une en grand
 * (pictogramme, titre, chapeau en citation), puis les brèves une par une et le prochain match en dernier.
 */
export function discordPayload(t: TFunction, issue: GazetteIssue, lang?: string) {
  const head = storyText(t, issue.club, issue.headline, lang);
  const all = issue.stories.slice(0, 12);
  const lead = (() => {
    if (issue.headline.kind !== 'result') return head.body ? `> ${head.body}` : '';
    const r = resultParts(t, issue.headline, lang);
    return [r.venue && `📍 ${r.venue}`, r.scorers && `🥅 ${r.scorers}`, r.best && `⭐ ${r.best}`].filter(Boolean).join('\n');
  })();
  const next = all.filter((s) => s.kind === 'nextMatch');
  const briefs = all.filter((s) => s.kind !== 'nextMatch' && s.kind !== 'quiet').slice(0, 9);
  const field = (s: GazetteStory, inline = false) => {
    const x = storyText(t, issue.club, s, lang);
    return { name: cut(`${ICON[s.kind]}  ${x.title}`, 256), value: cut(x.body || '​', 1024), inline };
  };
  const fields = [
    ...(briefs.length ? [{ name: '​', value: `**${t('gazette.discord.briefs')}**` }] : []),
    ...briefs.map((s) => field(s)),
    ...next.map((s) => field(s)),
  ];
  return {
    username: paperName(t, issue.club).slice(0, 80),
    embeds: [
      {
        author: { name: cut(`📰  ${paperName(t, issue.club).toUpperCase()}  ·  ${t('gazette.issue', { number: issue.number })}`, 256) },
        title: cut(`${ICON[issue.headline.kind]}  ${head.title}`, 256),
        description: cut([lead, '━━━━━━━━━━━━━━━━━━━━'].filter(Boolean).join('\n'), 4000),
        color: accent(issue.headline),
        fields,
        footer: { text: `${weekLabel(t, lang, issue.weekStart, issue.weekEnd)}  ·  FM Immersion` },
      },
    ],
  };
}
