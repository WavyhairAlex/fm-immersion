import type { RoleRef, StyleRef, TacticReference } from './tactic';

/*
 * Consignes d'équipe et mentalités des styles : libellés exacts de FM27 (voir team-instructions-fm27.ts),
 * reprises des tactiques préréglées du jeu (shared/data/simatch.fmf, lu hors jeu le 01/11/2026 ; styles
 * Contrôle de la possession, Gegenpress, Contre-attaques fluides, Jeu sur les ailes, Longs ballons devant,
 * Jeu ultra-défensif). Contrôle de la possession est vérifié sur l'écran du jeu (Malženice, 01/11) : la ligne
 * défensive y reste Standard et « Ralentissez le rythme » (relances du GB) remplace « Gagnez du temps » lu
 * dans le fichier ; ces deux lectures du fichier sont donc écartées pour tous les styles.
 *
 * Repères maison de FM Immersion : rôles et styles de jeu décrits avec nos propres pondérations
 * (3 = essentiel, 2 = important, 1 = utile). Ils servent par défaut ; un fichier local de repères
 * plus fins, placé par le joueur dans le dossier du plugin, les remplace.
 */

type W = Record<string, number>;
const role = (code: string, fr: string, en: string, phase: RoleRef['phase'], positions: string[], group: string, weights: W, weightsOOP?: W): RoleRef => ({
  code,
  fr,
  en,
  phase,
  positions,
  group,
  weights,
  weightsOOP: weightsOOP ?? null,
});

const GK = ['GK'];
const CB = ['DC'];
const FB = ['DL', 'DR'];
const WB = ['WBL', 'WBR'];
const DM = ['DM'];
const CM = ['MC'];
const WM = ['ML', 'MR'];
const AMW = ['AML', 'AMR'];
const AMC = ['AMC'];
const ST = ['ST'];

/** Codes du jeu (énumérations InPossessionRole / OutOfPossessionRole) et condition de créneau. */
const g = (ip?: string, oop?: string) => ({ game: { ...(ip ? { ip } : {}), ...(oop ? { oop: `OP${oop}` } : {}) } });

/*
 * Rôles de FM27 et postes où le jeu les propose, relevés dans le code du jeu (game_plugin.dll,
 * table poste → rôles et filtres de créneau) le 01/11/2026 ; libellés FR/EN du jeu (languages.fmf).
 * Les rôles des anciennes versions que FM27 ne propose plus (Mezzala, Regista, Enganche,
 * Segundo Volante, Milieu récupérateur, Milieu sentinelle, Attaquant complet, Ailier défensif,
 * Attaquant pivot excentré, Arrière latéral strict) ne figurent pas ici.
 * Les poids des attributs (3 = essentiel, 2 = important, 1 = utile) restent des repères maison.
 */
