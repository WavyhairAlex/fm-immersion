import { AiLink } from '../components/AiSettingsCard';
import { gazetteIssues, seasonReviews, seasonSoFar, visibleOn, type GazetteIssue, type SeasonReview } from '@fm-immersion/module-fm';
import { Face } from '../components/Face';
import { SeasonCard } from '../components/SeasonCard';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { aiFor, getAiSettings } from '../lib/ai';
import { useGazetteWriting, writeGazette } from '../lib/ai-gazette';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useCareer } from '../lib/career';
import { clubLogoUrl, clubLook, rememberClubLooks } from '../lib/club-look';
import { useHistory } from '../lib/fm-cache';
import { getWebhook, isWebhook } from '../lib/discord';
import { markGazetteSent, markSeasonSent, sendGazette, sendSeason } from '../lib/gazette-auto';
import { articleText, editorialText, headlineText, paperName, storyText, weekLabel } from '../lib/gazette-text';
import { drawPage } from '../lib/gazette-page';
import { recentForm } from '../lib/gazette-une';
import { loadFace } from '../lib/player-face';
import { drawSeason } from '../lib/season-une';

/** Mode Gazette : un journal par semaine de jeu, rédigé à partir des instantanés de la partie. */
export function Gazette() {
  const { t } = useTranslation();
  // Carrière suivie, choisie dans la barre latérale.
  const { saveId, fmSaves } = useCareer();

  const { data: history = [], isLoading } = useHistory(saveId);
  // Couleurs et logos des clubs vus dans l'historique (bandeau, filets, logos de la une).
  const looksReady = useMemo(() => {
    rememberClubLooks(history.map((h) => h.data));
    return history.length;
  }, [history]);
  const issues = useMemo(() => gazetteIssues(history), [history]);
  const reviews = useMemo(() => seasonReviews(history), [history]);
  const season = reviews[0] ?? null;
  // Carte de fin de saison : saisons finies, et la saison en cours en aperçu tant qu'elle n'est pas finie.
  const cards = useMemo(() => {
    const now = history.length ? seasonSoFar(history, history.reduce((a, e) => (e.gameDate > a ? e.gameDate : a), '')) : null;
    return now?.ongoing && now.played > 0 ? [now, ...reviews] : reviews;
  }, [history, reviews]);
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [saveId]);
  const raw = issues[index];
  // Texte de l'IA du joueur (si elle est branchée), demandé en arrière-plan : la gazette s'affiche d'abord sans lui.
  const writing = useGazetteWriting(saveId, raw);
  const issue = raw && writing.data ? { ...raw, written: writing.data } : raw;
  const shown = useMemo(() => (issue ? issues.map((x, i) => (i === index ? issue : x)) : issues), [issues, issue, index]);
  const figures = useMemo(() => (issue ? seasonSoFar(history, issue.date) : null), [history, issue]);

  return (
    <div className="w-full">
      <p className="max-w-3xl text-brun">{t('modes.gazette.details')}</p>

      {!fmSaves.length && (
        <div className="card mt-6 max-w-3xl">
          <p className="text-brun">{t('gazette.noSave')}</p>
          <Link to="/parties" className="btn-primary mt-4">
            {t('layout.career.create')}
          </Link>
        </div>
      )}
      {!!fmSaves.length && !isLoading && !issues.length && <p className="card mt-6 max-w-3xl text-brun">{t('gazette.empty')}</p>}

      {cards.length > 0 && <SeasonCard saveId={saveId} seasons={cards} />}
      {season && <SeasonSection saveId={saveId} review={season} />}

      {issue && (
        <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_16rem]">
          <div className="min-w-0 space-y-6">
            <AiStatus saveId={saveId} issue={raw!} state={writing} />
            <UnePreview issues={shown} index={index} figures={figures} looks={looksReady} />
            <Paper issue={issue} />
          </div>
          <aside className="flex flex-col gap-2">
            <SendButton saveId={saveId} issues={shown} index={index} figures={figures} />
            <h2 className="mt-4 text-xs font-bold uppercase tracking-wide text-brun">{t('gazette.archives')}</h2>
            <ul className="flex max-h-[60vh] flex-col gap-1 overflow-auto">
              {issues.map((x, i) => (
                <li key={x.weekStart}>
                  <button type="button" className={`chip w-full justify-between ${i === index ? 'chip-on' : ''}`} onClick={() => setIndex(i)}>
                    <span>{t('gazette.issue', { number: x.number })}</span>
                    <span className="text-xs opacity-70">{x.weekStart}</span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      )}
    </div>
  );
}

export function Paper({ issue }: { issue: GazetteIssue }) {
  const { t, i18n } = useTranslation();
  const head = headlineText(t, issue, i18n.resolvedLanguage);
  const article = articleText(t, issue, i18n.resolvedLanguage) ?? head.body;
  const edito = editorialText(t, issue, i18n.resolvedLanguage);
  // Aux couleurs du club : liseré du titre dans sa couleur qui se voit sur le fond clair, logo du pack de logos.
  const look = clubLook(issue.club);
  const accent = look ? visibleOn(look.colors, '#FFFFFF', '#F26B1D') : null;
  const { data: logo } = useQuery({ queryKey: ['club-logo', issue.club, look?.id ?? null], queryFn: () => clubLogoUrl(issue.club) });
  return (
    <article className="card rounded-xl p-0">
      <header className="flex items-center gap-4 border-b-4 border-orange px-6 py-4" style={accent ? { borderBottomColor: accent } : undefined}>
        {logo && <img src={logo} alt="" className="h-14 w-14 shrink-0 object-contain" />}
        <div className="min-w-0">
          <p className="font-display text-3xl font-semibold">{paperName(t, issue.club)}</p>
          <p className="mt-1 text-xs font-bold uppercase tracking-wide text-brun">
            {t('gazette.issue', { number: issue.number })} · {weekLabel(t, i18n.resolvedLanguage, issue.weekStart, issue.weekEnd)}
          </p>
        </div>
      </header>
      <section className="border-b border-canard/10 px-6 py-5">
        <div className="flex items-start gap-4">
          {(issue.headline.params.bestId ?? issue.headline.params.id) != null && (
            <Face id={(issue.headline.params.bestId ?? issue.headline.params.id) as string | number} name={String(issue.headline.params.best ?? issue.headline.params.name ?? '')} size={64} className="mt-1 ring-2 ring-orange" />
          )}
          <h2 className="font-display text-2xl font-semibold leading-tight">{head.title}</h2>
        </div>
        {article && <p className="mt-2 text-brun">{article}</p>}
      </section>
      {edito && (
        <section className="border-b border-canard/10 bg-orange-clair/40 px-6 py-4">
          <h3 className="font-display text-lg font-semibold">{edito.title}</h3>
          <p className="mt-1 text-sm italic text-canard">{edito.body}</p>
          <p className="mt-2 text-xs text-brun">
            📣 {edito.fans} · 🏛️ {edito.board}
          </p>
        </section>
      )}
      <div className="grid gap-x-8 gap-y-5 px-6 py-5 md:grid-cols-2">
        {issue.stories.map((s, i) => {
          const x = storyText(t, issue.club, s);
          return (
            <section key={i} className="flex gap-3">
              {(s.params.id ?? s.params.bestId) != null && <Face id={(s.params.id ?? s.params.bestId) as string | number} name={String(s.params.name ?? s.params.best ?? '')} size={36} className="mt-0.5" />}
              <div>
              <h3 className="font-sans text-sm font-extrabold">{x.title}</h3>
              {x.body && <p className="mt-1 text-sm text-brun">{x.body}</p>}
              </div>
            </section>
          );
        })}
      </div>
    </article>
  );
}

/** Où en est la rédaction par l'IA : en cours, faite (avec « Réécrire »), ou en panne (les phrases toutes faites restent). */
function AiStatus({ saveId, issue, state }: { saveId: string; issue: GazetteIssue; state: ReturnType<typeof useGazetteWriting> }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const settings = getAiSettings();
  const ai = aiFor('gazette', settings);
  const rewrite = useMutation({
    mutationFn: () => writeGazette(t, issue, i18n.resolvedLanguage, saveId, { force: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gazette', 'ia', saveId, issue.weekStart] }),
  });
  if (!ai) return <AiLink />;
  const busy = state.isFetching || rewrite.isPending;
  const failed = state.isError || rewrite.isError || (state.isSuccess && !state.data && !busy);
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span className={`font-bold ${failed ? 'text-corail' : busy ? 'text-brun' : 'text-eau-fonce'}`}>
        {busy ? t('ai.gazette.writing', { model: ai.model }) : failed ? t('ai.gazette.failed') : t('ai.gazette.written', { model: ai.model })}
      </span>
      {!busy && (
        <button type="button" className="btn-secondary text-xs" onClick={() => rewrite.mutate()}>
          {t('ai.gazette.rewrite')}
        </button>
      )}
      {(state.error || rewrite.error) && <span className="text-xs text-brun">{String(state.error ?? rewrite.error)}</span>}
    </div>
  );
}

/** Une en image, telle qu'elle part sur Discord. */
function UnePreview({ issues, index, figures, looks }: { issues: GazetteIssue[]; index: number; figures: SeasonReview | null; looks: number }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;
  const issue = issues[index]!;
  const { data: url } = useQuery({
    queryKey: ['gazette', 'une', issue.club, issue.weekStart, issue.date, lang, index, issues.length, figures?.end, figures?.played, looks, issue.written?.title, issue.written?.article],
    queryFn: async () =>
      (await drawPage(t, issue, { form: recentForm(issues, index), lang, face: await loadFace(issue.headline.params.bestId), figures })).toDataURL('image/png'),
  });
  if (!url) return <div className="aspect-[3/4] w-full animate-pulse rounded-xl bg-canard/5" />;
  return <img src={url} alt={t('gazette.preview')} className="w-full rounded-xl shadow-sm ring-1 ring-canard/10" />;
}

function SendButton({ saveId, issues, index, figures }: { saveId: string; issues: GazetteIssue[]; index: number; figures: SeasonReview | null }) {
  const { t, i18n } = useTranslation();
  const webhook = getWebhook();
  const send = useMutation({
    mutationFn: async () => {
      await sendGazette(t, i18n.resolvedLanguage, issues, index, figures);
      // La semaine en cours (n° le plus récent) n'est pas terminée : l'envoi automatique la publiera à la fin de la semaine.
      if (index > 0) markGazetteSent(saveId, issues[index]!.weekStart);
    },
  });
  if (!isWebhook(webhook)) {
    return (
      <Link to="/discord" className="btn-secondary text-sm">
        {t('gazette.setupDiscord')}
      </Link>
    );
  }
  return (
    <>
      <button type="button" className="btn-primary text-sm" disabled={send.isPending} onClick={() => send.mutate()}>
        {t('gazette.sendDiscord')}
      </button>
      {send.isSuccess && <p className="text-xs font-bold text-eau-fonce">{t('gazette.sent')}</p>}
      {send.isError && <p className="text-xs font-bold text-corail">{String(send.error)}</p>}
    </>
  );
}

/** Numéro spécial « Bilan de la saison », dès que le dernier match de championnat est joué. */
function SeasonSection({ saveId, review }: { saveId: string; review: SeasonReview }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;
  const { data: url } = useQuery({
    queryKey: ['gazette', 'season', saveId, review.end, review.club, lang],
    queryFn: async () => (await drawSeason(t, review, { face: await loadFace(review.topScorer?.id), lang })).toDataURL('image/png'),
  });
  const send = useMutation({
    mutationFn: async () => {
      await sendSeason(t, review, lang);
      markSeasonSent(saveId, review);
    },
  });
  return (
    <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_16rem]">
      <div className="min-w-0">
        <h2 className="text-xl font-semibold">{t('season.title', { season: review.label })}</h2>
        {url ? (
          <img src={url} alt={t('season.title', { season: review.label })} className="mt-3 w-full rounded-xl shadow-sm ring-1 ring-canard/10" />
        ) : (
          <div className="mt-3 aspect-video w-full animate-pulse rounded-xl bg-canard/5" />
        )}
      </div>
      <aside className="flex flex-col gap-2 xl:pt-10">
        {isWebhook(getWebhook()) ? (
          <button type="button" className="btn-primary text-sm" disabled={send.isPending} onClick={() => send.mutate()}>
            {t('season.send')}
          </button>
        ) : (
          <Link to="/discord" className="btn-secondary text-sm">
            {t('gazette.setupDiscord')}
          </Link>
        )}
        {send.isSuccess && <p className="text-xs font-bold text-eau-fonce">{t('season.sent')}</p>}
        {send.isError && <p className="text-xs font-bold text-corail">{String(send.error)}</p>}
      </aside>
    </section>
  );
}
