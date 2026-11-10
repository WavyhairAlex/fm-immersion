import { describe, expect, it } from 'vitest';
import { withExtended } from '../src/lineup';
import { normalizePlayer } from '../src/player';
import type { FmSnapshot } from '../src/snapshot';
import { firstTeamSnapshot, otherTeamOf } from '../src/teams';

const base = { schema: 'archivix/1', game: 'FM27', club: 'Malženice', gameDate: '2027-07-04' };

describe('équipes du club', () => {
  it('sépare équipe première, U19 et réserve par chemins.json (equipe / equipeType)', () => {
    const snap = {
      ...base,
      players: [
        { id: 1, name: 'Gorosito', age: 38, squadNumber: 4, squadStatus: 'Joueur Vedette' },
        { id: 2, name: 'Durica', age: 16, squadNumber: -1, squadStatus: 'Jeune joueur' },
        { id: 3, name: 'Novák', age: 20, squadNumber: -1, squadStatus: 'Jeune joueur' },
        { id: 4, name: 'Campagne', age: 24, squadNumber: -1, squadStatus: 'Joueur important' },
      ],
      custom: {
        joueurs: {
          a: { id: 1, equipe: 'Malženice', equipeType: 'Équipe prem.' },
          b: { id: 2, equipe: 'Malženice U19', equipeType: 'Équipe U19' },
          c: { id: 3, equipe: 'Malženice II', equipeType: 'Équipe réserve' },
          d: { id: 4, equipe: 'Malženice', equipeType: 'Équipe prem.' },
        },
      },
    } as unknown as FmSnapshot;
    expect([...otherTeamOf(snap)]).toEqual([
      ['2', 'Malženice U19'],
      ['3', 'Malženice II'],
    ]);
    expect(firstTeamSnapshot(snap).players.map((p) => p.id)).toEqual([1, 4]);
    const players = withExtended(snap).players.map(normalizePlayer);
    expect(players.map((p) => p.team)).toEqual([null, 'Malženice U19', 'Malženice II', null]);
  });

  it('reconnaît l’équipe première de la version finale de FM27 (« Équipe 1ère ») et le nom du club', () => {
    const snap = {
      ...base,
      players: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }, { id: 3, name: 'C' }, { id: 4, name: 'D' }],
      custom: {
        joueurs: {
          a: { id: 1, equipe: 'Malženice', equipeType: 'Équipe 1ère' },
          b: { id: 2, equipe: 'Malženice U19', equipeType: 'Équipe U19' },
          c: { id: 3, equipe: 'Nitra', equipeType: 'Équipe 1ère' },
          d: { id: 4, equipe: 'Malženice', equipeType: 'Libellé inconnu' },
        },
      },
    } as unknown as FmSnapshot;
    expect([...otherTeamOf(snap)]).toEqual([['2', 'Malženice U19']]);
    expect(firstTeamSnapshot(snap).players.map((p) => p.id)).toEqual([1, 3, 4]);
  });

  it('sans le type, compare le nom de l’équipe au club', () => {
    const snap = {
      ...base,
      players: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }],
      custom: { joueurs: { a: { id: 1, equipe: 'Malženice' }, b: { id: 2, equipe: 'Malženice U19' } } },
    } as unknown as FmSnapshot;
    expect([...otherTeamOf(snap)]).toEqual([['2', 'Malženice U19']]);
  });

  it('sans chemins.json, ne range dans les jeunes que les « Jeune joueur » de 18 ans ou moins sans numéro', () => {
    const snap = {
      ...base,
      players: [
        { id: 1, name: 'Durica', age: 16, squadNumber: -1, squadStatus: 'Jeune joueur' },
        { id: 2, name: 'Frimpong', age: 19, squadNumber: 30, squadStatus: "Espoir aux portes de l'équipe" },
        { id: 3, name: 'Novák', age: 20, squadNumber: -1, squadStatus: 'Jeune joueur' },
        { id: 4, name: 'Castillo', age: 28, squadNumber: -1, squadStatus: '-' },
      ],
    } as unknown as FmSnapshot;
    expect([...otherTeamOf(snap)]).toEqual([['1', 'Jeunes']]);
  });
});
