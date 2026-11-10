import type { GazetteIssue, GazetteWriting } from '@fm-immersion/module-fm';
import { invoke } from '@tauri-apps/api/core';
import type { TFunction } from 'i18next';
import { articleText, climateOf, editorialText, paperName, storyText, weekLabel } from './gazette-text';

/**
 * Rédaction par IA, choisie par le joueur : Ollama sur son PC (rien ne sort de l'ordinateur) ou une clé API qu'il
 * colle lui-même (Mistral, Anthropic, Google). L'IA ne reçoit que les faits déjà calculés par l'appli (brèves de la
 * semaine, score et buteurs du direct) et les met en mots ; l'appli vérifie sa réponse (chiffres, scores, longueur)
 * et garde les phrases toutes faites si elle ne répond pas ou se trompe.
 */

export type AiProvider = 'ollama' | 'mistral' | 'anthropic' | 'gemini';
export type AiTone = 'classic' | 'regional' | 'tabloid';

export interface AiSettings {
  provider: AiProvider | null;
  /** Modèle choisi pour chaque fournisseur. */
  models: Partial<Record<AiProvider, string>>;
  tone: AiTone;
  /** Rédiger la gazette avec l'IA. */
  gazette: boolean;
  /** Commenter les temps forts du direct avec l'IA. */
  live: boolean;
}

export const AI_PROVIDERS: AiProvider[] = ['ollama', 'mistral', 'anthropic', 'gemini'];
export const AI_TONES: AiTone[] = ['classic', 'regional', 'tabloid'];

/** Modèle proposé par défaut : bon en français, rapide, peu cher (modifiable dans les réglages). */
export const DEFAULT_MODELS: Record<AiProvider, string> = {
  ollama: 'gemma3:12b',
  mistral: 'mistral-small-latest',
  anthropic: 'claude-haiku-5-5',
  gemini: 'gemini-2.5-flash',
};

const KEY = 'fmi.ai';
const OFF: AiSettings = { provider: null, models: {}, tone: 'regional', gazette: true, live: true };

export function getAiSettings(): AiSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return OFF;
    const v = JSON.parse(raw) as Partial<AiSettings>;
    return {
      provider: v.provider && AI_PROVIDERS.includes(v.provider) ? v.provider : null,
      models: typeof v.models === 'object' && v.models ? v.models : {},
      tone: v.tone && AI_TONES.includes(v.tone) ? v.tone : 'regional',
      gazette: v.gazette !== false,
      live: v.live !== false,
    };
  } catch {
    return OFF;
  }
}

export function setAiSettings(s: AiSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* stockage indisponible : l'IA reste coupée */
  }
}

export const modelOf = (s: AiSettings, p: AiProvider) => s.models[p]?.trim() || DEFAULT_MODELS[p];

/** IA prête pour cet usage : fournisseur choisi et usage coché. */
export function aiFor(use: 'gazette' | 'live', s = getAiSettings()): { provider: AiProvider; model: string; tone: AiTone } | null {
  if (!s.provider || !s[use]) return null;
  return { provider: s.provider, model: modelOf(s, s.provider), tone: s.tone };
}

export const aiComplete = (provider: AiProvider, model: string, system: string, prompt: string, json: boolean) =>
  invoke<string>('ai_complete', { provider, model, system, prompt, json });
export const aiKeySet = (provider: AiProvider, key: string) => invoke<void>('ai_key_set', { provider, key });
export const aiKeyStatus = (provider: AiProvider) => invoke<boolean>('ai_key_status', { provider });
export const aiOllamaModels = () => invoke<string[]>('ai_ollama_models');

/* ---------- Consignes ---------- */

const TONE: Record<AiTone, string> = {
  classic: "un grand quotidien sportif national : sobre, précis, des phrases nettes, de l'analyse, pas d'emphase",
  regional:
    "le quotidien régional qui suit le club au jour le jour : proche des supporters, passionné, chaleureux, qui vibre avec le club et ne cache pas sa déception",
  tabloid: 'un tabloïd sportif : titres chocs, jeux de mots, dramatisation assumée, ton piquant (mais sans jamais inventer un fait)',
};

