import { describe, expect, it } from 'vitest';
import { autoPhase, buildTrainingWeek, defaultMatchDays, mondayOf, sessionCategory, weekMatches } from '../src';

const MONDAY = '2026-08-31';

describe('planning d’entraînement (méthode Freedom)', () => {
  it('trouve le lundi de la semaine', () => {
    expect(mondayOf('2026-08-29')).toBe('2026-08-24');
    expect(mondayOf('2026-08-31')).toBe('2026-08-31');
    expect(mondayOf('2026-09-06')).toBe('2026-08-31');
  });

  it('semaine à un match (samedi) : veille = préparation, lendemain = récupération + esprit d’équipe', () => {
    const w = buildTrainingWeek({ monday: MONDAY, phase: 'A', week: 1, matchDays: [5], style: 'possession', priorities: ['buildUpStrategy', 'passingStyle'] });
    expect(w.code).toBe('A1-1');
    expect(w.theme).toBe('buildUp');
    expect(w.days.map((d) => d.kind)).toEqual(['dev', 'dev', 'dev', 'dev', 'prep', 'match', 'recovery']);
    expect(w.days[6]!.sessions).toEqual(['recovery', 'recovery', 'teamBonding']);
    expect(sessionCategory(w.days[4]!.sessions[0]!)).toBe('matchPrep');
    expect(w.days[0]!.sessions[0]).toBe('buildUpStrategy');
  });

  it('semaine à deux matchs : mardi et vendredi en préparation, jeudi et dimanche en récupération', () => {
    const w = buildTrainingWeek({ monday: MONDAY, phase: 'B', week: 2, matchDays: [2, 5] });
    expect(w.code).toBe('B2-2');
    expect(w.days.map((d) => d.kind)).toEqual(['dev', 'prep', 'match', 'recovery', 'prep', 'match', 'recovery']);
  });

  it('un match le dimanche précédent rend le lundi à la récupération', () => {
    const w = buildTrainingWeek({ monday: MONDAY, phase: 'C', week: 3, matchDays: [], matchBeforeMonday: true });
    expect(w.code).toBe('C3-0');
    expect(w.days[0]!.kind).toBe('recovery');
  });

  it('aucune séance de Repos ni de condition physique intensive la veille ou l’avant-veille d’un match', () => {
    for (const phase of ['A', 'B', 'C'] as const)
      for (const week of [1, 2, 3, 4] as const)
        for (const days of [[], [5], [2, 5]]) {
          const w = buildTrainingWeek({ monday: MONDAY, phase, week, matchDays: days });
          for (const d of w.days) {
            expect(d.sessions).not.toContain('rest');
            if (days.includes(d.weekday + 1) || days.includes(d.weekday + 2)) {
              expect(d.sessions).not.toContain('heavyConditioning');
              expect(d.sessions).not.toContain('conditioning');
            }
          }
        }
  });

  it('la zone n° 1 du style visé est travaillée chaque semaine de saison', () => {
    for (const week of [1, 2, 3, 4] as const) {
      const w = buildTrainingWeek({ monday: MONDAY, phase: 'A', week, matchDays: [5], priorities: ['pressingTrap'] });
      expect(w.days.some((d) => d.sessions.includes('pressingTrap'))).toBe(true);
    }
  });

  it('variantes offensives et défensives selon le style', () => {
    const att = buildTrainingWeek({ monday: MONDAY, phase: 'A', week: 3, matchDays: [], style: 'wings' });
    expect(att.days.some((d) => d.sessions.includes('attackingWings'))).toBe(true);
    const def = buildTrainingWeek({ monday: MONDAY, phase: 'A', week: 2, matchDays: [], style: 'gegenpress' });
    expect(def.days.some((d) => d.sessions.includes('defendingEngaged'))).toBe(true);
  });

  it('présaison : P1 et P2 uniquement physiques', () => {
    for (const week of [1, 2] as const) {
      const w = buildTrainingWeek({ monday: MONDAY, phase: 'P', week, matchDays: [] });
      expect(w.code).toBe(`P${week}`);
      for (const d of w.days) for (const s of d.sessions) if (s) expect(sessionCategory(s)).toBe('physical');
    }
    expect(defaultMatchDays('P', 3, 0)).toEqual([2, 5]);
    expect(defaultMatchDays('P', 4, 0)).toEqual([2]);
  });

  it('situe la phase d’après le mois de reprise', () => {
    expect(autoPhase('2026-07-01', 8)).toEqual({ phase: 'P', week: 1 });
    expect(autoPhase('2026-09-02', 8).phase).toBe('A');
    expect(autoPhase('2026-12-15', 8).phase).toBe('B');
    expect(autoPhase('2027-03-10', 8).phase).toBe('C');
    expect(autoPhase('2027-07-10', 8).phase).toBe('P');
    // Championnat suédois (reprise en avril) : fin août = phase B.
    expect(autoPhase('2026-08-29', 4).phase).toBe('B');
    const a = autoPhase('2026-08-03', 8);
    const b = autoPhase('2026-08-10', 8);
    expect(b.week).toBe(a.week + 1);
  });

  it('lit les matchs de la semaine dans le calendrier', () => {
    const m = weekMatches(
      [
        { date: '2026-08-30', opponent: 'X' },
        { date: '2026-09-02', opponent: 'Kumla' },
        { date: '2026-09-05T15:00:00', opponent: 'Skövde' },
        { date: '2026-09-09', opponent: 'Y' },
      ],
      MONDAY,
    );
    expect(m.days).toEqual([2, 5]);
    expect(m.before).toBe(true);
    expect(m.opponents[2]).toBe('Kumla');
  });
});
