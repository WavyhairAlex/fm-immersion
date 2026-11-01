import { describe, expect, it } from 'vitest';
import { checkTeamInstructions, DEFAULT_TACTIC_REFERENCE, gameInstructionLabel, MENTALITIES_FM27, styleBlock, teamInstructionOf } from '../src';

describe('consignes d’équipe FM27', () => {
  it('chaque style ne propose que des consignes du jeu, une option par consigne, avec la bonne mentalité', () => {
    for (const s of DEFAULT_TACTIC_REFERENCE.styles) {
      expect(checkTeamInstructions([...s.inPossession, ...s.outOfPossession]), s.id).toEqual([]);
      expect(MENTALITIES_FM27 as readonly string[], s.id).toContain(s.mentality);
    }
  });

  it('retrouve une consigne malgré les accents et apostrophes', () => {
    expect(teamInstructionOf('Concentrez le jeu dans l’axe')?.def.code).toBe('ProgressThrough');
    expect(teamInstructionOf('effectuer un contre-pressing')?.def.code).toBe('DefensiveTransition');
    expect(teamInstructionOf('Consigne inventée')).toBeNull();
  });

  it('affiche chaque consigne comme la case du jeu (capture du 01/11, Malženice)', () => {
    // Anciens libellés des repères locaux, signalés « absents de FM27 » à tort.
    expect(gameInstructionLabel('Passes plus courtes')).toBe('Caract. direct des passes : Plus courtes');
    expect(gameInstructionLabel('Gérer le pressing')).toBe("Stratégie d'attaques placées : Gérer le pressing");
    expect(gameInstructionLabel('GB relance vers DC')).toBe('Relances GB : Défenseurs centraux');
    expect(gameInstructionLabel('Déclencher le pressing plus souvent')).toBe('Déclench. pressing : Plus souvent');
    expect(gameInstructionLabel('Empêcher relances courtes du GB')).toBe('Relance courte du gardien : Oui');
    expect(gameInstructionLabel('Contre-pressing en transition')).toBe('Transition défensive : Effectuer un contre-pressing');
    expect(gameInstructionLabel('Pressing haut')).toBe('Hauteur du pressing : Pressing haut');
    expect(gameInstructionLabel('Ligne défensive plus haute')).toBe('Ligne défensive : Plus haute');
    expect(gameInstructionLabel('Rythme plus lent')).toBe('Rythme : Plus lent');
    expect(gameInstructionLabel('Dégagements au pied courts')).toBe('Sorties de but : Courtes');
    // Saisie au format de l'écran.
    expect(teamInstructionOf('Rythme : Plus lent')?.def.code).toBe('Tempo');
    // La relance courte du gardien se règle en pressing haut, le pressing sur centres en bloc bas.
    expect(checkTeamInstructions(['Pressing haut', 'Empêchez les relances courtes du GB'])).toEqual([]);
    expect(checkTeamInstructions(['Bloc bas', 'Empêchez de centrer'])).toEqual([]);
  });

  it('signale deux options d’une même consigne et une consigne liée à un autre bloc', () => {
    const issues = checkTeamInstructions(['Bloc médian', 'Faites plus de passes courtes', 'Jouez beaucoup plus direct', 'Empêchez de centrer', 'Consigne inventée']);
    expect(issues.map((i) => i.kind).sort()).toEqual(['condition', 'sameGroup', 'unknown']);
  });

  it('la ligne d’engagement des styles reste lisible', () => {
    const by = Object.fromEntries(DEFAULT_TACTIC_REFERENCE.styles.map((s) => [s.id, styleBlock(s)]));
    expect(by).toMatchObject({ possession: 'high', gegenpress: 'high', 'counter-fluid': 'mid', 'ultra-def': 'low' });
  });
});
