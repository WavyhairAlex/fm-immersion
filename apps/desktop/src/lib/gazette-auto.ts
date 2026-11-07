import { gazetteIssues, seasonReviews, seasonSoFar, type GazetteIssue, type SeasonReview } from '@fm-immersion/module-fm';
import { useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import type { TFunction } from 'i18next';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { CAREER_KEY } from './career';
import { fmData, savesData } from './data';
import { getWebhook, isWebhook, sendDiscordImage } from './discord';
import { importMissingHistory } from './fm-history';
import { discordPayload } from './gazette-text';
import { canvasPng, drawUne, recentForm } from './gazette-une';
import { loadFace } from './player-face';
import { drawSeason, seasonPayload } from './season-une';

/** Envoie la gazette n° `index` (une en image + encart), comme le bouton « Envoyer sur Discord ». */
export async function sendGazette(
  t: TFunction,
  lang: string | undefined,
  issues: GazetteIssue[],
  index: number,
  figures: SeasonReview | null = null,
  webhook = getWebhook(),
) {
  const issue = issues[index]!;
  const png = await canvasPng(await drawUne(t, issue, { form: recentForm(issues, index), lang, face: await loadFace(issue.headline.params.bestId), figures }));
  const payload = discordPayload(t, issue, lang, figures);
  const embed = { ...payload.embeds[0]!, image: { url: 'attachment://une.png' } };
  return sendDiscordImage({ ...payload, embeds: [embed], attachments: [{ id: 0, filename: 'une.png' }] }, png, webhook);
}

/** Envoie le numéro spécial « Bilan de la saison » (une en image + encart). */
export async function sendSeason(t: TFunction, r: SeasonReview, lang?: string, webhook = getWebhook()) {
  const png = await canvasPng(await drawSeason(t, r, { face: await loadFace(r.topScorer?.id), lang }));
  return sendDiscordImage(seasonPayload(t, r, lang), png, webhook);
}

/** Dernier bilan de saison envoyé : partie et date de fin de saison. */
const SEASON_SENT_KEY = 'fmi.discord.seasonSent';
export const seasonSentKey = (saveId: string, r: SeasonReview) => `${saveId}|${r.end}`;
export const isSeasonSent = (saveId: string, r: SeasonReview) => read(SEASON_SENT_KEY) === seasonSentKey(saveId, r);
export const markSeasonSent = (saveId: string, r: SeasonReview) => write(SEASON_SENT_KEY, seasonSentKey(saveId, r));

/** Le bilan part une fois, peu après la fin de saison (pas celui d'une saison finie depuis des mois). */
export function seasonToSend(reviews: SeasonReview[], lastDate: string | undefined, sent: (r: SeasonReview) => boolean): SeasonReview | null {
  const r = reviews[0];
  if (!r || !lastDate || sent(r)) return null;
  const days = (Date.parse(lastDate.slice(0, 10)) - Date.parse(r.end.slice(0, 10))) / 86_400_000;
  return days <= 60 ? r : null;
}

/** Envoi automatique de la gazette chaque semaine de jeu, activé par le joueur (gardé sur ce PC). */
const AUTO_KEY = 'fmi.discord.gazetteAuto';
/** Dernière gazette envoyée automatiquement : partie et lundi de la semaine. */
const SENT_KEY = 'fmi.discord.gazetteSent';
/** Carrière suivie par toute l'appli (choisie dans la barre latérale). */
const GAZETTE_SAVE_KEY = CAREER_KEY;

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v == null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* stockage indisponible */
  }
};

/** Note une gazette comme envoyée (aussi à la main), pour que l'envoi automatique ne la renvoie pas. */
export function markGazetteSent(saveId: string, weekStart: string) {
  const [sentSave, sentWeek] = (read(SENT_KEY) ?? '').split('|');
  if (sentSave !== saveId || !sentWeek || weekStart > sentWeek) write(SENT_KEY, `${saveId}|${weekStart}`);
}

