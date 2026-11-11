import { formationFamily, MIN_MINUTES } from './matchup';
import { formationsOf, opponentReport, type OpponentFormation } from './opponent';
import type { FmSnapshot } from './snapshot';

/*
 * « Formations affrontées » de notre équipe (Centre de données de FM27, analyse des formations) : à quelle fréquence
 * on crée et on concède une occasion franche selon le schéma d'en face. Lu par chemins.json dans la section equipe
 * (`ExpectedFormations/FormationsFaced`, 11/11/2026) :
 * - `formationsAffronteesSans` : schémas adverses sans ballon → occasions que NOUS créons contre eux ;
 * - `formationsAffronteesAvec` : schémas adverses avec ballon → occasions que nous CONCÉDONS contre eux.
 * (Le jeu range les deux sous ChancesCreated, comme pour les formations utilisées.)
 *
 * Idée tirée d'un guide vidéo « data » sur FM27 (11/2026) : la moyenne toutes formations sert de repère, et un
 * schéma adverse contre lequel on crée nettement moins (ou concède nettement plus) demande un plan B. L'adjoint
 * n'en parle que si le prochain adversaire joue ce schéma et qu'on l'a assez affronté.
 */

export interface FacedRow {
  /** Famille du schéma (« 4-4-2 »). */
  form: string;
  minutes: number;
  /** Minutes par occasion franche contre ce schéma. */
  every: number;
  /** Rapport à notre moyenne : > 1 = occasions plus rares que d'habitude, < 1 = plus fréquentes. */
  ratio: number;
}

export interface FacedSide {
  /** Minutes par occasion franche, tous schémas confondus (le repère). */
  avgEvery: number;
  rows: FacedRow[];
}

export interface OwnFormations {
  /** Ce que nous créons selon le schéma adverse sans ballon. */
  create: FacedSide | null;
  /** Ce que nous concédons selon le schéma adverse avec ballon. */
  concede: FacedSide | null;
}

function side(list: OpponentFormation[]): FacedSide | null {
  // Le nombre d'occasions est exact ; la fréquence du jeu est arrondie à la minute et ne sert qu'à défaut.
  const seen = list.filter((f) => (f.minutes ?? 0) > 0 && (f.chances != null || (f.every != null && f.every > 0)));
  if (!seen.length) return null;
  const groups = new Map<string, { minutes: number; chances: number }>();
  for (const f of seen) {
    const k = formationFamily(f.form);
    const g = groups.get(k) ?? { minutes: 0, chances: 0 };
    g.minutes += f.minutes!;
    g.chances += f.chances != null ? f.chances : f.minutes! / f.every!;
    groups.set(k, g);
  }
  const all = [...groups.values()];
  const chances = all.reduce((a, g) => a + g.chances, 0);
  if (chances <= 0) return null;
  const avgEvery = all.reduce((a, g) => a + g.minutes, 0) / chances;
  const rows = [...groups].map(([form, g]) => {
    // Aucune occasion contre ce schéma : au moins toutes les minutes jouées (borne basse).
    const every = g.chances > 0 ? g.minutes / g.chances : g.minutes;
    return { form, minutes: Math.round(g.minutes), every: Math.round(every), ratio: Math.round((every / avgEvery) * 100) / 100 };
  });
  return { avgEvery: Math.round(avgEvery), rows: rows.sort((a, b) => b.minutes - a.minutes) };
}

/** Analyse des formations affrontées par notre équipe, ou null si le plugin ne l'a pas lue. */
export function ownFormations(snap: FmSnapshot): OwnFormations | null {
  const custom = (snap as Record<string, unknown>).custom as Record<string, unknown> | null | undefined;
  const team = (custom && typeof custom === 'object' ? (custom.equipe ?? {}) : {}) as Record<string, unknown>;
  const create = side(formationsOf(team.formationsAffronteesSans));
  const concede = side(formationsOf(team.formationsAffronteesAvec));
  return create || concede ? { create, concede } : null;
}

/** Écart à la moyenne à partir duquel un schéma adverse nous pose un problème (30 %). */
export const FACED_GAP = 1.3;

export type FacedAdviceKind = 'facedCreate' | 'facedConcede';
export interface FacedAdvice {
  kind: FacedAdviceKind;
  tone: 'warn';
  values: { form: string; every: number; avg: number; minutes: number };
}

/**
 * Le prochain adversaire joue-t-il un schéma contre lequel on souffre ? On regarde son schéma le plus utilisé sans
 * ballon (ce qu'on crée contre) et avec ballon (ce qu'on concède contre), sur au moins MIN_MINUTES affrontées.
 * Le pire des deux écarts est rendu ; rien si l'écart reste sous FACED_GAP.
 */
export function facedAdvice(snap: FmSnapshot): FacedAdvice | null {
  const own = ownFormations(snap);
  const opp = opponentReport(snap);
  if (!own || !opp) return null;
  const oppIp = opp.formations.ip[0]?.form ?? opp.manager.formation ?? null;
  const oppOop = opp.formations.oop[0]?.form ?? oppIp;
  const pick = (s: FacedSide | null, form: string | null) => (s && form ? (s.rows.find((r) => r.form === formationFamily(form) && r.minutes >= MIN_MINUTES) ?? null) : null);
  const c = pick(own.create, oppOop);
  const d = pick(own.concede, oppIp);
  // Gravité : créer 1,5 fois moins souvent ou concéder 1,5 fois plus souvent pèsent autant.
  const cBad = c ? c.ratio : 0;
  const dBad = d ? 1 / d.ratio : 0;
  if (Math.max(cBad, dBad) < FACED_GAP) return null;
  return cBad >= dBad
    ? { kind: 'facedCreate', tone: 'warn', values: { form: c!.form, every: c!.every, avg: own.create!.avgEvery, minutes: c!.minutes } }
    : { kind: 'facedConcede', tone: 'warn', values: { form: d!.form, every: d!.every, avg: own.concede!.avgEvery, minutes: d!.minutes } };
}