const ROLES_FM27: RoleRef[] = [
  // Gardiens — GB
  { ...role('GK', 'Gardien de but', 'Goalkeeper', 'both', GK, 'GK', { reflexes: 3, handling: 3, oneOnOnes: 2, positioning: 2, aerialReach: 2, commandOfArea: 2, concentration: 1, agility: 1 }), ...g('Goalkeeper', 'Goalkeeper') },
  { ...role('BPGK', 'Gardien à l’aise au pied', 'Ball-Playing Goalkeeper', 'ip', GK, 'GK', { passing: 3, kicking: 3, composure: 2, firstTouch: 2, vision: 1, reflexes: 2, decisions: 1 }), ...g('BallPlayingGoalkeeper') },
  { ...role('NNGK', 'Gardien pragmatique', 'No-Nonsense Goalkeeper', 'ip', GK, 'GK', { kicking: 3, handling: 3, reflexes: 2, aerialReach: 2, positioning: 1, concentration: 1 }), ...g('NoNonsenseGoalkeeper') },
  { ...role('SK', 'Gardien-libéro', 'Sweeper Keeper', 'oop', GK, 'GK', { rushingOut: 3, oneOnOnes: 3, anticipation: 2, acceleration: 2, reflexes: 2, decisions: 1, composure: 1 }), ...g(undefined, 'SweeperKeeper') },
  { ...role('LHK', 'Gardien sur la ligne', 'Line-Holding Goalkeeper', 'oop', GK, 'GK', { reflexes: 3, handling: 3, positioning: 2, agility: 2, concentration: 1 }), ...g(undefined, 'LineKeeper') },
  // Défenseurs centraux — D (C)
  { ...role('CB', 'Défenseur central', 'Centre-Back', 'both', CB, 'CB', { marking: 3, tackling: 3, heading: 2, positioning: 2, strength: 2, jumpingReach: 1, concentration: 1 }), ...g('CentreBack', 'CentreBack') },
  { ...role('ADCB', 'Défenseur central avancé', 'Advanced Centre-Back', 'ip', CB, 'CB', { dribbling: 2, passing: 2, firstTouch: 2, composure: 2, acceleration: 1, stamina: 1, decisions: 1 }), ...g('AdvancedCentreBack') },
  { ...role('BPCB', 'Défenseur central à l’aise au pied', 'Ball-Playing Centre-Back', 'ip', CB, 'CB', { passing: 3, composure: 3, firstTouch: 2, vision: 2, technique: 1, decisions: 1 }), ...g('BallPlayingCentreBack') },
  { ...role('NNCB', 'Défenseur central strict', 'No-Nonsense Centre-Back', 'ip', CB, 'CB', { heading: 3, marking: 3, tackling: 2, strength: 2, jumpingReach: 2, bravery: 1 }), ...g('NoNonsenseCentreBack') },
  { ...role('WCB', 'Défenseur central excentré', 'Wide Centre-Back', 'both', CB, 'CB', { tackling: 2, marking: 2, pace: 2, stamina: 2, dribbling: 1, passing: 1, crossing: 1 }, { tackling: 3, marking: 2, positioning: 2, pace: 2, anticipation: 1 }), ...g('WideCentreBack', 'WideCentreBack'), cond: 'wide3' },
  { ...role('OCB', 'Défenseur central de dédoublement', 'Overlapping Centre-Back', 'ip', CB, 'CB', { stamina: 3, pace: 2, crossing: 2, dribbling: 2, workRate: 2, tackling: 1 }), ...g('OverlappingCentreBack'), cond: 'wide3' },
  { ...role('STCB', 'Défenseur central stoppeur', 'Stopping Centre-Back', 'oop', CB, 'CB', { tackling: 3, aggression: 2, bravery: 2, strength: 2, anticipation: 2, acceleration: 1 }), ...g(undefined, 'StoppingCentreBack') },
  { ...role('CCB', 'Défenseur central de couverture', 'Covering Centre-Back', 'oop', CB, 'CB', { positioning: 3, anticipation: 3, pace: 2, concentration: 2, marking: 1 }), ...g(undefined, 'CoveringCentreBack') },
  { ...role('SWCB', 'Défenseur central excentré stoppeur', 'Stopping Wide Centre-Back', 'oop', CB, 'CB', { tackling: 3, aggression: 2, bravery: 2, acceleration: 2, anticipation: 2 }), ...g(undefined, 'StoppingWideCentreBack'), cond: 'wide3' },
  { ...role('CWCB', 'Défenseur central excentré de couverture', 'Covering Wide Centre-Back', 'oop', CB, 'CB', { positioning: 3, anticipation: 2, pace: 2, concentration: 2, marking: 1 }), ...g(undefined, 'CoveringWideCentreBack'), cond: 'wide3' },
  // Latéraux — D (D/G) et DL (D/G)
  { ...role('FB', 'Arrière latéral', 'Full-Back', 'both', FB, 'FB', { tackling: 3, marking: 2, positioning: 2, stamina: 2, crossing: 1, pace: 1, teamwork: 1 }), ...g('FullBack', 'FullBack') },
  { ...role('WB', 'Latéral offensif', 'Wing-Back', 'both', [...FB, ...WB], 'FB', { stamina: 3, crossing: 3, pace: 2, workRate: 2, tackling: 1, dribbling: 1 }), positionsOOP: WB, ...g('WingBack', 'WingBack') },
  { ...role('IWB', 'Latéral offensif intérieur', 'Inside Wing-Back', 'ip', [...FB, ...WB], 'FB', { passing: 3, vision: 2, firstTouch: 2, decisions: 2, stamina: 1, technique: 1 }), ...g('InsideWingBack') },
  { ...role('IFB', 'Arrière latéral intérieur', 'Inside Full-Back', 'ip', FB, 'FB', { passing: 3, composure: 2, firstTouch: 2, decisions: 2, positioning: 1, technique: 1 }), ...g('InsideFullBack') },
  { ...role('PMWB', 'Latéral offensif meneur de jeu', 'Playmaking Wing-Back', 'ip', [...FB, ...WB], 'FB', { passing: 3, vision: 3, technique: 2, crossing: 1, stamina: 2, decisions: 1 }), ...g('PlaymakingWingBack') },
  { ...role('AWB', 'Latéral offensif avancé', 'Advanced Wing-Back', 'ip', WB, 'FB', { crossing: 3, dribbling: 2, acceleration: 2, stamina: 3, offTheBall: 1, technique: 1 }), ...g('AdvancedWingBack') },
  { ...role('PFB', 'Arrière latéral de pressing', 'Pressing Full-Back', 'oop', FB, 'FB', { workRate: 3, aggression: 2, tackling: 2, acceleration: 2, stamina: 1 }), ...g(undefined, 'PressingFullBack') },
  { ...role('HFB', 'Arrière latéral en retrait', 'Holding Full-Back', 'oop', FB, 'FB', { positioning: 3, marking: 2, concentration: 2, tackling: 2, teamwork: 1 }), ...g(undefined, 'HoldingFullBack') },
  { ...role('PWB', 'Latéral offensif de pressing', 'Pressing Wing-Back', 'oop', WB, 'FB', { workRate: 3, stamina: 2, aggression: 2, tackling: 2, acceleration: 1 }), ...g(undefined, 'PressingWingBack') },
  { ...role('HWB', 'Latéral offensif en retrait', 'Holding Wing-Back', 'oop', WB, 'FB', { positioning: 3, tackling: 2, marking: 2, stamina: 2, teamwork: 1 }), ...g(undefined, 'HoldingWingBack') },
  // Milieux défensifs — MD (C)
  { ...role('DM', 'Milieu défensif', 'Defensive Midfielder', 'both', DM, 'DM', { tackling: 3, positioning: 3, anticipation: 2, teamwork: 2, passing: 1, concentration: 1 }), ...g('DefensiveMidfielder', 'DefensiveMidfielder') },
  { ...role('DLP', 'Meneur de jeu en retrait', 'Deep-Lying Playmaker', 'ip', DM, 'DM', { passing: 3, vision: 3, composure: 2, firstTouch: 2, decisions: 2, technique: 1 }), ...g('DeepLyingPlaymaker') },
  { ...role('HB', 'Demi-centre', 'Half Back', 'ip', DM, 'DM', { positioning: 3, passing: 2, composure: 2, marking: 2, decisions: 1, anticipation: 1 }), ...g('HalfBack') },
  { ...role('BBM', 'Milieu box to box', 'Box-To-Box Midfielder', 'ip', DM, 'DM', { stamina: 3, workRate: 3, offTheBall: 2, passing: 2, tackling: 1, longShots: 1 }), ...g('BoxToBoxMidfielder'), cond: 'wide' },
  { ...role('B2BPM', 'Meneur de jeu box to box', 'Box-To-Box Playmaker', 'ip', DM, 'DM', { passing: 3, vision: 2, stamina: 2, workRate: 2, firstTouch: 1, decisions: 1 }), ...g('BoxToBoxPlaymaker'), cond: 'wide' },
  { ...role('DROPDM', 'Milieu défensif en retrait', 'Dropping Defensive Midfielder', 'oop', DM, 'DM', { positioning: 3, marking: 2, heading: 1, concentration: 2, anticipation: 2 }), ...g(undefined, 'DroppingDefensiveMidfielder') },
  { ...role('PRSDM', 'Milieu défensif de pressing', 'Pressing Defensive Midfielder', 'oop', DM, 'DM', { workRate: 3, aggression: 2, tackling: 2, stamina: 2, acceleration: 1 }), ...g(undefined, 'PressingDefensiveMidfielder') },
  { ...role('SCRDM', 'Milieu défensif de couverture', 'Screening Defensive Midfielder', 'oop', DM, 'DM', { positioning: 3, anticipation: 3, concentration: 2, teamwork: 2, tackling: 1 }), ...g(undefined, 'ScreeningDefensiveMidfielder') },
  { ...role('WCDM', 'Milieu défensif de couverture dans la largeur', 'Wide Covering Defensive Midfielder', 'oop', DM, 'DM', { stamina: 3, positioning: 2, pace: 2, tackling: 2, teamwork: 1 }), ...g(undefined, 'WideCoverDefensiveMidfielder'), cond: 'wide' },
  // Milieux centraux — M (C)
  { ...role('CM', 'Milieu axial', 'Central Midfielder', 'both', CM, 'CM', { passing: 3, teamwork: 2, stamina: 2, decisions: 2, tackling: 1, firstTouch: 1 }), ...g('CentralMidfielder', 'CentralMidfielder') },
  { ...role('MFPM', 'Meneur de jeu du milieu', 'Midfield Playmaker', 'ip', CM, 'CM', { passing: 3, vision: 3, technique: 2, decisions: 2, firstTouch: 1, composure: 1 }), ...g('MidfieldPlaymaker') },
  { ...role('CHM', 'Milieu de couloir', 'Channel Midfielder', 'ip', [...CM, ...AMC], 'CM', { offTheBall: 3, dribbling: 2, acceleration: 2, stamina: 2, passing: 1, finishing: 1 }), ...g('ChannelMidfielder') },
  { ...role('WCM', 'Milieu central désaxé', 'Wide Central Midfielder', 'ip', CM, 'CM', { passing: 3, crossing: 2, stamina: 2, technique: 1, decisions: 1 }), ...g('WideCentralMidfielder') },
  { ...role('PRSCM', 'Milieu axial de pressing', 'Pressing Central Midfielder', 'oop', CM, 'CM', { workRate: 3, stamina: 3, aggression: 2, tackling: 2, acceleration: 1 }), ...g(undefined, 'PressingCentralMidfielder') },
  { ...role('SCRCM', 'Milieu axial de couverture', 'Screening Central Midfielder', 'oop', CM, 'CM', { positioning: 3, anticipation: 2, teamwork: 2, concentration: 2, tackling: 1 }), ...g(undefined, 'ScreeningCentralMidfielder') },
  { ...role('WCCM', 'Milieu axial de couverture dans la largeur', 'Wide Covering Central Midfielder', 'oop', CM, 'CM', { stamina: 3, pace: 2, positioning: 2, teamwork: 1, tackling: 1 }), ...g(undefined, 'WideCoverCentralMidfielder'), cond: 'wide' },
  // Milieux latéraux et ailiers — M (D/G) et MO (D/G)
  { ...role('WM', 'Milieu latéral', 'Wide Midfielder', 'both', WM, 'WG', { crossing: 2, passing: 2, stamina: 3, workRate: 2, teamwork: 1, tackling: 1 }), ...g('WideMidfielder', 'WideMidfielder') },
  { ...role('W', 'Ailier', 'Winger', 'both', [...WM, ...AMW], 'WG', { dribbling: 3, crossing: 3, acceleration: 2, pace: 2, technique: 1, agility: 1 }, { workRate: 2, stamina: 2, acceleration: 2, teamwork: 1, tackling: 1 }), positionsOOP: AMW, ...g('Winger', 'Winger') },
  { ...role('WP', 'Ailier meneur de jeu', 'Playmaking Winger', 'ip', [...WM, ...AMW], 'WG', { passing: 3, vision: 3, technique: 2, firstTouch: 2, decisions: 1 }), ...g('PlaymakingWinger') },
  { ...role('IW', 'Ailier intérieur', 'Inside Winger', 'ip', [...WM, ...AMW], 'WG', { dribbling: 3, passing: 2, vision: 2, technique: 2, longShots: 1, acceleration: 1 }), ...g('InsideWinger') },
  { ...role('IF', 'Attaquant intérieur', 'Inside Forward', 'ip', AMW, 'WG', { finishing: 3, dribbling: 3, offTheBall: 2, acceleration: 2, composure: 1, technique: 1 }), ...g('InsideForward') },
  { ...role('WF', 'Attaquant désaxé', 'Wide Forward', 'ip', AMW, 'WG', { offTheBall: 3, finishing: 2, acceleration: 2, pace: 2, dribbling: 1 }), ...g('WideForward') },
  { ...role('TWM', 'Milieu latéral de couverture', 'Tracking Wide Midfielder', 'oop', WM, 'WG', { workRate: 3, stamina: 2, tackling: 2, positioning: 2, teamwork: 1 }), ...g(undefined, 'TrackingWideMidfielder') },
  { ...role('WOM', 'Milieu latéral de contre-attaque', 'Wide Outlet Wide Midfielder', 'oop', WM, 'WG', { acceleration: 3, pace: 2, offTheBall: 2, anticipation: 1 }), ...g(undefined, 'WideOutletWideMidfielder') },
  { ...role('TW', 'Ailier de couverture', 'Tracking Winger', 'oop', AMW, 'WG', { workRate: 3, stamina: 3, tackling: 1, teamwork: 2, positioning: 1 }), ...g(undefined, 'TrackingWinger') },
  { ...role('WOW', 'Ailier de contre-attaque', 'Wide Outlet Winger', 'oop', AMW, 'WG', { acceleration: 3, pace: 3, offTheBall: 2, anticipation: 1 }), ...g(undefined, 'WideOutletWinger') },
  { ...role('IOW', 'Ailier inversé de contre-attaque', 'Inside Outlet Winger', 'oop', AMW, 'WG', { acceleration: 3, offTheBall: 2, anticipation: 2, pace: 2 }), ...g(undefined, 'InsideOutletWinger') },
  // Milieux offensifs — M (C) et MO (C)
  { ...role('AM', 'Milieu offensif', 'Attacking Midfielder', 'both', [...CM, ...AMC], 'AM', { passing: 2, offTheBall: 2, technique: 2, longShots: 2, vision: 2, decisions: 1 }), positionsOOP: AMC, ...g('AttackingMidfielder', 'AttackingMidfielder') },
  { ...role('AP', 'Meneur de jeu avancé', 'Advanced Playmaker', 'ip', [...CM, ...AMC], 'AM', { passing: 3, vision: 3, technique: 2, firstTouch: 2, decisions: 2, flair: 1 }), ...g('AdvancedPlaymaker') },
  { ...role('FREE', 'Rôle libre', 'Free Role', 'ip', AMC, 'AM', { flair: 3, vision: 2, dribbling: 2, technique: 2, offTheBall: 2, passing: 1 }), ...g('FreeRole') },
  { ...role('SS', 'Deuxième avant-centre', 'Second Striker', 'ip', AMC, 'AM', { offTheBall: 3, finishing: 3, anticipation: 2, composure: 2, acceleration: 1 }), ...g('SecondStriker') },
  { ...role('TAM', 'Milieu offensif de couverture', 'Tracking Attacking Midfielder', 'oop', AMC, 'AM', { workRate: 3, stamina: 2, teamwork: 2, tackling: 1, positioning: 1 }), ...g(undefined, 'TrackingAttackingMidfielder') },
  { ...role('COAM', 'Milieu de terrain offensif de contre-attaque axiale', 'Central Outlet Attacking Midfielder', 'oop', AMC, 'AM', { offTheBall: 2, anticipation: 2, acceleration: 2, composure: 1 }), ...g(undefined, 'CentralOutletAttackingMidfielder') },
  { ...role('SOAM', 'Milieu offensif de contre-attaque de couloir', 'Splitting Outlet Attacking Midfielder', 'oop', AMC, 'AM', { acceleration: 2, pace: 2, offTheBall: 2, stamina: 1 }), ...g(undefined, 'SplittingOutletAttackingMidfielder'), cond: 'wide' },
  // Attaquants — BT
  { ...role('CF', 'Attaquant central', 'Centre Forward', 'both', ST, 'ST', { finishing: 3, offTheBall: 2, firstTouch: 2, composure: 2, strength: 1, heading: 1, acceleration: 1 }, { workRate: 2, anticipation: 2, positioning: 1, teamwork: 1 }), ...g('CentreForward', 'CentreForward') },
  { ...role('POA', 'Renard des surfaces', 'Poacher', 'ip', ST, 'ST', { finishing: 3, offTheBall: 3, anticipation: 2, composure: 2, acceleration: 1 }), ...g('Poacher') },
  { ...role('TF', 'Attaquant pivot', 'Target Forward', 'ip', ST, 'ST', { heading: 3, strength: 3, jumpingReach: 2, firstTouch: 1, balance: 1, finishing: 1 }), ...g('TargetForward') },
  { ...role('DLF', 'Attaquant en retrait', 'Deep-Lying Forward', 'ip', ST, 'ST', { firstTouch: 3, passing: 2, technique: 2, strength: 1, vision: 1, composure: 1 }), ...g('DeepLyingForward') },
  { ...role('F9', 'Faux neuf', 'False Nine', 'ip', ST, 'ST', { passing: 3, vision: 2, technique: 2, firstTouch: 2, dribbling: 2, decisions: 1 }), ...g('FalseNine') },
  { ...role('CHF', 'Attaquant de couloir', 'Channel Forward', 'ip', ST, 'ST', { offTheBall: 3, acceleration: 3, pace: 2, dribbling: 1, finishing: 2 }), ...g('ChannelForward') },
  { ...role('TCF', 'Attaquant central de couverture', 'Tracking Centre Forward', 'oop', ST, 'ST', { workRate: 3, stamina: 2, teamwork: 2, aggression: 1 }), ...g(undefined, 'TrackingCentreForward') },
  // Libellé vu à l'écran du jeu (capture du 31/10/2026), qui diffère du libellé de rôle de languages.fmf.
  { ...role('COCF', 'Avant-centre point d’appui axial', 'Central Outlet Centre Forward', 'oop', ST, 'ST', { strength: 2, anticipation: 2, offTheBall: 2, firstTouch: 1 }), ...g(undefined, 'CentralOutletCentreForward') },
  { ...role('SOCF', 'Attaquant central de contre-attaque de couloir', 'Splitting Outlet Centre Forward', 'oop', ST, 'ST', { acceleration: 3, pace: 2, offTheBall: 2, stamina: 1 }), ...g(undefined, 'SplittingOutletCentreForward'), cond: 'wide' },
];

