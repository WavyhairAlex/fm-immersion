import { describe, expect, it } from 'vitest';
import { clubFinances, contractsByYear, dressingRoom, homeOverview, loans, moraleLevel, statusRank, upcomingContracts, wageReport } from '../src';
import { normalizePlayer } from '../src/player';
import type { FmSnapshot } from '../src/snapshot';

const p = (id: number, extra: Record<string, unknown>) => normalizePlayer({ id, name: `J${id}`, positions: 'MC', ...extra });
const DATE = '2026-08-29';

const squad = [
  p(1, { squadStatus: 'Joueur vedette', wage: 2000, contractEnd: '2028-06-30', attributes: { Passing: 14, Leadership: 15, Determination: 14 }, morale: 'Très bon' }),
  p(2, { squadStatus: 'Joueur vedette', wage: 1800, contractEnd: '2026-12-31', attributes: { Passing: 13 }, morale: 'Bon' }),
  p(3, { squadStatus: 'Remplaçant', wage: 300, contractEnd: '2026-11-30', attributes: { Passing: 9 }, morale: 'Médiocre' }),
  p(4, { squadStatus: 'Remplaçant', wage: 2500, contractEnd: '2027-06-30', attributes: { Passing: 10 } }),
  p(5, { squadStatus: "Indésirable dans l'équipe", wage: 95, contractEnd: '2027-01-31', age: 37, attributes: { Passing: 8 }, injury: 'Entorse', condition: 60 }),
  p(6, { squadStatus: 'Jeune espoir', wage: 50, age: 19, contractEnd: '2029-06-30', attributes: { Passing: 11 }, condition: 70 }),
];

describe('vues club et vestiaire', () => {
  it('classe les statuts du jeu', () => {
    expect(statusRank('Joueur vedette')).toBeLessThan(statusRank('Remplaçant'));
    expect(statusRank("Indésirable dans l'équipe")).toBeGreaterThan(statusRank('Jeune espoir'));
  });

  it('analyse la masse salariale', () => {
    const r = wageReport(squad, DATE)!;
    expect(r.total).toBe(6745);
    expect(r.groups[0]!.status).toBe('Joueur vedette');
    // Le remplaçant payé plus qu'une vedette type est signalé, l'indésirable est à libérer.
    expect(r.flags.some((f) => f.kind === 'over' && f.player.id === '4')).toBe(true);
    expect(r.flags.some((f) => f.kind === 'release' && f.player.id === '5')).toBe(true);
    expect(r.ending.players.map((x) => x.id).sort()).toEqual(['2', '3', '5']);
  });

  it('regroupe les contrats par année et repère les échéances', () => {
    expect(contractsByYear(squad).map((y) => y.year)).toEqual(['2026', '2027', '2028', '2029']);
    expect(upcomingContracts(squad, DATE, 6).map((c) => c.player.id)).toEqual(['3', '2', '5']);
  });

  it('lit les finances du club', () => {
    const snap = { clubInfo: { wageBudget: 6000, transferBudget: 0, expectations: [{ label: 'Maintien', status: 'En danger' }] } } as unknown as FmSnapshot;
    const f = clubFinances(snap, squad);
    expect(f.wageRoom).toBe(6000 - 6745);
    expect(f.expectations).toEqual([{ label: 'Maintien', status: 'En danger' }]);
  });

  it('lit les prêts', () => {
    const snap = { loans: [{ id: 9, name: 'Prêté', positions: 'BT', loanClub: 'IFK', loanApps: 1 }] } as unknown as FmSnapshot;
    expect(loans(snap)[0]).toMatchObject({ club: 'IFK', verdict: 'idle' });
    expect(loans({} as FmSnapshot)).toEqual([]);
  });

  it('juge le vestiaire', () => {
    expect(moraleLevel('Superbe')).toBe(5);
    expect(moraleLevel('Médiocre')).toBe(1);
    const d = dressingRoom(squad);
    expect(d.unhappy.map((x) => x.id)).toEqual(['3']);
    expect(d.leaders[0]!.id).toBe('1');
    expect(d.strongLeaders).toBe(1);
  });

  it("prépare l'accueil", () => {
    const h = homeOverview(squad, DATE);
    expect(h.contracts?.length).toBe(3);
    expect(h.alerts.map((a) => a.kind)).toEqual(['injured', 'condition', 'status']);
    expect(h.young.map((x) => x.id)).toEqual(['6']);
  });
});
