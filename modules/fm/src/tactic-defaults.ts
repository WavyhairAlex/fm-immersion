import type { RoleRef, StyleRef, TacticReference } from './tactic';

/*
 * Repères maison de Simloom : rôles et styles de jeu décrits avec nos propres pondérations
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

const ROLES: RoleRef[] = [
  // Gardiens
  role('GK', 'Gardien', 'Goalkeeper', 'both', GK, 'GK', { reflexes: 3, handling: 3, oneOnOnes: 2, positioning: 2, aerialReach: 2, commandOfArea: 2, concentration: 1, agility: 1 }),
  role('BPGK', 'Gardien relanceur', 'Ball-Playing Goalkeeper', 'ip', GK, 'GK', { passing: 3, kicking: 3, composure: 2, firstTouch: 2, vision: 1, reflexes: 2, decisions: 1 }),
  role('SK', 'Gardien qui sort', 'Sweeper Keeper', 'oop', GK, 'GK', { rushingOut: 3, oneOnOnes: 3, anticipation: 2, acceleration: 2, reflexes: 2, decisions: 1, composure: 1 }),
  role('LHK', 'Gardien sur sa ligne', 'Line Keeper', 'oop', GK, 'GK', { reflexes: 3, handling: 3, positioning: 2, agility: 2, concentration: 1 }),
  // Défenseurs centraux
  role('CB', 'Défenseur central', 'Centre-Back', 'both', CB, 'CB', { marking: 3, tackling: 3, heading: 2, positioning: 2, strength: 2, jumpingReach: 1, concentration: 1 }),
  role('BPCB', 'Défenseur relanceur', 'Ball-Playing Centre-Back', 'ip', CB, 'CB', { passing: 3, composure: 3, firstTouch: 2, vision: 2, technique: 1, decisions: 1 }),
  role('ADCB', 'Défenseur qui monte', 'Advanced Centre-Back', 'ip', CB, 'CB', { dribbling: 2, passing: 2, firstTouch: 2, composure: 2, acceleration: 1, stamina: 1, decisions: 1 }),
  role('STCB', 'Défenseur stoppeur', 'Stopping Centre-Back', 'oop', CB, 'CB', { tackling: 3, aggression: 2, bravery: 2, strength: 2, anticipation: 2, acceleration: 1 }),
  role('CCB', 'Défenseur couvreur', 'Covering Centre-Back', 'oop', CB, 'CB', { positioning: 3, anticipation: 3, pace: 2, concentration: 2, marking: 1 }),
  // Latéraux et pistons
  role('FB', 'Arrière latéral', 'Full-Back', 'both', FB, 'FB', { tackling: 3, marking: 2, positioning: 2, stamina: 2, crossing: 1, pace: 1, teamwork: 1 }),
  role('IFB', 'Latéral rentrant', 'Inverted Full-Back', 'ip', FB, 'FB', { passing: 3, composure: 2, firstTouch: 2, decisions: 2, positioning: 1, technique: 1 }),
  role('WB', 'Piston', 'Wing-Back', 'both', WB, 'FB', { stamina: 3, crossing: 3, pace: 2, workRate: 2, tackling: 1, dribbling: 1 }),
  role('IWB', 'Piston rentrant', 'Inverted Wing-Back', 'ip', [...FB, ...WB], 'FB', { passing: 3, vision: 2, firstTouch: 2, decisions: 2, stamina: 1, technique: 1 }),
  role('AWB', 'Piston offensif', 'Advanced Wing-Back', 'ip', WB, 'FB', { crossing: 3, dribbling: 2, acceleration: 2, stamina: 3, offTheBall: 1, technique: 1 }),
  role('PMWB', 'Piston meneur', 'Playmaking Wing-Back', 'ip', WB, 'FB', { passing: 3, vision: 3, technique: 2, crossing: 1, stamina: 2, decisions: 1 }),
  role('PFB', 'Latéral qui presse', 'Pressing Full-Back', 'oop', FB, 'FB', { workRate: 3, aggression: 2, tackling: 2, acceleration: 2, stamina: 1 }),
  role('HFB', 'Latéral qui reste', 'Holding Full-Back', 'oop', FB, 'FB', { positioning: 3, marking: 2, concentration: 2, tackling: 2, teamwork: 1 }),
  role('PWB', 'Piston qui presse', 'Pressing Wing-Back', 'oop', WB, 'FB', { workRate: 3, stamina: 2, aggression: 2, tackling: 2, acceleration: 1 }),
  role('DWB', 'Piston défensif', 'Defensive Wing-Back', 'oop', WB, 'FB', { positioning: 3, tackling: 2, marking: 2, stamina: 2, teamwork: 1 }),
  // Milieux défensifs
  role('DM', 'Milieu défensif', 'Defensive Midfielder', 'both', DM, 'DM', { tackling: 3, positioning: 3, anticipation: 2, teamwork: 2, passing: 1, concentration: 1 }),
  role('HB', 'Demi-défenseur', 'Half-Back', 'ip', DM, 'DM', { positioning: 3, passing: 2, composure: 2, marking: 2, decisions: 1, anticipation: 1 }),
  role('DLP', 'Meneur reculé', 'Deep-Lying Playmaker', 'ip', [...DM, ...CM], 'DM', { passing: 3, vision: 3, composure: 2, firstTouch: 2, decisions: 2, technique: 1 }),
  role('DROPDM', 'Milieu qui décroche', 'Dropping Midfielder', 'oop', DM, 'DM', { positioning: 3, marking: 2, heading: 1, concentration: 2, anticipation: 2 }),
  role('SCRDM', 'Milieu écran', 'Screening Midfielder', 'oop', DM, 'DM', { positioning: 3, anticipation: 3, concentration: 2, teamwork: 2, tackling: 1 }),
  role('PRSDM', 'Milieu défensif qui presse', 'Pressing Defensive Midfielder', 'oop', DM, 'DM', { workRate: 3, aggression: 2, tackling: 2, stamina: 2, acceleration: 1 }),
  role('WCDM', 'Milieu défensif couvrant le côté', 'Wide-Cover Defensive Midfielder', 'oop', DM, 'DM', { stamina: 3, positioning: 2, pace: 2, tackling: 2, teamwork: 1 }),
  // Milieux centraux
  role('CM', 'Milieu central', 'Central Midfielder', 'both', CM, 'CM', { passing: 3, teamwork: 2, stamina: 2, decisions: 2, tackling: 1, firstTouch: 1 }),
  role('BBM', 'Milieu box-to-box', 'Box-to-Box Midfielder', 'ip', CM, 'CM', { stamina: 3, workRate: 3, offTheBall: 2, passing: 2, tackling: 1, longShots: 1 }),
  role('B2BPM', 'Meneur box-to-box', 'Box-to-Box Playmaker', 'ip', CM, 'CM', { passing: 3, vision: 2, stamina: 2, workRate: 2, firstTouch: 1, decisions: 1 }),
  role('MFPM', 'Meneur de milieu', 'Midfield Playmaker', 'ip', CM, 'CM', { passing: 3, vision: 3, technique: 2, decisions: 2, firstTouch: 1, composure: 1 }),
  role('CHM', 'Milieu de couloir', 'Channel Midfielder', 'ip', CM, 'CM', { offTheBall: 3, dribbling: 2, acceleration: 2, stamina: 2, passing: 1, finishing: 1 }),
  role('WCM', 'Milieu axial excentré', 'Wide Central Midfielder', 'ip', CM, 'CM', { passing: 3, crossing: 2, stamina: 2, technique: 1, decisions: 1 }),
  role('SCRCM', 'Milieu central écran', 'Screening Central Midfielder', 'oop', CM, 'CM', { positioning: 3, anticipation: 2, teamwork: 2, concentration: 2, tackling: 1 }),
  role('PRSCM', 'Milieu central qui presse', 'Pressing Central Midfielder', 'oop', CM, 'CM', { workRate: 3, stamina: 3, aggression: 2, tackling: 2, acceleration: 1 }),
  role('WCCM', 'Milieu central couvrant le côté', 'Wide-Cover Central Midfielder', 'oop', CM, 'CM', { stamina: 3, pace: 2, positioning: 2, teamwork: 1, tackling: 1 }),
  // Milieux latéraux et ailiers
  role('WM', 'Milieu latéral', 'Wide Midfielder', 'both', WM, 'WG', { crossing: 2, passing: 2, stamina: 3, workRate: 2, teamwork: 1, tackling: 1 }),
  role('W', 'Ailier', 'Winger', 'ip', [...WM, ...AMW], 'WG', { dribbling: 3, crossing: 3, acceleration: 2, pace: 2, technique: 1, agility: 1 }),
  role('IF', 'Attaquant intérieur', 'Inside Forward', 'ip', AMW, 'WG', { finishing: 3, dribbling: 3, offTheBall: 2, acceleration: 2, composure: 1, technique: 1 }),
  role('IW', 'Ailier rentrant', 'Inverted Winger', 'ip', [...WM, ...AMW], 'WG', { dribbling: 3, passing: 2, vision: 2, technique: 2, longShots: 1, acceleration: 1 }),
  role('WP', 'Ailier meneur', 'Wide Playmaker', 'ip', [...WM, ...AMW], 'WG', { passing: 3, vision: 3, technique: 2, firstTouch: 2, decisions: 1 }),
  role('WF', 'Attaquant de côté', 'Wide Forward', 'ip', AMW, 'WG', { offTheBall: 3, finishing: 2, acceleration: 2, pace: 2, dribbling: 1 }),
  role('TWM', 'Milieu latéral qui suit', 'Tracking Wide Midfielder', 'oop', WM, 'WG', { workRate: 3, stamina: 2, tackling: 2, positioning: 2, teamwork: 1 }),
  role('WOM', 'Milieu latéral en pointe', 'Wide Outlet Midfielder', 'oop', WM, 'WG', { acceleration: 3, pace: 2, offTheBall: 2, anticipation: 1 }),
  role('TW', 'Ailier qui suit', 'Tracking Winger', 'oop', AMW, 'WG', { workRate: 3, stamina: 3, tackling: 1, teamwork: 2, positioning: 1 }),
  role('WOW', 'Ailier en pointe', 'Wide Outlet Winger', 'oop', AMW, 'WG', { acceleration: 3, pace: 3, offTheBall: 2, anticipation: 1 }),
  role('IOW', 'Ailier en pointe dans l’axe', 'Inside Outlet Winger', 'oop', AMW, 'WG', { acceleration: 3, offTheBall: 2, anticipation: 2, pace: 2 }),
  // Milieux offensifs
  role('AM', 'Milieu offensif', 'Attacking Midfielder', 'both', AMC, 'AM', { passing: 2, offTheBall: 2, technique: 2, longShots: 2, vision: 2, decisions: 1 }),
  role('AP', 'Meneur avancé', 'Advanced Playmaker', 'ip', [...AMC, ...CM], 'AM', { passing: 3, vision: 3, technique: 2, firstTouch: 2, decisions: 2, flair: 1 }),
  role('FREE', 'Électron libre', 'Free Role', 'ip', AMC, 'AM', { flair: 3, vision: 2, dribbling: 2, technique: 2, offTheBall: 2, passing: 1 }),
  role('SS', 'Second attaquant', 'Second Striker', 'ip', [...AMC, ...ST], 'AM', { offTheBall: 3, finishing: 3, anticipation: 2, composure: 2, acceleration: 1 }),
  role('TAM', 'Milieu offensif qui suit', 'Tracking Attacking Midfielder', 'oop', AMC, 'AM', { workRate: 3, stamina: 2, teamwork: 2, tackling: 1, positioning: 1 }),
  role('COAM', 'Milieu offensif en pointe', 'Central Outlet Attacking Midfielder', 'oop', AMC, 'AM', { offTheBall: 2, anticipation: 2, acceleration: 2, composure: 1 }),
  role('SOAM', 'Milieu offensif qui écarte', 'Splitting Outlet Attacking Midfielder', 'oop', AMC, 'AM', { acceleration: 2, pace: 2, offTheBall: 2, stamina: 1 }),
  // Attaquants
  role('CF', 'Avant-centre', 'Centre-Forward', 'both', ST, 'ST', { finishing: 3, offTheBall: 2, firstTouch: 2, composure: 2, strength: 1, heading: 1, acceleration: 1 }),
  role('POA', 'Renard des surfaces', 'Poacher', 'ip', ST, 'ST', { finishing: 3, offTheBall: 3, anticipation: 2, composure: 2, acceleration: 1 }),
  role('TF', 'Pivot', 'Target Forward', 'ip', ST, 'ST', { heading: 3, strength: 3, jumpingReach: 2, firstTouch: 1, balance: 1, finishing: 1 }),
  role('DLF', 'Attaquant en soutien', 'Deep-Lying Forward', 'ip', ST, 'ST', { firstTouch: 3, passing: 2, technique: 2, strength: 1, vision: 1, composure: 1 }),
  role('F9', 'Faux neuf', 'False Nine', 'ip', ST, 'ST', { passing: 3, vision: 2, technique: 2, firstTouch: 2, dribbling: 2, decisions: 1 }),
  role('CHF', 'Attaquant de couloir', 'Channel Forward', 'ip', ST, 'ST', { offTheBall: 3, acceleration: 3, pace: 2, dribbling: 1, finishing: 2 }),
  role('CCS', 'Attaquant central', 'Central Striker', 'oop', ST, 'ST', { workRate: 2, positioning: 1, anticipation: 2, teamwork: 1 }),
  role('TCF', 'Attaquant qui suit', 'Tracking Centre-Forward', 'oop', ST, 'ST', { workRate: 3, stamina: 2, teamwork: 2, aggression: 1 }),
  role('COCF', 'Point d’appui axial', 'Central Outlet Centre-Forward', 'oop', ST, 'ST', { strength: 2, anticipation: 2, offTheBall: 2, firstTouch: 1 }),
];

const style = (s: StyleRef): StyleRef => s;

const STYLES: StyleRef[] = [
  style({
    id: 'possession',
    name: 'Contrôle de la possession',
    nameEn: 'Possession control',
    summary: 'Garder le ballon, construire court depuis l’arrière et le récupérer vite.',
    inPossession: ['Passes plus courtes', 'Gérer le pressing', 'GB relance vers DC', 'Dégagements au pied courts', 'Rythme plus lent'],
    outOfPossession: ['Ligne défensive plus haute', 'Pressing haut', 'Déclencher le pressing plus souvent', 'Contre-pressing en transition'],
    weights: { technical: 3, creators: 2, press: 1 },
    mentality: 'Équilibré',
    signatureRoles: { ip: ['BPGK', 'BPCB', 'IFB', 'IWB', 'DLP', 'MFPM', 'AP', 'WP', 'IW', 'F9', 'DLF'], oop: ['SK', 'PFB', 'PRSCM', 'SCRDM', 'TW', 'TAM', 'CCS'] },
  }),
  style({
    id: 'gegenpress',
    name: 'Pressing à la perte',
    nameEn: 'Gegenpress',
    summary: 'Récupérer le ballon tout de suite après l’avoir perdu, haut sur le terrain.',
    inPossession: ['Passes plus directes', 'Rythme plus élevé'],
    outOfPossession: ['Ligne défensive plus haute', 'Pressing haut', 'Déclencher le pressing beaucoup plus souvent', 'Contre-pressing en transition'],
    weights: { press: 3, physical: 2, pace: 1, technical: 1 },
    mentality: 'Positif',
    signatureRoles: { ip: ['GK', 'CB', 'FB', 'WB', 'BBM', 'CM', 'IF', 'W', 'AM', 'CF', 'POA'], oop: ['SK', 'STCB', 'PFB', 'PWB', 'PRSDM', 'PRSCM', 'TW', 'TAM', 'TCF'] },
  }),
  style({
    id: 'counter-fluid',
    name: 'Contre-attaque rapide',
    nameEn: 'Fast counter-attack',
    summary: 'Défendre en bloc et projeter vite les joueurs rapides dans l’espace.',
    inPossession: ['Passes plus directes', 'Contre-attaque en transition', 'Rythme plus élevé'],
    outOfPossession: ['Bloc médian', 'Ligne défensive normale'],
    weights: { pace: 3, finishing: 2, defense: 2, physical: 1 },
    mentality: 'Équilibré',
    signatureRoles: { ip: ['GK', 'CB', 'FB', 'WB', 'DM', 'BBM', 'IF', 'WF', 'W', 'SS', 'CHF', 'POA'], oop: ['GK', 'CCB', 'HFB', 'SCRDM', 'SCRCM', 'WOW', 'COAM', 'COCF'] },
  }),
  style({
    id: 'wings',
    name: 'Jeu sur les ailes',
    nameEn: 'Wing play',
    summary: 'Étirer le bloc adverse par les côtés et servir la surface.',
    inPossession: ['Plus grande largeur', 'Centrer de loin', 'Passes plus directes'],
    outOfPossession: ['Bloc médian'],
    weights: { wide: 3, aerial: 2, finishing: 1, physical: 1 },
    mentality: 'Positif',
    signatureRoles: { ip: ['GK', 'CB', 'WB', 'AWB', 'FB', 'CM', 'BBM', 'W', 'WM', 'TF', 'CF'], oop: ['GK', 'CB', 'DWB', 'TWM', 'TW', 'CCS'] },
  }),
  style({
    id: 'longball',
    name: 'Jeu direct',
    nameEn: 'Direct play',
    summary: 'Chercher vite l’avant-centre et jouer les seconds ballons.',
    inPossession: ['Passes beaucoup plus directes', 'Longs dégagements', 'Contourner le pressing'],
    outOfPossession: ['Bloc médian', 'Ligne défensive normale'],
    weights: { aerial: 3, physical: 2, defense: 1 },
    mentality: 'Équilibré',
    signatureRoles: { ip: ['GK', 'CB', 'FB', 'DM', 'BBM', 'WM', 'W', 'TF', 'POA'], oop: ['LHK', 'STCB', 'HFB', 'TWM', 'CCS'] },
  }),
  style({
    id: 'ultra-def',
    name: 'Bloc bas',
    nameEn: 'Low block',
    summary: 'Fermer l’axe, défendre bas et frapper sur les rares occasions.',
    inPossession: ['Passes plus directes', 'Contre-attaque en transition'],
    outOfPossession: ['Bloc bas', 'Ligne défensive plus basse', 'Rester en place en transition'],
    weights: { defense: 3, aerial: 2, physical: 1, pace: 1 },
    mentality: 'Défensif',
    signatureRoles: { ip: ['GK', 'CB', 'FB', 'WB', 'DM', 'CM', 'WM', 'TF', 'CF'], oop: ['LHK', 'CCB', 'HFB', 'DWB', 'DROPDM', 'SCRCM', 'TWM', 'TCF'] },
  }),
];

export const DEFAULT_TACTIC_REFERENCE: TacticReference = { roles: ROLES, styles: STYLES };

/** Fusionne un fichier local de repères avec les repères maison : ses rôles et styles remplacent ceux de même code. */
export function mergeReference(local: TacticReference | null | undefined): TacticReference {
  if (!local) return DEFAULT_TACTIC_REFERENCE;
  const roles = new Map(DEFAULT_TACTIC_REFERENCE.roles.map((r) => [r.code, r]));
  for (const r of local.roles) roles.set(r.code, r);
  const styles = new Map(DEFAULT_TACTIC_REFERENCE.styles.map((s) => [s.id, s]));
  for (const s of local.styles) styles.set(s.id, s);
  return { roles: [...roles.values()], styles: [...styles.values()] };
}
