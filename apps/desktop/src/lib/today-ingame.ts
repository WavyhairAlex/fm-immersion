import { gazetteIssues, type GazetteIssue } from '@fm-immersion/module-fm';
import { invoke } from '@tauri-apps/api/core';
import type { TFunction } from 'i18next';
import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useCareer, useCareerStore, type BriefLine } from './career';
import { useHistory } from './fm-cache';
import { useFmFolder } from './fm-sync';
import { storyText } from './gazette-text';

/**
 * Panneau « Aujourd'hui » dans FM27 (plugin 0.6.5, preuve de concept) : FM Immersion dépose dans le dossier du plugin
 * (`fmimmersion-aujourdhui.json`) le briefing de l'adjoint et la une de la dernière gazette, déjà rédigés. Le plugin
 * l'affiche par-dessus le jeu quand le joueur appuie sur F7. Rien n'est envoyé au jeu, rien ne revient.
 */

/** Le panneau n'a pas d'ascenseur : il doit tenir à l'écran. Le plugin applique les mêmes bornes. */
const MAX_ITEMS = 8;
const MAX_OTHERS = 3;
const MAX_LEDE = 320;

export interface InGameToday {
  format: 'fmi-aujourdhui/1';
  key: string;
  heading: string;
  sub: string;
  brief: { title: string; empty: string; items: { tone: BriefLine['tone']; text: string }[] };
  gazette: { label: string; title: string; lede: string; also: string; others: string[] } | null;
  ui: { close: string; hint: string };
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

const dateLabel = (iso: string, lang?: string) =>
  /^\d{4}-\d{2}-\d{2}/.test(iso) ? new Intl.DateTimeFormat(lang, { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(`${iso.slice(0, 10)}T00:00:00Z`)) : '';

/** Le panneau tel que le plugin l'affiche, dans la langue du joueur. */
export function inGameToday(t: TFunction, input: { saveId: string; gameDate: string; club: string; brief: BriefLine[]; issue: GazetteIssue | null }, lang?: string): InGameToday {
  const { issue } = input;
  let gazette: InGameToday['gazette'] = null;
  if (issue) {
    const une = storyText(t, issue.club, issue.headline, lang);
    gazette = {
      label: `${t('layout.today.gazette', { club: issue.club })} · ${t('gazette.issue', { number: issue.number })}`,
      title: issue.written?.title || une.title,
      lede: clip((issue.written?.article || une.body || '').replace(/\s+/g, ' ').trim(), MAX_LEDE),
      also: t('layout.today.also'),
      others: issue.stories
        .filter((x) => x !== issue.headline)
        .slice(0, MAX_OTHERS)
        .map((x) => storyText(t, issue.club, x, lang).title),
    };
  }
  const date = dateLabel(input.gameDate, lang);
  return {
    format: 'fmi-aujourdhui/1',
    key: `${input.saveId}|${input.gameDate}|${issue?.number ?? 0}`,
    heading: t('ingameToday.heading'),
    sub: [input.club, date].filter(Boolean).join(' · '),
    brief: {
      title: t('fm.brief.word'),
      empty: t('ingameToday.empty'),
      items: input.brief.slice(0, MAX_ITEMS).map((b) => ({ tone: b.tone, text: b.text })),
    },
    gazette,
    ui: { close: t('ingameToday.close'), hint: t('ingameToday.hint') },
  };
}

/** Monté une fois pour toute l'appli : réécrit le panneau quand le briefing ou la gazette changent. */
export function useTodayInGame() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;
  const { saveId } = useCareer();
  const folder = useFmFolder(saveId);
  const { data: history = [] } = useHistory(saveId);
  // Le briefing est calculé par l'accueil (`FmBriefing`), qui le range ici avec sa date de jeu.
  const brief = useCareerStore((s) => s.brief);
  const issue = useMemo(() => gazetteIssues(history)[0] ?? null, [history]);
  const last = history.at(-1);
  const [briefSave, briefDate] = brief.at.split('|');
  const ready = !!saveId && briefSave === saveId && !!briefDate;
  const json = useMemo(
    () =>
      ready
        ? JSON.stringify(inGameToday(t, { saveId, gameDate: briefDate!, club: last?.data.club ?? issue?.club ?? '', brief: brief.items, issue }, lang), null, 1)
        : undefined,
    [ready, t, saveId, briefDate, last, issue, brief.items, lang],
  );
  const written = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!folder || json === undefined || json === written.current) return;
    invoke('fm_write_today', { folder, json })
      .then(() => (written.current = json))
      .catch((e) => console.warn('Panneau Aujourd’hui pour FM27 :', e));
  }, [folder, json]);
  useEffect(() => {
    written.current = undefined;
  }, [folder, saveId]);
}
