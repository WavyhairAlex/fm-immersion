import type { FmSnapshot } from './snapshot';

/**
 * Rapport sur le prochain adversaire, lu par chemins.json (étape adverse 1, 01/11/2026) dans `custom.equipe` :
 * advClassement, advEntraineur, advFormationPref, advMentalite, advPressing, advMarquage (Manager/Preferred*),
 * advButeur/advButs, advPasseur/advPasses, advMeilleureNoteJoueur/advMeilleureNote, et l'effectif
 * advEff<i>Nom / advEff<i>Postes / advEff<i>Etoiles (Club/Squad/#i). Ce sont les données de l'écran
 * « Rapport d'équipe » du jeu, disponibles même avec une analyse du staff « Basique ».
 * Les étoiles adverses valent -1 quand le staff ne les connaît pas : elles sont alors ignorées.
 * `advRapportDispo` (HasTeamReport) n'est pas utilisé : il vaut False alors que l'écran affiche un rapport.
 */
export interface OpponentPlayer {
  name: string;
  positions: string | null;
  stars: number | null;
}

export type OpponentAdviceId =
  | 'buildShort'
  | 'beatPress'
  | 'rotate'
  | 'overloadZone'
  | 'twoStrikers'
  | 'oneStriker'
  | 'betweenLines'
  | 'counter'
  | 'patience'
  | 'markCreator'
  | 'watchScorer';

export interface OpponentAdvice {
  id: OpponentAdviceId;
  name?: string;
}

export interface OpponentReport {
  name: string | null;
  position: string | null;
  manager: { name: string | null; formation: string | null; mentality: string | null; pressing: string | null; marking: string | null };
  scorer: { name: string; value: number | null } | null;
  assister: { name: string; value: number | null } | null;
  rated: { name: string; value: number | null } | null;
  squad: OpponentPlayer[];
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
    squad.push({ name, positions: str(team[`advEff${i}Postes`]), stars: stars != null && stars >= 0 ? stars : null });
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
  const strikers = strikersOf(m.formation);
  if (strikers != null && strikers >= 2) out.push({ id: 'twoStrikers' });
  else if (strikers === 1) out.push({ id: 'oneStriker' });
  // Deux lignes de quatre sans milieu offensif : l'espace entre elles est à prendre.
  if (m.formation && /^\d-4-\d$/.test(m.formation.replace(/\s/g, ''))) out.push({ id: 'betweenLines' });
  const ment = m.mentality?.toLowerCase() ?? '';
  if (/offens|attack|positi/.test(ment)) out.push({ id: 'counter' });
  else if (/défens|defens|prud|caut/.test(ment)) out.push({ id: 'patience' });
  // Le créateur (passeur, meilleure moyenne) d'abord, puis le buteur s'il est un autre joueur.
  const creator = r.assister?.name ?? r.rated?.name;
  if (creator) out.push({ id: 'markCreator', name: creator });
  if (r.scorer && r.scorer.name !== creator) out.push({ id: 'watchScorer', name: r.scorer.name });
  return out;
}

