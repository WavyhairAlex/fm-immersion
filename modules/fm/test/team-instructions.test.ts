import { describe, expect, it } from 'vitest';
import { checkTeamInstructions, DEFAULT_TACTIC_REFERENCE, MENTALITIES_FM27, styleBlock, teamInstructionOf } from '../src';

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
    expect(teamInstructionOf('Passes plus courtes')).toBeNull();
  });

  it('signale deux options d’une même consigne et une consigne liée à un autre bloc', () => {
    const issues = checkTeamInstructions(['Bloc médian', 'Faites plus de passes courtes', 'Jouez beaucoup plus direct', 'Empêchez de centrer', 'Contre-pressing en transition']);
    expect(issues.map((i) => i.kind).sort()).toEqual(['condition', 'sameGroup', 'unknown']);
  });

  it('la ligne d’engagement des styles reste lisible', () => {
    const by = Object.fromEntries(DEFAULT_TACTIC_REFERENCE.styles.map((s) => [s.id, styleBlock(s)]));
    expect(by).toMatchObject({ possession: 'high', gegenpress: 'high', 'counter-fluid': 'mid', 'ultra-def': 'low' });
  });
});
