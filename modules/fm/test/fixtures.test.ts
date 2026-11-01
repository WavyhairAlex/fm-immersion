import { describe, expect, it } from 'vitest';
import { currentTrainingWeek, daysUntil, snapshotFixtures, upcomingFixtures, weekMatches } from '../src';
import type { FmSnapshot } from '../src/snapshot';

// Forme réelle du bloc nextMatch (instantané Malženice du 25/11/2026, plugin 0.4.3).
const snap = {
  gameDate: '2026-11-25',
  nextMatch: {
    opponent: 'Petržalka',
    competition: '2. slovenská futbalová liga',
    next5Opponent0: 'Petržalka',
    next5Opponent1: 'Žilina B',
    next5Opponent2: '1.HFC Humenné',
    next5Opponent3: 'Lokomotíva Zvolen',
    next5Opponent4: 'Bytča',
    location: 'Domicile',
    inDays: 'Dans 95 jours',
    next5: [
      { DisplayValue: 'Dans 95 jours', PropertyValue: 'Team#7154' },
      { DisplayValue: 'Dans 102 jours', PropertyValue: 'Team#21843' },
      { DisplayValue: 'Dans 108 jours', PropertyValue: 'Team#1330' },
      { DisplayValue: 'Dans 116 jours', PropertyValue: 'Team#21853' },
      { DisplayValue: 'Dans 123 jours', PropertyValue: 'Team#34502' },
    ],
  },
} as unknown as FmSnapshot;

describe('calendrier reconstitué depuis les 5 prochains matchs', () => {
  it('lit le texte « Dans N jours » du jeu', () => {
    expect(daysUntil('Dans 95 jours')).toBe(95);
    expect(daysUntil('Dans 1 jour')).toBe(1);
    expect(daysUntil('Demain')).toBe(1);
    expect(daysUntil("Aujourd'hui")).toBe(0);
    expect(daysUntil('In 3 days')).toBe(3);
    expect(daysUntil('Team#7154')).toBeNull();
    expect(daysUntil(null)).toBeNull();
  });

  it('date chaque match à partir de la date du jeu', () => {
    const f = snapshotFixtures(snap);
    expect(f.map((x) => [x.date, x.opponent])).toEqual([
      ['2027-02-28', 'Petržalka'],
      ['2027-03-07', 'Žilina B'],
      ['2027-03-13', '1.HFC Humenné'],
      ['2027-03-21', 'Lokomotíva Zvolen'],
      ['2027-03-28', 'Bytča'],
    ]);
    expect(f[0]).toMatchObject({ home: true, competition: '2. slovenská futbalová liga' });
    expect(f[1]).toMatchObject({ home: null, competition: null });
    expect(upcomingFixtures(snap).map((x) => x.gap)).toEqual([null, 7, 6, 8, 7]);
  });

  it('place les matchs dans la semaine d’entraînement', () => {
    // Semaine du lundi 1er mars 2027 : Žilina B le dimanche, Petržalka la veille du lundi.
    const w = weekMatches(snapshotFixtures(snap), '2027-03-01');
    expect(w.days).toEqual([6]);
    expect(w.before).toBe(true);
    expect(w.opponents[6]).toBe('Žilina B');
    // Trêve d'hiver : aucune journée de match cette semaine.
    const now = currentTrainingWeek({ gameDate: snap.gameDate, fixtures: snapshotFixtures(snap) });
    expect(now.days.filter((d) => d.kind === 'match')).toEqual([]);
  });

  it('garde une vraie liste fixtures quand le plugin en fournit une', () => {
    const fixtures = [{ date: '2026-12-01', opponent: 'A', competition: null, home: true }];
    expect(snapshotFixtures({ ...snap, fixtures } as FmSnapshot)).toBe(fixtures);
    expect(snapshotFixtures({ gameDate: '2026-11-25' } as FmSnapshot)).toEqual([]);
  });
});
