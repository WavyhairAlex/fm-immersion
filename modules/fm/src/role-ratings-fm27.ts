import type { FmPlayer } from './player';
import type { PosCode } from './positions';

/*
 * Note d'un joueur dans un rôle, telle que FM27 la calcule (« Capacité au poste »), relevée dans le code
 * du jeu (game_plugin.dll) le 01/11/2026. Copie complète sur le PC du joueur :
 * D:\COMFY\archivix-analyse\etoiles-par-role.json.
 *
 * Chaque rôle classe les attributs en trois groupes : clés (poids 16, ceux du radar à l'écran : 9 rôles
 * vérifiés sur captures, 100 % exacts), secondaires (poids 4) et à éviter (poids 3, sur 100 − valeur :
 * un attribut élevé y fait baisser la note). Une familiarité au poste basse retire (20 − familiarité) %,
 * × 2,5 sous 15 et × 4 sous 12.
 *
 * Le jeu en tire ensuite une valeur = capacité actuelle × note / meilleure note du joueur, divisée par 2 sous
 * le seuil du rôle (`t`, rôles exigeants), puis des étoiles (conversion non trouvée). La capacité actuelle
 * n'est pas lue : Archivix s'en tient à la note, comparable d'un joueur à l'autre, et signale le seuil.
 */

export interface RoleRating {
  /** Attributs clés (poids 16). */
  k: string[];
  /** Attributs secondaires (poids 4). */
  s?: string[];
  /** Attributs à éviter (poids 3, inversés). */
  x?: string[];
  /** Seuil de valeur sous lequel le jeu divise la note par 2. */
  t?: number;
}

const W = { k: 16, s: 4, x: 3 } as const;

