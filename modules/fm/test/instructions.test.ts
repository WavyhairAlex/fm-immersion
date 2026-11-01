import { describe, expect, it } from 'vitest';
import { mergeReference, playerInstructions, roleLocks, TacticEngine, type Slot } from '../src';
import { normalizePlayer } from '../src/player';

const engine = new TacticEngine(mergeReference(undefined));
const style = engine.ref.styles.find((s) => s.id === 'possession')!;
// Gros volume de course : il « devrait » presser plus.
const presser = (positions: string) =>
  normalizePlayer({ id: 1, name: 'Pontus Edh', positions, level: 10, attributes: { WorkRate: 15, Stamina: 15, Aggression: 15, Passing: 10, Decisions: 10, Tackling: 10, Marking: 10, Strength: 10, Bravery: 10 } });
const slot = (pos: Slot['pos'], ip: string, oop: string, positions: string): Slot => ({ pos, x: 50, y: 60, ip, oop, player: presser(positions), fit: null });

describe('consignes individuelles', () => {
  it('lit les verrous de pressing des rôles', () => {
    expect(roleLocks(engine.roles.get('SCRDM')).press).toBe('less');
    // Table du jeu : l'attaquant point d'appui axial n'impose pas de pressing.
    expect(roleLocks(engine.roles.get('COCF')).press).toBeNull();
    expect(roleLocks(engine.roles.get('HFB')).press).toBe('less');
    expect(roleLocks(engine.roles.get('PRSDM')).press).toBe('more');
    expect(roleLocks(engine.roles.get('DM')).press).toBeNull();
    // Relevé en jeu : le défenseur de couverture garde le marquage libre, son pressing est verrouillé sur « Moins souvent ».
    expect(roleLocks(engine.roles.get('CCB'), 'DC').blocked).not.toContain('markTighter');
    expect(roleLocks(engine.roles.get('CCB'), 'DC').press).toBe('less');
    expect(roleLocks(engine.roles.get('STCB'), 'DC').press).toBe('more');
    // Repères locaux aux codes du jeu : le nom anglais suffit.
    expect(roleLocks({ ...engine.roles.get('SCRDM')!, code: 'OPScreeningDefensiveMidfielder' }).press).toBe('less');
  });

  it('ne propose jamais « presser plus » à un rôle de couverture, mais le rôle qui le permet', () => {
    const adv = playerInstructions(engine, slot('MDF', 'DM', 'SCRDM', 'MD (C)'), style);
    expect(adv.list.map((x) => x.id)).not.toContain('pressMore');
    expect(adv.switches).toEqual([{ phase: 'oop', from: 'SCRDM', to: 'PRSDM', unlocks: 'pressMore' }]);
    // Même joueur dans un rôle libre sans ballon : la consigne est proposée.
    const free = playerInstructions(engine, slot('MDF', 'DM', 'DM', 'MD (C)'), style);
    expect(free.list.map((x) => x.id)).toContain('pressMore');
    expect(free.switches).toEqual([]);
  });

  it('juge le pressing sur le rôle sans ballon, pas sur le rôle avec ballon', () => {
    const adv = playerInstructions(engine, slot('MC', 'MFPM', 'SCRCM', 'M (C)'), style);
    expect(adv.list.map((x) => x.id)).not.toContain('pressMore');
    expect(adv.switches[0]?.from).toBe('SCRCM');
  });

  it('suit les verrous relevés dans FM27 : socle du poste, puis consignes imposées par le rôle', () => {
    // Gardien : tirs, liberté et pressing verrouillés par le poste ; risque des passes libre pour le gardien de but.
    const gk = roleLocks(engine.roles.get('GK'), 'GB').blocked;
    expect(gk).toEqual(expect.arrayContaining(['shootMore', 'roam', 'pressMore', 'markTighter', 'slowDown', 'rushOut']));
    expect(gk).not.toContain('riskMore');
    expect(gk).not.toContain('tackleHarder');
    // Gardien à l'aise au pied : risque imposé (« Prenez plus de risques »).
    expect(roleLocks(engine.roles.get('BPGK'), 'GB').blocked).toContain('riskLess');
    // D (C) avec ballon : courses et liberté verrouillées, tirs et largeur libres.
    const cb = roleLocks(engine.roles.get('ADCB'), 'DC').blocked;
    expect(cb).toEqual(expect.arrayContaining(['holdPosition', 'roam', 'holdBall', 'cutInside', 'crossByline']));
    expect(cb).not.toContain('shootMore');
    expect(cb).not.toContain('riskMore');
    // Défenseur central strict : risque, dribbles et stratégie de passes imposés.
    expect(roleLocks(engine.roles.get('NNCB'), 'DC').blocked).toEqual(expect.arrayContaining(['riskMore', 'dribbleMore', 'shortPass']));
    // Sans ballon en D (C) : tout est libre pour le défenseur central.
    const oop = roleLocks(engine.roles.get('CB'), 'DC').blocked;
    expect(oop).not.toContain('pressMore');
    expect(oop).not.toContain('tackleHarder');
    expect(oop).not.toContain('markTighter');
  });

  it("ne propose pas de changer de rôle pour une consigne que le rôle impose déjà", () => {
    const passer = normalizePlayer({ id: 2, name: 'Fabian Falkstrand Ransjö', positions: 'D (C)', level: 10, attributes: { Passing: 15, Vision: 15, Decisions: 15, Tackling: 10, Marking: 10 } });
    const adv = playerInstructions(engine, { pos: 'DC', x: 45, y: 85, ip: 'BPCB', oop: 'CB', player: passer, fit: null }, style);
    expect(adv.list.map((x) => x.id)).not.toContain('riskMore');
    expect(adv.switches.filter((w) => w.unlocks === 'riskMore')).toEqual([]);
  });

  it('lit la table du jeu pour tous les postes, côté compris', () => {
    // MO (D) : « Prenez les espaces » refusée par le poste ; l'attaquant désaxé impose ses courses.
    const wf = roleLocks(engine.roles.get('WF') ?? [...engine.roles.values()].find((r) => r.game?.ip === 'WideForward'), 'MOD', 85, 'ip');
    expect(wf.blocked).toEqual(expect.arrayContaining(['shortPass', 'runBehind']));
    const dlf = [...engine.roles.values()].find((r) => r.game?.ip === 'DeepLyingForward')!;
    expect(roleLocks(dlf, 'BT', 50, 'ip').blocked).toContain('holdBall');
    expect(roleLocks(dlf, 'BT', 50, 'ip').blocked).toContain('cutInside');
    // BT (D) : direction des dribbles libre, mais « Repiquez dans l'axe » refusée par le poste.
    expect(roleLocks(dlf, 'BT', 62, 'ip').blocked).toContain('cutInside');
  });
});

