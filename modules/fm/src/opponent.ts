import type { FmSnapshot } from './snapshot';

/**
 * Rapport sur le prochain adversaire, lu par chemins.json (étape adverse 1, 01/11/2026) dans `custom.equipe` :
 * advClassement, advEntraineur, advFormationPref, advMentalite, advPressing, advMarquage (Manager/Preferred*),
 * advButeur/advButs, advPasseur/advPasses, advMeilleureNoteJoueur/advMeilleureNote, et l'effectif
 * advEff<i>Nom / advEff<i>Postes / advEff<i>Etoiles / advEff<i>Pied (Club/Squad/#i ; le pied depuis le 07/11/2026). Ce sont les données de l'écran
 * « Rapport d'équipe » du jeu, disponibles même avec une analyse du staff « Basique ».
 * Les étoiles adverses valent -1 quand le staff ne les connaît pas : elles sont alors ignorées.
 * `advRapportDispo` (HasTeamReport) n'est pas utilisé : il vaut False alors que l'écran affiche un rapport.
 */
export interface OpponentPlayer {
  name: string;
  positions: string | null;
  stars: number | null;
  /** Pied fort tel que le jeu l'écrit (« Gauche », « Droit uniquement », « Les deux »…), si `advEff<i>Pied` est lu. */
  foot: string | null;
}

export type OpponentAdviceId =
  | 'buildShort'
  | 'beatPress'
  | 'rotate'
  | 'overloadZone'
  | 'twoStrikers'
  | 'oneStriker'
  | 'betweenLines'
  | 'screened'
  | 'leaky'
  | 'counter'
  | 'patience'
  | 'markCreator'
  | 'watchScorer';

export interface OpponentAdvice {
  id: OpponentAdviceId;
  name?: string;
}

/** Formation adverse vue par le rapport d'équipe (ExpectedFormations/FormationsUsed). */
export interface OpponentFormation {
  form: string;
  /** Part du temps de jeu, en %. */
  pct: number | null;
  minutes: number | null;
  /** Occasions franches créées (avec ballon) ou concédées (sans ballon : le jeu les range aussi sous ChancesCreated). */
  chances: number | null;
  /** Minutes par occasion franche. */
  every: number | null;
}

export interface OpponentReport {
  name: string | null;
  position: string | null;
  manager: { name: string | null; formation: string | null; mentality: string | null; pressing: string | null; marking: string | null };
  scorer: { name: string; value: number | null } | null;
  assister: { name: string; value: number | null } | null;
  rated: { name: string; value: number | null } | null;
  squad: OpponentPlayer[];
  /** faced : formations affrontées (occasions concédées selon la formation d'en face), si lues. */
  formations: { ip: OpponentFormation[]; oop: OpponentFormation[]; faced?: OpponentFormation[] };
  advice: OpponentAdvice[];
}

type Raw = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null);
const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && !isNaN(+v.replace(',', '.')) ? +v.replace(',', '.') : null);

/** Nombre d'attaquants d'une formation écrite par le jeu (« 4-4-2 » → 2, « 4-2-3-1 » → 1). */
export function strikersOf(formation: string | null): number | null {
  const parts = formation?.match(/\d/g)?.map(Number);
  return parts && parts.length >= 3 ? parts.at(-1)! : null;
}

/** Liste de formations lue en JSON (clé « profond » de chemins.json) ; TacticalPositions est ignoré (références opaques). */
function formationsOf(v: unknown): OpponentFormation[] {
  let list = v;
  if (typeof list === 'string') {
    try {
      list = JSON.parse(list);
    } catch {
      return [];
    }
  }
  const rows = (Array.isArray(list) ? list : list && typeof list === 'object' ? [list] : []) as Raw[];
  return rows
    .map((r) => ({ form: str(r.FormationType) ?? '', pct: num(r.FormationUsedPercentage), minutes: num(r.FormationUsedMinutes), chances: num(r.ChancesCreated), every: num(r.FormationChancesFrequency) }))
    .filter((f) => f.form)
    .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
}

