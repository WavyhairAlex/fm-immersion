import { describe, expect, it } from 'vitest';
import { autoPhase, breakPhase, upcomingWeeks, weekWorkload, buildTrainingWeek, currentTrainingWeek, trainingAlerts, defaultMatchDays, individualAdvice, individualFocus, mentoringGroups, mondayOf, nearestPreset, personalityTone, sessionCategory, setupStatus, weekMatches } from '../src';

const MONDAY = '2026-08-31';

describe('planning d’entraînement (méthode Freedom)', () => {
  it('trouve le lundi de la semaine', () => {
    expect(mondayOf('2026-08-29')).toBe('2026-08-24');
    expect(mondayOf('2026-08-31')).toBe('2026-08-31');
    expect(mondayOf('2026-09-06')).toBe('2026-08-31');
  });

  it('semaine à un match (samedi) : veille = préparation, lendemain = repos, récupération + esprit d’équipe', () => {
    const w = buildTrainingWeek({ method: 'freedom', monday: MONDAY, phase: 'A', week: 1, matchDays: [5], style: 'possession', priorities: ['buildUpStrategy', 'passingStyle'] });
    expect(w.code).toBe('A1-1');
    expect(w.theme).toBe('buildUp');
    expect(w.days.map((d) => d.kind)).toEqual(['dev', 'dev', 'dev', 'dev', 'prep', 'match', 'recovery']);
    expect(w.days[6]!.sessions).toEqual(['rest', 'recovery', 'teamBonding']);
    expect(sessionCategory(w.days[4]!.sessions[0]!)).toBe('matchPrep');
    expect(w.days[0]!.sessions[0]).toBe('buildUpStrategy');
  });

  it('semaine à deux matchs : mardi et vendredi en préparation, jeudi et dimanche en récupération', () => {
    const w = buildTrainingWeek({ method: 'freedom', monday: MONDAY, phase: 'B', week: 2, matchDays: [2, 5] });
    expect(w.code).toBe('B2-2');
    expect(w.days.map((d) => d.kind)).toEqual(['dev', 'prep', 'match', 'recovery', 'prep', 'match', 'recovery']);
  });

  it('un match le dimanche précédent rend le lundi à la récupération', () => {
    const w = buildTrainingWeek({ method: 'freedom', monday: MONDAY, phase: 'C', week: 3, matchDays: [], matchBeforeMonday: true });
    expect(w.code).toBe('C3-0');
    expect(w.days[0]!.kind).toBe('recovery');
  });

  it('Repos seulement les lendemains de match, pas de condition physique la veille ou l’avant-veille', () => {
    for (const phase of ['A', 'B', 'C'] as const)
      for (const week of [1, 2, 3, 4] as const)
        for (const days of [[], [5], [2, 5]]) {
          const w = buildTrainingWeek({ method: 'freedom', monday: MONDAY, phase, week, matchDays: days });
          for (const d of w.days) {
            if (d.kind !== 'recovery') expect(d.sessions).not.toContain('rest');
            if (days.includes(d.weekday + 1) || days.includes(d.weekday + 2)) {
              expect(d.sessions).not.toContain('heavyConditioning');
              expect(d.sessions).not.toContain('conditioning');
            }
          }
        }
  });

  it('la zone n° 1 du style visé est travaillée chaque semaine de saison', () => {
    for (const week of [1, 2, 3, 4] as const) {
      const w = buildTrainingWeek({ method: 'freedom', monday: MONDAY, phase: 'A', week, matchDays: [5], priorities: ['pressingTrap'] });
      expect(w.days.some((d) => d.sessions.includes('pressingTrap'))).toBe(true);
    }
  });

  it('deux séances de piège de pressing par semaine, ni plus ni moins quand il y a de la place', () => {
    for (const phase of ['T', 'A', 'B', 'C'] as const)
      for (const week of [1, 2, 3, 4] as const)
        for (const days of [[], [5], [2]]) {
          const w = buildTrainingWeek({ method: 'freedom', monday: MONDAY, phase, week, matchDays: days, priorities: ['passingStyle'] });
          const n = w.days.reduce((k, d) => k + d.sessions.filter((s) => s === 'pressingTrap').length, 0);
          expect(n, w.code).toBeGreaterThanOrEqual(2);
          // La zone n° 1 du style reste travaillée.
          expect(w.days.some((d) => d.sessions.includes('passingStyle')), w.code).toBe(true);
        }
  });

  it('les zones qui rapportent le plus passent devant les autres zones du thème', () => {
    // Thème pressing : le piège de pressing passe devant l'intensité du pressing.
    const w = buildTrainingWeek({ method: 'freedom', monday: MONDAY, phase: 'A', week: 2, matchDays: [5] });
    expect(w.days[0]!.sessions[0]).toBe('pressingTrap');
  });

  it('semaine à trois matchs : repos complet entre les matchs', () => {
    const w = buildTrainingWeek({ method: 'freedom', monday: MONDAY, phase: 'B', week: 1, matchDays: [1, 3, 6] });
    expect(w.congested).toBe(true);
    for (const d of w.days) if (d.kind !== 'match') expect(d.sessions).toEqual(['rest', 'rest', null]);
    expect(nearestPreset(w)).toBe('fullRest');
    expect(weekWorkload(w)).toBeNull();
    expect(buildTrainingWeek({ method: 'freedom', monday: MONDAY, phase: 'B', week: 1, matchDays: [2, 5] }).congested).toBe(false);
  });

  it('variantes offensives et défensives selon le style', () => {
    const att = buildTrainingWeek({ method: 'freedom', monday: MONDAY, phase: 'A', week: 3, matchDays: [], style: 'wings' });
    expect(att.days.some((d) => d.sessions.includes('attackingWings'))).toBe(true);
    const def = buildTrainingWeek({ method: 'freedom', monday: MONDAY, phase: 'A', week: 2, matchDays: [], style: 'gegenpress' });
    expect(def.days.some((d) => d.sessions.includes('defendingEngaged'))).toBe(true);
  });

  it('présaison : P1 et P2 uniquement physiques', () => {
    for (const week of [1, 2] as const) {
      const w = buildTrainingWeek({ method: 'freedom', monday: MONDAY, phase: 'P', week, matchDays: [] });
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

describe('club semi-professionnel', () => {
  it('ne s’entraîne que les jours choisis ; la dernière séance avant le match sert de préparation', () => {
    const w = buildTrainingWeek({ method: 'freedom', monday: MONDAY, phase: 'B', week: 1, matchDays: [5], trainingDays: [1, 3], priorities: ['passingStyle'] });
    expect(w.days.map((d) => d.kind)).toEqual(['off', 'dev', 'off', 'prep', 'off', 'match', 'off']);
    for (const d of w.days.filter((x) => x.kind === 'off')) expect(d.sessions).toEqual([null, null, null]);
    expect(sessionCategory(w.days[3]!.sessions[0]!)).toBe('matchPrep');
    expect(w.days.some((d) => d.sessions.includes('passingStyle'))).toBe(true);
  });

  it('séance le lendemain d’un match = récupération', () => {
    const w = buildTrainingWeek({ method: 'freedom', monday: MONDAY, phase: 'A', week: 1, matchDays: [2, 5], trainingDays: [1, 3] });
    expect(w.days.map((d) => d.kind)).toEqual(['off', 'prep', 'match', 'recovery', 'off', 'match', 'off']);
  });
});

describe('programme du jeu et entraînement individuel', () => {
  it('propose le programme prédéfini le plus proche', () => {
    const at = (phase: 'P' | 'T' | 'A' | 'B' | 'C', week: 1 | 2 | 3 | 4, days: number[]) => nearestPreset(buildTrainingWeek({ method: 'freedom', monday: MONDAY, phase, week, matchDays: days }));
    expect(at('P', 1, [])).toBe('preSeason');
    expect(at('A', 1, [2, 5])).toBe('congestion');
    expect(at('A', 1, [5])).toBe('devIP');
    expect(at('A', 2, [5])).toBe('devOOP');
    expect(at('T', 4, [2])).toBe('tacticalBalanced');
    expect(at('B', 1, [5])).toBe('mix');
    expect(at('C', 1, [5])).toBe('match');
  });

  it('règle l’intensité individuelle selon l’état du joueur', () => {
    expect(individualAdvice({ age: 25, condition: 95, sharpness: 90, injury: 'Entorse' }).intensity).toBe('team');
    expect(individualAdvice({ age: 25, condition: 75, sharpness: 90, injury: null })).toEqual({ intensity: 'team', reason: 'veryTired', rusty: false });
    expect(individualAdvice({ age: 19, condition: 98, sharpness: 50, injury: null })).toEqual({ intensity: 'team', reason: 'young', rusty: true });
    expect(individualAdvice({ age: 19, condition: 85, sharpness: 90, injury: null }).intensity).toBe('team');
    expect(individualAdvice({ age: 19, condition: 98, sharpness: 90, injury: null }, { matches: 2 }).intensity).toBe('team');
    expect(individualAdvice({ age: 33, condition: 98, sharpness: 90, injury: null }).intensity).toBe('team');
    expect(individualAdvice({ age: 26, condition: 98, sharpness: 90, injury: null }).intensity).toBe('team');
  });

  it('choisit la priorité individuelle qui travaille l’attribut le plus faible', () => {
    expect(individualFocus([{ key: 'Kicking' }], true)).toBe('gkDistribution');
    expect(individualFocus([{ key: 'Positioning' }, { key: 'Tackling' }], false)).toBe('defensivePositioning');
    expect(individualFocus([{ key: 'Leadership' }, { key: 'Pace' }], false)).toBe('quickness');
    expect(individualFocus([{ key: 'Reflexes' }], false)).toBeNull();
  });
});

describe('groupes d’encadrement', () => {
  const pl = (id: string, age: number, line: string, personality: string | null, hierarchy: string | null = null, det = 10) => ({
    id,
    name: id,
    age,
    line,
    level: 10,
    personality,
    hierarchy,
    attributes: { Determination: det },
  });

  it('associe les jeunes à des tuteurs expérimentés à la bonne personnalité, du même secteur', () => {
    const m = mentoringGroups([
      pl('vieuxDef', 30, 'DEF', 'Professionnel modèle', 'Leader de l’équipe'),
      pl('vieuxAtt', 27, 'ATT', 'Résolu', 'Joueur influent'),
      pl('caractere', 29, 'MIL', 'Tempéramental', 'Joueur influent'),
      pl('jeuneDef', 19, 'DEF', 'Équilibré'),
      pl('jeuneAtt', 20, 'ATT', 'Peu ambitieux'),
    ]);
    expect(m.groups.map((g) => [g.mentor.id, g.mentees.map((x) => x.id)])).toEqual([
      ['vieuxDef', ['jeuneDef']],
      ['vieuxAtt', ['jeuneAtt']],
    ]);
    expect(m.avoid.map((x) => x.id)).toEqual(['caractere']);
  });

  it('groupes de 3 joueurs au plus, tuteur compris', () => {
    const m = mentoringGroups([
      pl('tuteur', 30, 'DEF', 'Professionnel modèle', 'Leader de l’équipe'),
      pl('j1', 18, 'DEF', 'Équilibré'),
      pl('j2', 19, 'DEF', 'Équilibré'),
      pl('j3', 20, 'DEF', 'Équilibré'),
    ]);
    expect(m.groups[0]!.mentees).toHaveLength(2);
    expect(m.unassigned).toHaveLength(1);
  });

  it('classe les personnalités, les défavorables avant les favorables', () => {
    expect(personalityTone('Peu professionnel')).toBe('bad');
    expect(personalityTone('Très professionnel')).toBe('good');
    expect(personalityTone('Équilibré')).toBe('neutral');
  });
});

describe('semaine courante et alertes', () => {
  it('construit la semaine d’après le calendrier du jeu', () => {
    const w = currentTrainingWeek({ gameDate: '2026-09-03', seasonStart: 8, fixtures: [{ date: '2026-09-05' }] });
    expect(w.code).toBe('A2-1');
    expect(w.days[5]!.kind).toBe('match');
  });

  it('liste les joueurs en manque de rythme', () => {
    const a = trainingAlerts([
      { injury: null, age: 25, condition: 70, sharpness: 90 },
      { injury: null, age: 25, condition: 95, sharpness: 50 },
      { injury: 'x', age: 25, condition: 50, sharpness: 20 },
    ]);
    expect(a.rusty).toHaveLength(1);
  });
});

describe('réglages faits en jeu', () => {
  const rec = { ip: 'a', oop: 'b', focus: 'pressing', intensity: 'normal' as const };
  it('signale un joueur jamais réglé, à jour ou à changer', () => {
    expect(setupStatus(rec, undefined).status).toBe('todo');
    expect(setupStatus(rec, { ...rec }).status).toBe('ok');
    const c = setupStatus(rec, { ...rec, intensity: 'double', focus: 'tackling' });
    expect(c.status).toBe('change');
    expect(c.changed).toEqual(['focus', 'intensity']);
  });
});

describe('trêve hivernale', () => {
  const wb = { from: '12-21', to: '02-08' };
  it('repos complet puis mini-présaison terminée par P4 avant la reprise', () => {
    expect(breakPhase('2026-12-15', wb)).toBeNull();
    expect(breakPhase('2026-12-22', wb)?.phase).toBe('R');
    expect(breakPhase('2027-01-04', wb)?.phase).toBe('R');
    expect(breakPhase('2027-01-11', wb)).toEqual({ phase: 'P', week: 1 });
    expect(breakPhase('2027-02-01', wb)).toEqual({ phase: 'P', week: 4 });
    expect(breakPhase('2027-02-08', wb)).toBeNull();
    expect(autoPhase('2027-01-18', 7, wb).phase).toBe('P');
    expect(autoPhase('2027-02-10', 7, wb).phase).toBe('C');
  });
  it('semaine de repos : aucune séance, programme « Semaine complète de repos »', () => {
    const w = buildTrainingWeek({ method: 'freedom', monday: '2026-12-28', phase: 'R', week: 1, matchDays: [] });
    expect(w.days.every((d) => d.kind === 'off' && d.sessions.every((x) => x === null))).toBe(true);
    expect(nearestPreset(w)).toBe('fullRest');
  });
});

describe('semaines à venir', () => {
  it('priorité du calendrier et charge pour chaque semaine, trêve comprise', () => {
    const fixtures = [{ date: '2026-12-16' }, { date: '2026-12-19' }];
    const weeks = upcomingWeeks({ gameDate: '2026-12-15', fixtures, seasonStart: 7, winterBreak: { from: '12-28', to: '02-08' } }, 4);
    expect(weeks.map((w) => w.monday)).toEqual(['2026-12-14', '2026-12-21', '2026-12-28', '2027-01-04']);
    expect(weeks[0]).toMatchObject({ matches: 2, preset: 'congestion', workload: 'light' });
    expect(weeks[2]).toMatchObject({ preset: 'fullRest', workload: null });
    // Au-delà du dernier match connu : match supposé le samedi.
    expect(weekWorkload(weeks[1]!.plan)).toBe('medium');
  });
});

describe('méthode « Méta efficacité 1.1 » (AlexJeuVideal)', () => {
  const sess = (w: ReturnType<typeof buildTrainingWeek>) => w.days.map((d) => d.sessions.join(','));
  it('reproduit le programme « 06 - Dim - Sam » : repos, bloc 1, bloc 2, veille, match, repos', () => {
    const w = buildTrainingWeek({ monday: MONDAY, phase: 'A', week: 1, matchDays: [5], matchBeforeMonday: true });
    expect(sess(w)).toEqual([
      'rest,rest,rest',
      'rest,rest,rest',
      'pressingTrap,lineOfEngagement,buildUpStrategy',
      'pressingTrap,chanceCreation,inPossessionShape',
      'ballProgression,defensiveBlock,conditioning',
      'rest,match,rest',
      'rest,rest,rest',
    ]);
  });

  it('reproduit « 01 - Dim - Mer - Sam » : un seul jour libre pour les blocs, veille du dernier match', () => {
    const w = buildTrainingWeek({ monday: MONDAY, phase: 'B', week: 2, matchDays: [2, 5], matchBeforeMonday: true });
    expect(sess(w)).toEqual([
      'rest,rest,rest',
      'pressingTrap,lineOfEngagement,buildUpStrategy',
      'rest,match,rest',
      'rest,rest,rest',
      'ballProgression,defensiveBlock,conditioning',
      'rest,match,rest',
      'rest,rest,rest',
    ]);
    const all = w.days.flatMap((d) => d.sessions);
    expect(all).not.toContain('passingStyle');
    expect(all).not.toContain('pressingIntensity');
  });

  it('la méthode Freedom reste disponible', () => {
    const w = buildTrainingWeek({ monday: MONDAY, phase: 'A', week: 1, matchDays: [5], method: 'freedom' });
    expect(w.theme).toBe('buildUp');
  });

  it('trouve le programme .fmf à charger', async () => {
    const { metaProgramme } = await import('../src');
    expect(metaProgramme([5], 6)).toBe('06 - Dim - Sam');
    expect(metaProgramme([5])).toBe('19 - Sam - Sam');
    expect(metaProgramme([1, 4], 4)).toBe('27 - Ven - Mar - Ven');
    expect(metaProgramme([0])).toBe('33 - Lun - Lun');
    expect(metaProgramme([0, 6])).toBe('36 - Lun - Dim');
    expect(metaProgramme([3, 6], 6)?.trim()).toBe('04 - Dim - Jeu - Dim');
    expect(metaProgramme([1, 3, 5])).toBeNull();
  });
});

describe('méthode Méta : semaine sans match', () => {
  it('place les deux blocs et la séance de veille sur les derniers jours', () => {
    const w = buildTrainingWeek({ monday: MONDAY, phase: 'C', week: 1, matchDays: [] });
    expect(w.days.slice(4).map((d) => d.sessions[0])).toEqual(['pressingTrap', 'pressingTrap', 'ballProgression']);
  });
});
