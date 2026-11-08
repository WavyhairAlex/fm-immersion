import type { PosCode } from './positions';
import { FORMATIONS, formationKeys, formationOfPositions } from './tactic';

/*
 * Les onze postes de la tactique jouée, lus par le plugin (0.5.5) dans `tactic.positionsCombined`
 * (TacticalPositionsCombined de la tactique de l'équipe) : poste et rôles avec et sans ballon, en codes du jeu.
 * Sert à connaître le vrai schéma et les vrais rôles même quand la compo (réglage LireCompo) n'est pas lue.
 *
 * Codes relevés dans les énumérations du jeu (PositionID, InPossessionRole, OutOfPossessionRole), 08/11/2026 :
 * le poste est un numéro, chaque rôle un bit (la mission, Défense/Soutien/Attaque, est un bit à part, ignoré ici).
 */

/** PositionID du jeu → poste FM Immersion (gauche, axe et droite d'une même ligne se rejoignent). */
const POSITION_ID: Record<number, PosCode> = {
  1: 'GB',
  2: 'DD', 3: 'DC', 4: 'DC', 5: 'DC', 6: 'DG',
  7: 'DLD', 8: 'MDF', 9: 'MDF', 10: 'MDF', 11: 'DLG',
  12: 'MD', 13: 'MC', 14: 'MC', 15: 'MC', 16: 'MG',
  17: 'MOD', 18: 'MOC', 19: 'MOC', 20: 'MOC', 21: 'MOG',
  22: 'BT', 23: 'BT', 24: 'BT',
};

/** Bit du rôle avec ballon (InPossessionRole) → code du jeu, tel que `RoleRef.game.ip`. */
const IP_ROLE: Record<number, string> = { 0: 'Goalkeeper', 1: 'CentreBack', 2: 'FullBack', 3: 'WingBack', 4: 'DefensiveMidfielder', 5: 'CentralMidfielder', 6: 'WideMidfielder', 7: 'Winger', 9: 'AttackingMidfielder', 10: 'DeepLyingForward', 11: 'CentreForward', 12: 'BallPlayingGoalkeeper', 14: 'AdvancedCentreBack', 15: 'DeepLyingPlaymaker', 16: 'BoxToBoxMidfielder', 17: 'AdvancedPlaymaker', 18: 'TargetForward', 19: 'Poacher', 20: 'CompleteForward', 24: 'BallPlayingCentreBack', 27: 'InsideForward', 28: 'BallWinningMidfielder', 29: 'NoNonsenseCentreBack', 30: 'DefensiveWinger', 31: 'ChannelForward', 32: 'FreeRole', 33: 'Anchor', 35: 'HalfBack', 36: 'NoNonsenseFullBack', 37: 'Enganche', 38: 'AdvancedWingBack', 39: 'Regista', 40: 'FalseNine', 41: 'SecondStriker', 42: 'WideTargetForward', 43: 'PlaymakingWinger', 44: 'InsideWingBack', 45: 'WideForward', 46: 'BoxToBoxPlaymaker', 47: 'Mezzala', 48: 'WideCentralMidfielder', 49: 'InsideWinger', 50: 'SegundoVolante', 51: 'WideCentreBack', 52: 'InsideFullBack', 53: 'NoNonsenseGoalkeeper', 54: 'OverlappingCentreBack', 55: 'PlaymakingWingBack', 56: 'ChannelMidfielder', 57: 'MidfieldPlaymaker' };