export function opponentReport(snap: FmSnapshot): OpponentReport | null {
  const custom = (snap as Raw).custom as Raw | null | undefined;
  const team = (custom && typeof custom === 'object' ? (custom.equipe ?? {}) : {}) as Raw;
  if (!Object.keys(team).some((k) => k.startsWith('adv') && k !== 'advRapportDispo' && team[k] != null)) return null;
  const next = (snap.nextMatch ?? null) as Raw | null;
  const who = (k: string, v: string) => {
    const name = str(team[k]);
    return name ? { name, value: num(team[v]) } : null;
  };
  const squad: OpponentPlayer[] = [];
  for (let i = 0; i < 60; i++) {
    const name = str(team[`advEff${i}Nom`]);
    if (!name) continue;
    const stars = num(team[`advEff${i}Etoiles`]);
    squad.push({ name, positions: str(team[`advEff${i}Postes`]), stars: stars != null && stars >= 0 ? stars : null, foot: str(team[`advEff${i}Pied`]) });
  }
  const r: OpponentReport = {
    name: next ? str(next.opponent) : null,
    position: str(team.advClassement),
    manager: {
      name: str(team.advEntraineur),
      formation: str(team.advFormationPref),
      mentality: str(team.advMentalite),
      pressing: str(team.advPressing),
      marking: str(team.advMarquage),
    },
    scorer: who('advButeur', 'advButs'),
    assister: who('advPasseur', 'advPasses'),
    rated: who('advMeilleureNoteJoueur', 'advMeilleureNote'),
    squad,
    formations: { ip: formationsOf(team.advFormationsAvec), oop: formationsOf(team.advFormationsSans), faced: formationsOf(team.advFormationsAffrontees) },
    advice: [],
  };
  r.advice = opponentAdvice(r);
  return r;
}

/**
 * Conseils de préparation tirés du profil de l'entraîneur adverse et de ses joueurs clés.
 * Raisonnement de football (pas une formule du jeu) : chaque conseil répond à une donnée lue.
 */
export function opponentAdvice(r: OpponentReport): OpponentAdvice[] {
  const out: OpponentAdvice[] = [];
  const m = r.manager;
  const press = m.pressing?.toLowerCase() ?? '';
  if (/moins|less|rarement|rarely/.test(press)) out.push({ id: 'buildShort' });
  else if (/plus|more|souvent|often/.test(press)) out.push({ id: 'beatPress' });
  const mark = m.marking?.toLowerCase() ?? '';
  if (/indiv|man/.test(mark)) out.push({ id: 'rotate' });
  else if (/zon/.test(mark)) out.push({ id: 'overloadZone' });
  // Formations réellement jouées d'abord, la formation préférée de l'entraîneur à défaut.
  const ip = r.formations.ip[0]?.form ?? m.formation;
  const oop = r.formations.oop[0]?.form ?? m.formation;
  const strikers = strikersOf(ip);
  if (strikers != null && strikers >= 2) out.push({ id: 'twoStrikers' });
  else if (strikers === 1) out.push({ id: 'oneStriker' });
  // Sans ballon : deux milieux défensifs ferment l'axe, sinon deux lignes de quatre laissent l'espace entre elles.
  if (oop && /MD|DM/.test(oop)) out.push({ id: 'screened' });
  else if (oop && /^\d-4-\d$/.test(oop.replace(/\s/g, ''))) out.push({ id: 'betweenLines' });
  // Défense qui concède une occasion franche toutes les 30 minutes ou moins.
  const leak = r.formations.oop[0]?.every;
  if (leak != null && leak <= 30) out.push({ id: 'leaky', name: String(Math.round(leak)) });
  const ment = m.mentality?.toLowerCase() ?? '';
  if (/offens|attack|positi/.test(ment)) out.push({ id: 'counter' });
  else if (/défens|defens|prud|caut/.test(ment)) out.push({ id: 'patience' });
  // Le créateur (passeur, meilleure moyenne) d'abord, puis le buteur s'il est un autre joueur.
  const creator = r.assister?.name ?? r.rated?.name;
  if (creator) out.push({ id: 'markCreator', name: creator });
  if (r.scorer && r.scorer.name !== creator) out.push({ id: 'watchScorer', name: r.scorer.name });
  return out;
}

