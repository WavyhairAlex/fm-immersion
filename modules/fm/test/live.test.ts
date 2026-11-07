import { describe, expect, it } from 'vitest';
import { fmLiveSchema, liveIsFresh, liveNews, parseScorers, type FmLive } from '../src/live';

const base: FmLive = {
  schema: 'archivix-live/1',
  gameDate: '2027-04-21',
  updatedAt: '2026-11-07T07:20:00.000Z',
  home: 'Inter Bratislava',
  away: 'Malženice',
  homeScore: 1,
  awayScore: 2,
  minute: '42 min.',
  final: false,
  scorers: "L. Carrero pen 36', M. Fábry 11', A. Mojžiš 26'",
};

describe('match en direct', () => {
  it('découpe le texte des buteurs du jeu', () => {
    expect(parseScorers("L. Carrero pen 36', M. Kušnír 61', M. Fábry 11', 90+1', A. Mojžiš 26', 74'")).toEqual([
      { name: 'L. Carrero', time: "pen 36'" },
      { name: 'M. Kušnír', time: "61'" },
      { name: 'M. Fábry', time: "11'" },
      { name: 'M. Fábry', time: "90+1'" },
      { name: 'A. Mojžiš', time: "26'" },
      { name: 'A. Mojžiš', time: "74'" },
    ]);
    expect(parseScorers(null)).toEqual([]);
  });

  it('annonce un but avec son buteur, puis la fin du match', () => {
    const goal = {
      ...base,
      awayScore: 3,
      minute: '59 min.',
      scorers: base.scorers + ", M. Henyig 59'",
    };
    expect(liveNews(base, goal)).toEqual([
      {
        kind: 'goal',
        side: 'away',
        scorer: { name: 'M. Henyig', time: "59'" },
      },
    ]);
    const end = { ...goal, minute: 'FDM', final: true };
    expect(liveNews(goal, end)).toEqual([{ kind: 'final' }]);
    expect(liveNews(end, end)).toEqual([]);
  });

  it('ne raconte rien au premier relevé ni pour un autre match', () => {
    expect(liveNews(null, base)).toEqual([]);
    expect(liveNews({ ...base, home: 'Autre' }, { ...base, homeScore: 3 })).toEqual([]);
  });

  it('deux buts d’un coup : pas de buteur deviné', () => {
    const two = {
      ...base,
      homeScore: 2,
      awayScore: 3,
      scorers: base.scorers + ", M. Kušnír 61', M. Henyig 59'",
    };
    expect(liveNews(base, two)).toEqual([
      { kind: 'goal', side: 'home', scorer: null },
      { kind: 'goal', side: 'away', scorer: null },
    ]);
  });

  it('lit le fichier du plugin et vérifie sa fraîcheur', () => {
    const raw = {
      ...base,
      inMatch: true,
      result: '1 - 2',
      homeEvents: [],
      awayEvents: [],
    };
    expect(fmLiveSchema.parse(raw).home).toBe('Inter Bratislava');
    expect(liveIsFresh(base, Date.parse('2026-11-07T07:21:00Z'))).toBe(true);
    expect(liveIsFresh(base, Date.parse('2026-11-07T07:30:00Z'))).toBe(false);
  });
});
