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

describe('cases de l’écran Consignes d’équipe', () => {
  it('donne les 18 cases avec ballon et les 9 sans ballon du jeu, comme sur la capture de Malženice', async () => {
    const { teamInstructionCards } = await import('../src');
    const s = DEFAULT_TACTIC_REFERENCE.styles.find((x) => x.id === 'possession')!;
    const c = teamInstructionCards([...s.inPossession, ...s.outOfPossession]);
    expect(c.ip).toHaveLength(18);
    expect(c.oop).toHaveLength(9);
    const shown = (cs: typeof c.ip) => cs.map((x) => `${x.def.title} : ${x.value}`);
    expect(shown(c.ip)).toEqual([
      'Caract. direct des passes : Plus courtes', 'Rythme : Plus lent', 'Largeur du jeu offensif : Standard', 'Transition offensive : Standard',
      'Liberté créative : Équilibrée', 'Perdre du temps : Normal', 'Obtenir des coups de pied arrêtés : Garder le ballon en jeu',
      'Patience : Jouer le ballon dans la surface', 'Tirs de loin : Standard', 'Style de centres : Équilibrées', 'Dribbles : Standard',
      'Courses de soutien : Équilibré', 'Progression : Équilibrée', 'Réception des passes : Standard', "Stratégie d'attaques placées : Gérer le pressing",
      'Sorties de but : Courtes', 'Relances GB (vitesse) : Ralentir le rythme', 'Relances GB : Défenseurs centraux',
    ]);
    expect(shown(c.oop)).toEqual([
      'Hauteur du pressing : Pressing haut', 'Ligne défensive : Standard', 'Comportement de la ligne défensive : Équilibré', 'Déclench. pressing : Plus souvent',
      'Transition défensive : Effectuer un contre-pressing', 'En taclant : Standard', 'Relance courte du gardien : Oui', 'Piège du pressing : Équilibrée',
      'Pressing sur centres : Équilibré',
    ]);
    expect(c.ip.filter((x) => x.set)).toHaveLength(7);
  });
});

describe('ancien fichier local de repères', () => {
  it('ne remplace ni la mentalité ni les consignes du jeu, et les styles du jeu absents du code prennent leur préréglage', async () => {
    const { mergeReference, gameMentality } = await import('../src');
    const old = (id: string, mentality: string, ip: string[], oop: string[]) => ({ id, name: id, inPossession: ip, outOfPossession: oop, weights: {}, mentality, signatureRoles: { ip: [], oop: [] } });
    const ref = mergeReference({
      roles: [],
      styles: [
        old('possession', 'Équilibré', ['Passes plus courtes'], ['Pressing haut']),
        old('counter-direct', 'Prudent', ['Plus de passes directes', 'Contre-attaque en transition', 'Relances rapides du GB'], ['Bloc bas', 'Ligne déf. descend plus bas']),
        old('maison', 'Très prudent', ['Plus de passes directes'], []),
      ],
    } as never);
    const by = Object.fromEntries(ref.styles.map((s) => [s.id, s]));
    expect(by.possession!.mentality).toBe('Positive');
    expect(by.possession!.inPossession).toContain('Jouer le ballon dans la surface');
    expect(by['counter-direct']!.mentality).toBe('Prudente');
    for (const s of ref.styles) expect(checkTeamInstructions([...s.inPossession, ...s.outOfPossession]), s.id).toEqual([]);
    expect(by.maison!.mentality).toBe('Défensive');
    expect(gameMentality('Offensif')).toBe('Offensive');
    // Libellés de l'ancien fichier reconnus.
    expect(teamInstructionOf('Ligne déf. descend plus bas')?.def.code).toBe('DefensiveLineBehaviour');
    expect(teamInstructionOf('Relances rapides du GB')?.def.code).toBe('GoalkeeperDistributionSpeed');
  });

  it('les préréglages des styles du jeu sont valides', async () => {
    const { mergeReference } = await import('../src');
    const ids = ['tikitaka', 'tikitaka-v', 'counter-direct', 'catenaccio'];
    const ref = mergeReference({ roles: [], styles: ids.map((id) => ({ id, name: id, inPossession: [], outOfPossession: [], weights: {}, signatureRoles: { ip: [], oop: [] } })) } as never);
    for (const id of ids) {
      const s = ref.styles.find((x) => x.id === id)!;
      expect(checkTeamInstructions([...s.inPossession, ...s.outOfPossession]), id).toEqual([]);
      expect(MENTALITIES_FM27 as readonly string[], id).toContain(s.mentality);
    }
  });
});
