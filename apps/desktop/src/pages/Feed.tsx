import { socialFeed, type SocialFeed, type SocialMood, type SocialPost } from '@fm-immersion/module-fm';
import type { TFunction } from 'i18next';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useCareer } from '../lib/career';
import { useHistory } from '../lib/fm-cache';
import { usePressHeld } from '../lib/press';

/** Pseudo des comptes : le nom court du club en minuscules, sans accents ni espaces. */
const handleOf = (tag: string) =>
  tag
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();

/** Nombre de variantes d'une phrase dans la langue du joueur (`social.post.<sujet>.<compte>.0`, `.1`…). */
function variants(exists: (k: string) => boolean, base: string): number {
  let n = 0;
  while (exists(`${base}.${n}`)) n++;
  return n;
}

/** Phrase d'un message : une variante tirée de son identifiant, celle qui cite le buteur quand on le connaît. */
export function postText(t: TFunction, exists: (k: string) => boolean, p: SocialPost, feed: Pick<SocialFeed, 'tag' | 'coach' | 'club'>): string {
  const vars = { ...p.vars, tag: feed.tag, club: feed.club, coach: feed.coach ?? '' };
  const plain = `social.post.${p.topic}.${p.author}`;
  const scorer = `${plain}Scorer`;
  const base = p.vars.scorer && variants(exists, scorer) && p.seed % 2 === 0 ? scorer : plain;
  const n = variants(exists, base);
  if (!n) return '';
  return t(`${base}.${p.seed % n}`, { ...vars, interpolation: { escapeValue: false } });
}

const MOOD_STYLE: Record<SocialMood, string> = {
  [-2]: 'bg-corail/15 text-corail',
  [-1]: 'bg-ambre/20 text-canard',
  0: 'bg-canard/10 text-canard',
  1: 'bg-eau/15 text-eau-fonce',
  2: 'bg-eau/25 text-eau-fonce',
};

const initials = (s: string) =>
  s
    .split(/\s+/)
    .filter((w) => /\p{L}/u.test(w[0] ?? ''))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

/** Le Fil : les réseaux sociaux autour du club (supporters, journalistes, club, insider), d'après la partie. */
export function Feed() {
  const { t, i18n } = useTranslation();
  const { saveId, fmSaves } = useCareer();
  const { data: history = [], isLoading } = useHistory(saveId);
  const { data: held = [] } = usePressHeld(saveId);
  const feed = useMemo(() => socialFeed(history, held), [history, held]);
  const exists = (k: string) => i18n.exists(k);
  const handle = handleOf(feed.tag);
  const lang = i18n.resolvedLanguage;

  if (!fmSaves.length)
    return (
      <div className="card">
        <p className="text-brun">{t('social.noSave')}</p>
        <Link to="/parties" className="btn-primary mt-4">
          {t('layout.career.create')}
        </Link>
      </div>
    );

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <section className="min-w-0" aria-label={t('social.title')}>
        {!isLoading && !feed.posts.length && <p className="card text-brun">{t('social.empty')}</p>}
        <ol className="space-y-3">
          {feed.posts.map((p) => {
            const who = { tag: feed.tag, club: feed.club, handle };
            const name = t(`social.authors.${p.author}.name`, { ...who, interpolation: { escapeValue: false } });
            const text = postText(t, exists, p, feed);
            if (!text) return null;
            return (
              <li key={p.id} className="card p-4">
                <div className="flex items-start gap-3">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${p.author === 'club' ? 'bg-orange text-canard' : p.author === 'reporter' || p.author === 'insider' ? 'bg-canard text-white' : 'bg-orange-clair text-canard'}`}
                    aria-hidden
                  >
                    {initials(name) || '#'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                      <span className="font-bold">{name}</span>
                      <span className="text-brun">{t(`social.authors.${p.author}.handle`, { ...who, interpolation: { escapeValue: false } })}</span>
                      <span className="text-xs text-brun">· {dateLabel(p.date, lang)}</span>
                    </p>
                    <p className="mt-1">
                      {text}
                      {p.tags.map((tag) => (
                        <span key={tag} className="ml-1 font-semibold text-orange-fonce">
                          {tag === 'club' ? `#${feed.tag}` : tag === 'coachOut' ? `#${feed.coach ?? ''}Out` : `#${t('social.tags.champions')}`}
                        </span>
                      ))}
                    </p>
                    <p className="mt-2 text-xs text-brun">♥ {t('social.likes', { count: p.likes })}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <aside className="min-w-0 space-y-4 lg:sticky lg:top-28">
        <div className="card">
          <h2 className="font-sans text-xs font-bold uppercase tracking-wide text-brun">{t('social.moodTitle')}</h2>
          <p className={`mt-3 inline-block rounded-full px-3 py-1 text-sm font-bold ${MOOD_STYLE[feed.mood]}`}>{t(`social.mood.${feed.mood}`)}</p>
          <p className="mt-2 text-sm">{t(`social.moodText.${feed.mood}`)}</p>
        </div>
        <p className="text-xs text-brun">{t('social.invented')}</p>
      </aside>
    </div>
  );
}

const dateLabel = (iso: string, lang?: string) => new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));
