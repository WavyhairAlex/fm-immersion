import type { FmPlayer } from './player';
import { instructionKey, instructionState, type InstructionId, type PlayerInstruction } from './instructions';
import type { LineupAdvice, RoleAdvice, StarterAdvice } from './lineup-advice';
import type { TeamAdvice, TeamAdviceRow } from './team-advice';

/*
 * « À changer dans FM27 » : une seule liste, classée par importance, de tout ce que les conseils de Mon onze
 * demandent de modifier dans la tactique réglée dans le jeu. Elle rassemble ce qui était réparti entre le bilan des
 * matchs, l'avis de l'adjoint, les consignes d'équipe et les consignes individuelles :
 * 1. les consignes d'équipe à corriger (ce que l'effectif ne tient pas, ce que les matchs ont montré) ;
 * 2. les titulaires à revoir ;
 * 3. les consignes individuelles réglées à l'inverse de ce qui est conseillé ;
 * 4. celles que les stats de match justifient d'ajouter ;
 * 5. les joueurs trop chargés en consignes ;
 * 6. les rôles qui iraient mieux.
 * Rien n'est inventé ici : chaque ligne reprend un conseil déjà calculé, avec ses chiffres.
 */

/** Ce qu'on sait des consignes individuelles d'un titulaire : conseillées, appuyées par ses attributs, réglées dans le jeu. */
export interface PlayerPiState {
  player: FmPlayer;
  /** Consignes conseillées, dans la limite par joueur. */
  list: PlayerInstruction[];
  /** Toutes celles que ses attributs ou ses stats appuient, sans la limite. */
  supported: PlayerInstruction[];
  /** Réglées dans FM27 : choisies par le joueur (`mine`) et imposées par le rôle ; null si non lues. */
  game: { mine: string[]; imposed: string[] } | null;
}

export type TodoItem =
  | { kind: 'team'; row: TeamAdviceRow }
  | { kind: 'starter'; advice: StarterAdvice }
  | { kind: 'piChange'; player: FmPlayer; instruction: PlayerInstruction; other: string }
  | { kind: 'piAdd'; player: FmPlayer; instruction: PlayerInstruction }
  | { kind: 'piRemove'; player: FmPlayer; count: number; budget: number; keys: string[] }
  | { kind: 'role'; advice: RoleAdvice };

/** Consigne tirée des stats de match (voir `statInstructions`). */
const fromStats = (x: PlayerInstruction) => x.why.startsWith('stat');

export function tacticTodo(input: { team: TeamAdvice | null; lineup: LineupAdvice | null; players: PlayerPiState[]; budget: number }): TodoItem[] {
  const out: TodoItem[] = [];
  // Consignes d'équipe : seulement les corrections motivées, et pas celles déjà réglées ainsi dans le jeu.
  for (const row of input.team?.rows ?? []) if (row.reason && row.game !== row.option) out.push({ kind: 'team', row });
  for (const advice of input.lineup?.starters ?? []) out.push({ kind: 'starter', advice });

  const change: TodoItem[] = [];
  const add: TodoItem[] = [];
  const remove: TodoItem[] = [];
  for (const p of input.players) {
    if (!p.game) continue;
    const keys = [...p.game.mine, ...p.game.imposed];
    let room = input.budget - p.game.mine.length;
    for (const x of p.list) {
      const s = instructionState(x.id as InstructionId, keys);
      // Une consigne imposée par le rôle ne se change pas : ce serait un changement de rôle.
      if (s.state === 'conflict' && p.game.mine.includes(s.other!)) change.push({ kind: 'piChange', player: p.player, instruction: x, other: s.other! });
      else if (s.state === 'todo' && fromStats(x) && room > 0) {
        add.push({ kind: 'piAdd', player: p.player, instruction: x });
        room--;
      }
    }
    // Une consigne déjà à remplacer plus haut n'est pas à retirer une seconde fois.
    const replaced = new Set(change.flatMap((c) => (c.kind === 'piChange' && c.player.id === p.player.id ? [c.other] : [])));
    const extra = p.game.mine.filter((k) => !replaced.has(k) && !p.supported.some((x) => instructionKey(x.id) === k));
    if (p.game.mine.length > input.budget && extra.length) remove.push({ kind: 'piRemove', player: p.player, count: p.game.mine.length, budget: input.budget, keys: extra });
  }
  out.push(...change, ...add, ...remove);
  for (const advice of input.lineup?.roles ?? []) out.push({ kind: 'role', advice });
  return out;
}
