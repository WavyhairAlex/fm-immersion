import { backForMatch, gazetteIssues, type FmPlayer } from '@fm-immersion/module-fm';
import { useQuery } from '@tanstack/react-query';
import { useContext, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { gazettePhoto } from '../lib/gazette-auto';
import { storyText } from '../lib/gazette-text';
import { useHistory } from '../lib/fm-cache';
import { PlayerSheetContext } from '../pages/FmUi';
import { Face } from './Face';

type StaffStory = { player: FmPlayer; kind: 'back' | 'injured' | 'suspended' | 'form' };

/**
 * Le joueur dont le staff parle aujourd'hui : un retour de blessure à temps pour le match d'abord, puis le blessé
 * ou le suspendu le plus important, sinon le joueur le plus en forme (note moyenne sur au moins trois matchs).
 */
export function staffStory(players: FmPlayer[]): StaffStory | null {
  const byLevel = (a: FmPlayer, b: FmPlayer) => (b.level ?? 0) - (a.level ?? 0);
  const back = players.filter((p) => backForMatch(p)).sort(byLevel)[0];
  if (back) return { player: back, kind: 'back' };
  const injured = players.filter((p) => p.injury).sort(byLevel)[0];
  if (injured) return { player: injured, kind: 'injured' };
  const suspended = players.filter((p) => p.suspension).sort(byLevel)[0];
  if (suspended) return { player: suspended, kind: 'suspended' };
  const form = players.filter((p) => p.avgRating != null && (p.apps ?? 0) >= 3).sort((a, b) => b.avgRating! - a.avgRating!)[0];
  return form ? { player: form, kind: 'form' } : null;
}

/** Carte « Point du staff » de l'accueil : un joueur, sa photo, une phrase, et sa fiche. */
export function StaffPoint({ players }: { players: FmPlayer[] }) {
  const { t, i18n } = useTranslation();
  const open = useContext(PlayerSheetContext);
  const story = useMemo(() => staffStory(players), [players]);
  if (!story) return null;
  const p = story.player;
  const rating = p.avgRating == null ? '' : p.avgRating.toLocaleString(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <section className="card flex flex-col p-5">
      <h2 className="text-xs font-bold uppercase tracking-widest text-canard">{t('layout.today.staff.title')}</h2>
      <span className="mt-1.5 block h-1 w-10 rounded-full bg-orange" aria-hidden />
      <div className="mt-4 flex flex-1 gap-4">
        <Face id={p.id} name={p.name} size={120} className="!rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-2xl font-semibold leading-tight">{p.name}</p>
          <p className="mt-0.5 text-brun">{t(`layout.today.staff.${story.kind}`)}</p>
          <p className="mt-2 text-sm">
            {t(`layout.today.staff.${story.kind}Text`, {
              injury: p.injury ?? '',
              count: p.injuryDays ?? 0,
              suspension: p.suspension ?? '',
              rating,
              apps: p.apps ?? 0,
              goals: p.goals ?? 0,
            })}
          </p>
          {open && (
            <button type="button" className="mt-3 text-sm font-bold text-orange-fonce hover:underline" onClick={() => open(p.id)}>
              {t('layout.today.staff.sheet')} →
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

/** Carte « La Gazette » de l'accueil : la une de la dernière gazette, façon papier, avec sa photo de situation si elle existe. */
export function GazetteUne({ saveId }: { saveId: string }) {
  const { t } = useTranslation();
  const { data: history = [] } = useHistory(saveId);
  const issue = useMemo(() => gazetteIssues(history)[0] ?? null, [history]);
  const { data: photo = null } = useQuery({
    queryKey: ['gazette', 'une-photo', saveId, issue?.number, issue?.weekStart],
    queryFn: () => gazettePhoto(saveId, issue!, false),
    enabled: !!issue,
  });
  if (!issue) return null;
  const title = storyText(t, issue.club, issue.headline).title;
  return (
    <Link to="/gazette" className="card group flex flex-col bg-orange-clair/25 p-5 hover:ring-orange/40" aria-label={`${t('modes.gazette.title')} · ${title}`}>
      <div className="flex items-center gap-3" aria-hidden>
        <span className="h-px flex-1 bg-canard/40" />
        <span className="font-display text-2xl font-semibold italic">{t('layout.today.gazette', { club: issue.club })}</span>
        <span className="h-px flex-1 bg-canard/40" />
      </div>
      <p className="mt-1 text-center text-xs uppercase tracking-widest text-brun">{t('gazette.issue', { number: issue.number })}</p>
      {photo && <img src={photo.src} alt="" className="mt-3 aspect-[16/7] w-full rounded object-cover grayscale" />}
      <p className="mt-3 flex-1 font-display text-3xl font-semibold leading-tight">{title}</p>
      <span className="mt-3 border-t border-canard/30 pt-2 text-sm font-bold text-orange-fonce group-hover:underline">{t('layout.today.read')} →</span>
    </Link>
  );
}
