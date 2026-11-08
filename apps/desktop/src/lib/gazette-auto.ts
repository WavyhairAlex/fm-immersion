import { coachExits, gazetteIssues, seasonReviews, seasonSoFar, type CoachExit, type ExitReason, type GazetteIssue, type SeasonReview } from '@fm-immersion/module-fm';
import { useQueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { withWriting } from './ai-gazette';
import { CAREER_KEY } from './career';
import { rememberClubLooks } from './club-look';
import { fmData, savesData } from './data';
import { getWebhook, isWebhook, sendDiscordImage } from './discord';
import { fetchHistory } from './fm-cache';
import { drawFarewell } from './farewell-page';
import { farewellPayload } from './farewell-text';
import { drawPage } from './gazette-page';
import { discordPagePayload } from './gazette-text';
import { canvasPng, recentForm } from './gazette-une';
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
  // Tout le journal sur une seule image (page complète), avec un court encart : pas de long texte dans le salon.
  const png = await canvasPng(await drawPage(t, issue, { form: recentForm(issues, index), lang, face: await loadFace(issue.headline.params.bestId), figures, faceFor: loadFace }));
  return sendDiscordImage(discordPagePayload(t, issue, lang), png, webhook);
}

/** Envoie le numéro spécial « Bilan de la saison » (une en image + encart). */
export async function sendSeason(t: TFunction, r: SeasonReview, lang?: string, webhook = getWebhook()) {
  const png = await canvasPng(await drawSeason(t, r, { face: await loadFace(r.topScorer?.id), lang }));
  return sendDiscordImage(seasonPayload(t, r, lang), png, webhook);
}

/** Photo du coach choisie dans la barre latérale (data URL), en image prête à dessiner ; null sans photo. */
export async function loadCoachPhoto(saveId: string): Promise<HTMLImageElement | null> {
  try {
    const src = (await fmData.settings(saveId)).coachPhoto;
    if (!src) return null;
    const img = new Image();
    img.src = src;
    await img.decode();
    return img;
  } catch {
    return null;
  }
}

/** Raison du départ corrigée par le joueur (licenciement ou départ), sinon celle devinée. Gardée sur ce PC. */
const exitKey = (saveId: string, x: CoachExit) => `fmi.gazette.exit.${saveId}|${x.club}|${x.end}`;
export const exitReason = (saveId: string, x: CoachExit): ExitReason => {
  const v = read(exitKey(saveId, x));
  return v === 'sacked' || v === 'left' ? v : x.reason;
};
export const setExitReason = (saveId: string, x: CoachExit, r: ExitReason) => write(exitKey(saveId, x), r);

/** Hors-série « Flash spécial » du départ du coach (page en image + encart). */
export async function sendFarewell(t: TFunction, saveId: string, x: CoachExit, lang?: string, webhook = getWebhook()) {
  const reason = exitReason(saveId, x);
  const png = await canvasPng(await drawFarewell(t, x, { reason, lang, photo: await loadCoachPhoto(saveId) }));
  return sendDiscordImage(farewellPayload(t, x, reason, lang), png, webhook);
}

/** Hors-série déjà envoyés (aussi à la main), pour que l'envoi automatique ne les renvoie pas. */
const FAREWELL_SENT_KEY = 'fmi.discord.farewellSent';
const farewellId = (saveId: string, x: CoachExit) => `${saveId}|${x.club}|${x.end}`;
export const isFarewellSent = (saveId: string, x: CoachExit) => (read(FAREWELL_SENT_KEY) ?? '').split('\n').includes(farewellId(saveId, x));
export const markFarewellSent = (saveId: string, x: CoachExit) =>
  write(FAREWELL_SENT_KEY, [...(read(FAREWELL_SENT_KEY) ?? '').split('\n').filter(Boolean), farewellId(saveId, x)].slice(-20).join('\n'));

/** Le hors-série part une fois, peu après le départ (pas celui d'un club quitté il y a des mois). */
export function farewellToSend(exits: CoachExit[], lastDate: string | undefined, sent: (x: CoachExit) => boolean): CoachExit | null {
  const x = exits[0];
  if (!x || sent(x)) return null;
  const ref = lastDate && lastDate > x.end ? lastDate : x.end;
  const days = (Date.parse(ref.slice(0, 10)) - Date.parse(x.end.slice(0, 10))) / 86_400_000;
  return days <= 45 ? x : null;
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
 * du plugin (comme FM Coach) puis envoie la gazette dès qu'une semaine de jeu est terminée, le bilan de la saison
 * dès que le dernier match de championnat est joué, et le hors-série quand le coach quitte son club.
 */
export function useGazetteAuto() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const busy = useRef(false);
  useEffect(() => {
    const tick = async () => {
      if (busy.current || !getGazetteAuto() || !isWebhook(getWebhook())) return;
      busy.current = true;
      try {
        const fmSaves = (await savesData.list()).filter((s) => s.gameId === 'fm');
        const saveId = fmSaves.find((s) => s.id === read(GAZETTE_SAVE_KEY))?.id ?? fmSaves[0]?.id;
        if (!saveId) return;
        // L'instantané du jour et les jours rattrapés sont importés par la lecture du plugin (`useFmSync`, active dans
        // toute l'appli) : ici, on lit seulement l'historique, dans le cache tenu à jour par celle-ci.
        const history = await fetchHistory(qc, saveId);
        rememberClubLooks(history.map((h) => h.data));
        const issues = gazetteIssues(history);
        const index = gazetteToSend(issues, saveId, read(SENT_KEY));
        if (index != null) {
          // Rédigée par l'IA du joueur quand elle est branchée (sinon, ou si elle échoue, avec les phrases toutes faites).
          issues[index] = await withWriting(t, issues[index]!, i18n.resolvedLanguage, saveId);
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
        // Le coach a quitté son club (autre club, ou sans club d'après le plugin) : hors-série « Flash spécial ».
        const freeSince = (await fmData.settings(saveId)).fmFreeSince ?? null;
        const exit = farewellToSend(coachExits(history, { freeSince }), lastDate, (x) => isFarewellSent(saveId, x));
        if (exit) {
          await sendFarewell(t, saveId, exit, i18n.resolvedLanguage);
          markFarewellSent(saveId, exit);
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
