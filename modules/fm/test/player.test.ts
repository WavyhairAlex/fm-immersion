import { describe, expect, it } from 'vitest';
import { alertGroups, fmDashboardCard, fmSnapshotSchema, monthsBetween, normalizePlayer, parsePositions, toNumber } from '../src';

describe('postes', () => {
  it('lit les libellés français du jeu', () => {
    expect(parsePositions('D (DGC), MD')).toEqual(['DD', 'DC', 'DG', 'MDF']);
    expect(parsePositions('DL/M (G), MO (DG), BT')).toEqual(['DLG', 'MG', 'MOD', 'MOG', 'BT']);
    expect(parsePositions(['GB'])).toEqual(['GB']);
    expect(parsePositions('')).toEqual([]);
  });
});

describe('joueur', () => {
  it('convertit les valeurs texte du jeu', () => {
    expect(toNumber('1,2 M€')).toBe(1_200_000);
    expect(toNumber('450K €')).toBe(450_000);
    expect(toNumber('85 %')).toBe(85);
    expect(toNumber('–')).toBeNull();
  });

  it('calcule le niveau sans les attributs propres aux gardiens', () => {
    const p = normalizePlayer({
      id: 7,
      name: '<b>Erik Lind</b>',
      positions: 'MO (D), BT',
      attributes: { Passing: 12, Pace: { min: 13, max: 15 }, Handling: 1 },
      condition: '91 %',
      injury: { description: 'Entorse', returnDays: 10 },
    });
    expect(p).toMatchObject({ id: '7', name: 'Erik Lind', positions: ['MOD', 'BT'], line: 'ATT', level: 13, condition: 91, injury: 'Entorse', injuryDays: 10 });
  });
});

describe('alertes', () => {
  const snap = fmSnapshotSchema.parse({
    schema: 'archivix/1',
    game: 'FM27',
    club: 'Vänersborgs IF',
    gameDate: '2026-08-29',
    players: [
      { id: 1, name: 'A', positions: 'GB', contractEnd: '2026-12-31', condition: 95 },
      { id: 2, name: 'B', positions: 'BT', contractEnd: '2028-06-30', condition: 70 },
      { id: 3, name: 'C', positions: 'D (C)', contractEnd: '2027-06-30', injury: 'Genou' },
    ],
  });
  const players = snap.players.map(normalizePlayer);

  it('compte les mois restants', () => {
    expect(monthsBetween('2026-08-29', '2026-12-31')).toBe(4);
    expect(monthsBetween('2026-08-29', '2027-06-30')).toBe(10);
  });

  it('ne garde que ce qui demande une action', () => {
    const g = alertGroups(players, snap.gameDate);
    expect(g.expiring.map((p) => p.name)).toEqual(['A']);
    expect(g.injured.map((p) => p.name)).toEqual(['C']);
    expect(g.tired.map((p) => p.name)).toEqual(['B']);
    const card = fmDashboardCard(players, snap.gameDate, snap.club);
    expect(card.alerts.map((a) => a.level)).toEqual(['urgent', 'warning', 'warning']);
    expect(card.meta).toBe('Vänersborgs IF');
  });

  it('refuse un fichier qui n’est pas un instantané Archivix', () => {
    expect(fmSnapshotSchema.safeParse({ schema: 'autre', players: [] }).success).toBe(false);
  });
});