const RULES = [
  "N'utilise QUE les faits fournis. N'invente aucun score, buteur, joueur, transfert, blessure, chiffre, déclaration ni citation.",
  'Garde les noms propres exactement comme écrits dans les faits.',
  'Écris les scores et les nombres en chiffres, tels que donnés (2-1, 3e).',
  "Tiens compte de l'enjeu : une élimination en coupe nationale est un événement marquant, un tour franchi en coupe ou en Europe se savoure, un match amical compte peu, un match de championnat se lit avec le classement.",
  "Pas de markdown, pas d'émoji, pas de guillemets de citation.",
];

export const LANG = (lang?: string) => (lang?.startsWith('en') ? 'anglais (British English, football vocabulary)' : 'français');

export interface GazettePrompt {
  system: string;
  prompt: string;
}

/** Ce que l'IA reçoit pour une gazette : la une et toutes les brèves déjà mises en mots, le climat, l'objectif. */
export function gazettePrompt(t: TFunction, issue: GazetteIssue, lang: string | undefined, tone: AiTone): GazettePrompt {
  const plain = { ...issue, written: null };
  const head = storyText(t, issue.club, issue.headline, lang);
  const p = issue.headline.params;
  const match =
    issue.headline.kind === 'result'
      ? [
          `Compétition : ${p.competition ?? '?'} (type : ${p.compKind ?? (p.friendly ? 'friendly' : 'league')})`,
          p.cup ? `Tour de coupe : ${p.cup === 'out' ? 'ÉLIMINÉ' : 'QUALIFIÉ'}${Number(p.legs) === 2 ? ` (score cumulé ${p.aggFor}-${p.aggAgainst})` : ''}` : '',
          `Lieu : ${p.home == null ? '?' : p.home ? 'à domicile' : "à l'extérieur"}`,
          p.goalsFor != null ? `Score de ${issue.club} : ${p.goalsFor}-${p.goalsAgainst} contre ${p.opponent ?? '?'}` : '',
        ].filter(Boolean)
      : [];
  const edito = editorialText(t, plain, lang);
  const facts = [
    `Journal : ${paperName(t, issue.club)}, n° ${issue.number}, ${weekLabel(t, lang, issue.weekStart, issue.weekEnd)}.`,
    `Club suivi : ${issue.club}. Climat de la semaine : ${climateOf(issue)}.`,
    issue.board ? `Objectif de la direction : ${issue.board}.` : '',
    '',
    `À LA UNE : ${head.title}`,
    head.body,
    ...match,
    articleText(t, plain, lang) ? `Récit factuel : ${articleText(t, plain, lang)}` : '',
    '',
    'AUTRES BRÈVES :',
    ...issue.stories.map((s) => {
      const x = storyText(t, issue.club, s, lang);
      return `- ${x.title}${x.body ? ` : ${x.body}` : ''}`;
    }),
    edito ? `\nTribunes (texte du jeu ou ambiance) : ${edito.fans}\nDirection : ${edito.board}` : '',
  ]
    .filter((x) => x !== '')
    .join('\n');
  const system = [
    `Tu es le rédacteur en chef de ${paperName(t, issue.club)}, le journal qui suit ${issue.club} dans une partie de Football Manager. Ton style : ${TONE[tone]}.`,
    `Écris en ${LANG(lang)}.`,
    ...RULES,
    'Réponds uniquement par un objet JSON avec ces clés :',
    '"titre" : le gros titre de une, 4 à 10 mots, accrocheur, une phrase correcte et naturelle, avec une majuscule seulement au premier mot et aux noms propres (jamais à chaque mot) ;',
    '"article" : le récit de la une, 90 à 160 mots, avec une attaque forte et ce que ça change pour le club ;',
    '"billet" : l\'avis de la rédaction sur la semaine, 40 à 80 mots ;',
    '"tribunes" : une phrase sur ce qui se dit chez les supporters, 25 mots au plus ;',
    '"direction" : une phrase sur l\'humeur de la direction, 25 mots au plus.',
  ].join('\n');
  return { system, prompt: `Faits de la semaine :\n${facts}` };
}

