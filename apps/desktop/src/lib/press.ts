import { ASKED_BY, withPress, type AnswerTone, type GazetteIssue, type Outlet, type PressConference, type PressHeld, type PressQuestion } from '@fm-immersion/module-fm';
import { useQuery } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { LANG, aiComplete, aiFor, factsKept, getAiSettings } from './ai';
import { fmData } from './data';

/**
 * Conférences de presse dans l'appli : questions et réponses proposées mises en mots, reformulation des questions
 * par l'IA du joueur (si elle est branchée, vérifiée, sinon les questions toutes faites), conférences tenues.
 */

export const pressKeyOf = (saveId: string) => ['fm', saveId, 'press'] as const;

/** Conférences déjà tenues ou refusées pour cette carrière (les plus récentes d'abord). */
export function usePressHeld(saveId: string) {
  return useQuery({ queryKey: pressKeyOf(saveId), queryFn: () => fmData.pressConferences(saveId), enabled: !!saveId });
}

/** Les gazettes avec les paroles du coach (rien ne change tant qu'aucune conférence n'a été tenue). */
export function issuesWithPress<I extends GazetteIssue>(issues: I[], held: PressHeld[] | undefined): I[] {
  return held?.length ? withPress(issues, held) : issues;
}

/** Clé i18n d'une question (et de ses réponses proposées) : le sujet, précisé par l'enjeu, l'issue du match ou la sorte de relance. */
export function questionKey(q: Pick<PressQuestion, 'id' | 'params'>): string {
  const p = q.params;
  if (q.id === 'stakes') return `stakes_${p.kind}`;
  if (q.id === 'result' || q.id === 'cup' || q.id === 'streak') return `${q.id}_${p.outcome}`;
  if (q.id === 'followUp') return `followUp_${p.variant}`;
  return q.id;
}

/** Rédaction qui pose la question (la préférée du sujet si la conférence est antérieure aux rédactions). */
export const outletOf = (q: Pick<PressQuestion, 'id' | 'outlet'>): Outlet => q.outlet ?? ASKED_BY[q.id][0];

/** Nom de la rédaction (le quotidien local porte le nom du club). */
export const outletName = (t: TFunction, outlet: Outlet, club: string) => t(`press.outlets.${outlet}`, { club });

/** « Claire Moreau, L'Écho de Dender (quotidien local) » : qui pose la question. */
export const askedBy = (t: TFunction, q: Pick<PressQuestion, 'id' | 'outlet' | 'reporter'>, club: string) => {
  const o = outletOf(q);
  return q.reporter ? t('press.page.asked', { reporter: q.reporter, outlet: outletName(t, o, club), kind: t(`press.outletKinds.${o}`) }) : outletName(t, o, club);
};

/** Rang au classement en toutes lettres (« 1er », « 5e » ; « 1st », « 5th »). */
function ordinal(n: unknown, lang?: string): string {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return '?';
  if (lang?.startsWith('en')) {
    const s = { one: 'st', two: 'nd', few: 'rd', other: 'th' } as Record<string, string>;
    return `${v}${s[new Intl.PluralRules('en', { type: 'ordinal' }).select(v)] ?? 'th'}`;
  }
  return v === 1 ? '1er' : `${v}e`;
}

/** Variables d'une question pour ses textes (score, rangs, forme dans la langue de l'interface). */
function vars(t: TFunction, q: PressQuestion, lang?: string): Record<string, unknown> {
  const p = q.params;
  const letters = t('press.page.formLetters');
  const form = typeof p.form === 'string' ? [...p.form].map((c) => letters['WDL'.indexOf(c)] ?? c).join('') : '';
  return {
    ...p,
    score: p.goalsFor != null && p.goalsAgainst != null ? `${p.goalsFor}-${p.goalsAgainst}` : '',
    positionOrd: ordinal(p.position, lang),
    opponentPositionOrd: ordinal(p.opponentPosition, lang),
    form,
    competition: p.competition ?? '',
  };
}

export const questionText = (t: TFunction, q: PressQuestion, lang?: string) => t(`press.q.${questionKey(q)}.${outletOf(q)}`, vars(t, q, lang));

export const answerText = (t: TFunction, q: PressQuestion, tone: AnswerTone, lang?: string) => t(`press.a.${questionKey(q)}.${tone}`, vars(t, q, lang));

/** Style de chaque rédaction, tel que décrit à l'IA. */
const STYLE: Record<Outlet, string> = { local: 'quotidien local', radio: 'radio', tabloid: 'presse à scandale', tv: 'télé nationale' };

/** Longueur maximale d'une question reformulée par l'IA. */
const MAX_QUESTION = 260;

