import { describe, expect, it } from 'vitest';
import {
  builtPlan,
  matchFindings,
  matchReview,
  matchTrend,
  mergeReference,
  newBuiltTactic,
  playerInstructions,
  statInstructions,
  tacticForms,
  tacticVerdict,
  TacticEngine,
  teamAdvice,
  type GameInstructions,
  type ReviewedMatch,
} from '../src';
import { normalizePlayer } from '../src/player';

const m = (o: Partial<ReviewedMatch>): ReviewedMatch => ({ date: '2028-02-01', opponent: 'X', home: true, outcome: 'W', goalsFor: 1, goalsAgainst: 0, xg: [1.5, 0.8], shots: [12, 8], possession: 52, press: [10, 40], tactic: 'CTA', ...o });
const series = (n: number, o: Partial<ReviewedMatch>) => Array.from({ length: n }, (_, i) => m({ date: `2028-02-${String(i + 1).padStart(2, '0')}`, ...o }));
const ids = (ms: ReviewedMatch[]) => matchFindings(matchTrend(ms)).map((f) => f.id);

describe('tendance des derniers matchs', () => {
  it('ne conclut rien en dessous de trois matchs', () => {
    expect(matchTrend(series(2, {}))).toBeNull();
    expect(matchFindings(null)).toEqual([]);
    expect(matchReview([]).verdict).toBe('early');
  });

  it('fait les moyennes par match, xG seulement sur les matchs chiffrés', () => {
    const t = matchTrend([...series(3, {}), m({ xg: null, shots: null, possession: null, outcome: 'L', goalsFor: 0, goalsAgainst: 3 })])!;
    expect(t).toMatchObject({ matches: 4, wins: 3, losses: 1, xgMatches: 3, xgGoalsFor: 3, xgGoalsAgainst: 0, possession: 52, pressSuccess: 25 });
    expect(t.xgFor).toBeCloseTo(1.5);
    expect(t.goalsAgainst).toBeCloseTo(0.75);
    expect(t.xgPerShot).toBeCloseTo(0.125);
  });

  it('reconnaît une équipe qui domine, et une équipe dominée', () => {
    expect(ids(series(4, {}))).toContain('dominant');
    expect(ids(series(4, { xg: [0.9, 1.6], possession: 45 }))).toEqual(expect.arrayContaining(['outplayed', 'fewChances', 'leaky']));
  });

  it('sépare la finition de la tactique', () => {
    // 6 xG, 2 buts : les occasions sont là.
    const f = matchFindings(matchTrend(series(4, { goalsFor: 0, outcome: 'D' }).map((x, i) => (i < 2 ? { ...x, goalsFor: 1 } : x))));
    expect(f.find((x) => x.id === 'wasteful')?.vals).toEqual({ goals: 2, xg: 6 });
    expect(ids(series(4, { goalsFor: 1 }))).not.toContain('wasteful');
    // 3,2 xG concédés, 7 buts encaissés : le gardien ou la malchance.
    expect(ids(series(4, { goalsAgainst: 2 }).map((x, i) => (i ? x : { ...x, goalsAgainst: 1 })))).toContain('unluckyDefence');
  });

  it('voit la possession stérile, les tirs de loin et le pressing dans le vide', () => {
    expect(ids(series(3, { possession: 64, xg: [0.8, 0.5] }))).toContain('sterile');
    expect(ids(series(3, { possession: 48, xg: [0.8, 0.5] }))).toContain('fewChances');
    expect(ids(series(3, { shots: [18, 8], xg: [1.2, 0.8] }))).toContain('longShots');
    expect(ids(series(3, { press: [6, 40] }))).toContain('pressFails');
    expect(ids(series(3, { press: [12, 40] }))).not.toContain('pressFails');
    expect(ids(series(3, { shots: [12, 6], xg: [1.5, 1.2] }))).toContain('bigChancesAgainst');
  });
});

describe('bilan par tactique', () => {
  const ms = [...series(4, {}), m({ date: '2027-10-01', tactic: 'Autre', outcome: 'L', goalsFor: 0, goalsAgainst: 1 })];

  it('compte points et écart de xG par tactique, la plus récente d’abord', () => {
    const f = tacticForms(ms);
    expect(f.map((x) => x.tactic)).toEqual(['CTA', 'Autre']);
    expect(f[0]).toMatchObject({ matches: 4, wins: 4, ppm: 3, goalsFor: 4, xgDiff: 0.7 });
    expect(f[1]!.xgDiff).toBeNull();
  });

  it('garde une tactique qui crée plus qu’elle ne concède, doute d’une tactique dominée', () => {
    const [cta, other] = tacticForms(ms);
    expect(tacticVerdict(cta)).toBe('keep');
    expect(tacticVerdict(other)).toBe('early');
    expect(tacticVerdict(tacticForms(series(4, { xg: [0.8, 1.5], outcome: 'L', goalsFor: 0, goalsAgainst: 1 }))[0])).toBe('doubt');
    // Bons résultats mais dominé aux occasions : on ne tranche pas.
    expect(tacticVerdict(tacticForms(series(4, { xg: [0.8, 1.5] }))[0])).toBe('open');
  });
});

