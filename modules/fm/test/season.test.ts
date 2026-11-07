import { describe, expect, it } from 'vitest';
import { seasonEndedBetween, seasonReviews, seasonSoFar, type FmSnapshot } from '../src';

const snap = (gameDate: string, left: number | null, position: number, players: FmSnapshot['players'] = []) =>
  ({
    schema: 'archivix/1',
    club: 'Malženice',
    gameDate,
    players,
    custom: { equipe: { classementPosition: position, ...(left == null ? {} : { calendrierChampionnatRestant: Array.from({ length: left }, () => ({})) }) } },
  }) as unknown as FmSnapshot;

describe('bilan de la saison', () => {
  it('la saison finit quand il ne reste plus de match de championnat', () => {
    expect(seasonEndedBetween(snap('2027-05-08', 1, 4), snap('2027-05-14', 0, 4))).toBe(true);
    expect(seasonEndedBetween(snap('2027-05-14', 0, 4), snap('2027-05-15', 0, 4))).toBe(false);
    expect(seasonEndedBetween(snap('2027-05-08', null, 4), snap('2027-05-14', 0, 4))).toBe(false);
  });

  it('un bilan par saison terminée, avec la place finale et son évolution', () => {
    const h = [snap('2027-04-01', 3, 6), snap('2027-04-10', 2, 5), snap('2027-05-08', 1, 4), snap('2027-05-14', 0, 4), snap('2027-05-20', 0, 4)];
    const [r] = seasonReviews(h.map((data) => ({ gameDate: data.gameDate, data })));
    expect(r).toMatchObject({ club: 'Malženice', start: '2027-04-01', end: '2027-05-14', label: '2027', position: 4 });
    expect(r!.positions.map((p) => p.position)).toEqual([6, 5, 4]);
    expect(seasonReviews(h.slice(0, 3).map((data) => ({ gameDate: data.gameDate, data })))).toEqual([]);
  });

  it("saison en cours, et bilan de la saison finie pendant l'intersaison", () => {
    const h = [snap('2027-04-01', 3, 6), snap('2027-05-08', 1, 4), snap('2027-05-14', 0, 4), snap('2027-05-20', 0, 4)].map((data) => ({
      gameDate: data.gameDate,
      data,
    }));
    expect(seasonSoFar(h, '2027-05-08')).toMatchObject({ start: '2027-04-01', end: '2027-05-08', position: 4 });
    expect(seasonSoFar(h, '2027-05-20')).toMatchObject({ start: '2027-04-01', end: '2027-05-14' });
    expect(seasonSoFar(h, '2027-03-01')).toBeNull();
  });
});

describe('carte de fin de saison', () => {
  // Onze en 4-3-3 + un remplaçant milieu ; chaque match joué en entier par les titulaires.
  const squad: { id: string; pos: string; rating: number }[] = [
    { id: 'gk', pos: 'GB', rating: 6.9 },
    { id: 'dg', pos: 'D (G)', rating: 6.8 },
    { id: 'dc1', pos: 'D (C)', rating: 7.0 },
    { id: 'dc2', pos: 'D (C)', rating: 6.7 },
    { id: 'dd', pos: 'D (D)', rating: 6.6 },
    { id: 'mdf', pos: 'MD (C)', rating: 7.1 },
    { id: 'mc1', pos: 'M (C)', rating: 7.2 },
    { id: 'mc2', pos: 'M (C)', rating: 6.5 },
    { id: 'mog', pos: 'MO (G)', rating: 7.3 },
    { id: 'bt', pos: 'BT', rating: 7.6 },
    { id: 'mod', pos: 'MO (D)', rating: 7.0 },
  ];
  // Scores des matchs ; le 3e : 5-0 avec un triplé de l'avant-centre.
  const scores: [number, number][] = [[1, 0], [2, 2], [5, 0], [0, 1], [2, 1], [3, 1]];
  const scorerOf = (m: number, g: number) => (m === 2 ? (g < 3 ? 'bt' : 'mog') : g % 2 ? 'mog' : 'bt');

  function history() {
    const cum = new Map(squad.map((p) => [p.id, { min: 0, starts: 0, tg: 0, tc: 0, won: 0, lost: 0, goals: 0, motm: 0 }]));
    const snapAt = (date: string, left: number) => ({
      schema: 'archivix/1',
      club: 'Malženice',
      gameDate: date,
      tactic: { name: '4-3-3' },
      players: squad.map((p) => {
        const c = cum.get(p.id)!;
        return { id: p.id, name: `J-${p.id}`, positions: p.pos, apps: c.starts, avgRating: c.starts ? p.rating : null, goals: c.goals };
      }),
      custom: {
        equipe: { classementPosition: 2, calendrierChampionnatRestant: Array.from({ length: left }, () => ({})) },
        joueurs: Object.fromEntries(
          squad.map((p) => {
            const c = cum.get(p.id)!;
            return [p.id, { id: p.id, stat_Minutes: c.min, stat_StartingAppearances: c.starts, stat_SubAppearances: 0, stat_TeamGoals: c.tg, stat_TeamConceded: c.tc, stat_GamesWon: c.won, stat_GamesLost: c.lost, stat_ManOfMatch: c.motm }];
          }),
        ),
      },
    }) as unknown as FmSnapshot;
    const out = [snapAt('2027-03-01', scores.length)];
    scores.forEach(([f, a], m) => {
      for (const p of squad) {
        const c = cum.get(p.id)!;
        c.min += 90;
        c.starts += 1;
        c.tg += f;
        c.tc += a;
        if (f > a) c.won += 1;
        if (f < a) c.lost += 1;
      }
      for (let g = 0; g < f; g++) cum.get(scorerOf(m, g))!.goals += 1;
      out.push(snapAt(`2027-03-${String(8 + m * 7).padStart(2, '0')}`, scores.length - m - 1));
    });
    return out.map((data) => ({ gameDate: data.gameDate, data }));
  }

  it('meilleurs buteurs, équipe type sur le schéma joué et moment fort', () => {
    const [r] = seasonReviews(history());
    expect(r!.ongoing).toBe(false);
    expect(r!.topScorers.map((p) => [p.id, p.value])).toEqual([
      ['bt', 8],
      ['mog', 5],
    ]);
    expect(r!.team!.formation).toBe('4-3-3');
    const at = Object.fromEntries(r!.team!.slots.map((s, i) => [`${s.pos}${i}`, s.player?.id]));
    expect(at).toMatchObject({ GB0: 'gk', BT9: 'bt', MOG8: 'mog', MOD10: 'mod', MDF5: 'mdf' });
    expect(new Set(r!.team!.slots.map((s) => s.player?.id)).size).toBe(11);
    expect(r!.moment).toMatchObject({ kind: 'hatTrick', id: 'bt', goals: 3, match: { goalsFor: 5, goalsAgainst: 0 } });
  });

  it('saison en cours : aperçu marqué comme tel', () => {
    const h = history().slice(0, 4);
    expect(seasonSoFar(h, '2027-12-31')).toMatchObject({ ongoing: true, played: 3 });
  });
});