export const ROLE_RATINGS_FM27: Record<string, RoleRating> = {
  Goalkeeper: { k: ["Handling", "AerialReach", "CommandOfArea", "Communication", "Positioning", "Reflexes", "Agility", "Concentration"], s: ["Kicking", "Throwing", "Anticipation", "Decisions", "OneOnOnes"], x: ["Eccentricity"] },
  BallPlayingGoalkeeper: { k: ["Handling", "AerialReach", "CommandOfArea", "Communication", "Kicking", "Positioning", "Reflexes", "Agility", "Concentration"], s: ["Passing", "Throwing", "Anticipation", "Decisions", "OneOnOnes", "Eccentricity", "Composure"] },
  NoNonsenseGoalkeeper: { k: ["Handling", "AerialReach", "CommandOfArea", "Communication", "Positioning", "Reflexes", "Agility", "Concentration"], s: ["Anticipation", "Decisions", "OneOnOnes"], x: ["Passing", "Eccentricity"] },
  FullBack: { k: ["Marking", "Tackling", "Anticipation", "Positioning", "Teamwork", "Acceleration", "Concentration"], s: ["Crossing", "Dribbling", "Passing", "Decisions", "Technique", "WorkRate", "Stamina", "Pace", "Agility"] },
  WingBack: { k: ["Crossing", "Marking", "Tackling", "Teamwork", "WorkRate", "Acceleration", "Stamina", "Pace"], s: ["Dribbling", "Movement", "Passing", "Anticipation", "Decisions", "Positioning", "FirstTouch", "Technique", "Balance", "Agility", "Concentration"] },
  AdvancedWingBack: { k: ["Crossing", "Dribbling", "Movement", "Technique", "Teamwork", "WorkRate", "Acceleration", "Stamina", "Pace", "Agility"], s: ["Marking", "Passing", "Tackling", "Anticipation", "Decisions", "Positioning", "FirstTouch", "Flair", "Balance"], t: 60 },
  InsideWingBack: { k: ["Passing", "Tackling", "Anticipation", "Decisions", "Positioning", "Teamwork", "Acceleration", "Composure"], s: ["Marking", "FirstTouch", "Technique", "WorkRate", "Stamina", "Pace", "Agility", "Concentration"] },
  InsideFullBack: { k: ["Heading", "Marking", "Tackling", "Anticipation", "Positioning", "Strength"], s: ["Dribbling", "Decisions", "WorkRate", "Acceleration", "Stamina", "Pace", "JumpingReach", "Bravery", "Aggression", "Agility", "Composure", "Concentration"] },
  PlaymakingWingBack: { k: ["Passing", "Tackling", "Vision", "Decisions", "FirstTouch", "Technique", "Teamwork", "Acceleration", "Composure"], s: ["Crossing", "Dribbling", "Marking", "Movement", "Anticipation", "Positioning", "WorkRate", "Stamina", "Pace", "Agility", "Concentration"] },
  CentreBack: { k: ["Heading", "Marking", "Tackling", "Anticipation", "Positioning", "Strength", "JumpingReach"], s: ["Decisions", "Pace", "Bravery", "Aggression", "Composure", "Concentration"], x: ["Passing"] },
  AdvancedCentreBack: { k: ["Heading", "Marking", "Passing", "Tackling", "Anticipation", "Decisions", "Positioning", "Technique", "Teamwork", "Strength", "JumpingReach", "Composure"], s: ["Dribbling", "Vision", "FirstTouch", "Stamina", "Pace", "Bravery", "Aggression", "Concentration"], t: 80 },
  BallPlayingCentreBack: { k: ["Heading", "Marking", "Passing", "Tackling", "Anticipation", "Positioning", "Strength", "JumpingReach", "Composure"], s: ["Vision", "Decisions", "FirstTouch", "Technique", "Pace", "Bravery", "Aggression", "Concentration"] },
  NoNonsenseCentreBack: { k: ["Heading", "Marking", "Tackling", "Anticipation", "Positioning", "Strength", "JumpingReach"], s: ["Pace", "Bravery", "Aggression", "Concentration"], x: ["Passing", "Composure"] },
  WideCentreBack: { k: ["Heading", "Marking", "Tackling", "Anticipation", "Positioning", "Strength", "JumpingReach"], s: ["Dribbling", "Decisions", "WorkRate", "Acceleration", "Stamina", "Pace", "Bravery", "Aggression", "Agility", "Composure", "Concentration"], x: ["Passing"] },
  OverlappingCentreBack: { k: ["Crossing", "Heading", "Marking", "Tackling", "Anticipation", "WorkRate", "Strength", "Stamina", "Pace", "JumpingReach"], s: ["Dribbling", "Movement", "Decisions", "Positioning", "Technique", "Acceleration", "Bravery", "Aggression", "Agility", "Composure", "Concentration"] },
  MidfieldPlaymaker: { k: ["Movement", "Passing", "Vision", "Decisions", "FirstTouch", "Technique", "Teamwork", "Composure"], s: ["Dribbling", "Tackling", "Anticipation", "Positioning", "Flair", "WorkRate", "Stamina", "Agility"] },
  DefensiveMidfielder: { k: ["Tackling", "Anticipation", "Positioning", "Teamwork", "Concentration"], s: ["Marking", "Passing", "Decisions", "FirstTouch", "WorkRate", "Strength", "Stamina", "Aggression", "Composure"] },
  CentralMidfielder: { k: ["Passing", "Tackling", "Decisions", "FirstTouch", "Teamwork"], s: ["Movement", "Vision", "Anticipation", "Positioning", "Technique", "WorkRate", "Stamina", "Composure", "Concentration"] },
  DeepLyingPlaymaker: { k: ["Passing", "Vision", "Decisions", "FirstTouch", "Technique", "Teamwork", "Composure"], s: ["Marking", "Movement", "Tackling", "Anticipation", "Positioning", "WorkRate", "Stamina", "Balance", "Concentration"] },
  BoxToBoxMidfielder: { k: ["Movement", "Passing", "Tackling", "Teamwork", "WorkRate", "Stamina"], s: ["Dribbling", "Finishing", "LongShots", "Anticipation", "Decisions", "Positioning", "FirstTouch", "Technique", "Acceleration", "Strength", "Pace", "Balance", "Aggression", "Composure"] },
  HalfBack: { k: ["Heading", "Marking", "Tackling", "Anticipation", "Positioning", "Teamwork", "Strength", "JumpingReach", "Concentration"], s: ["Passing", "Decisions", "FirstTouch", "WorkRate", "Stamina", "Bravery", "Aggression", "Composure"], t: 60 },
  BoxToBoxPlaymaker: { k: ["Movement", "Passing", "Vision", "Decisions", "FirstTouch", "Technique", "Teamwork", "WorkRate", "Stamina", "Composure"], s: ["Dribbling", "LongShots", "Marking", "Tackling", "Anticipation", "Positioning", "Acceleration", "Pace", "Balance", "Agility"], t: 100 },
  WideMidfielder: { k: ["Crossing", "Passing", "Decisions", "Technique", "Teamwork", "WorkRate", "Stamina", "Pace"], s: ["Dribbling", "Movement", "Vision", "Anticipation", "FirstTouch", "Acceleration", "Agility", "Composure"] },
  Winger: { k: ["Crossing", "Dribbling", "Technique", "Teamwork", "Acceleration", "Pace", "Agility"], s: ["Movement", "Passing", "Anticipation", "FirstTouch", "Flair", "WorkRate", "Stamina", "Balance"] },
  AttackingMidfielder: { k: ["LongShots", "Movement", "Passing", "FirstTouch", "Technique", "Flair", "Composure"], s: ["Crossing", "Dribbling", "Finishing", "Vision", "Anticipation", "Decisions", "Acceleration", "Agility"] },
  ChannelMidfielder: { k: ["Crossing", "Movement", "Passing", "FirstTouch", "Technique", "WorkRate", "Acceleration", "Composure"], s: ["Dribbling", "LongShots", "Vision", "Anticipation", "Decisions", "Flair", "Stamina", "Pace", "Agility"] },
  AdvancedPlaymaker: { k: ["Movement", "Passing", "Vision", "Decisions", "FirstTouch", "Technique", "Teamwork", "Composure"], s: ["Crossing", "Dribbling", "Anticipation", "Flair", "Acceleration", "Agility"] },
  InsideForward: { k: ["Dribbling", "Movement", "Anticipation", "FirstTouch", "Technique", "Acceleration", "Agility", "Composure"], s: ["Crossing", "Finishing", "LongShots", "Passing", "Vision", "Flair", "WorkRate", "Stamina", "Pace", "Balance"] },
  InsideWinger: { k: ["Dribbling", "FirstTouch", "Technique", "Teamwork", "Acceleration", "Agility", "Composure"], s: ["Crossing", "LongShots", "Movement", "Passing", "Vision", "Anticipation", "Flair", "WorkRate", "Stamina", "Pace", "Balance"] },
  FreeRole: { k: ["Dribbling", "LongShots", "Movement", "Passing", "Vision", "FirstTouch", "Technique", "Flair", "Composure"], s: ["Crossing", "Finishing", "Anticipation", "Decisions", "Acceleration", "Agility"], t: 100 },
  PlaymakingWinger: { k: ["Crossing", "Dribbling", "Movement", "Passing", "Vision", "Decisions", "FirstTouch", "Technique", "Teamwork", "Acceleration", "Composure"], s: ["Anticipation", "Flair", "WorkRate", "Stamina", "Pace", "Agility"], t: 80 },
  WideForward: { k: ["Dribbling", "Movement", "Anticipation", "FirstTouch", "Technique", "Acceleration", "Pace", "Agility"], s: ["Crossing", "Finishing", "Passing", "Flair", "WorkRate", "Stamina", "Balance", "Composure"], t: 100 },
  WideCentralMidfielder: { k: ["Passing", "Tackling", "Decisions", "FirstTouch", "Teamwork"], s: ["Crossing", "Dribbling", "Movement", "Vision", "Anticipation", "Positioning", "Technique", "WorkRate", "Stamina", "Agility", "Composure", "Concentration"] },
  DeepLyingForward: { k: ["Finishing", "Movement", "FirstTouch", "Technique", "Strength", "Composure"], s: ["Dribbling", "Passing", "Vision", "Anticipation", "Decisions", "Teamwork", "Balance"] },
  CentreForward: { k: ["Finishing", "Heading", "Movement", "FirstTouch", "Technique", "Acceleration", "Strength", "Composure"], s: ["Dribbling", "Passing", "Anticipation", "Decisions", "Pace", "JumpingReach", "Balance", "Agility"] },
  TargetForward: { k: ["Finishing", "Heading", "Movement", "Strength", "JumpingReach", "Balance", "Bravery", "Aggression", "Composure"], s: ["Anticipation", "Decisions", "FirstTouch", "Teamwork"] },
  Poacher: { k: ["Finishing", "Heading", "Movement", "Anticipation", "Acceleration", "Composure", "Concentration"], s: ["Decisions", "FirstTouch", "Technique", "Balance"] },
  ChannelForward: { k: ["Dribbling", "Finishing", "Movement", "FirstTouch", "Technique", "WorkRate", "Acceleration", "Composure"], s: ["Crossing", "Heading", "Passing", "Anticipation", "Decisions", "Stamina", "Pace", "Balance", "Agility"] },
  FalseNine: { k: ["Dribbling", "Movement", "Passing", "Vision", "Decisions", "FirstTouch", "Technique", "Teamwork", "Acceleration", "Composure"], s: ["Finishing", "Anticipation", "Flair", "Balance", "Agility"], t: 80 },
  SecondStriker: { k: ["Finishing", "Movement", "Anticipation", "FirstTouch", "Acceleration", "Composure"], s: ["Dribbling", "LongShots", "Passing", "Decisions", "Technique", "WorkRate", "Stamina", "Pace", "Agility", "Concentration"] },
  OPGoalkeeper: { k: ["Handling", "AerialReach", "CommandOfArea", "Communication", "Positioning", "Reflexes", "Agility", "Concentration"], s: ["Anticipation", "Decisions", "OneOnOnes", "RushingOut"] },
  OPSweeperKeeper: { k: ["Handling", "AerialReach", "CommandOfArea", "Communication", "Anticipation", "Decisions", "OneOnOnes", "Reflexes", "RushingOut", "Agility"], s: ["Positioning", "Eccentricity", "Acceleration", "Concentration"] },
  OPLineKeeper: { k: ["Handling", "AerialReach", "CommandOfArea", "Communication", "Positioning", "Reflexes", "Agility", "Concentration"], s: ["Anticipation", "Decisions", "OneOnOnes"], x: ["RushingOut"] },
  OPCentreBack: { k: ["Heading", "Marking", "Tackling", "Anticipation", "Positioning", "Strength", "JumpingReach"], s: ["Decisions", "Pace", "Bravery", "Aggression", "Composure", "Concentration"] },
  OPStoppingCentreBack: { k: ["Heading", "Marking", "Tackling", "Anticipation", "Positioning", "Strength", "JumpingReach", "Bravery", "Aggression"], s: ["Decisions", "Pace", "Concentration"] },
  OPCoveringCentreBack: { k: ["Heading", "Marking", "Tackling", "Anticipation", "Decisions", "Positioning", "Strength", "Pace", "JumpingReach", "Concentration"], s: ["Acceleration", "Bravery"] },
  OPWideCentreBack: { k: ["Heading", "Marking", "Tackling", "Anticipation", "Positioning", "Strength", "JumpingReach"], s: ["Decisions", "Acceleration", "Pace", "Bravery", "Aggression", "Agility", "Concentration"] },
  OPStoppingWideCentreBack: { k: ["Heading", "Marking", "Tackling", "Anticipation", "Positioning", "Strength", "JumpingReach", "Bravery", "Aggression"], s: ["Decisions", "Acceleration", "Pace", "Agility", "Concentration"] },
  OPCoveringWideCentreBack: { k: ["Heading", "Marking", "Tackling", "Anticipation", "Decisions", "Positioning", "Strength", "Pace", "JumpingReach", "Concentration"], s: ["Acceleration", "Bravery", "Agility"] },
  OPFullBack: { k: ["Marking", "Tackling", "Anticipation", "Positioning", "Teamwork", "Acceleration"], s: ["Decisions", "WorkRate", "Stamina", "Pace", "Aggression", "Agility", "Concentration"] },
  OPPressingFullBack: { k: ["Marking", "Tackling", "Anticipation", "Positioning", "Teamwork", "WorkRate", "Acceleration", "Aggression"], s: ["Decisions", "Stamina", "Pace", "Bravery", "Agility", "Concentration"] },
  OPHoldingFullBack: { k: ["Marking", "Tackling", "Anticipation", "Decisions", "Positioning", "Acceleration", "Concentration"], s: ["Teamwork", "Pace", "Agility"] },
  OPWingBack: { k: ["Marking", "Tackling", "Anticipation", "Positioning", "Teamwork", "Acceleration", "Stamina"], s: ["Decisions", "WorkRate", "Pace", "Aggression", "Agility", "Concentration"] },
  OPPressingWingBack: { k: ["Marking", "Tackling", "Anticipation", "Positioning", "Teamwork", "WorkRate", "Acceleration", "Stamina", "Aggression"], s: ["Decisions", "Pace", "Bravery", "Agility", "Concentration"] },
  OPHoldingWingBack: { k: ["Marking", "Tackling", "Anticipation", "Decisions", "Positioning", "Acceleration", "Concentration"], s: ["Teamwork", "Stamina", "Pace", "Agility"] },
  OPDefensiveMidfielder: { k: ["Tackling", "Anticipation", "Decisions", "Positioning", "Teamwork", "WorkRate"], s: ["Marking", "Strength", "Stamina", "Aggression", "Concentration"] },
  OPDroppingDefensiveMidfielder: { k: ["Marking", "Tackling", "Anticipation", "Decisions", "Positioning", "Teamwork", "WorkRate", "Strength", "JumpingReach", "Concentration"], s: ["Stamina", "Aggression"] },
  OPPressingDefensiveMidfielder: { k: ["Tackling", "Anticipation", "Decisions", "Positioning", "Teamwork", "WorkRate", "Stamina", "Aggression"], s: ["Marking", "Strength", "Pace", "Concentration"] },
  OPScreeningDefensiveMidfielder: { k: ["Marking", "Tackling", "Anticipation", "Decisions", "Positioning", "Concentration"], s: ["Teamwork", "WorkRate", "Strength", "Stamina"] },
  OPWideCoverDefensiveMidfielder: { k: ["Marking", "Tackling", "Anticipation", "Decisions", "Positioning", "Teamwork", "WorkRate", "Stamina", "Agility"], s: ["Strength", "Pace", "Aggression", "Concentration"] },
  OPCentralMidfielder: { k: ["Tackling", "Decisions", "Teamwork", "WorkRate"], s: ["Marking", "Anticipation", "Positioning", "Stamina", "Aggression", "Concentration"] },
  OPPressingCentralMidfielder: { k: ["Tackling", "Anticipation", "Decisions", "Teamwork", "WorkRate", "Stamina", "Aggression"], s: ["Marking", "Positioning", "Strength", "Pace", "Concentration"] },
  OPScreeningCentralMidfielder: { k: ["Marking", "Tackling", "Decisions", "Positioning", "Concentration"], s: ["Anticipation", "Teamwork", "WorkRate", "Stamina"] },
  OPWideCoverCentralMidfielder: { k: ["Marking", "Tackling", "Decisions", "Teamwork", "WorkRate", "Stamina", "Agility"], s: ["Anticipation", "Positioning", "Pace", "Aggression", "Concentration"] },
  OPAttackingMidfielder: { k: ["Anticipation", "Decisions", "WorkRate"], s: ["Marking", "Movement", "Teamwork", "Stamina", "Aggression"] },
  OPTrackingAttackingMidfielder: { k: ["Anticipation", "Decisions", "Teamwork", "WorkRate", "Stamina", "Aggression"], s: ["Marking", "Movement", "Positioning"] },
  OPCentralOutletAttackingMidfielder: { k: ["Movement", "Anticipation", "Decisions", "Teamwork", "Balance", "Concentration"], s: ["Marking", "FirstTouch", "Strength", "Composure"], x: ["WorkRate", "Stamina"] },
  OPSplittingOutletAttackingMidfielder: { k: ["Movement", "Anticipation", "Decisions", "Teamwork", "Pace", "Concentration"], s: ["Marking", "FirstTouch", "Acceleration", "Composure"], x: ["WorkRate", "Stamina"] },
  OPWideMidfielder: { k: ["Decisions", "Teamwork", "WorkRate", "Acceleration"], s: ["Marking", "Movement", "Anticipation", "Stamina", "Pace", "Aggression", "Agility"] },
  OPTrackingWideMidfielder: { k: ["Anticipation", "Decisions", "Teamwork", "WorkRate", "Acceleration", "Stamina", "Aggression"], s: ["Marking", "Movement", "Tackling", "Positioning", "Pace", "Agility"] },
  OPWideOutletWideMidfielder: { k: ["Movement", "Anticipation", "Decisions", "Teamwork", "Pace", "Concentration"], s: ["Dribbling", "Marking", "FirstTouch", "Acceleration", "Agility", "Composure"], x: ["WorkRate", "Stamina"] },
  OPWinger: { k: ["Anticipation", "Decisions", "Teamwork", "WorkRate", "Acceleration"], s: ["Marking", "Movement", "Stamina", "Pace", "Aggression", "Agility"] },
  OPTrackingWinger: { k: ["Anticipation", "Decisions", "Teamwork", "WorkRate", "Acceleration", "Stamina", "Aggression"], s: ["Marking", "Movement", "Tackling", "Positioning", "Pace", "Agility"] },
  OPInsideOutletWinger: { k: ["Movement", "Anticipation", "Decisions", "Teamwork", "Balance", "Concentration"], s: ["Dribbling", "Marking", "FirstTouch", "Acceleration", "Strength", "Composure"], x: ["WorkRate", "Stamina"] },
  OPWideOutletWinger: { k: ["Movement", "Anticipation", "Decisions", "Teamwork", "Pace", "Concentration"], s: ["Dribbling", "Marking", "FirstTouch", "Acceleration", "Agility", "Composure"], x: ["WorkRate", "Stamina"] },
  OPCentreForward: { k: ["Anticipation", "Decisions", "WorkRate"], s: ["Marking", "Movement", "Teamwork", "Stamina", "Aggression"] },
  OPTrackingCentreForward: { k: ["Anticipation", "Decisions", "Teamwork", "WorkRate", "Stamina", "Aggression"], s: ["Marking", "Movement", "Positioning"] },
  OPCentralOutletCentreForward: { k: ["Movement", "Anticipation", "Decisions", "Teamwork", "Balance", "Concentration"], s: ["Marking", "FirstTouch", "Strength", "Composure"], x: ["WorkRate", "Stamina"] },
  OPSplittingOutletCentreForward: { k: ["Movement", "Anticipation", "Decisions", "Teamwork", "Pace", "Concentration"], s: ["Marking", "FirstTouch", "Acceleration", "Composure"], x: ["WorkRate", "Stamina"] },
};
/** Pénalité de familiarité au poste (1-20), en part de la note retirée. */
export function familiarityPenalty(f: number | null | undefined): number {
  if (f == null) return 0;
  const v = 20 - Math.max(1, Math.min(20, f));
  return Math.min(1, (f < 12 ? v * 4 : f < 15 ? Math.floor(v * 2.5) : v) / 100);
}