/** Mission avec ballon que FM27 attribue à chaque rôle (relevée dans le code du jeu ; elle ne se choisit plus). */
const DUTY: Record<string, 'd' | 's' | 'a'> = {
  GK: 'd', NNGK: 'd', BPGK: 's',
  CB: 'd', ADCB: 'd', BPCB: 'd', NNCB: 'd', WCB: 'd', OCB: 'a',
  IFB: 'd', IWB: 'd', FB: 's', WB: 's', PMWB: 's', AWB: 'a',
  DM: 'd', HB: 'd', DLP: 's', BBM: 's', B2BPM: 's',
  CM: 's', MFPM: 's', WCM: 's', CHM: 'a',
  WM: 's', W: 's', WP: 's', IW: 's', IF: 'a', WF: 'a',
  AM: 'a', AP: 'a', FREE: 'a', SS: 'a',
  CF: 'a', POA: 'a', TF: 'a', DLF: 'a', F9: 'a', CHF: 'a',
};

const ROLES: RoleRef[] = ROLES_FM27.map((r) => (DUTY[r.code] && r.phase !== 'oop' ? { ...r, duty: DUTY[r.code] } : r));

const style = (s: StyleRef): StyleRef => s;

const STYLES: StyleRef[] = [
  style({
    id: 'possession',
    name: 'Contrôle de la possession',
    nameEn: 'Possession control',
    summary: 'Garder le ballon, construire court depuis l’arrière et le récupérer vite.',
    inPossession: ['Faites plus de passes courtes', 'Rythme plus lent', 'Jouer le ballon dans la surface', 'Jouer malgré le pressing', 'Dégagements au pied courts', 'Ralentissez le rythme', 'Relancez vers défenseurs centraux'],
    outOfPossession: ['Pressing haut', 'Déclenchez le pressing plus souvent', 'Effectuer un contre-pressing', 'Empêchez les relances courtes du GB'],
    weights: { technical: 3, creators: 2, press: 1 },
    mentality: 'Positive',
    signatureRoles: { ip: ['BPGK', 'BPCB', 'CB', 'IFB', 'IWB', 'PMWB', 'B2BPM', 'DLP', 'HB', 'MFPM', 'AP', 'IW', 'WP', 'F9', 'DLF'], oop: ['SK', 'STCB', 'CB', 'PFB', 'PWB', 'SCRDM', 'PRSDM', 'PRSCM', 'SCRCM', 'TWM', 'TW', 'TAM', 'CF'] },
  }),
  style({
    id: 'gegenpress',
    name: 'Pressing à la perte',
    nameEn: 'Gegenpress',
    summary: 'Récupérer le ballon tout de suite après l’avoir perdu, haut sur le terrain.',
    inPossession: ['Rythme beaucoup plus élevé', 'Plus axiale', 'Contrez', 'Jouer malgré le pressing', 'Relancez vers défenseurs centraux'],
    outOfPossession: ['Pressing haut', 'Rester plus haut', 'Déclenchez le pressing beaucoup plus souvent', 'Effectuer un contre-pressing', 'Empêchez les relances courtes du GB'],
    weights: { press: 3, physical: 2, pace: 1, technical: 1 },
    mentality: 'Équilibrée',
    signatureRoles: { ip: ['GK', 'BPCB', 'CB', 'FB', 'WB', 'AWB', 'BBM', 'DM', 'CM', 'CHM', 'AM', 'IF', 'W', 'CF', 'POA'], oop: ['SK', 'STCB', 'CB', 'PFB', 'PWB', 'PRSDM', 'PRSCM', 'TWM', 'TW', 'TAM', 'CF'] },
  }),
  style({
    id: 'counter-fluid',
    name: 'Contre-attaque rapide',
    nameEn: 'Fast counter-attack',
    summary: 'Défendre en bloc et projeter vite les joueurs rapides dans l’espace.',
    inPossession: ['Faites plus de passes courtes', 'Rythme plus élevé', 'Contrez', 'Prenez la défense de vitesse', 'Passer dans les espaces', 'Relances rapides'],
    outOfPossession: ['Bloc médian', 'Rester plus bas', 'Déclenchez le pressing plus souvent', 'Effectuer un contre-pressing', "S'engager plus"],
    weights: { pace: 3, finishing: 2, defense: 2, physical: 1 },
    mentality: 'Prudente',
    signatureRoles: { ip: ['GK', 'CB', 'NNCB', 'FB', 'WB', 'BBM', 'DM', 'CM', 'CHM', 'WM', 'IF', 'WF', 'W', 'SS', 'CHF', 'POA'], oop: ['GK', 'CCB', 'CB', 'HFB', 'HWB', 'SCRDM', 'SCRCM', 'WOM', 'WOW', 'IOW', 'COAM', 'COCF'] },
  }),
  style({
    id: 'wings',
    name: 'Jeu sur les ailes',
    nameEn: 'Wing play',
    summary: 'Étirer le bloc adverse par les côtés et servir la surface.',
    inPossession: ['Faites plus de passes directes', 'Rythme plus élevé', 'Beaucoup plus large', 'Contrez', 'Cherchez à dédoubler', 'Jouez sur les deux flancs', 'Relancez vers défenseurs latéraux'],
    outOfPossession: ['Bloc médian', 'Déclenchez le pressing plus souvent', 'Pressing vers les côtés'],
    weights: { wide: 3, aerial: 2, finishing: 1, physical: 1 },
    mentality: 'Équilibrée',
    signatureRoles: { ip: ['GK', 'OCB', 'CB', 'WB', 'AWB', 'FB', 'BBM', 'DM', 'CM', 'WCM', 'WM', 'W', 'AM', 'TF', 'CF'], oop: ['GK', 'CB', 'HWB', 'FB', 'DM', 'CM', 'TWM', 'TW', 'AM', 'CF'] },
  }),
  style({
    id: 'longball',
    name: 'Jeu direct',
    nameEn: 'Direct play',
    summary: 'Chercher vite l’avant-centre et jouer les seconds ballons.',
    inPossession: ['Jouez beaucoup plus direct', 'Rythme plus élevé', 'Contrez', 'Soyez plus disciplinés', 'Obtenir des coups de pied arrêtés', 'Centrer de loin', 'Contourner le pressing', 'Longs dégagements au pied'],
    outOfPossession: ['Bloc médian', 'Regroupement', "S'engager plus", 'Pressing vers les côtés'],
    weights: { aerial: 3, physical: 2, defense: 1 },
    mentality: 'Équilibrée',
    signatureRoles: { ip: ['NNGK', 'NNCB', 'CB', 'FB', 'WB', 'BBM', 'DM', 'CM', 'WM', 'W', 'AM', 'TF', 'POA'], oop: ['LHK', 'STCB', 'CB', 'HFB', 'HWB', 'DM', 'CM', 'TWM', 'TW', 'AM', 'TCF', 'CF'] },
  }),
  style({
    id: 'ultra-def',
    name: 'Bloc bas',
    nameEn: 'Low block',
    summary: 'Fermer l’axe, défendre bas et frapper sur les rares occasions.',
    inPossession: ['Faites plus de passes directes', 'Rythme plus lent', 'Plus axiale', 'Soyez plus disciplinés', 'Gagnez beaucoup plus de temps', 'Obtenir des coups de pied arrêtés', 'Centrer de loin', 'Passer dans les espaces', 'Contourner le pressing', 'Longs dégagements au pied', 'Ralentissez le rythme'],
    outOfPossession: ['Bloc bas', 'Rester plus bas', 'Déclenchez le pressing moins souvent', 'Regroupement', "S'engager plus", 'Pressing vers les côtés'],
    weights: { defense: 3, aerial: 2, physical: 1, pace: 1 },
    mentality: 'Défensive',
    signatureRoles: { ip: ['NNGK', 'NNCB', 'CB', 'WCB', 'FB', 'WB', 'HB', 'DM', 'CM', 'WM', 'TF', 'CF'], oop: ['LHK', 'CCB', 'CB', 'CWCB', 'HFB', 'HWB', 'DROPDM', 'SCRDM', 'SCRCM', 'TWM', 'TW', 'TAM', 'TCF'] },
  }),
];

