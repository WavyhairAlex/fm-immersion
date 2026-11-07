import { gazetteIssues, type GazetteIssue } from '@fm-immersion/module-fm';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { fmData, savesData } from '../lib/data';
import { getWebhook, isWebhook } from '../lib/discord';
import { GAZETTE_SAVE_KEY, markGazetteSent, sendGazette } from '../lib/gazette-auto';
import { paperName, storyText, weekLabel } from '../lib/gazette-text';
import { drawUne, recentForm } from '../lib/gazette-une';
import { loadFace } from '../lib/player-face';

const SAVE_KEY = GAZETTE_SAVE_KEY;
const readSave = () => {
  try {
    return localStorage.getItem(SAVE_KEY) ?? '';
  } catch {
    return '';
  }
};

/** Mode Gazette : un journal par semaine de jeu, rédigé à partir des instantanés de la partie. */
export function Gazette() {
  const { t } = useTranslation();
  const { data: saves = [] } = useQuery({ queryKey: ['saves'], queryFn: savesData.list });
  const fmSaves = saves.filter((s) => s.gameId === 'fm');
  const [saveId, setSaveId] = useState(readSave());
  useEffect(() => {
    if ((!saveId || !fmSaves.some((s) => s.id === saveId)) && fmSaves[0]) setSaveId(fmSaves[0].id);
  }, [fmSaves, saveId]);
  useEffect(() => {
    try {
      if (saveId) localStorage.setItem(SAVE_KEY, saveId);
    } catch {
      /* rien */
    }
  }, [saveId]);

  const { data: history = [], isLoading } = useQuery({ queryKey: ['fm', 'all', saveId], queryFn: () => fmData.all(saveId), enabled: !!saveId });
  const issues = useMemo(() => gazetteIssues(history), [history]);
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [saveId]);
  const issue = issues[index];

  return (
    <div className="w-full px-6 py-6 xl:px-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">{t('modes.gazette.title')}</h1>
        {fmSaves.length > 1 && (
          <select className="input w-auto" value={saveId} onChange={(e) => setSaveId(e.target.value)} aria-label={t('gazette.save')}>
            {fmSaves.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {!fmSaves.length && (
        <div className="card mt-6 max-w-3xl">
          <p className="text-brun">{t('gazette.noSave')}</p>
          <Link to="/coach" className="btn-primary mt-4">
            {t('modes.coach.title')}
          </Link>
        </div>
      )}
      {!!fmSaves.length && !isLoading && !issues.length && <p className="card mt-6 max-w-3xl text-brun">{t('gazette.empty')}</p>}

      {issue && (
        <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_16rem]">
          <div className="min-w-0 space-y-6">
            <UnePreview issues={issues} index={index} />
            <Paper issue={issue} />
          </div>
          <aside className="flex flex-col gap-2">
            <SendButton saveId={saveId} issues={issues} index={index} />
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
  const head = storyText(t, issue.club, issue.headline);
  return (
    <article className="card rounded-xl p-0">
      <header className="border-b-4 border-orange px-6 py-4">
        <p className="font-display text-3xl font-semibold">{paperName(t, issue.club)}</p>
        <p className="mt-1 text-xs font-bold uppercase tracking-wide text-brun">
          {t('gazette.issue', { number: issue.number })} · {weekLabel(t, i18n.resolvedLanguage, issue.weekStart, issue.weekEnd)}
        </p>
      </header>
      <section className="border-b border-canard/10 px-6 py-5">
        <h2 className="font-display text-2xl font-semibold leading-tight">{head.title}</h2>
        {head.body && <p className="mt-2 text-brun">{head.body}</p>}
      </section>
      <div className="grid gap-x-8 gap-y-5 px-6 py-5 md:grid-cols-2">
        {issue.stories.map((s, i) => {
          const x = storyText(t, issue.club, s);
          return (
            <section key={i}>
              <h3 className="font-sans text-sm font-extrabold">{x.title}</h3>
              {x.body && <p className="mt-1 text-sm text-brun">{x.body}</p>}
            </section>
          );
        })}
      </div>
    </article>
  );
}

/** Une en image, telle qu'elle part sur Discord. */
function UnePreview({ issues, index }: { issues: GazetteIssue[]; index: number }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;
  const issue = issues[index]!;
  const { data: url } = useQuery({
    queryKey: ['gazette', 'une', issue.club, issue.weekStart, issue.date, lang, index, issues.length],
    queryFn: async () =>
      (await drawUne(t, issue, { form: recentForm(issues, index), lang, face: await loadFace(issue.headline.params.bestId) })).toDataURL('image/png'),
  });
  if (!url) return <div className="aspect-video w-full animate-pulse rounded-xl bg-canard/5" />;
  return <img src={url} alt={t('gazette.preview')} className="w-full rounded-xl shadow-sm ring-1 ring-canard/10" />;
}

function SendButton({ saveId, issues, index }: { saveId: string; issues: GazetteIssue[]; index: number }) {
  const { t, i18n } = useTranslation();
  const webhook = getWebhook();
  const send = useMutation({
    mutationFn: async () => {
      await sendGazette(t, i18n.resolvedLanguage, issues, index);
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