/**
 * Note du jeu pour un code de rôle FM27 (énumération InPossessionRole, ou « OP… » sans ballon), sur 20 :
 * moyenne pondérée des groupes présents, puis pénalité de familiarité si le poste est donné.
 * null si le rôle n'est pas dans la table ou si aucun attribut n'est connu.
 */
export function gameRoleRating(p: FmPlayer, gameCode: string, pos?: PosCode): number | null {
  const r = ROLE_RATINGS_FM27[gameCode];
  if (!r) return null;
  const mean = (keys: string[] | undefined, inv: boolean) => {
    const v = (keys ?? []).map((k) => p.attributes[k]).filter((a): a is number => a != null);
    return v.length ? v.reduce((a, b) => a + (inv ? Math.max(20 - b, 0.2) : b), 0) / v.length : null;
  };
  let s = 0;
  let t = 0;
  for (const [g, inv] of [['k', false], ['s', false], ['x', true]] as const) {
    const m = mean(r[g], inv);
    if (m != null) {
      s += W[g] * m;
      t += W[g];
    }
  }
  if (!t) return null;
  const fam = pos ? p.familiarity?.[pos] : undefined;
  return (s / t) * (1 - familiarityPenalty(fam));
}

/** Seuil exigeant du rôle (le jeu divise la note par 2 en dessous), s'il en a un. */
export const roleThreshold = (gameCode: string): number | null => ROLE_RATINGS_FM27[gameCode]?.t ?? null;