export const DEFAULT_TACTIC_REFERENCE: TacticReference = { roles: ROLES, styles: STYLES };

/** Fusionne un fichier local de repères avec les repères maison : ses rôles et styles remplacent ceux de même code. */
/**
 * Styles du jeu absents des repères du code, avec leur préréglage FM27 (simatch.fmf, lu hors jeu le 01/11/2026) :
 * mentalité et consignes d'équipe, aux mêmes corrections que les styles du code (ligne défensive et
 * « Gagnez du temps » écartées). Les identifiants sont ceux du fichier local `simloom-roles.json`.
 */
const GAME_PRESETS: Record<string, Pick<StyleRef, 'inPossession' | 'outOfPossession' | 'mentality'>> = {
  tikitaka: {
    inPossession: ['Passes beaucoup plus courtes', 'Rythme beaucoup plus lent', 'Rester en place', 'Centres à ras de terre', 'Faites moins de dribbles', 'Dissuader de frapper de loin', 'Jouer le ballon dans la surface', 'Passer dans les pieds', 'Jouer malgré le pressing', 'Dégagements au pied courts', 'Relances rapides', 'Relancez vers défenseurs centraux'],
    outOfPossession: ['Pressing haut', 'Déclenchez le pressing plus souvent', 'Effectuer un contre-pressing', 'Empêchez les relances courtes du GB'],
    mentality: 'Positive',
  },
  'tikitaka-v': {
    inPossession: ['Faites plus de passes courtes', 'Rythme plus lent', 'Beaucoup plus axiale', 'Contrez', 'Soyez plus expressifs', 'Jouer le ballon dans la surface', 'Centres à ras de terre', 'Cherchez le dédoublement intérieur', "Concentrez le jeu dans l'axe", 'Jouer malgré le pressing', 'Dégagements au pied courts', 'Relancez vers défenseurs centraux'],
    outOfPossession: ['Pressing haut', 'Déclenchez le pressing plus souvent', 'Effectuer un contre-pressing', 'Empêchez les relances courtes du GB'],
    mentality: 'Équilibrée',
  },
  'counter-direct': {
    inPossession: ['Faites plus de passes directes', 'Rythme plus élevé', 'Contrez', 'Passer dans les espaces', 'Contourner le pressing', 'Relances rapides'],
    outOfPossession: ['Bloc bas', 'Rester plus bas', 'Déclenchez le pressing plus souvent', "S'engager plus"],
    mentality: 'Prudente',
  },
  catenaccio: {
    inPossession: ['Faites plus de passes directes', 'Rythme plus lent', 'Beaucoup plus axiale', 'Contrez', 'Soyez plus disciplinés', 'Gagnez beaucoup plus de temps', 'Obtenir des coups de pied arrêtés', 'Contourner le pressing', 'Ralentissez le rythme'],
    outOfPossession: ['Bloc bas', 'Rester plus bas', 'Déclenchez le pressing moins souvent', 'Regroupement', 'Ne pas se jeter'],
    mentality: 'Défensive',
  },
};

