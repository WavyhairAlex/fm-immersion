import { describe, expect, it } from 'vitest';
import { matchStats, matchStatsFull, normalizePlayer, statsBoard } from '../src';
import type { FmSnapshot } from '../src/snapshot';

const p = (id: number, positions: string, goals = 0) => normalizePlayer({ id, name: `J${id}`, positions, goals });
const row = (id: number, s: Record<string, unknown>) => ({ id, ...s });

const snap = {
  schema: 'archivix/1',
  game: 'FM27',
  club: 'Club',
  gameDate: '2026-11-25',
  players: [],
  custom: {
    joueurs: {
      '0': row(1, { statMinutes: 900, statPassPct: '91 %', statProgPass90: 6, statInterc90: { PropertyValue: 2.1, Count: 16 }, statSavePct: { PropertyValue: 0, Count: 0 }, statTacklePct: 80, statMistakes: 0, statPress90: 3, statPressAtt90: 15, statXg: 0.2 }),
      '1': row(2, { statMinutes: 880, statPassPct: '70 %', statProgPass90: 2, statInterc90: '0,8', statTacklePct: 55, statMistakes: 2, statPress90: 2, statPressAtt90: 14, statXg: 0.1 }),
      '2': row(3, { statMinutes: 870, statPassPct: 80, statProgPass90: 4, statInterc90: 1.5, statTacklePct: 70, statMistakes: 1, statPress90: 2, statPressAtt90: 12, statXg: 0.3 }),
      '3': row(4, { statMinutes: 120, statPassPct: 60 }),
      '4': row(5, { statMinutes: 850, statPassPct: 72, statKeyPass90: 0.5, statChances90: 0.4, statPress90: 4, statPressAtt90: 20, statXg: 1.5, statXgPer90: 0.16, statShotsOnTargetPct: 30 }),
      '5': row(6, { statMinutes: 860, statPassPct: 75, statKeyPass90: 1.5, statChances90: 1.2, statPress90: 5, statPressAtt90: 18, statXg: 2.5, statXgPer90: 0.26, statShotsOnTargetPct: 45 }),
      '6': row(7, { suspensions: 0 }),
    },
  },
} as unknown as FmSnapshot;

describe('centre de données', () => {
  const stats = matchStats(snap);
  const players = [p(1, 'D (C)'), p(2, 'D (C)'), p(3, 'D (C)'), p(4, 'D (C)'), p(5, 'BT'), p(6, 'BT', 1)];

  it('lit les clés stat* de chemins.json, nombres ou textes', () => {
    expect(stats.get('1')).toMatchObject({ minutes: 900, passPct: 91, interc90: 2.1 });
    expect(stats.has('7')).toBe(false);
  });

  it('classe chaque joueur dans sa ligne et propose une priorité individuelle', () => {
    const b = statsBoard(players, stats);
    const r2 = b.players.find((r) => r.player.id === '2')!;
    expect(r2.marks.passPct?.rank).toBe(0);
    expect(r2.weaknesses.map((w) => w.key)).toContain('passPct');
    expect(r2.focus).toBe('ballRetention');
    const r4 = b.players.find((r) => r.player.id === '4')!;
    expect(r4.enough).toBe(false);
    expect(r4.marks).toEqual({});
    expect(b.players.find((r) => r.player.id === '1')!.focus).toBeNull();
  });

  it('signale les tendances de l’équipe qui appellent une action', () => {
    const b = statsBoard(players, stats);
    expect(b.team!.matches).toBeCloseTo(4480 / 990);
    const kinds = b.alerts.map((a) => a.kind);
    expect(kinds).toContain('possession');
    expect(kinds).toContain('pressing');
    expect(kinds).toContain('mistakes');
    expect(b.areas[0]).toBeDefined();
    expect(b.alerts.find((a) => a.kind === 'possession')!.names[0]).toBe('J2');
  });

  it('reste vide sans stats', () => {
    expect(statsBoard(players, new Map()).players).toEqual([]);
  });
});

describe('centre de données, toutes les stats (stat_<Propriété>)', () => {
  const full = {
    schema: 'archivix/1', game: 'FM27', club: 'Club', gameDate: '2026-12-02', players: [],
    custom: { joueurs: { '0': { id: 9, stat_Minutes: { PropertyValue: 900, Count: 10 }, stat_PassAttempts: { PropertyValue: 500, Count: 10 },
      stat_PassCompleted: { PropertyValue: 450, Count: 10 }, stat_PossessionLost: { PropertyValue: 80, Count: 10 },
      stat_HeaderAttempts: { PropertyValue: 20, Count: 10 }, stat_HeaderCompleted: { PropertyValue: 15, Count: 10 },
      stat_TackleAttempts: { PropertyValue: 0, Count: 0 }, stat_YellowCards: { PropertyValue: 3, Count: 3 } } } },
  } as unknown as FmSnapshot;

  it('garde toutes les stats brutes et recalcule par 90 et pourcentages', () => {
    const m = matchStatsFull(full).get('9')!;
    expect(m.raw).toMatchObject({ Minutes: 900, PassAttempts: 500, YellowCards: 3 });
    expect(m.raw.TackleAttempts).toBeUndefined();
    expect(m.stats.passPct).toBe(90);
    expect(m.stats.passAtt90).toBe(50);
    expect(m.stats.possLost90).toBe(8);
    expect(m.stats.headerPct).toBe(75);
    expect(m.stats.headersLost90).toBe(0.5);
    expect(m.stats.tacklePct).toBeUndefined();
    expect(m.stats.yellow).toBe(3);
  });
});
