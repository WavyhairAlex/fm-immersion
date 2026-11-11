import { describe, expect, it } from 'vitest';
import { clubReach, reachCaps, reachOf, type DbPlayer } from '../src';

const GAME_DATE = '2028-02-21';
// Effectif d'un petit club : salaires de base par semaine, réputations, championnat coté 100.
const own = [
  { id: 1, reputation: 2000, wageWeekly: 1000, valueRaw: 300_000, divisionReputation: 100 },
  { id: 2, reputation: 1800, wageWeekly: 800, valueRaw: 200_000, divisionReputation: 100 },
  { id: 3, reputation: 1600, wageWeekly: 600, valueRaw: 100_000, divisionReputation: 100 },
  { id: 4, reputation: 900, wageWeekly: 300, valueRaw: 20_000, divisionReputation: 100 },
];
// Le jeu affiche 5 € par mois pour 1 de base par semaine.
const squad = own.map((a) => ({ id: String(a.id), wage: (a.wageWeekly ?? 0) * 5 }));

const db = (o: Partial<DbPlayer>): DbPlayer => ({
  id: 99,
  name: 'Recrue',
  age: 27,
  birthDate: null,
  club: 'Club',
  clubShort: null,
  clubId: 500,
  loanClub: null,
  loanEnd: null,
  divisionReputation: 100,
  ca: 120,
  pa: 125,
  positionsText: 'BT',
  positionRatings: { BT: 20 },
  attributes: {},
  wageWeekly: 700,
  contractEnd: '2030-06-30',
  valueRaw: 150_000,
  reputation: [1800, 1800, 1500],
  ...o,
});

describe('recrues à la portée du club', () => {
  const club = clubReach(own, squad, { transferBudget: 200_000, wageRoom: 5_000 });

  it('tire ses repères de l’effectif', () => {
    expect(club.topWage).toBe(1000);
    expect(club.reputation).toBe(1800);
    expect(club.divisionReputation).toBe(100);
    // 5 000 € par mois affichés = 1 000 de base par semaine.
    expect(club.wageRoom).toBeCloseTo(1000);
    expect(reachCaps(club)).toEqual({ maxWageWeekly: 2000, maxReputation: 3150 });
  });

  it('un joueur de son niveau, dans le budget, est possible', () => {
    expect(reachOf(db({}), club, GAME_DATE)).toEqual({ level: 'possible', why: [], fee: 150_000 });
  });

  it('une vedette d’un grand championnat est hors de portée', () => {
    const star = db({ wageWeekly: 250_000, valueRaw: 80_000_000, reputation: [9000, 9500, 9500], divisionReputation: 190 });
    const r = reachOf(star, club, GAME_DATE);
    expect(r.level).toBe('out');
    expect(r.why).toEqual(expect.arrayContaining(['wage', 'fee', 'reputation', 'league']));
  });

  it('libre ou en fin de contrat : pas d’indemnité', () => {
    expect(reachOf(db({ club: null, clubId: null, valueRaw: 5_000_000 }), club, GAME_DATE)).toMatchObject({ level: 'easy', why: ['free'], fee: 0 });
    expect(reachOf(db({ contractEnd: '2028-06-30', valueRaw: 5_000_000 }), club, GAME_DATE)).toMatchObject({ level: 'easy', why: ['preContract'], fee: 0 });
  });

  it('un jeune d’un club plus huppé peut venir en prêt', () => {
    const r = reachOf(db({ age: 20, valueRaw: 3_000_000, divisionReputation: 160, reputation: [1500, 1500, 1000] }), club, GAME_DATE);
    expect(r).toMatchObject({ level: 'easy', why: ['loan'], fee: 0 });
  });

  it('salaire au-dessus de la grille ou de la marge : difficile', () => {
    expect(reachOf(db({ wageWeekly: 1400 }), club, GAME_DATE)).toMatchObject({ level: 'hard', why: ['wage', 'wageRoom'] });
    const broke = clubReach(own, squad, { transferBudget: 0, wageRoom: -50_000 });
    expect(reachOf(db({ club: null, clubId: null, wageWeekly: 500 }), broke, GAME_DATE)).toMatchObject({ level: 'hard', why: ['free', 'wageRoom'] });
    // Sans budget de transferts, un achat est hors de portée.
    expect(reachOf(db({}), broke, GAME_DATE).level).toBe('out');
  });

  it('le salaire du partant libère de la marge', () => {
    const broke = clubReach(own, squad, { transferBudget: 0, wageRoom: 0 }, 800);
    expect(reachOf(db({ club: null, clubId: null, wageWeekly: 700 }), broke, GAME_DATE).level).toBe('easy');
  });

  it('sans repères lus, ne juge que ce qu’il sait', () => {
    const none = clubReach([], [], null);
    expect(reachOf(db({}), none, GAME_DATE)).toEqual({ level: 'possible', why: [], fee: 150_000 });
  });
});
