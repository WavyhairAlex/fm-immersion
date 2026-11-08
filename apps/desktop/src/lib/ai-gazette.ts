import type { GazetteIssue, GazetteWriting } from '@fm-immersion/module-fm';
import { useQuery } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { aiComplete, aiFor, fingerprint, gazettePrompt, getAiSettings, parseWriting, type AiSettings } from './ai';
import { fmData } from './data';

/**
 * Gazette rédigée par l'IA du joueur, gardée dans la base : la même semaine garde le même texte tant que ses faits,
 * le ton et le modèle ne changent pas. Null si l'IA est coupée, ne répond pas ou se trompe deux fois de suite
 * (la gazette garde alors ses phrases toutes faites).
 */
export async function writeGazette(
  t: TFunction,
  issue: GazetteIssue,
  lang: string | undefined,
  saveId: string,
  opts: { force?: boolean; settings?: AiSettings } = {},
): Promise<GazetteWriting | null> {
  const ai = aiFor('gazette', opts.settings ?? getAiSettings());
  if (!ai) return null;
  const { system, prompt } = gazettePrompt(t, issue, lang, ai.tone);
  const model = `${ai.provider}/${ai.model}`;
  const facts = fingerprint(`${model}|${ai.tone}|${lang ?? ''}|${system}|${prompt}`);
  if (!opts.force) {
    const kept = await fmData.writing(saveId, issue.weekStart, facts);
    if (kept) return kept;
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await aiComplete(ai.provider, ai.model, system, prompt, true);
    const w = parseWriting(raw, prompt);
    if (w) {
      await fmData.saveWriting(saveId, issue.weekStart, facts, w, model);
      return w;
    }
  }
  return null;
}

/** La même gazette, avec le texte de l'IA quand il existe (sinon telle quelle). Ne lève jamais d'erreur. */
export async function withWriting(t: TFunction, issue: GazetteIssue, lang: string | undefined, saveId: string): Promise<GazetteIssue> {
  try {
    const written = await writeGazette(t, issue, lang, saveId);
    return written ? { ...issue, written } : issue;
  } catch (e) {
    console.warn('Gazette IA :', e);
    return issue;
  }
}

/** Texte de l'IA pour la gazette affichée : demandé en arrière-plan, la gazette s'affiche d'abord sans lui. */
export function useGazetteWriting(saveId: string, issue: GazetteIssue | undefined) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;
  const settings = getAiSettings();
  const on = !!issue && !!saveId && !!aiFor('gazette', settings);
  return useQuery({
    queryKey: ['gazette', 'ia', saveId, issue?.weekStart, issue?.date, issue?.stories.length, lang, settings.provider, settings.provider ? settings.models[settings.provider] : null, settings.tone],
    queryFn: () => writeGazette(t, issue!, lang, saveId),
    enabled: on,
    staleTime: Infinity,
    retry: false,
  });
}
