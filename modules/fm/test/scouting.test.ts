import { describe, expect, it } from 'vitest';
import {
  addBaseTarget,
  caGrowth,
  marketMap,
  measuredGrowth,
  profileEdge,
  refreshBaseTarget,
  sellTiming,
  trackOf,
  watchAlerts,
  type DbPlayer,
  type FmPlayer,
  type SquadAt,
} from '../src';

const pl = (o: Partial<FmPlayer>): FmPlayer => ({ id: '1', name: 'J', age: 20, ca: 100, pa: 150, value: 100_000, positions: [], attributes: {}, ...o }) as FmPlayer;
const at = (gameDate: string, players: FmPlayer[]): SquadAt => ({ gameDate, players });

const db = (o: Partial<DbPlayer>): DbPlayer => ({
  id: 7,
  name: 'Suivi',
  age: 20,
  birthDate: null,
  club: 'Club',
  clubShort: null,
  clubId: 500,
  loanClub: null,
  loanEnd: null,
  ca: 100,
  pa: 150,
  positionsText: 'MC',
  positionRatings: {},
  attributes: {},
  wageWeekly: 500,
  contractEnd: '2031-06-30',
  valueRaw: 500_000,
  division: 'Ligue',
  ...o,
});

describe('progression mesurée', () => {
  it('reste sur les repères sans mesure', () => {
    const g = measuredGrowth([]);
    expect(g.samples).toBe(0);
    expect(g.growth(18)).toBe(caGrowth(19));
  });

  it('mêle mesures et repères, sans les joueurs au plafond', () => {
    const h = [
      at('2027-07-01', [pl({ id: 'a', age: 18, ca: 100 }), pl({ id: 'b', age: 18, ca: 100 }), pl({ id: 'c', age: 18, ca: 120, pa: 121 }), pl({ id: 'd', age: 18, ca: 100 })]),
      at('2028-07-01', [pl({ id: 'a', age: 19, ca: 120 }), pl({ id: 'b', age: 19, ca: 120 }), pl({ id: 'c', age: 19, ca: 120 }), pl({ id: 'd', age: 19, ca: 120 })]),
    ];
    const g = measuredGrowth(h);
    const b = g.buckets.find((x) => x.ages[0] === 18)!;
    expect(b.n).toBe(3);
    expect(b.measured).toBeCloseTo(20, 0);
    expect(b.used).toBeGreaterThan(b.base);
    expect(b.used).toBeLessThan(20);
  });
});

describe('quand vendre', () => {
  const squad = Array.from({ length: 24 }, (_, i) => pl({ id: `s${i}`, age: 20 + (i % 10), ca: 90 + (i % 6) * 8, pa: 95 + (i % 6) * 8, value: 100_000 * 2 ** ((i % 6) * 8 / 15) * 0.85 ** (i % 10) }));
  it("vend le trentenaire, garde le jeune qui monte", () => {
    const old = pl({ id: 'old', age: 30, ca: 130, pa: 130, value: 2_000_000 });
    const young = pl({ id: 'young', age: 18, ca: 100, pa: 160, value: 300_000 });
    const r = sellTiming([...squad, old, young]);
    expect(r.find((x) => x.player.id === 'old')!.call).toBe('sellNow');
    const y = r.find((x) => x.player.id === 'young')!;
    expect(y.call).toBe('hold');
    expect(y.peakYear).toBeGreaterThan(0);
  });
});

describe('suivi des joueurs repérés', () => {
  it('garde un suivi par date et signale prix, contrat et progression', () => {
    let r = addBaseTarget([], db({}), '2027-08-01');
    expect(trackOf(r)).toHaveLength(1);
    r = { ...r, dismissed: false };
    r = refreshBaseTarget(r, db({ ca: 112, valueRaw: 350_000, contractEnd: '2028-06-30', transferListed: true }), '2028-01-01');
    r = refreshBaseTarget(r, db({ ca: 112, valueRaw: 350_000, contractEnd: '2028-06-30', transferListed: true }), '2028-01-01');
    expect(trackOf(r)).toHaveLength(2);
    const [a] = watchAlerts([r], '2028-01-01');
    expect(a!.signals).toEqual(expect.arrayContaining(['priceDrop', 'preContract', 'listed', 'ahead']));
    expect(a!.caChange).toBe(12);
  });

  it("n'est pas remis en liste s'il a été écarté", () => {
    const r = { ...addBaseTarget([], db({}), '2027-08-01'), dismissed: true, inList: false };
    const n = refreshBaseTarget(r, db({}), '2027-09-01');
    expect(n.dismissed).toBe(true);
    expect(watchAlerts([n], '2027-09-01')).toHaveLength(0);
  });
});

describe('profils et marchés', () => {
  it('repère la note au-dessus de ce que le CA laisse attendre', () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, ca: 80 + i * 5, fit: 8 + i * 0.5 }));
    rows.push({ id: 'gem', ca: 100, fit: 14 });
    const e = profileEdge(rows);
    expect(e.get('gem')!).toBeGreaterThan(3);
    expect(Math.abs(e.get('p4')!)).toBeLessThan(1);
    expect(profileEdge(rows.slice(0, 5)).size).toBe(0);
  });

  it('classe les championnats du moins cher au plus cher', () => {
    const model = { value: () => 100_000, n: 0 };
    const ps = [
      ...Array.from({ length: 5 }, (_, i) => db({ id: i, division: 'Chère', valueRaw: 150_000 })),
      ...Array.from({ length: 5 }, (_, i) => db({ id: 10 + i, division: 'Bradée', valueRaw: 60_000 })),
      ...Array.from({ length: 2 }, (_, i) => db({ id: 20 + i, division: 'Rare', valueRaw: 10_000 })),
    ];
    const m = marketMap(ps, model);
    expect(m.map((x) => x.division)).toEqual(['Bradée', 'Chère']);
    expect(m[0]!.priceIndex).toBeCloseTo(0.6);
  });
});
