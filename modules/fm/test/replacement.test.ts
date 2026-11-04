import { describe, expect, it } from 'vitest';
import { buildProject, divisionLevels, mergeReference, replacementFor, replacementPositions, TacticEngine, type DbPlayer } from '../src';
import { normalizePlayer } from '../src/player';

const ATTRS = ['Passing', 'FirstTouch', 'Technique', 'Composure', 'Vision', 'Decisions', 'Teamwork', 'WorkRate', 'Stamina', 'Strength', 'Pace', 'Acceleration', 'Tackling', 'Marking', 'Positioning', 'Anticipation', 'Heading', 'JumpingReach', 'Finishing', 'OffTheBall', 'Crossing', 'Dribbling', 'Flair', 'Concentration', 'Agility', 'Aggression', 'Reflexes', 'Handling', 'OneOnOnes', 'AerialReach', 'CommandOfArea', 'Kicking', 'RushingOut', 'Communication', 'Bravery', 'Balance', 'LongShots'];
const attrs = (base: number) => Object.fromEntries(ATTRS.map((k) => [k, base]));
const p = (id: number, positions: string, base: number) => normalizePlayer({ id, name: `J${id}`, positions, age: 26, attributes: attrs(base) });

const engine = new TacticEngine(mergeReference(undefined));
const squad = [
  p(1, 'GB', 12),
  p(2, 'D (D)', 11),
  p(3, 'D (C)', 12),
  p(4, 'D (C)', 12),
  p(5, 'D (G)', 11),
  p(6, 'MD (C)', 12),
  p(7, 'M (C)', 12),
  p(8, 'M (C)', 11),
  p(9, 'MO (D)', 12),
  p(10, 'MO (G)', 12),
  p(11, 'BT', 13),
  p(12, 'BT', 10),
];
const pr = buildProject(engine, squad, { style: 'possession' })!;

describe('remplaçant d’un partant', () => {
  it('classe les candidats au poste du partant, avec l’écart de note', () => {
    const bt = squad.find((x) => x.id === '11')!;
    expect(replacementPositions(engine, pr, bt)).toEqual(['BT']);
    const r = replacementFor(engine, pr, bt, [p(20, 'BT', 15), p(21, 'BT', 9), p(22, 'D (C)', 16)], squad);
    expect(r.starter).toBe(true);
    expect(r.slot!.pos).toBe('BT');
    expect(r.candidates.map((c) => c.player.id)).toEqual(['20', '21']);
    expect(r.candidates[0]!.delta).toBeGreaterThan(0);
    expect(r.candidates[1]!.delta).toBeLessThan(0);
    // En interne : l'autre attaquant, moins bon.
    expect(r.internal!.player.id).toBe('12');
    expect(r.internal!.delta).toBeLessThan(0);
  });

  it('sans poste dans le schéma, aucun candidat', () => {
    const r = replacementFor(engine, pr, p(30, 'GB', 10), [p(20, 'BT', 15)]);
    expect(r.slot?.pos).toBe('GB');
    expect(r.candidates).toEqual([]);
  });
});

const db = (id: number, clubId: number, base: number, positionsText: string, ca: number, division = 'Niké liga'): DbPlayer => ({
  id,
  name: `D${id}`,
  age: 25,
  birthDate: null,
  club: `Club ${clubId}`,
  clubShort: null,
  clubId,
  loanClub: null,
  loanEnd: null,
  division,
  divisionReputation: 90,
  ca,
  pa: ca,
  positionsText,
  positionRatings: {},
  attributes: attrs(base),
  wageWeekly: null,
  contractEnd: null,
  valueRaw: null,
});
const team = (clubId: number, base: number, ca: number) =>
  ['GB', 'DD', 'DC', 'DC', 'DG', 'MDF', 'MC', 'MC', 'MOD', 'MOG', 'BT', 'BT'].map((pos, i) => db(clubId * 100 + i, clubId, base, pos, ca));

describe('niveau de la division', () => {
  it('classe les onze des clubs et situe le nôtre', () => {
    const players = [...team(1, 14, 120), ...team(2, 12, 100), ...team(3, 10, 80), db(999, 4, 15, 'BT', 150)];
    const [d] = divisionLevels(engine, pr.slots, players, 2);
    expect(d!.division).toBe('Niké liga');
    // Le club 4 (un seul joueur) est ignoré.
    expect(d!.clubs.map((c) => c.clubId)).toEqual([1, 2, 3]);
    expect(d!.ownRank).toBe(2);
    expect(d!.top3!).toBeCloseTo(d!.clubs.reduce((n, c) => n + c.xiFit!, 0) / 3, 5);
    expect(d!.median).toBe(d!.clubs[1]!.xiFit);
    expect(d!.clubs[0]!.xiCa).toBe(120);
    expect(d!.medianCa).toBe(100);
  });
});