export const getGazetteAuto = () => read(AUTO_KEY) === '1';
export const setGazetteAuto = (on: boolean) => write(AUTO_KEY, on ? '1' : null);

/**
 * Gazette à envoyer : la dernière semaine terminée (la semaine en cours, la plus récente, s'écrit encore).
 * Une seule à la fois, jamais d'anciens numéros : à l'activation, seule la dernière semaine terminée part.
 */
export function gazetteToSend(issues: GazetteIssue[], saveId: string, sent: string | null): number | null {
  const done = issues[1];
  if (!done) return null;
  const [sentSave, sentWeek] = (sent ?? '').split('|');
  if (sentSave === saveId && sentWeek && sentWeek >= done.weekStart) return null;
  return 1;
}

/**
 * Monté une fois pour toute l'appli : chaque minute, si le joueur l'a activé et relié un salon, relit l'instantané
 * du plugin (comme FM Coach) puis envoie la gazette dès qu'une semaine de jeu est terminée, et le bilan de la saison
 * dès que le dernier match de championnat est joué.
 */
export function useGazetteAuto() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const busy = useRef(false);
  const lastText = useRef<string | null>(null);
  useEffect(() => {
    const tick = async () => {
      if (busy.current || !getGazetteAuto() || !isWebhook(getWebhook())) return;
      busy.current = true;
      try {
        const fmSaves = (await savesData.list()).filter((s) => s.gameId === 'fm');
        const saveId = fmSaves.find((s) => s.id === read(GAZETTE_SAVE_KEY))?.id ?? fmSaves[0]?.id;
        if (!saveId) return;
        // Instantané du jour : importé ici aussi, pour que la gazette parte même si FM Coach n'est pas ouvert.
        try {
          const folder = (await fmData.settings(saveId)).fmFolder ?? (await invoke<string | null>('fm_default_folder'));
          const text = folder ? await invoke<string>('fm_read_snapshot', { folder }) : null;
          if (text && text !== lastText.current) {
            lastText.current = text;
            await fmData.importSnapshot(saveId, JSON.parse(text));
            qc.invalidateQueries({ queryKey: ['fm'] });
          }
        } catch {
          /* fichier absent, en cours d'écriture, ou autre partie chargée */
        }
        // Jours de jeu passés sans l'appli (fichiers datés du plugin) : rattrapés pour que chaque match ait sa brève.
        try {
          const folder = (await fmData.settings(saveId)).fmFolder ?? (await invoke<string | null>('fm_default_folder'));
          if (folder) {
            const n = await importMissingHistory(saveId, folder, (await fmData.settings(saveId)).fmClub ?? (await fmData.latest(saveId))?.club ?? null);
            if (n) qc.invalidateQueries({ queryKey: ['fm'] });
          }
        } catch {
          /* dossier illisible */
        }
        const history = await fmData.all(saveId);
        const issues = gazetteIssues(history);
        const index = gazetteToSend(issues, saveId, read(SENT_KEY));
        if (index != null) {
          await sendGazette(t, i18n.resolvedLanguage, issues, index, seasonSoFar(history, issues[index]!.date));
          markGazetteSent(saveId, issues[index]!.weekStart);
        }
        // Fin du championnat : numéro spécial, après la gazette de la semaine.
        const lastDate = history
          .map((h) => h.gameDate)
          .sort()
          .at(-1);
        const season = seasonToSend(seasonReviews(history), lastDate, (r) => isSeasonSent(saveId, r));
        if (season) {
          await sendSeason(t, season, i18n.resolvedLanguage);
          markSeasonSent(saveId, season);
        }
      } catch (e) {
        console.warn('Gazette automatique :', e);
      } finally {
        busy.current = false;
      }
    };
    const id = window.setInterval(tick, 60_000);
    void tick();
    return () => window.clearInterval(id);
  }, [t, i18n, qc]);
}