describe('corrections tirées des matchs', () => {
  const engine = new TacticEngine(mergeReference(undefined));
  const style = engine.ref.styles.find((s) => s.id === 'possession')!;
  const XI = ['GB', 'D (G)', 'D (C)', 'D (C)', 'D (D)', 'MD (C)', 'M (C)', 'M (C)', 'MO (G)', 'BT', 'MO (D)'];
  const keys = ['Pace', 'Acceleration', 'Passing', 'Tackling', 'Finishing', 'WorkRate', 'Stamina', 'Teamwork', 'Heading', 'JumpingReach', 'LongShots', 'Aggression', 'Bravery', 'Decisions'];
  const players = XI.map((p, i) => normalizePlayer({ id: i + 1, name: `J${i}`, positions: p, level: 12, attributes: Object.fromEntries(keys.map((k) => [k, 12])) }));
  const plan = builtPlan(engine, newBuiltTactic(engine, '4-3-3', 'a'), players);
  const game = (ti: Record<number, number>) => ({ ti, pi: {}, imposed: {} }) as unknown as GameInstructions;
  const row = (a: ReturnType<typeof teamAdvice>, code: string) => a.rows.find((r) => r.def.code === code);

  it('règle les consignes d’équipe sur ce que les matchs ont montré', () => {
    const findings = matchFindings(matchTrend(series(4, { press: [6, 40], xg: [0.8, 1.6], possession: 63, shots: [18, 12] })));
    const a = teamAdvice(plan, style, game({ 8: 2, 9: 3, 10: 3, 21: 1 }), 'game', findings);
    expect(row(a, 'PressingTrigger')).toMatchObject({ option: 2, reason: 'pressFails' });
    expect(row(a, 'DefensiveLine')).toMatchObject({ option: 2, reason: 'leakyLine' });
    expect(row(a, 'Tempo')).toMatchObject({ option: 2, reason: 'sterile' });
    expect(row(a, 'ShotsFromDistance')).toMatchObject({ option: 0, reason: 'longShots' });
    // Sans ces constats, les mêmes consignes sont gardées.
    expect(teamAdvice(plan, style, game({ 8: 2, 9: 3, 10: 3, 21: 1 }), 'game').rows.every((r) => !r.reason)).toBe(true);
  });

  it('ligne déjà standard : c’est le pressing haut qui recule', () => {
    const findings = matchFindings(matchTrend(series(4, { xg: [1.5, 1.6] })));
    expect(row(teamAdvice(plan, style, game({ 8: 2 }), 'game', findings), 'LineOfEngagement')).toMatchObject({ option: 1, reason: 'leakyBlock' });
  });

  it('tire des consignes individuelles des stats de la saison', () => {
    expect(statInstructions({ minutes: 100, shots90: 3, npxg90: 0.05 })).toEqual([]);
    expect(statInstructions({ minutes: 900, shots90: 2.4, npxg90: 0.1 }).map((x) => x.id)).toEqual(['shootLess']);
    expect(statInstructions({ minutes: 900, shots90: 2.4, npxg90: 0.4 })).toEqual([]);
    expect(statInstructions({ minutes: 1890, yellow: 7, passPct: 70 }).map((x) => x.id)).toEqual(['riskLess', 'tackleLess']);
    expect(statInstructions({ minutes: 1890, yellow: 2 })).toEqual([]);
    // Gros frappeur sur le papier, mais ses tirs ne donnent rien : la stat l'emporte sur l'attribut.
    const shooter = normalizePlayer({ id: 50, name: 'Frappeur', positions: 'M (C)', level: 12, attributes: { ...Object.fromEntries(keys.map((k) => [k, 12])), LongShots: 17 } });
    const sl = { ...plan.slots[6]!, player: shooter };
    expect(playerInstructions(engine, sl, style, plan.slots, 3).list.map((x) => x.id)).toContain('shootMore');
    const withStats = playerInstructions(engine, sl, style, plan.slots, 3, { minutes: 900, shots90: 2.4, npxg90: 0.1 }).list;
    expect(withStats.map((x) => x.id)).not.toContain('shootMore');
    expect(withStats[0]).toMatchObject({ id: 'shootLess', why: 'statShootLess' });
  });
});
