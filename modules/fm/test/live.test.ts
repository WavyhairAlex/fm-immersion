import { describe, expect, it } from 'vitest';
import { fmLiveSchema, liveAssists, liveCardList, liveCoachState, liveIsFresh, liveMinute, liveNews, parseScorers, type FmLive } from '../src/live';

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
        penalty: false,
        assist: null,
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
      { kind: 'goal', side: 'home', scorer: null, penalty: false, assist: null },
      { kind: 'goal', side: 'away', scorer: null, penalty: false, assist: null },
    ]);
  });

  it('penalty transformé et passeur décisif lus dans la feuille de match', () => {
    const before = {
      ...base,
      homeLineup: [{ name: 'L. Carrero', goals: 1, assists: 0 }, { name: 'J. Novák', goals: 0, assists: 0 }],
      awayLineup: [{ name: 'M. Fábry', goals: 1, assists: 0 }, { name: 'A. Mojžiš', goals: 1, assists: 1 }],
    };
    const pen = {
      ...before,
      homeScore: 2,
      minute: '70 min.',
      scorers: before.scorers + ", J. Novák pen 70'",
      homeLineup: [{ name: 'L. Carrero', goals: 1, assists: 0 }, { name: 'J. Novák', goals: 1, assists: 0 }],
    };
    expect(liveNews(before, pen)).toEqual([{ kind: 'goal', side: 'home', scorer: { name: 'J. Novák', time: "pen 70'" }, penalty: true, assist: null }]);
    const assisted = {
      ...pen,
      awayScore: 3,
      minute: '80 min.',
      scorers: pen.scorers + ", M. Fábry 80'",
      awayLineup: [{ name: 'M. Fábry', goals: 2, assists: 0 }, { name: 'A. Mojžiš', goals: 1, assists: 2 }],
    };
    expect(liveNews(pen, assisted)).toEqual([{ kind: 'goal', side: 'away', scorer: { name: 'M. Fábry', time: "80'" }, penalty: false, assist: 'A. Mojžiš' }]);
  });

  it('rapport de match : passeurs sur les événements, repris sur un but de fin de match', () => {
    const report = {
      ...base,
      homeEvents: [{ type: 0, time: "36'", player: 'L. Carrero', assist: null }],
      awayEvents: [
        { type: 0, time: "11'", player: 'M. Fábry', assist: 'A. Mojžiš' },
        { type: 0, time: "26'", player: 'A. Mojžiš', assist: null },
      ],
    };
    expect(liveAssists(report)).toEqual([{ side: 'away', assist: 'A. Mojžiš', player: 'M. Fábry', time: "11'" }]);
    expect(liveAssists(base)).toEqual([]);
    const late = { ...report, awayScore: 3, minute: 'FDM', final: true, scorers: base.scorers + ", M. Henyig 90+2'", awayEvents: [...report.awayEvents, { type: 0, time: "90+2'", player: 'M. Henyig', assist: 'M. Fábry' }] };
    expect(liveNews(report, late)[0]).toMatchObject({ kind: 'goal', side: 'away', assist: 'M. Fábry' });
  });

  it('cartons : jaune, puis rouge (second jaune annoncé une fois, en rouge)', () => {
    const clean = { ...base, homeLineup: [{ name: 'J. Novák', yellow: false, red: false }], awayLineup: [{ name: 'M. Fábry' }] };
    const yellow = { ...clean, minute: '50 min.', homeLineup: [{ name: 'J. Novák', yellow: true, red: false }], awayLineup: [{ name: 'M. Fábry', yellow: true }] };
    expect(liveNews(clean, yellow)).toEqual([
      { kind: 'card', side: 'home', player: 'J. Novák', card: 'yellow' },
      { kind: 'card', side: 'away', player: 'M. Fábry', card: 'yellow' },
    ]);
    const red = { ...yellow, minute: '77 min.', homeLineup: [{ name: 'J. Novák', yellow: true, red: true }] };
    expect(liveNews(yellow, red)).toEqual([{ kind: 'card', side: 'home', player: 'J. Novák', card: 'red' }]);
    expect(liveNews(red, red)).toEqual([]);
    // Pas de feuille de match au relevé précédent : rien à rejouer.
    expect(liveNews(base, yellow)).toEqual([]);
    expect(liveCardList(red)).toEqual([
      { side: 'home', player: 'J. Novák', card: 'red' },
      { side: 'away', player: 'M. Fábry', card: 'yellow' },
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

describe('liveCoachState', () => {
  const now = Date.parse(base.updatedAt) + 10_000;
  it('lit la minute du jeu', () => {
    expect(liveMinute('62 min.')).toBe(62);
    expect(liveMinute("90+3'")).toBe(93);
    expect(liveMinute('MT')).toBe(45);
    expect(liveMinute('FDM')).toBeNull();
  });
  it('voit le match du côté du club du joueur', () => {
    expect(liveCoachState(base, 'Malženice', null, now)).toMatchObject({ side: 'away', opponent: 'Inter Bratislava', goalsFor: 2, goalsAgainst: 1, diff: 1, minute: 42, final: false });
  });
  it("reconnaît le club par l'adversaire du prochain match", () => {
    expect(liveCoachState(base, null, 'Inter Bratislava', now)?.side).toBe('away');
  });
  it('ignore un autre match, un relevé ancien ou hors match', () => {
    expect(liveCoachState(base, 'Spartak Trnava', 'Žilina', now)).toBeNull();
    expect(liveCoachState(base, 'Malženice', null, now + 10 * 60_000)).toBeNull();
    expect(liveCoachState({ ...base, inMatch: false }, 'Malženice', null, now)).toBeNull();
  });
  it('fin du match : minute 90 au moins', () => {
    expect(liveCoachState({ ...base, minute: 'FDM', final: true }, 'Malženice', null, now)).toMatchObject({ minute: 90, final: true });
  });
});