/**
 * Fusionne un fichier local de repères avec les repères maison : ses rôles et styles remplacent ceux de même code,
 * sauf ce qui vient du jeu. La mentalité et les consignes d'équipe d'un style connu du jeu restent celles du
 * préréglage FM27 : un ancien fichier local (libellés d'avant le 01/11/2026) faisait sinon perdre des consignes
 * et donnait d'anciennes mentalités.
 */
export function mergeReference(local: TacticReference | null | undefined): TacticReference {
  if (!local) return DEFAULT_TACTIC_REFERENCE;
  const roles = new Map(DEFAULT_TACTIC_REFERENCE.roles.map((r) => [r.code, r]));
  for (const r of local.roles) roles.set(r.code, r);
  const styles = new Map(DEFAULT_TACTIC_REFERENCE.styles.map((s) => [s.id, s]));
  for (const s of local.styles) {
    const game = styles.get(s.id) ?? GAME_PRESETS[s.id];
    styles.set(s.id, game ? { ...s, inPossession: game.inPossession, outOfPossession: game.outOfPossession, mentality: game.mentality } : { ...s, mentality: gameMentality(s.mentality) });
  }
  return { roles: [...roles.values()], styles: [...styles.values()] };
}

/** Ancien libellé de mentalité (« Équilibré », « Très prudent ») → libellé de FM27. */
export function gameMentality(m: string | null | undefined): string | undefined {
  if (!m) return undefined;
  const n = m.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const map: Record<string, string> = {
    'tres defensif': 'Très défensive', 'tres defensive': 'Très défensive', 'tres prudent': 'Défensive', 'tres prudente': 'Défensive',
    defensif: 'Défensive', defensive: 'Défensive', prudent: 'Prudente', prudente: 'Prudente', equilibre: 'Équilibrée', equilibree: 'Équilibrée',
    positif: 'Positive', positive: 'Positive', offensif: 'Offensive', offensive: 'Offensive', 'tres offensif': 'Très offensive', 'tres offensive': 'Très offensive',
  };
  return map[n] ?? m;
}

