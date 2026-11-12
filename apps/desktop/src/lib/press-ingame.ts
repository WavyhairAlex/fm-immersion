import { ANSWER_TONES, answerTones, pendingConference, type AnswerTone, type PressAnswer, type PressConference } from '@fm-immersion/module-fm';
import { useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import type { TFunction } from 'i18next';
import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useCareer } from './career';
import { fmData } from './data';
import { useHistory } from './fm-cache';
import { useFmFolder } from './fm-sync';
import { answerText, askedBy, pressKeyOf, recentAnswers, usePressHeld, usePressQuestions } from './press';

/**
 * Conférence de presse dans FM27 : FM Immersion dépose la conférence du moment dans le dossier du plugin
 * (`fmimmersion-presse.json`), le plugin l'affiche par-dessus le jeu et écrit les réponses du coach
 * (`fmimmersion-presse-reponse.json`), que l'appli enregistre comme si elles avaient été données ici.
 * Rien n'est envoyé au jeu : c'est notre conférence, pas celle de FM.
 */

/** Relecture des réponses écrites par le plugin. */
const ANSWER_POLL_MS = 10_000;
const MAX_ANSWER = 400;

export interface InGameConference {
  format: 'fmi-presse/1';
  key: string;
  title: string;
  subtitle: string;
  questions: { id: string; by: string; text: string; answers: { tone: AnswerTone; label: string; text: string }[] }[];
  ui: { free: string; send: string; skip: string; decline: string; later: string; thanks: string };
}

const dateLabel = (iso: string, lang?: string) => new Intl.DateTimeFormat(lang, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));

/** La conférence telle que le plugin l'affiche : tous les textes déjà rédigés dans la langue du joueur. */
export function inGameConference(t: TFunction, c: PressConference, club: string, texts: string[], lang?: string, avoid?: ReadonlySet<string>): InGameConference {
  return {
    format: 'fmi-presse/1',
    key: c.key,
    title: t(`press.page.${c.kind}`, { opponent: c.opponent }),
    subtitle: t('press.page.date', { date: dateLabel(c.date, lang) }) + (c.competition ? ` · ${c.competition}` : ''),
    questions: c.questions.map((q, i) => ({
      id: q.id,
      by: askedBy(t, q, club),
      text: texts[i] ?? '',
      answers: answerTones(q).map((tone) => ({ tone, label: t(`press.tones.${tone}`), text: answerText(t, q, tone, lang, avoid) })),
    })),
    ui: {
      free: t('press.ingame.free'),
      send: t('press.ingame.send'),
      skip: t('press.ingame.skip'),
      decline: t('press.page.decline'),
      later: t('press.ingame.later'),
      thanks: t('press.ingame.thanks'),
    },
  };
}

/** Réponses écrites par le plugin, vérifiées : seulement pour cette conférence, sujets et tons connus, textes bornés. */
export function parseInGameAnswer(raw: string, c: PressConference): PressAnswer[] | null {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== 'object') return null;
  const o = v as { key?: unknown; declined?: unknown; answers?: unknown };
  if (o.key !== c.key) return null;
  if (o.declined === true || !Array.isArray(o.answers)) return [];
  const topics = new Set<string>(c.questions.map((q) => q.id));
  const out: PressAnswer[] = [];
  for (const a of o.answers as unknown[]) {
    if (!a || typeof a !== 'object') continue;
    const { question, tone, text } = a as { question?: unknown; tone?: unknown; text?: unknown };
    if (typeof question !== 'string' || !topics.has(question) || out.some((x) => x.question === question)) continue;
    const clean = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim().slice(0, MAX_ANSWER) : '';
    if (!clean) continue;
    const okTone = typeof tone === 'string' && (ANSWER_TONES as readonly string[]).includes(tone) ? (tone as AnswerTone) : null;
    out.push({ question: question as PressAnswer['question'], tone: okTone, text: clean });
  }
  return out;
}

/** Monté une fois pour toute l'appli, à côté de la lecture du plugin. */
export function usePressInGame() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;
  const qc = useQueryClient();
  const { saveId } = useCareer();
  const folder = useFmFolder(saveId);
  const { data: history = [] } = useHistory(saveId);
  const { data: held } = usePressHeld(saveId);
  const pending = useMemo(() => (held ? pendingConference(history, new Set(held.map((h) => h.key)), held) : null), [history, held]);
  const club = history.at(-1)?.data.club ?? pending?.club ?? '';
  const { texts, rewording } = usePressQuestions(club, pending);
  const written = useRef<string | null | undefined>(undefined);
  const textsRef = useRef(texts);
  textsRef.current = texts;

  // Dépose (ou retire) la conférence pour le plugin ; on attend la reformulation de l'IA si elle est en cours.
  const json = useMemo(
    () => (!held ? undefined : pending ? (rewording ? undefined : JSON.stringify(inGameConference(t, pending, club, texts, lang, recentAnswers(held)), null, 1)) : null),
    [held, pending, rewording, t, club, texts, lang],
  );
  useEffect(() => {
    if (!folder || json === undefined || json === written.current) return;
    invoke('fm_write_press', { folder, json })
      .then(() => (written.current = json))
      .catch((e) => console.warn('Conférence pour FM27 :', e));
  }, [folder, json]);
  useEffect(() => {
    written.current = undefined;
  }, [folder, saveId]);

  // Relit les réponses données dans FM27 tant qu'une conférence attend.
  useEffect(() => {
    if (!folder || !saveId || !pending) return;
    let stop = false;
    const tick = async () => {
      try {
        const raw = await invoke<string | null>('fm_read_press_answer', { folder });
        const answers = raw ? parseInGameAnswer(raw, pending) : null;
        if (stop || !answers) return;
        const asked = textsRef.current;
        await fmData.savePressConference({
          saveId,
          key: pending.key,
          kind: pending.kind,
          matchDate: pending.date,
          club: pending.club,
          opponent: pending.opponent,
          competition: pending.competition,
          questions: pending.questions.map((q, i) => ({ id: q.id, text: asked[i] ?? '', ...(q.outlet ? { outlet: q.outlet } : {}), ...(q.reporter ? { reporter: q.reporter } : {}) })),
          answers,
        });
        await qc.invalidateQueries({ queryKey: pressKeyOf(saveId) });
      } catch (e) {
        console.warn('Réponses de FM27 :', e);
      }
    };
    void tick();
    const id = setInterval(() => void tick(), ANSWER_POLL_MS);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [folder, saveId, pending, qc]);
}