/* ---------- Vérification ---------- */

/** Nombres écrits en chiffres dans un texte (« 2-1 », « 3e », « 1,06 » → 2, 1, 3, 1,06). */
const numbersIn = (text: string) => text.match(/\d+(?:[.,]\d+)?/g) ?? [];

/** Scores écrits dans un texte, normalisés « a-b » (« 2 - 1 », « 2–1 », « 2 à 1 »). */
const scoresIn = (text: string) => [...text.matchAll(/(\d+)\s*(?:-|–|—|à|to)\s*(\d+)/g)].map((m) => `${m[1]}-${m[2]}`);

/**
 * L'IA n'a-t-elle rien inventé de vérifiable ? Chaque nombre écrit doit venir des faits, chaque score aussi (dans un
 * sens ou dans l'autre : « Nitra s'impose 2-1 » pour une défaite 1-2).
 */
export function factsKept(text: string, facts: string): boolean {
  const nums = new Set(numbersIn(facts).flatMap((n) => [n, n.replace(',', '.'), n.replace('.', ',')]));
  if (!numbersIn(text).every((n) => nums.has(n))) return false;
  const scores = new Set(scoresIn(facts).flatMap((s) => [s, s.split('-').reverse().join('-')]));
  return scoresIn(text).every((s) => scores.has(s));
}

