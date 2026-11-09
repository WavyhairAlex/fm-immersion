import { describe, expect, it } from 'vitest';
import { analyseBuiltTactic, builtFromGame, gameInstructions, mergeReference, TacticEngine, tacticSlots } from '../src';

// Valeurs lues en jeu le 09/11/2026 (tactique « CTA » d'un joueur, plugin 0.5.6 + chemins.json).
const TACTIQUE = {
  ce_1_PassingDirectness: 1146434657, // Plus courtes
  ce_2_PassingVerticality: null,
  ce_4_TeamWidth: 1244744824, // Plus large
  ce_8_LineOfEngagement: 2033537859, // Pressing haut
  ce_9_DefensiveLine: 807423041, // Plus basse
  ce_10_PressingTrigger: 2000905329, // Plus souvent
  ce_11_DefensiveTransition: 928473934, // Contre-pressing
  ce_15_DefensiveLineBehaviour: 1466132292, // Reculer
  ce_18_Patience: 1196903216, // Jouer le ballon dans la surface
  ce_21_Tempo: 1311996258, // Plus lent
  ce_27_ShotsFromDistance: 2021157752, // Dissuader de frapper de loin
  ce_30_ProgressThrough: 1849981002, // Les deux flancs
  // Latéral droit : moins de dribbles et tacles plus durs choisis ; gardien : risque imposé par le rôle.
  ci_0_8: 3,
  ciModif_0_8: 'False',
  ci_1_2: 14,
  ciModif_1_2: 'True',
  ci_1_13: 31,
  ciModif_1_13: 'True',
  ci_1_14: 34,
  ciModif_1_14: 'True',
  ci_1_0: 0,
  ciModif_1_0: 'False',
  ci_10_15: 39,
  ciModif_10_15: 'True',
};

describe('consignes de la tactique jouée', () => {
  it('décode consignes d\'équipe et individuelles', () => {
    const g = gameInstructions({ custom: { tactique: TACTIQUE } })!;
    expect(g.ti).toMatchObject({ 1: 1, 4: 3, 8: 2, 9: 1, 10: 3, 11: 2, 15: 2, 18: 2, 21: 1, 27: 0, 30: 4 });
    expect(g.ti[2]).toBeUndefined();
    expect(g.pi[1]).toEqual(['DribblingFrequency:Dribblez moins', 'Tackling:Taclez plus durement', 'MarkingTarget:Marquage individuel']);
    expect(g.pi[0]).toEqual([]);
    expect(g.imposed[0]).toEqual(['PassingRisk:Prenez plus de risques']);
    expect(g.pi[10]).toEqual(['AttackBoxSide:Premier poteau']);
  });

  it('rien sans les clés du plugin', () => {
    expect(gameInstructions({ custom: { tactique: { nomTactique: 'CTA' } } })).toBeNull();
    expect(gameInstructions({})).toBeNull();
  });

  it('postes en masque de bits et bloc étiré signalé', () => {
    const R = 2 ** 20;
    const L = 2 ** 21;
    const row = (pos: number, ip: number, oop: number) => ({ IPPosition: pos, IPRole: ip, OOPPosition: pos, OOPRole: oop });
    // Onze réel du 24/10/2027 (4-1-4-1 avec deux MO) ; postes sans ballon simplifiés.
    const rows = [row(1, 4096, 2), row(4, 4, 512), row(16 + L, 2, 8), row(16 + R, 16777216, 8), row(8, 4, 1024), row(128, 32768, 32768),
      row(8192 + L, 131072, 1048576), row(8192 + R, 512, 1048576), row(2048, 128, 2 ** 38), row(4096, 2 ** 49, 2 ** 39), row(16384, 1024, 2 ** 42)];
    const slots = tacticSlots({ positionsCombined: rows })!;
    expect(slots.map((s) => s.pos)).toEqual(['GB', 'DD', 'DC', 'DC', 'DG', 'MDF', 'MOC', 'MOC', 'MOD', 'MOG', 'BT']);
    expect(slots[5]!.roleIP).toBe('DeepLyingPlaymaker');
    const engine = new TacticEngine(mergeReference(undefined));
    const built = builtFromGame(engine, slots, 'id', 'CTA', gameInstructions({ custom: { tactique: TACTIQUE } }), 'Équilibrée')!;
    expect(built.ti[8]).toBe(2);
    expect(built.slots[1]!.pi).toHaveLength(3);
    expect(analyseBuiltTactic(engine, built).findings.map((f) => f.id)).toContain('stretchedBlock');
  });
});
