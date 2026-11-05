import { mercatoAdvice, squadPlaces, type MercatoReport } from './mercato';
import type { FmPlayer } from './player';
import { POS_ORDER, type PosCode } from './positions';
import type { SquadAt } from './progress';
import { buildProject, recruitAttrs, type CoachPrefs, type ProjectSlot } from './project';
import { replacementFor } from './replacement';
import type { TacticEngine } from './tactic';

/**
 * Besoins du mercato : la liste de courses, poste par poste, qui rassemble ce que les autres écrans disent séparément.
 * - `leaving` : un partant signalé que personne dans l'effectif ne remplace au niveau du projet (urgent) ;
 * - `projectGap` : poste du onze du projet sans joueur au niveau visé ;
 * - `replace` : titulaire d'aujourd'hui à remplacer à terme (profil hors projet, ou hors du onze du projet passé 27 ans) ;
 * - `succession` : titulaire du projet de 31 ans ou plus, à préparer avant qu'il ne baisse ;
 * - `noBackup` : poste du projet sans doublure dans l'effectif.
 * Un poste déjà à pourvoir pour une raison plus forte ne réapparaît pas pour une plus faible.
 */
export type NeedWhy = 'leaving' | 'projectGap' | 'replace' | 'succession' | 'noBackup';
/** 1 = urgent (avant la prochaine fenêtre), 2 = pour bâtir le projet, 3 = profondeur et anticipation. */
export type NeedPriority = 1 | 2 | 3;

export interface RecruitNeed {
  pos: PosCode;
  priority: NeedPriority;
  why: NeedWhy[];
  /** Joueur concerné : le partant, le titulaire à remplacer ou à faire succéder, le titulaire trop juste du projet. */
  player: FmPlayer | null;
  /** Créneau du onze du projet (rôles avec et sans ballon) ; null si le poste n'y figure pas. */
  slot: ProjectSlot | null;
  /** Adéquation à viser (sur 20) : seuil du projet, ou niveau du partant s'il est plus haut. */
  target: number | null;
  /** Attributs clés à chercher pour ce créneau (filtre de recherche du jeu). */
  attrs: string[];
}

export interface NeedsReport {
  needs: RecruitNeed[];
  report: MercatoReport;
  /** Seuil d'adéquation du projet (sur 20). */
  threshold: number | null;
}

export const SUCCESSION_AGE = 31;
const PRIORITY: Record<NeedWhy, NeedPriority> = { leaving: 1, projectGap: 2, replace: 2, succession: 3, noBackup: 3 };
const WHY_ORDER: NeedWhy[] = ['leaving', 'projectGap', 'replace', 'succession', 'noBackup'];

export function recruitmentNeeds(
  engine: TacticEngine,
  players: FmPlayer[],
  gameDate: string,
  coach: CoachPrefs = {},
  history: SquadAt[] = [],
  leavingIds: ReadonlySet<string> = new Set(),
): NeedsReport | null {
  const all = players.filter((p) => Object.keys(p.attributes).length);
  const list = all.filter((p) => !leavingIds.has(p.id));
  const report = mercatoAdvice(engine, all, gameDate, coach, history, leavingIds);
  if (!report) return null;
  const project = buildProject(engine, list, coach);
  const threshold = project?.threshold ?? null;
  const out: RecruitNeed[] = [];
  const add = (why: NeedWhy, pos: PosCode | null, player: FmPlayer | null, slot: ProjectSlot | null, target: number | null = threshold) => {
    if (!pos) return;
    // Même joueur, ou même créneau du projet : une seule ligne, avec toutes ses raisons.
    const same = out.find((n) => (player && n.player?.id === player.id) || (slot && n.slot === slot));
    if (same) {
      if (!same.why.includes(why)) same.why.push(why);
      same.priority = Math.min(same.priority, PRIORITY[why]) as NeedPriority;
      if (target != null && (same.target == null || target > same.target)) same.target = target;
      same.player ??= player;
      return;
    }
    out.push({ pos, priority: PRIORITY[why], why: [why], player, slot, target, attrs: slot ? recruitAttrs(engine, slot) : [] });
  };
  const slotAt = (pos: PosCode | null, player?: FmPlayer | null) =>
    project?.slots.find((s) => s.player && s.player.id === player?.id) ?? project?.slots.find((s) => s.pos === pos) ?? null;

  // 1. Partants que personne ne remplace au niveau du projet.
  if (report.leaving.length) {
    const withThem = buildProject(engine, all, coach);
    for (const p of report.leaving) {
      if (!withThem) break;
      const r = replacementFor(engine, withThem, p, [], list);
      if (r.verdict !== 'recruit' || !r.slot) continue;
      // Le créneau du partant dans le onze sans lui, s'il y est (même poste), pour ne pas compter deux fois le trou.
      const mine = project?.slots.find((s) => s.pos === r.slot!.pos && s.status === 'recruit') ?? null;
      add('leaving', r.slot.pos, p, mine ?? r.slot, Math.max(r.fit ?? 0, threshold ?? 0) || null);
    }
  }
  // 2. Postes du projet sans joueur au niveau.
  for (const sl of project?.slots ?? []) if (sl.status === 'recruit') add('projectGap', sl.pos, sl.player, sl);
  // 3. Titulaires d'aujourd'hui à remplacer.
  for (const a of report.byVerdict.replace) add('replace', a.now.pos, a.player, slotAt(a.now.pos, a.player));
  // 4. Titulaires âgés du projet : préparer la succession.
  for (const sl of project?.slots ?? [])
    if (sl.player && (sl.player.age ?? 0) >= SUCCESSION_AGE && sl.status !== 'recruit') add('succession', sl.pos, sl.player, sl);
  // 5. Postes du projet sans doublure (un recrutement déjà prévu au poste en apporte une).
  if (project) {
    const places = squadPlaces(engine, project.slots, list);
    const backups = new Map<PosCode, number>();
    for (const pl of places.values()) if (pl.tier === 1 && pl.pos) backups.set(pl.pos, (backups.get(pl.pos) ?? 0) + 1);
    const seen = new Set<PosCode>();
    for (const sl of project.slots) {
      if (seen.has(sl.pos)) continue;
      seen.add(sl.pos);
      if (backups.get(sl.pos) || out.some((n) => n.pos === sl.pos)) continue;
      add('noBackup', sl.pos, null, sl);
    }
  }
  for (const n of out) n.why.sort((a, b) => WHY_ORDER.indexOf(a) - WHY_ORDER.indexOf(b));
  out.sort((a, b) => a.priority - b.priority || POS_ORDER.indexOf(a.pos) - POS_ORDER.indexOf(b.pos));
  return { needs: out, report, threshold };
}
