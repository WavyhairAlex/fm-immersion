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
  it('suit la tactique choisie quand elle est fournie : style, schéma et rôles', async () => {
    const { bestTactic } = await import('../src/project');
    const base = buildProject(engine, squad, { style: 'possession', target: 55 })!;
    const other = engine.ref.styles.find((x) => x.id !== base.style.id)!;
    const template = { style: other, form: '4-4-2', source: 'game' as const, slots: base.slots.map((x) => ({ pos: x.pos, ip: x.ip, oop: x.oop })) };
    const pr = buildProject(engine, squad, { style: 'possession', target: 55, template })!;
    expect(pr.style.id).toBe(other.id);
    expect(pr.form).toBe('4-4-2');
    expect(pr.slots.map((x) => x.ip)).toEqual(base.slots.map((x) => x.ip));
    const pick = bestTactic(engine, squad, { template })!;
    expect(pick.style.id).toBe(other.id);
    expect(pick.plan.slots).toHaveLength(11);
  });

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
    expect(ranked[0]!.best!.verdict).toBe('starter');
    // Sans effectif connu au-delà des titulaires, une cible moins bonne que le titulaire reste une doublure utile.
    expect(ranked[1]!.best!.verdict).toBe('backup');
    // Avec une doublure meilleure qu'elle, elle n'apporte rien.
    const withBackup = rankTargets(engine, targets, pr, [...squad, p(20, 'BT', 15)]);
    expect(withBackup.find((r) => r.target.id === 't2')!.best!.verdict).toBe('none');
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

describe('tactique à jouer maintenant', () => {
  it('prend le meilleur onze applicable, et le projet dès qu’il le vaut', async () => {
    const { bestTactic } = await import('../src/project');
    const { DEFAULT_TACTIC_REFERENCE, TacticEngine, normalizePlayer } = await import('../src');
    const engine = new TacticEngine(DEFAULT_TACTIC_REFERENCE);
    const squad = ['GB', 'D (C)', 'D (C)', 'D (D)', 'D (G)', 'MD', 'M (C)', 'M (C)', 'MO (G)', 'MO (D)', 'BT'].map((pos, i) =>
      normalizePlayer({ id: i + 1, name: `J${i + 1}`, positions: pos, attributes: { Passing: 12, Tackling: 12, Finishing: 12, Reflexes: 12, Handling: 12, Pace: 12, Stamina: 12 } }),
    );
    const best = bestTactic(engine, squad)!;
    expect(best.project).toBe(false);
    const asProject = bestTactic(engine, squad, { style: best.style.id, form: best.form })!;
    expect(asProject.project).toBe(true);
    const other = DEFAULT_TACTIC_REFERENCE.styles.find((s) => s.id !== best.style.id)!;
    const worse = bestTactic(engine, squad, { style: other.id, form: '5-4-1' })!;
    expect(worse.plan.score).toBeGreaterThanOrEqual(engine.formationPlan('5-4-1', other, squad).score);
  });

  it('départage les styles à égalité par l’adéquation de l’effectif au style', async () => {
    const { rankTactics, TACTIC_TIE } = await import('../src/project');
    const { DEFAULT_TACTIC_REFERENCE, TacticEngine, normalizePlayer } = await import('../src');
    const engine = new TacticEngine(DEFAULT_TACTIC_REFERENCE);
    const attrs = { Passing: 16, Technique: 16, FirstTouch: 16, Vision: 15, Decisions: 14, Tackling: 9, Heading: 8, Jumping: 8, Strength: 9, Finishing: 11, Reflexes: 12, Handling: 12, Pace: 12, Stamina: 13, WorkRate: 13 };
    const squad = ['GB', 'D (C)', 'D (C)', 'D (D)', 'D (G)', 'MD', 'M (C)', 'M (C)', 'MO (G)', 'MO (D)', 'BT'].map((pos, i) => normalizePlayer({ id: i + 1, name: `J${i + 1}`, positions: pos, attributes: attrs }));
    const ranked = rankTactics(engine, squad);
    const top = Math.max(...ranked.map((r) => r.fit));
    const tied = ranked.filter((r) => top - r.fit < TACTIC_TIE);
    // Les styles à égalité viennent en tête, rangés par adéquation de l'effectif au style.
    expect(ranked.slice(0, tied.length)).toEqual(tied);
    const order = engine.rankStyles(squad).map((x) => x.style.id).filter((id) => tied.some((t) => t.style.id === id));
    expect(tied.map((t) => t.style.id)).toEqual(order);
  });
});

