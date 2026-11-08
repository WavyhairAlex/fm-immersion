import type { SeasonReview } from '@fm-immersion/module-fm';
import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import { cardFileName, cardPeople, cupLines, momentText, shortName } from '../src/lib/season-card';

const t = ((k: string, o?: Record<string, unknown>) => (o ? `${k} ${JSON.stringify(o)}` : k)) as unknown as TFunction;
const match = { date: '2027-03-22', opponent: 'Senica', goalsFor: 5, goalsAgainst: 0 };

describe('carte de fin de saison', () => {
  it('nom de fichier sans accents ni caractères spéciaux', () => {
    expect(cardFileName({ club: 'Malženice', label: '2026/27' } as SeasonReview)).toBe('carte-saison-malzenice-2026-27');
  });

  it('nom court : le nom de famille', () => {
    expect(shortName('Marek Fábry')).toBe('Fábry');
    expect(shortName('Neymar')).toBe('Neymar');
  });

  it('textes du moment fort', () => {
    expect(momentText(t, { kind: 'hatTrick', id: 'a', name: 'Fábry', goals: 3, match }, 'fr').title).toBe('card.moment.hatTrick {"name":"Fábry","count":3}');
    expect(momentText(t, { kind: 'hatTrick', id: 'a', name: 'Fábry', goals: 4, match }, 'fr').title).toContain('card.moment.haul');
    expect(momentText(t, { kind: 'bigWin', match }, 'fr')).toEqual({
      title: 'card.moment.vs {"score":"5-0","opponent":"Senica"}',
      body: 'card.moment.bigWinBody {"date":"22 mars"}',
    });
    expect(momentText(t, { kind: 'unbeaten', count: 12 }).title).toBe('card.moment.unbeaten {"count":12}');
  });

  it('photos à charger : équipe type, buteurs et auteur du triplé, sans doublon', () => {
    const r = {
      team: { formation: '4-3-3', slots: [{ pos: 'BT', x: 50, y: 12, player: { id: 'a', name: 'A', rating: 7, apps: 9, goals: 5 } }, { pos: 'GB', x: 50, y: 92, player: null }] },
      topScorers: [{ id: 'a', name: 'A', value: 5 }, { id: 'b', name: 'B', value: 2 }],
      moment: { kind: 'hatTrick', id: 'c', name: 'C', goals: 3, match },
    } as unknown as SeasonReview;
    expect(cardPeople(r)).toEqual(['a', 'b', 'c']);
  });

  it('coupes : pastilles et coupe gagnée comme moment fort', () => {
    const r = { cups: [{ competition: 'Slovnaft Cup', status: 'won', played: 5, outBy: null }, { competition: 'UECL', status: 'out', played: 2, outBy: { opponent: 'Ajax' } }] } as unknown as SeasonReview;
    expect(cupLines(t, r)).toEqual([
      ['card.cup.won {"competition":"Slovnaft Cup","opponent":"?","count":5}', true],
      ['card.cup.out {"competition":"UECL","opponent":"Ajax","count":2}', false],
    ]);
    expect(momentText(t, { kind: 'cupWin', competition: 'Slovnaft Cup' }).title).toBe('card.moment.cupWin {"competition":"Slovnaft Cup"}');
  });
});