/**
 * Questions reformulées par l'IA du joueur, comme un journaliste les poserait. Chaque question doit garder ses
 * chiffres et scores, et le même nombre de questions doit revenir ; sinon les questions toutes faites restent.
 */
export async function rewordQuestions(club: string, c: PressConference, base: string[], lang?: string): Promise<string[] | null> {
  const ai = aiFor('gazette', getAiSettings());
  if (!ai || !base.length) return null;
  const system = [
    `Tu es journaliste sportif en conférence de presse ${c.kind === 'pre' ? "d'avant-match" : "d'après-match"} avec l'entraîneur de ${club} (adversaire : ${c.opponent}), dans une partie de Football Manager.`,
    `Écris en ${LANG(lang)}.`,
    "Chaque question est posée par un journaliste d'une rédaction différente, indiquée entre crochets : garde son style (quotidien local : proche du club et factuel ; radio : direct et à chaud ; presse à scandale : provocateur, petites phrases ; télé nationale : solennel, grands enjeux).",
    "Reformule chaque question avec tes mots, en vouvoyant l'entraîneur, une ou deux phrases. Garde le sens, les noms propres, les citations entre guillemets, les chiffres et les scores exactement ; n'ajoute aucun fait.",
    "Pas de markdown, pas d'émoji.",
    'Réponds uniquement par un objet JSON : {"questions": ["…", "…"]}, dans le même ordre et en même nombre.',
  ].join('\n');
  const prompt = base.map((q, i) => `${i + 1}. [${STYLE[outletOf(c.questions[i]!)]}] ${q}`).join('\n');
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await aiComplete(ai.provider, ai.model, system, prompt, true);
      const parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)) as { questions?: unknown };
      const out = Array.isArray(parsed.questions) ? parsed.questions.map((x) => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim() : '')) : [];
      if (out.length === base.length && out.every((x, i) => x && x.length <= MAX_QUESTION && factsKept(x, base[i]!))) return out;
    } catch (e) {
      console.warn('Conférence IA :', e);
    }
  }
  return null;
}

/** Les questions d'une conférence, reformulées par l'IA quand elle est branchée (demandé en arrière-plan). */
export function usePressQuestions(club: string, c: PressConference | null) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;
  const base = c ? c.questions.map((q) => questionText(t, q, lang)) : [];
  const settings = getAiSettings();
  const on = !!c && !!aiFor('gazette', settings);
  const ai = useQuery({
    queryKey: ['press', 'ia', c?.key, lang, settings.provider, settings.provider ? settings.models[settings.provider] : null],
    queryFn: () => rewordQuestions(club, c!, base, lang),
    enabled: on,
    staleTime: Infinity,
    retry: false,
  });
  return { texts: ai.data ?? base, rewording: on && ai.isLoading };
}

/** Longueur maximale d'une réponse reformulée (comme le champ de saisie). */
const MAX_ANSWER = 400;

/**
 * Réponse du coach reformulée par l'IA du joueur, à sa demande : même idée et même ton, dite comme un entraîneur
 * devant les micros. Les chiffres et scores doivent rester ceux de la question et de la réponse ; sinon null (la
 * réponse reste telle quelle).
 */
export async function rewordAnswer(club: string, question: string, answer: string, lang?: string): Promise<string | null> {
  const ai = aiFor('gazette', getAiSettings());
  if (!ai || !answer.trim()) return null;
  const system = [
    `Tu es l'entraîneur de ${club} en conférence de presse, dans une partie de Football Manager.`,
    `Écris en ${LANG(lang)}.`,
    "Reformule la réponse de l'entraîneur avec plus de caractère, à la première personne, une à trois phrases courtes. Garde son idée, son ton, les noms propres, les chiffres et les scores ; n'ajoute aucun fait, aucun chiffre.",
    "Pas de markdown, pas d'émoji, pas de guillemets autour.",
    'Réponds uniquement par un objet JSON : {"answer": "…"}.',
  ].join('\n');
  const prompt = `Question : ${question}\nRéponse : ${answer.trim()}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await aiComplete(ai.provider, ai.model, system, prompt, true);
      const parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)) as { answer?: unknown };
      const out = typeof parsed.answer === 'string' ? parsed.answer.replace(/\s+/g, ' ').replace(/^["«“\s]+|["»”\s]+$/g, '').trim() : '';
      if (out && out.length <= MAX_ANSWER && factsKept(out, `${question} ${answer}`)) return out;
    } catch (e) {
      console.warn('Réponse IA :', e);
    }
  }
  return null;
}

/** L'IA du joueur est-elle branchée pour écrire (reformulations proposées dans la conférence) ? */
export const pressAiOn = () => !!aiFor('gazette', getAiSettings());
