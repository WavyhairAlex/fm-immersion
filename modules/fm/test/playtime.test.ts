import { describe, expect, it } from 'vitest';
import type { FmPlayer } from '../src/player';
import { playtimeReport, type PlaytimeMatch } from '../src/playtime';

const pl = (id: string, squadStatus: string) => ({ id, name: id, squadStatus, positions: [], attributes: {} }) as unknown as FmPlayer;
const match = (played: [string, number, boolean][], out: string[] = []): PlaytimeMatch => ({
  matches: 1,
  squad: new Set(['star', 'rot', 'back', 'hurt', 'new']),
  out: new Set(out),
  played: played.map(([id, minutes, started]) => ({ id, minutes, started })),
});

describe('temps de jeu promis', () => {
  const list = [
    // La vedette joue 30 min de moyenne : en dessous de sa promesse.
    ...Array.from({ length: 6 }, () => match([['star', 30, false], ['rot', 90, true], ['back', 90, true]], ['hurt'])),
  ];
  const r = playtimeReport([pl('star', 'Joueur vedette'), pl('rot', 'Joueur de rotation'), pl('back', 'Remplaçant'), pl('hurt', 'Titulaire régulier'), pl('x', 'Indésirable')], list);
  const by = (id: string) => r.rows.find((x) => x.player.id === id)!;
  it('alerte quand le statut promet plus que les minutes jouées', () => {
    expect(r.matches).toBe(6);
    expect(by('star')).toMatchObject({ verdict: 'short', available: 6, minutes: 180, starts: 0 });
    expect(by('star').share).toBeCloseTo(1 / 3);
  });
  it('repère le remplaçant qui joue comme un titulaire', () => {
    expect(by('back')).toMatchObject({ verdict: 'over', earnedRank: 0 });
    expect(by('rot').verdict).toBe('over');
  });
  it('ne compte pas les matchs manqués sur blessure, ni les statuts sans promesse', () => {
    expect(by('hurt')).toMatchObject({ verdict: 'early', available: 0 });
    expect(by('x').verdict).toBe('none');
    expect(r.rows[0]!.player.id).toBe('star');
  });
});
