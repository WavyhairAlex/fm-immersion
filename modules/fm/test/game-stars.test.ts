import { describe, expect, it } from 'vitest';
import { carryRoleStars, DEFAULT_TACTIC_REFERENCE, roleKey, roleStarsIn, starsFromValue, TacticEngine, withExtended, type FmSnapshot } from '../src';
import { normalizePlayer } from '../src/player';

// Extrait réel de la lecture du 01/11 (D (C) avec ballon, Falkstrand Ransjö et Ilio).
const entry = (name: string, v: number) => ({ CurrentAbilityStars: { MaxValue: v, MinValue: v, IsScoutsOpinion: 'False' }, ShortName: 'X', TacticsRoleID: 1, TacticsRoleName: name });
const dc = (fr: number, il: number) => ({
  '0': { id: 10, etoiles_DC_ip: JSON.stringify([entry('Défenseur central à l\'aise au pied', fr), entry('Défenseur central avancé', 13)]) },
  '1': { id: 11, etoiles_DC_ip: [entry('Défenseur central à l\'aise au pied', il)] },
});
const base = (gameDate: string, custom: unknown) =>
  ({ schema: 'archivix/1', game: 'FM27', club: 'V', gameDate, players: [{ id: 10, name: 'Falkstrand Ransjö', positions: 'D (C)', attributes: { Passing: 9 } }, { id: 11, name: 'Ilio', positions: 'D (C)', attributes: { Passing: 9 } }], custom }) as unknown as FmSnapshot;

describe('étoiles lues dans le jeu', () => {
  it('conversion en étoiles du jeu', () => {
    expect([12, 13, 15, 19, 20].map(starsFromValue)).toEqual([1, 1.5, 2.5, 4.5, 5]);
  });

  it('lit les tables etoiles_<poste>_<phase> et les garde d’un instantané à l’autre', () => {
    const s1 = base('2026-09-20', { joueurs: dc(19, 12) });
    expect(roleStarsIn(s1)['10']?.DC?.ip?.["defenseur central a l'aise au pied"]?.v).toBe(19);
    // Instantané suivant sans lecture D (C) : la table précédente est conservée, puis remplacée par une nouvelle lecture.
    const s2 = carryRoleStars(base('2026-09-21', { joueurs: {} }), s1);
    expect((s2 as unknown as { roleStars: Record<string, unknown> }).roleStars['10']).toBeDefined();
    const s3 = carryRoleStars(base('2026-09-22', { joueurs: dc(18, 12) }), s2);
    expect(roleStarsIn(s3)['10']?.DC?.ip?.["defenseur central a l'aise au pied"]?.v).toBe(18);
  });

  it('la valeur lue prime sur la formule dans le moteur tactique', () => {
    const snap = carryRoleStars(base('2026-09-22', { joueurs: {} }), base('2026-09-20', { joueurs: dc(19, 12) }));
    const [fr, il] = withExtended(snap).players.map(normalizePlayer);
    const engine = new TacticEngine(DEFAULT_TACTIC_REFERENCE);
    expect(engine.roleFit(fr!, 'BPCB', 'ip', 'DC')).toBe(19);
    expect(engine.roleFit(il!, 'BPCB', 'ip', 'DC')).toBe(12);
    // Autre poste ou phase non lus : retour à la formule.
    expect(engine.roleFit(fr!, 'BPCB', 'ip', 'DD')).not.toBe(19);
  });

  it('ignore les caractères invisibles des libellés du jeu', () => {
    expect(roleKey('Défenseur central\u200b stoppeur')).toBe(roleKey('Défenseur central stoppeur'));
  });

  it('ramène les notes calculées à l’échelle des étoiles lues', () => {
    const attrs = (v: number) => Object.fromEntries(['Marking', 'Tackling', 'Heading', 'Positioning', 'Strength', 'JumpingReach', 'Concentration', 'Passing', 'Composure', 'FirstTouch', 'Vision', 'Technique', 'Decisions', 'Pace', 'Acceleration', 'Anticipation', 'Bravery', 'Aggression', 'Dribbling', 'Stamina', 'WorkRate'].map((k) => [k, v]));
    // Trois défenseurs lus dans le jeu (valeur ≈ 2 × moyenne + 0), un quatrième non lu.
    const mk = (id: number, v: number, read: number | null) =>
      normalizePlayer({ id, name: `J${id}`, positions: 'D (C)', attributes: attrs(v), ...(read == null ? {} : { gameStars: { DC: { ip: { 'defenseur central': read, "defenseur central a l'aise au pied": read - 1 }, oop: { 'defenseur central': read } } } }) });
    const list = [mk(1, 8, 16), mk(2, 9, 18), mk(3, 10, 20), mk(4, 9, null)];
    const engine = new TacticEngine(DEFAULT_TACTIC_REFERENCE);
    const raw = engine.roleFit(list[3]!, 'CB', 'ip', 'DC')!;
    engine.calibrate(list);
    expect(engine.cal).not.toBeNull();
    // Le joueur non lu, de niveau égal au n°2, arrive près de la valeur lue du n°2 (18), pas à sa note brute.
    const cal = engine.roleFit(list[3]!, 'CB', 'ip', 'DC')!;
    expect(Math.abs(cal - 18)).toBeLessThan(Math.abs(raw - 18));
    expect(cal).toBeGreaterThan(16);
    // Les valeurs lues restent telles quelles.
    expect(engine.roleFit(list[0]!, 'CB', 'ip', 'DC')).toBe(16);
  });
});