/*
 * Taille du terrain à domicile, d'après le style de jeu. FM27 la propose en début de saison (longueur 90 à 120 m,
 * largeur 55 à 90 m). Repères de la communauté FM : un style qui garde le ballon ou joue sur les côtés gagne à un
 * terrain large (plus d'espace pour faire circuler), un style de pressing à un terrain court (moins de distance à
 * couvrir), la contre-attaque à un terrain long (de l'espace dans le dos), un bloc bas au plus petit terrain permis.
 * L'effet reste modeste dans le moteur : c'est un petit plus, pas une tactique.
 */
export type PitchChoice = 'large' | 'short' | 'long' | 'narrow' | 'min' | 'normal';
export const PITCH_SIZES: Record<PitchChoice, { length: number; width: number }> = {
  large: { length: 105, width: 85 },
  short: { length: 90, width: 70 },
  long: { length: 115, width: 70 },
  narrow: { length: 105, width: 55 },
  min: { length: 90, width: 55 },
  normal: { length: 105, width: 68 },
};
const PITCH_BY_STYLE: Record<string, PitchChoice> = {
  possession: 'large',
  tikitaka: 'large',
  'tikitaka-v': 'large',
  wings: 'large',
  gegenpress: 'short',
  'counter-fluid': 'long',
  'counter-direct': 'long',
  longball: 'narrow',
  'ultra-def': 'min',
  catenaccio: 'min',
};
export function pitchAdvice(styleId: string | null | undefined): { choice: PitchChoice; length: number; width: number } {
  const choice = PITCH_BY_STYLE[styleId ?? ''] ?? 'normal';
  return { choice, ...PITCH_SIZES[choice] };
}
