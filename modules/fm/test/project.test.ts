import { describe, expect, it } from 'vitest';
import { buildProject, effectiveness, mergeReference, rankTargets, range, roleMatrix, shiftPlayer, shortlist, switchAnalysis, tactAbility, TacticEngine, trainingFor } from '../src';
import { normalizePlayer } from '../src/player';
import type { FmSnapshot } from '../src/snapshot';

const ATTRS = ['Passing', 'FirstTouch', 'Technique', 'Composure', 'Vision', 'Decisions', 'Teamwork', 'WorkRate', 'Stamina', 'Strength', 'Pace', 'Acceleration', 'Tackling', 'Marking', 'Positioning', 'Anticipation', 'Heading', 'JumpingReach', 'Finishing', 'Movement', 'Crossing', 'Dribbling', 'Flair', 'Concentration', 'Agility', 'Aggression', 'Reflexes', 'Handling', 'OneOnOnes', 'AerialReach', 'CommandOfArea', 'Kicking', 'RushingOut'];
const p = (id: number, positions: string, base: number, extra: Record<string, unknown> = {}) =>
  normalizePlayer({ id, name: `J${id}`, positions, age: 26, attributes: Object.fromEntries(ATTRS.map((k) => [k, base])), ...extra });

const engine = new TacticEngine(mergeReference(undefined));
const squad = [
  p(1, 'GB', 12),
  p(2, 'D (D)', 11),
  p(3, 'D (C)', 12),
  p(4, 'D (C)', 12),
  p(5, 'D (G)', 11),
  p(6, 'MD (C)', 12),
  p(7, 'M (C)', 12, { age: 20 }),
  p(8, 'M (C)', 9),
  p(9, 'MO (D)', 12),
  p(10, 'MO (G)', 12),
  p(11, 'BT', 13),
];

describe('projet du coach', () => {
  it('classe chaque poste du onze cible : prêt, à faire progresser ou à recruter', () => {
    const pr = buildProject(engine, squad, { style: 'possession', target: 55 })!;
    expect(pr.form).toBe('4-3-3');
    expect(pr.slots).toHaveLength(11);
    const byStatus = (s: string) => pr.slots.filter((x) => x.status === s).length;
    expect(byStatus('ready') + byStatus('develop') + byStatus('recruit')).toBe(11);
    // Plus le niveau visé est haut, moins il y a de postes prêts.
    const strict = buildProject(engine, squad, { style: 'possession', target: 70 })!;
    expect(strict.slots.filter((x) => x.status === 'ready').length).toBeLessThanOrEqual(byStatus('ready'));
    // Chaque joueur a un rôle visé et ses trois axes de travail.
    const plan = pr.plans.find((x) => x.player.id === '11')!;
    expect(plan.role).not.toBeNull();
    expect(plan.weak).toHaveLength(3);
  });

  it('propose les séances collectives du style', () => {
    const pr = buildProject(engine, squad, { style: 'gegenpress' })!;
    expect(trainingFor(pr.style)[0]).toBe('pressingIntensity');
  });

  it('projette les joueurs et évalue la bascule à plusieurs horizons', () => {
    const young = p(20, 'BT', 10, { age: 18, level: 10 });
    const later = shiftPlayer(young, 2);
    expect(later.level!).toBeGreaterThan(10);
    expect(later.attributes.Finishing!).toBeGreaterThan(10);
    const x = switchAnalysis(engine, squad, { style: 'possession' })!;
    expect(x.timeline).toHaveLength(6);
    expect(x.now.checks.map((c) => c.id)).toEqual(['fit', 'ready', 'ability']);
    expect(['go', 'step', 'no']).toContain(x.now.verdict);
    expect(tactAbility(squad)).toBeCloseTo(11.9, 0);
  });

  it('remplit la matrice postes et rôles', () => {
    const { rows, colBest } = roleMatrix(engine, squad, 'ip');
    const st = rows.find((r) => r.player.id === '11')!;
    const bt = st.cells.find((c) => c?.pos === 'BT')!;
    expect(bt.natural).toBe(true);
    expect(colBest.length).toBe(14);
  });

  it('lit les jauges d’efficacité du jeu', () => {
    const snap = {
      effectiveness: {
        overall: { min: 60, max: 70 },
        understandingAreas: { passingStyle: 40, pressingTrap: 80, buildUpStrategy: { min: 50, max: 54 }, chanceCreation: 30 },
        statusFlags: { noLineupWarning: true, noTacticError: false },
        advice: { playerBuyIn: [{ Text: 'Bonne adhésion', IsPro: true }] },
      },
    } as unknown as FmSnapshot;
    const e = effectiveness(snap)!;
    expect(e.overall?.mid).toBe(65);
    expect(e.weakest).toEqual(['chanceCreation', 'passingStyle', 'buildUpStrategy']);
    expect(e.flags).toEqual(['noLineupWarning']);
    expect(e.advice).toEqual([{ group: 'playerBuyIn', text: 'Bonne adhésion', pro: true }]);
    expect(effectiveness({} as FmSnapshot)).toBeNull();
    expect(range('85 %')?.mid).toBe(85);
  });

  it('classe les cibles par gain sur le onze cible', () => {
    const snap = {
      shortlist: [
        { id: 1, name: 'Bon BT', positions: 'BT', club: 'X', attributes: Object.fromEntries(ATTRS.map((k) => [k, 16])) },
        { id: 2, name: 'Faible BT', positions: 'BT', attributes: Object.fromEntries(ATTRS.map((k) => [k, 8])) },
        { name: 'sans id' },
      ],
    } as unknown as FmSnapshot;
    const targets = shortlist(snap);
    expect(targets.map((t) => t.id)).toEqual(['t1', 't2']);
    const pr = buildProject(engine, squad, { style: 'possession' })!;
    const ranked = rankTargets(engine, targets, pr);
    expect(ranked[0]!.target.name).toBe('Bon BT');
    expect(ranked[0]!.best!.gain).toBeGreaterThan(0);
    expect(ranked[1]!.best!.gain).toBeLessThan(0);
  });
});

describe('titulaires et remplaçants', () => {
  it('reprend le onze et le schéma choisis en Tactique', async () => {
    const { depthFromPlan } = await import('../src');
    const style = engine.ref.styles.find((s) => s.id === 'possession')!;
    const bench = [p(12, 'BT', 14), p(13, 'D (C)', 9, { injury: 'Genou' })];
    const plan = engine.formationPlan('4-3-3', style, squad.concat(bench[0]!));
    const rows = depthFromPlan(plan, squad.concat(bench));
    expect(rows.reduce((n, r) => n + r.count, 0)).toBe(11);
    const xi = plan.slots.map((s) => s.player?.id).filter(Boolean).sort();
    expect(rows.flatMap((r) => r.starters.map((e) => e.player.id)).sort()).toEqual(xi);
    // Aucun titulaire n'apparaît en doublure ; le blessé naturel au poste reste listé.
    expect(rows.flatMap((r) => r.subs.map((e) => e.player.id)).some((id) => xi.includes(id))).toBe(false);
    expect(rows.find((r) => r.pos === 'DC')!.subs.map((e) => e.player.id)).toContain('13');
  });
});