describe('une base, des ajustements', () => {
  it('garde la tactique jouée dans FM27 tant qu’une autre ne gagne pas une demi-étoile', async () => {
    const { bestTactic, rankTactics, styleOfGameTactic, SWITCH_POINTS } = await import('../src/project');
    const { DEFAULT_TACTIC_REFERENCE, TacticEngine, normalizePlayer } = await import('../src');
    const engine = new TacticEngine(DEFAULT_TACTIC_REFERENCE);
    const squad = ['GB', 'D (C)', 'D (C)', 'D (D)', 'D (G)', 'MD', 'M (C)', 'M (C)', 'MO (G)', 'MO (D)', 'BT'].map((pos, i) =>
      normalizePlayer({ id: i + 1, name: `J${i + 1}`, positions: pos, attributes: { Passing: 12, Tackling: 12, Finishing: 12, Reflexes: 12, Handling: 12, Pace: 12, Stamina: 12 } }),
    );
    const styles = DEFAULT_TACTIC_REFERENCE.styles;
    expect(styleOfGameTactic('4-1-5 MD 2MO Jeu large - Positive - Contrôle de la possession', styles)?.id).toBe('possession');
    expect(styleOfGameTactic('4231 FM27', styles)).toBeNull();
    const ranked = rankTactics(engine, squad);
    const free = bestTactic(engine, squad, {}, ranked)!;
    const other = ranked.find((r) => r.style.id !== free.style.id)!;
    const kept = bestTactic(engine, squad, {}, ranked, other.style)!;
    const freeFit = ranked.find((r) => r.style.id === free.style.id)!.fit;
    if (freeFit - other.fit < SWITCH_POINTS) {
      expect(kept.style.id).toBe(other.style.id);
      expect(kept.kept?.style.id).toBe(free.style.id);
    } else expect(kept.style.id).toBe(free.style.id);
  });
});

describe('complexité tactique', () => {
  it('un style trop complexe pour l’effectif coûte des points, plafonnés, et réduit les consignes individuelles', async () => {
    const { complexityCost, instructionBudget, abilityNeeded, COMPLEXITY_MAX } = await import('../src/project');
    const style = (id: string) => engine.ref.styles.find((s) => s.id === id)!;
    const poss = style('possession');
    const need = abilityNeeded(poss);
    expect(complexityCost(poss, need + 1)).toBe(0);
    expect(complexityCost(poss, need - 2)).toBeCloseTo(0.4);
    expect(complexityCost(poss, 1)).toBe(COMPLEXITY_MAX);
    expect(complexityCost(poss, null)).toBe(0);
    expect(instructionBudget(poss, need)).toBe(3);
    expect(instructionBudget(poss, need - 1)).toBe(2);
    expect(instructionBudget(poss, need - 3)).toBe(1);
  });
});

describe('plan d’évolution', () => {
  it('place les fenêtres de mercato après la date du jeu', async () => {
    const { nextWindows } = await import('../src/evolution');
    expect(nextWindows('2027-02-14', 8, 3)).toEqual([
      { kind: 'summer', date: '2027-08-01' },
      { kind: 'winter', date: '2028-02-01' },
      { kind: 'summer', date: '2028-08-01' },
    ]);
  });

  it('fait partir les fins de contrat non prolongées et fait monter les jeunes', async () => {
    const { evolutionPlan } = await import('../src/evolution');
    const team = [
      ...squad.slice(0, 10),
      // Avant-centre âgé en fin de contrat, doublé par un jeune qui progresse.
      p(11, 'BT', 13, { age: 34, contractEnd: '2027-06-30' }),
      p(12, 'BT', 11, { age: 18, contractEnd: '2030-06-30' }),
    ];
    const plan = evolutionPlan(engine, team, '2027-02-14', { style: 'possession' }, [], null, 3)!;
    expect(plan.stages.map((s) => s.kind)).toEqual(['now', 'summer', 'winter', 'summer']);
    const now = plan.stages[0]!;
    expect(now.tactic.plan.slots.some((s) => s.player?.id === '11')).toBe(true);
    // Titulaire de 34 ans : prolongé d'un an, il part à l'été suivant et le jeune prend sa place.
    expect(plan.extend.map((a) => a.player.id)).toEqual(['11']);
    expect(plan.stages[1]!.left).toEqual([]);
    const later = plan.stages[3]!;
    expect(later.left.map((x) => x.id)).toEqual(['11']);
    expect(later.newStarters.map((c) => [c.player.id, c.replaces?.id])).toEqual([['12', '11']]);
    // Une seule tactique par étape, gardée d'une fenêtre à l'autre sauf gain net.
    for (const s of plan.stages) expect([1, 2, 3]).toContain(s.perPlayer);
  });
});

describe('réserve et jeunes', () => {
  it('comble un poste que l’équipe première ne couvre pas, et une doublure manquante, sans remplacer un titulaire', () => {
    const style = engine.ref.styles.find((s) => s.id === 'possession')!;
    const noDm = squad.filter((x) => x.id !== '6');
    const reserve = [p(20, 'MD (C)', 10, { team: 'Malženice U19' }), p(21, 'BT', 15, { team: 'Malženice II' })];
    const empty = engine.formationPlan('4-3-3', style, noDm);
    expect(empty.holes).toBe(1);
    const plan = engine.formationPlan('4-3-3', style, noDm, reserve);
    expect(plan.holes).toBe(0);
    const dm = plan.slots.find((s) => s.pos === 'MDF')!;
    expect(dm.player?.id).toBe('20');
    // Le buteur de la réserve, pourtant meilleur, ne prend pas la place du titulaire : il est doublure.
    const st = plan.slots.find((s) => s.pos === 'BT')!;
    expect(st.player?.id).toBe('11');
    expect(plan.subs[plan.slots.indexOf(st)]![0]?.id).toBe('21');
  });
});
