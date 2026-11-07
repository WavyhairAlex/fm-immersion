import { describe, expect, it } from 'vitest';
import { figuresForResult, figuresForResultIn, gameLastMatch, type MatchResult } from '../src';

const equipe = {
  dernierMatchScoreDomicile: '1',
  dernierMatchScoreExterieur: '0',
  dernierMatchPossDom: 47,
  dernierMatchPossExt: 53,
  dernierMatchTirsDom: 5,
  dernierMatchTirsExt: 12,
  dernierMatchTirsCadresDom: 3,
  dernierMatchTirsCadresExt: 5,
  dernierMatchXgDom: 1.0615,
  dernierMatchXgExt: 0.4936,
  dernierMatchHommeDuMatch: 'Martin Bukata',
  dernierMatchNoteHommeDuMatch: 8.05,
};
const snap = { gameDate: '2027-08-15', custom: { equipe } };
const result = (over: Partial<MatchResult>): MatchResult =>
  ({ date: '2027-08-14', since: '2027-08-10', matches: 1, opponent: 'X', competition: null, friendly: false, home: null, outcome: 'W', wins: 1, draws: 0, losses: 0, goalsFor: 1, goalsAgainst: 0, xg: null, tactic: null, formation: null, players: [], ...over }) as MatchResult;

describe('chiffres du dernier match écrits par le jeu', () => {
  it('lit score, possession, tirs, xG et homme du match ; rien quand tout est vide', () => {
    expect(gameLastMatch(snap)).toMatchObject({ homeScore: 1, awayScore: 0, possession: [47, 53], shots: [5, 12], onTarget: [3, 5], motm: { name: 'Martin Bukata', rating: 8.05 } });
    expect(gameLastMatch({ custom: { equipe: { ...equipe, dernierMatchPossDom: 50, dernierMatchPossExt: 50, dernierMatchTirsDom: 0, dernierMatchTirsExt: 0 } } })).toBeNull();
    expect(gameLastMatch({ custom: { equipe: { ...equipe, dernierMatchHommeDuMatch: 'FM.UI.PersonReference' } } })?.motm).toBeNull();
    expect(gameLastMatch({})).toBeNull();
  });

  it('retourne les chiffres de notre côté selon le lieu, et refuse un autre score ou un instantané trop tardif', () => {
    expect(figuresForResult(snap, result({ home: true }))).toMatchObject({ possession: [47, 53], shots: [5, 12] });
    // Défaite 0-1 à l'extérieur : le score du jeu (1-0) se lit dans l'autre sens.
    expect(figuresForResult(snap, result({ home: false, goalsFor: 0, goalsAgainst: 1, outcome: 'L' }))).toMatchObject({ possession: [53, 47], shots: [12, 5], onTarget: [5, 3] });
    // Lieu inconnu : le sens du score tranche.
    expect(figuresForResult(snap, result({ home: null, goalsFor: 0, goalsAgainst: 1 }))?.possession).toEqual([53, 47]);
    expect(figuresForResult(snap, result({ home: true, goalsFor: 2 }))).toBeNull();
    expect(figuresForResult(snap, result({ home: false }))).toBeNull();
    expect(figuresForResult({ ...snap, gameDate: '2027-08-30' }, result({ home: true }))).toBeNull();
    expect(figuresForResult(snap, result({ matches: 2 }))).toBeNull();
  });

  it('plusieurs matchs dans la semaine : chacun retrouve ses chiffres dans l’instantané qui l’a révélé', () => {
    const second = { ...equipe, dernierMatchScoreDomicile: '2', dernierMatchScoreExterieur: '2', dernierMatchPossDom: 60, dernierMatchPossExt: 40 };
    const snaps = [
      { gameDate: '2027-08-11', data: { gameDate: '2027-08-11', custom: { equipe: { ...equipe, dernierMatchPossDom: 30, dernierMatchPossExt: 70 } } } },
      { gameDate: '2027-08-14', data: snap },
      { gameDate: '2027-08-18', data: { gameDate: '2027-08-18', custom: { equipe: second } } },
    ];
    const first = result({ date: '2027-08-14', home: true });
    const draw = result({ date: '2027-08-18', since: '2027-08-14', home: true, goalsFor: 2, goalsAgainst: 2, outcome: 'D' });
    expect(figuresForResultIn(snaps, first, draw.date)?.possession).toEqual([47, 53]);
    expect(figuresForResultIn(snaps, draw, null)?.possession).toEqual([60, 40]);
    // Même score une semaine plus tôt : l'instantané d'avant le match n'est jamais pris.
    expect(figuresForResultIn(snaps, result({ date: '2027-08-14', home: true, goalsFor: 1, goalsAgainst: 0 }), null)?.possession).toEqual([47, 53]);
  });
});
