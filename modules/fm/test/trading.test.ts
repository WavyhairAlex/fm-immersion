import { describe, expect, it } from 'vitest';
import { caGrowth, contractFactor, paValue, projectCa, tradeIdeas, valueModel, type ClubReach, type DbPlayer } from '../src';

const GAME_DATE = '2028-02-21';
const club: ClubReach = { topWage: 2000, reputation: 2000, divisionReputation: 100, transferBudget: 2_000_000, wageRoom: 5_000 };

let next = 1;
const db = (o: Partial<DbPlayer>): DbPlayer => ({
  id: next++,
  name: 'Joueur',
  age: 24,
  birthDate: null,
  club: 'Club',
  clubShort: null,
  clubId: 500,
  loanClub: null,
  loanEnd: null,
  divisionReputation: 100,
  ca: 110,
  pa: 120,
  positionsText: 'MC',
  positionRatings: {},
  attributes: {},
  wageWeekly: 500,
  contractEnd: '2030-06-30',
  valueRaw: 300_000,
  reputation: [1500, 1500, 1200],
  ...o,
});

// Un marché cohérent : la valeur double tous les 15 points de CA et baisse avec l'âge.
const market = (ca: number, age: number) => 200_000 * 2 ** ((ca - 100) / 15) * 0.95 ** (age - 24);
const crowd = Array.from({ length: 40 }, (_, i) => {
  const ca = 80 + (i % 10) * 6;
  const age = 19 + (i % 8);
  return db({ ca, pa: ca, age, valueRaw: market(ca, age) });
});

describe('trading', () => {
  it('fait progresser plus vite les jeunes, sans dépasser le PA', () => {
    expect(caGrowth(17)).toBeGreaterThan(caGrowth(22));
    expect(caGrowth(28)).toBe(0);
    expect(projectCa(100, 150, 18, 2)).toBe(122);
    expect(projectCa(100, 110, 18, 3)).toBe(110);
    expect(projectCa(100, 150, 18, 1, 0.5)).toBe(105.5);
  });

  it('lit les fourchettes de PA', () => {
    expect(paValue(160, 100)).toBe(160);
    expect(paValue(-9, 100)).toBe(165);
    expect(paValue(-3, 100)).toBe(100);
  });

  it('ajuste la valeur sur le marché trouvé', () => {
    const m = valueModel(crowd);
    expect(m.n).toBe(40);
    expect(m.value(115, 24) / market(115, 24)).toBeCloseTo(1, 2);
    expect(valueModel(crowd.slice(0, 5)).n).toBe(0);
  });

  it('renchérit un long contrat et brade une fin proche', () => {
    expect(contractFactor(40)).toBeGreaterThan(contractFactor(8));
    expect(contractFactor(null)).toBe(1);
  });

  it('classe une pépite sous-cotée en tête et écarte ce qui ne rapporte pas', () => {
    const nugget = db({ name: 'Pépite', age: 18, ca: 95, pa: 150, valueRaw: market(95, 18) * 0.5, wageWeekly: 200 });
    const done = db({ name: 'Plafonné', age: 29, ca: 130, pa: 131, valueRaw: market(130, 29) });
    const old = db({ name: 'Vétéran', age: 31, ca: 120, pa: 140, valueRaw: market(120, 31), wageWeekly: 1500 });
    const ideas = tradeIdeas([...crowd, nugget, done, old], club, GAME_DATE);
    expect(ideas[0]!.player.name).toBe('Pépite');
    expect(ideas[0]!.kinds).toContain('nugget');
    expect(ideas[0]!.kinds).toContain('undervalued');
    expect(ideas[0]!.profit).toBeGreaterThan(0);
    expect(ideas.some((x) => x.player.name === 'Plafonné')).toBe(false);
    expect(ideas.some((x) => x.player.name === 'Vétéran')).toBe(false);
  });

  it('un libre ne coûte rien, un prêté se paie', () => {
    const free = db({ name: 'Libre', age: 20, ca: 100, pa: 140, club: null, clubId: null, contractEnd: null });
    const loan = db({ name: 'Prêtable', age: 20, ca: 100, pa: 140, divisionReputation: 150 });
    const ideas = tradeIdeas([...crowd, free, loan], club, GAME_DATE);
    const f = ideas.find((x) => x.player.name === 'Libre')!;
    expect(f.buy).toBe(0);
    expect(f.kinds).toContain('free');
    const l = ideas.find((x) => x.player.name === 'Prêtable');
    expect(l == null || l.buy > 0).toBe(true);
  });

  it('un joueur qui ne joue pas progresse moins et rapporte moins', () => {
    const p = db({ name: 'Jeune', age: 19, ca: 100, pa: 150, valueRaw: market(100, 19) });
    const play = tradeIdeas([...crowd, p], club, GAME_DATE).find((x) => x.player === p)!;
    const bench = tradeIdeas([...crowd, p], club, GAME_DATE, { play: new Map([[String(p.id), 'none']]) }).find((x) => x.player === p);
    expect(play.role).toBe(null);
    expect(bench == null || bench.profit < play.profit).toBe(true);
  });
});
