import { describe, expect, it } from 'vitest';
import { cupRuns, type FmSnapshot, type MatchResult } from '../src';

const CUP = 'Slovnaft Cup';
const EURO = 'UEFA Europa League';
const res = (date: string, competition: string, opponent: string, f: number, a: number) =>
  ({ date, since: date, matches: 1, competition, opponent, friendly: false, goalsFor: f, goalsAgainst: a, outcome: f > a ? 'W' : f < a ? 'L' : 'D', wins: +(f > a), draws: +(f === a), losses: +(f < a), players: [] }) as unknown as MatchResult;
/** Instantané au `date` avec ces matchs à venir au calendrier [date, compétition, adversaire]. */
const snap = (date: string, fixtures: [string, string, string][] = [['2027-12-01', 'Niké liga', 'Senica']]) =>
  ({
    club: 'Malženice',
    gameDate: date,
    players: [],
    custom: {
      equipe: Object.fromEntries(
        fixtures.flatMap(([d, c, o], i) => {
          const n = String(i).padStart(2, '0');
          return [[`cal${n}Date`, d], [`cal${n}Dom`, 'Malženice'], [`cal${n}Ext`, o], [`cal${n}Comp`, c]];
        }),
      ),
    },
  }) as unknown as FmSnapshot;

describe('parcours en coupe', () => {
  it('défaite sur match sec sans match suivant : éliminé', () => {
    const [c] = cupRuns([res('2027-09-10', CUP, 'Trnava', 2, 0), res('2027-10-20', CUP, 'Žilina', 0, 1)], snap('2027-10-21'));
    expect(c).toMatchObject({ competition: CUP, kind: 'cup', status: 'out', played: 2, outBy: { opponent: 'Žilina', goalsFor: 0, goalsAgainst: 1 } });
  });

  it('match au calendrier : encore en course ; victoire sans tirage : qualifié', () => {
    expect(cupRuns([res('2027-09-10', CUP, 'Trnava', 2, 0)], snap('2027-09-11', [['2027-10-20', CUP, 'Žilina']]))[0]!.status).toBe('alive');
    expect(cupRuns([res('2027-09-10', CUP, 'Trnava', 2, 0)], snap('2027-09-11'))[0]!.status).toBe('through');
  });

  it('aller-retour : le score cumulé décide', () => {
    const ms = [res('2027-10-01', CUP, 'Žilina', 0, 1), res('2027-10-08', CUP, 'Žilina', 3, 1)];
    const [c] = cupRuns(ms, snap('2027-10-09'));
    expect(c!.ties).toHaveLength(1);
    expect(c).toMatchObject({ status: 'through', ties: [{ legs: 2, goalsFor: 3, goalsAgainst: 2 }] });
  });

  it('nul (tirs au but inconnus) : on attend, puis éliminé si rien ne revient', () => {
    const ms = [res('2027-10-20', CUP, 'Žilina', 1, 1)];
    expect(cupRuns(ms, snap('2027-10-22'))[0]!.status).toBe('unknown');
    expect(cupRuns(ms, snap('2027-11-25'))[0]!.status).toBe('out');
  });

  it("coupe d'Europe : une défaite en phase de groupes n'élimine pas tout de suite", () => {
    const ms = [res('2027-10-20', EURO, 'Ajax', 0, 2)];
    expect(cupRuns(ms, snap('2027-10-22'))[0]!.status).toBe('unknown');
    expect(cupRuns(ms, snap('2027-12-01'))[0]!.status).toBe('out');
  });

  it('victoire en fin de saison sans match suivant : vainqueur', () => {
    const [c] = cupRuns([res('2028-05-01', CUP, 'Slovan', 2, 1)], snap('2028-05-20'), { seasonOver: true, seasonEnd: '2028-05-20' });
    expect(c!.status).toBe('won');
  });

  it('sans calendrier lu : inconnu', () => {
    const s = { club: 'Malženice', gameDate: '2027-10-21', players: [], custom: { equipe: {} } } as unknown as FmSnapshot;
    expect(cupRuns([res('2027-10-20', CUP, 'Žilina', 0, 1)], s)[0]!.status).toBe('unknown');
  });
});