/** Bit du rôle sans ballon (OutOfPossessionRole) → code du jeu, tel que `RoleRef.game.oop`. */
const OOP_ROLE: Record<number, string> = { 0: 'OPGoalkeeper', 1: 'OPSweeperKeeper', 2: 'OPLineKeeper', 3: 'OPCentreBack', 4: 'OPStoppingCentreBack', 5: 'OPCoveringCentreBack', 6: 'OPWideCentreBack', 7: 'OPStoppingWideCentreBack', 8: 'OPCoveringWideCentreBack', 9: 'OPFullBack', 10: 'OPPressingFullBack', 11: 'OPHoldingFullBack', 12: 'OPWingBack', 13: 'OPPressingWingBack', 14: 'OPHoldingWingBack', 15: 'OPDefensiveMidfielder', 16: 'OPDroppingDefensiveMidfielder', 17: 'OPPressingDefensiveMidfielder', 18: 'OPScreeningDefensiveMidfielder', 19: 'OPWideCoverDefensiveMidfielder', 20: 'OPCentralMidfielder', 27: 'OPPressingCentralMidfielder', 28: 'OPScreeningCentralMidfielder', 29: 'OPWideCoverCentralMidfielder', 30: 'OPAttackingMidfielder', 31: 'OPTrackingAttackingMidfielder', 32: 'OPCentralOutletAttackingMidfielder', 33: 'OPSplittingOutletAttackingMidfielder', 35: 'OPWideMidfielder', 36: 'OPTrackingWideMidfielder', 37: 'OPWideOutletWideMidfielder', 38: 'OPWinger', 39: 'OPTrackingWinger', 40: 'OPInsideOutletWinger', 41: 'OPWideOutletWinger', 42: 'OPCentreForward', 43: 'OPTrackingCentreForward', 44: 'OPCentralOutletCentreForward', 45: 'OPSplittingOutletCentreForward' };

/** Bits de mission (Défense, Soutien, Attaque…), communs aux deux énumérations. */
const DUTY_BITS = new Set([21, 22, 23, 25, 26, 34]);

const toInt = (v: unknown): bigint | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v) : NaN;
  return Number.isInteger(n) && n > 0 ? BigInt(n) : null;
};

/** Code du rôle d'après sa valeur du jeu (bit du rôle, éventuellement combiné à celui de la mission). */
function roleOf(v: unknown, table: Record<number, string>): string | null {
  const n = toInt(v);
  if (n == null) return null;
  for (let b = 0; b < 64; b++) if (!DUTY_BITS.has(b) && (n >> BigInt(b)) & 1n && table[b]) return table[b]!;
  return null;
}

export interface TacticSlot {
  /** Poste avec ballon. */
  pos: PosCode;
  /** Poste sans ballon (souvent le même). */
  posOOP: PosCode | null;
  roleIP: string | null;
  roleOOP: string | null;
}

/** Les onze postes de la tactique jouée, ou null si le plugin ne les a pas lus (avant 0.5.5, ou tactique vide). */
export function tacticSlots(tactic: unknown): TacticSlot[] | null {
  const rows = (tactic as { positionsCombined?: unknown } | null | undefined)?.positionsCombined;
  if (!Array.isArray(rows)) return null;
  const out: TacticSlot[] = [];
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const pos = POSITION_ID[Number(o.IPPosition ?? o.Position)];
    if (!pos) continue;
    out.push({ pos, posOOP: POSITION_ID[Number(o.OOPPosition)] ?? null, roleIP: roleOf(o.IPRole, IP_ROLE), roleOOP: roleOf(o.OOPRole, OOP_ROLE) });
  }
  return out.length === 11 ? out : null;
}

/**
 * Schéma connu le plus proche des onze postes : exact si possible, sinon celui qui ne diffère que d'un poste
 * (FM27 décale un milieu en MO, un latéral en piston…). Null au-delà : mieux vaut ne rien dire que se tromper.
 */
export function formationOfSlots(slots: readonly { pos: PosCode }[] | null): string | null {
  if (!slots || slots.length !== 11) return null;
  const exact = formationOfPositions(slots.map((s) => s.pos));
  if (exact) return exact;
  const count = (ps: PosCode[]) => ps.reduce((m, p) => m.set(p, (m.get(p) ?? 0) + 1), new Map<PosCode, number>());
  const mine = count(slots.map((s) => s.pos));
  let best: { k: string; d: number } | null = null;
  for (const k of formationKeys()) {
    const theirs = count(FORMATIONS[k]!.map(([p]) => p));
    let d = 0;
    for (const p of new Set([...mine.keys(), ...theirs.keys()])) d += Math.abs((mine.get(p) ?? 0) - (theirs.get(p) ?? 0));
    // d compte chaque poste différent deux fois (un en trop, un en moins).
    if (d <= 2 && (!best || d < best.d)) best = { k, d };
  }
  return best?.k ?? null;
}

/** Empreinte des rôles (poste et rôles des onze) : deux instantanés qui diffèrent = rôles changés dans le jeu. */
export function rolePrint(slots: readonly TacticSlot[] | null): string[] | null {
  return slots ? slots.map((s) => `${s.pos}:${s.roleIP ?? '?'}/${s.roleOOP ?? '?'}`).sort() : null;
}