/** Nettoie un texte de l'IA : espaces, guillemets ou markdown laissés autour. */
const clean = (v: unknown) =>
  typeof v === 'string'
    ? v
        .replace(/\*\*|__|#+\s/g, '')
        .replace(/^["«\s]+|["»\s]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    : '';

const LETTER = /\p{L}/u;
const isUpper = (c: string) => LETTER.test(c) && c === c.toUpperCase() && c !== c.toLowerCase();
/** Mot sans sa ponctuation ni son article élidé (« l'Absence, » → « Absence »). */
const bare = (w: string) => w.replace(/^[^\p{L}\d]+|[^\p{L}\d]+$/gu, '').replace(/^\p{L}{1,2}['’]/u, '');

/**
 * Titre écrit « Avec Une Majuscule À Chaque Mot » (habitude anglaise de certains modèles) ramené à l'usage de la
 * presse : majuscule au premier mot, aux sigles et aux noms propres, c'est-à-dire aux mots écrits ainsi au milieu
 * d'une ligne des faits (clubs, joueurs, compétitions). Un titre déjà normal est rendu tel quel.
 */
export function headlineCase(title: string, facts: string): string {
  const words = title.split(' ');
  const rest = words.slice(1).filter((w) => bare(w).length >= 4);
  if (rest.length < 2 || rest.filter((w) => isUpper(bare(w)[0] ?? '')).length / rest.length < 0.75) return title;
  const proper = new Set<string>();
  for (const line of facts.split('\n')) {
    line
      .split(' ')
      .slice(1)
      .forEach((w, i, all) => {
        const b = bare(w);
        if (b && isUpper(b[0]!) && !/[:.!?]$/.test(all[i - 1] ?? '') && all[i - 1] !== '-') proper.add(b);
      });
  }
  return words
    .map((w, i) => {
      const b = bare(w);
      if (i === 0 || !b || !isUpper(b[0]!) || proper.has(b) || (b.length > 1 && b === b.toUpperCase())) return w;
      const at = w.lastIndexOf(b);
      return w.slice(0, at) + b[0]!.toLowerCase() + w.slice(at + 1);
    })
    .join(' ');
}

const LIMITS = { title: 120, article: 1400, editorial: 800, fans: 260, board: 260 } as const;

/** Lit et vérifie la gazette écrite par l'IA (JSON, longueurs, faits) ; null si elle n'est pas utilisable. */
export function parseWriting(raw: string, facts: string): GazetteWriting | null {
  let v: Record<string, unknown>;
  try {
    const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
    v = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
  const w: GazetteWriting = {
    title: headlineCase(clean(v.titre ?? v.title), facts),
    article: clean(v.article),
    editorial: clean(v.billet ?? v.editorial),
    fans: clean(v.tribunes ?? v.fans),
    board: clean(v.direction ?? v.board),
  };
  for (const k of Object.keys(LIMITS) as (keyof typeof LIMITS)[]) {
    if (!w[k] || w[k].length > LIMITS[k]) return null;
    if (!factsKept(w[k], facts)) return null;
  }
  return w;
}

/** Empreinte stable d'un texte (FNV-1a) : sert à savoir si les faits envoyés ont changé. */
export function fingerprint(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16);
}

/* ---------- Direct ---------- */

/** Ce qui vient de se passer dans le match, déjà mis en mots par l'appli, et le contexte connu avant le match. */
export interface LiveMoment {
  home: string;
  away: string;
  score: string;
  minute: string | null;
  club: string | null;
  competition: string | null;
  /** Le fait du moment (« But de M. Fábry pour Malženice, 1-0 »), et la phrase toute faite du commentateur. */
  fact: string;
  said: string;
  /** Déroulé des buts et cartons jusqu'ici. */
  timeline: string[];
  /** Contexte d'avant-match (classement, buteur de la saison, avis du jeu sur l'adversaire). */
  context: string[];
}

export function livePrompt(m: LiveMoment, lang: string | undefined, tone: AiTone): GazettePrompt {
  const system = [
    `Tu es commentateur radio d'un match de Football Manager${m.club ? `, au micro de la radio qui suit ${m.club}` : ''}. Ton style : ${TONE[tone]}.`,
    `Écris en ${LANG(lang)}.`,
    ...RULES,
    'Réponds par une ou deux phrases de commentaire en direct (40 mots au plus), vivantes, au présent, sans rien d\'autre.',
  ].join('\n');
  const prompt = [
    `Match : ${m.home} ${m.score} ${m.away}${m.minute ? `, ${m.minute}` : ''}${m.competition ? ` (${m.competition})` : ''}.`,
    `Moment : ${m.fact}`,
    `Phrase prévue (à réécrire avec ton style) : ${m.said}`,
    m.timeline.length ? `Déroulé : ${m.timeline.join(' ; ')}` : '',
    m.context.length ? `Avant le match : ${m.context.join(' ; ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return { system, prompt };
}

/** Lit et vérifie la phrase du commentateur ; null si elle n'est pas utilisable. */
export function parseComment(raw: string, facts: string): string | null {
  const text = clean(raw.split('\n').filter((l) => l.trim()).slice(0, 2).join(' '));
  if (!text || text.length > 320) return null;
  return factsKept(text, facts) ? text : null;
}

/** Le commentaire de l'IA ne doit pas retarder le direct : au-delà de ce délai, la phrase toute faite part. */
const LIVE_TIMEOUT_MS = 12_000;

/** Commentaire de l'IA pour un temps fort, ou null (IA coupée, trop lente, ou réponse refusée). */
export async function aiLiveComment(m: LiveMoment, lang?: string, settings = getAiSettings()): Promise<string | null> {
  const ai = aiFor('live', settings);
  if (!ai) return null;
  const { system, prompt } = livePrompt(m, lang, ai.tone);
  try {
    const raw = await Promise.race([
      aiComplete(ai.provider, ai.model, system, prompt, false),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), LIVE_TIMEOUT_MS)),
    ]);
    return raw ? parseComment(raw, prompt) : null;
  } catch (e) {
    console.warn('Commentaire IA :', e);
    return null;
  }
}
