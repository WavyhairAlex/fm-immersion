import type { SeasonReview } from '@fm-immersion/module-fm';
import { useMutation, useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { getWebhook, isWebhook, sendDiscordImage } from '../lib/discord';
import { canvasPng } from '../lib/gazette-une';
import { cardFaces, cardFileName, cardPayload, drawSeasonCard } from '../lib/season-card';

/**
 * Carte de fin de saison à partager : aperçu, choix de la saison (les saisons finies, plus la saison en cours en
 * aperçu), copie dans le presse-papiers (à coller dans Discord), enregistrement dans Images\FM Immersion, envoi par
 * le webhook du joueur.
 */
export function SeasonCard({ saveId, seasons }: { saveId: string; seasons: SeasonReview[] }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [saveId, seasons.length]);
  const r = seasons[Math.min(index, seasons.length - 1)];

  const { data: png } = useQuery({
    queryKey: ['gazette', 'card', saveId, r?.club, r?.start, r?.end, r?.played, lang],
    enabled: !!r,
    queryFn: async () => {
      const canvas = await drawSeasonCard(t, r!, { faces: await cardFaces(r!), lang });
      const bytes = await canvasPng(canvas);
      return { bytes, url: URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/png' })) };
    },
  });

  const copy = useMutation({
    mutationFn: async () => {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': new Blob([png!.bytes as BlobPart], { type: 'image/png' }) })]);
    },
  });
  const save = useMutation({ mutationFn: () => invoke<string>('image_save', { name: cardFileName(r!), png: Array.from(png!.bytes) }) });
  const send = useMutation({ mutationFn: () => sendDiscordImage(cardPayload(t, r!, lang), png!.bytes) });

  if (!r) return null;
  const label = (x: SeasonReview) => (x.ongoing ? t('card.current', { season: x.label }) : x.label);
  return (
    <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,34rem)_1fr]">
      <div className="min-w-0">
        <h2 className="text-xl font-semibold">{t('card.title')}</h2>
        <p className="mt-1 text-sm text-brun">{t('card.intro')}</p>
        {png ? (
          <img src={png.url} alt={t('card.title')} className="mt-3 w-full rounded-xl shadow-sm ring-1 ring-canard/10" />
        ) : (
          <div className="mt-3 aspect-[4/5] w-full animate-pulse rounded-xl bg-canard/5" />
        )}
      </div>
      <aside className="flex max-w-sm flex-col gap-2 xl:pt-16">
        {seasons.length > 1 && (
          <label className="text-xs font-bold uppercase tracking-wide text-brun">
            {t('card.season')}
            <select className="input mt-1 w-full" value={index} onChange={(e) => setIndex(Number(e.target.value))}>
              {seasons.map((x, i) => (
                <option key={`${x.club}|${x.start}`} value={i}>
                  {label(x)} · {x.club}
                </option>
              ))}
            </select>
          </label>
        )}
        {r.ongoing && <p className="rounded-lg bg-orange-clair px-3 py-2 text-sm text-canard">{t('card.preview')}</p>}
        <button type="button" className="btn-primary text-sm" disabled={!png || copy.isPending} onClick={() => copy.mutate()}>
          {t('card.copy')}
        </button>
        <button type="button" className="btn-secondary text-sm" disabled={!png || save.isPending} onClick={() => save.mutate()}>
          {t('card.save')}
        </button>
        {isWebhook(getWebhook()) ? (
          <button type="button" className="btn-secondary text-sm" disabled={!png || send.isPending} onClick={() => send.mutate()}>
            {t('card.send')}
          </button>
        ) : (
          <Link to="/discord" className="btn-secondary text-sm">
            {t('gazette.setupDiscord')}
          </Link>
        )}
        {copy.isSuccess && <p className="text-xs font-bold text-eau-fonce">{t('card.copied')}</p>}
        {copy.isError && <p className="text-xs font-bold text-corail">{t('card.copyError')}</p>}
        {save.isSuccess && <p className="break-all text-xs font-bold text-eau-fonce">{t('card.saved', { path: save.data })}</p>}
        {save.isError && <p className="text-xs font-bold text-corail">{String(save.error)}</p>}
        {send.isSuccess && <p className="text-xs font-bold text-eau-fonce">{t('card.sent')}</p>}
        {send.isError && <p className="text-xs font-bold text-corail">{String(send.error)}</p>}
        <p className="mt-2 text-xs text-brun">{t('card.faces')}</p>
      </aside>
    </section>
  );
}
