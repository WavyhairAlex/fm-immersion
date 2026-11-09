import { describe, expect, it } from 'vitest';
import { careerOf, countryOfLeague, countryOfNationality, spellCountry, type FmSnapshot } from '../src';

const snap = (gameDate: string, club: string, left: number | null, position: number, nats: string[] = [], comp?: string) =>
  ({
    schema: 'archivix/1',
    club,
    gameDate,
    players: nats.map((nationality, i) => ({ id: i, name: `J${i}`, nationality })),
    ...(comp ? { nextMatch: { competition: comp } } : {}),
    custom: {
      equipe: {
        classementPosition: position,
        ...(left == null ? {} : { calendrierChampionnatRestant: Array.from({ length: left }, () => ({})) }),
      },
    },
  }) as unknown as FmSnapshot;
const e = (xs: FmSnapshot[]) => xs.map((data) => ({ gameDate: data.gameDate, data }));

describe('pays des clubs', () => {
  it('lit les nationalités de FM en français et en anglais', () => {
    expect(countryOfNationality('slovaque')).toBe('SK');
    expect(countryOfNationality('argentin, slovaque')).toBe('AR');
    expect(countryOfNationality('congolais (RDC)')).toBe('CD');
    expect(countryOfNationality('congolais')).toBe('CG');
    expect(countryOfNationality('Swedish')).toBe('SE');
    expect(countryOfNationality('martien')).toBeNull();
  });

  it('reconnaît les championnats au nom sans ambiguïté', () => {
    expect(countryOfLeague('Division 2 Norra Götaland')).toBe('SE');
    expect(countryOfLeague('Challenger Pro League')).toBe('BE');
    expect(countryOfLeague('2. slovenská futbalová liga')).toBe('SK');
    expect(countryOfLeague('Ligue 1 McDonald’s')).toBe('FR');
    expect(countryOfLeague('Scottish Premiership')).toBe('GB-SCT');
    expect(countryOfLeague('Match Amical')).toBeNull();
  });

  it("effectif local : la nationalité dominante ; effectif très international : le championnat", () => {
    expect(spellCountry(e([snap('2027-01-01', 'Dender', 10, 3, ['belge', 'belge', 'français', 'marocain'])]))).toEqual({ code: 'BE', source: 'squad' });
    const intl = ['brésilien', 'français', 'anglais', 'espagnol', 'argentin', 'portugais', 'allemand'];
    expect(spellCountry(e([snap('2027-01-01', 'City', 10, 1, intl, 'Premier League')]))).toEqual({ code: 'GB-ENG', source: 'league' });
    expect(spellCountry(e([snap('2027-01-01', 'X', 10, 1, [])]))).toBeNull();
  });
});

describe('Ma carrière', () => {
  it('suit chaque club, du premier au club actuel, avec titres et pays', () => {
    const h = e([
      snap('2026-09-01', 'Vänersborgs IF', 10, 4, ['suédois', 'suédois', 'kosovar']),
      snap('2026-11-01', 'Vänersborgs IF', 0, 1, ['suédois', 'suédois', 'kosovar']),
      snap('2027-01-10', 'FCV Dender', 12, 6, ['belge', 'belge']),
      snap('2027-03-01', 'Malženice', 8, 2, ['slovaque', 'slovaque', 'brésilien']),
    ]);
    const c = careerOf(h);
    expect(c.spells.map((s) => [s.club, s.country, s.current])).toEqual([
      ['Vänersborgs IF', 'SE', false],
      ['FCV Dender', 'BE', false],
      ['Malženice', 'SK', true],
    ]);
    expect(c.spells[0]!.trophies).toEqual([{ season: '2026', competition: null }]);
    expect(c.spells[2]!.reason).toBeNull();
    expect(c.totals).toMatchObject({ clubs: 3, countries: 3, trophies: 1, bestFinish: 1, seasons: 1, ongoingSeason: true, days: 181 });
  });

  it('coach sans club : le dernier club est quitté', () => {
    const h = e([snap('2027-08-01', 'Malženice', 20, 12, ['slovaque'])]);
    expect(careerOf(h).spells[0]!.current).toBe(true);
    expect(careerOf(h, { freeSince: '2027-08-05' }).spells[0]).toMatchObject({ current: false, reason: 'left' });
  });

  it('matchs sans score : comptés par les apparitions, hors bilan', () => {
    const day = (gameDate: string, apps: number, goals: number[]) =>
      ({
        schema: 'archivix/1',
        club: 'Vänersborgs IF',
        gameDate,
        players: Array.from({ length: 14 }, (_, i) => ({ id: i, name: `J${i}`, nationality: 'suédois', apps: apps + (i < 13 ? 0 : -apps), goals: goals[i] ?? 0 })),
        custom: { equipe: {} },
      }) as unknown as FmSnapshot;
    const c = careerOf(e([day('2026-08-29', 10, []), day('2026-08-30', 11, [1]), day('2026-09-05', 11, [1]), day('2026-09-13', 13, [2, 1])]));
    expect(c.spells[0]!.untracked).toEqual({ matches: 3, goalsFor: 3 });
    expect(c.spells[0]!.total.played).toBe(0);
  });

  it('historique vide', () => {
    expect(careerOf([])).toMatchObject({ spells: [], totals: { clubs: 0, played: 0, winRate: null, biggestWin: null } });
  });
});
