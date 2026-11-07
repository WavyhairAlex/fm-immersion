import type { GazetteIssue, GazetteStory } from '@fm-immersion/module-fm';
import type { TFunction } from 'i18next';

/** Une brève mise en mots : titre court et texte. */
export interface StoryText {
  title: string;
  body: string;
}

const str = (v: unknown) => (v == null || v === '' ? null : String(v));

/** Met une brève de la gazette en mots (FR/EN), avec le nom du club pour les titres. */
export function storyText(t: TFunction, club: string, s: GazetteStory): StoryText {
  const p = s.params;
  const k = (key: string, extra: Record<string, unknown> = {}) => t(`gazette.story.${s.kind}.${key}`, { club, ...p, ...extra });
  switch (s.kind) {
    case 'result': {
      const opponent = str(p.opponent) ?? t('gazette.opponentUnknown');
      const score = p.goalsFor != null && p.goalsAgainst != null ? `${p.goalsFor}-${p.goalsAgainst}` : '';
      const venue = p.home == null ? '' : t(p.home ? 'gazette.home' : 'gazette.away');
      const parts = [venue && `${venue}.`, p.scorers ? t('gazette.scorers', { names: p.scorers }) : '', p.best ? t('gazette.best', { name: p.best, rating: p.rating ?? '-' }) : ''];
      return { title: k(`title_${p.outcome}`, { opponent, score }), body: parts.filter(Boolean).join(' ') };
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
    default:
      return { title: k('title'), body: k('body') };
  }
}

/** Nom du journal pour un club. */
export const paperName = (t: TFunction, club: string) => t('gazette.paper', { club });

/** Message Discord (webhook) pour une gazette : une carte à liseré orange, la une puis les brèves. */
export function discordPayload(t: TFunction, issue: GazetteIssue) {
  const head = storyText(t, issue.club, issue.headline);
  const fields = issue.stories.slice(0, 10).map((s) => {
    const x = storyText(t, issue.club, s);
    return { name: x.title.slice(0, 256), value: (x.body || '​').slice(0, 1024) };
  });
  return {
    username: 'FM Immersion',
    embeds: [
      {
        author: { name: `${paperName(t, issue.club)} · ${t('gazette.issue', { number: issue.number })}` },
        title: head.title.slice(0, 256),
        description: head.body.slice(0, 4000) || undefined,
        color: 0xf26b1d,
        fields,
        footer: { text: t('gazette.week', { from: issue.weekStart, to: issue.weekEnd }) },
      },
    ],
  };
}
