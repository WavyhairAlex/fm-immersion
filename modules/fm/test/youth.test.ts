import { describe, expect, it } from 'vitest';
import { buildProject, mergeReference, TacticEngine, firstTeamBar, youthStatus, youthTeams, youthWeek } from '../src';
import { normalizePlayer } from '../src/player';

const ATTRS = ['Passing', 'FirstTouch', 'Technique', 'Composure', 'Vision', 'Decisions', 'Teamwork', 'WorkRate', 'Stamina', 'Strength', 'Pace', 'Acceleration', 'Tackling', 'Marking', 'Positioning', 'Anticipation', 'Heading', 'JumpingReach', 'Finishing', 'Movement', 'Crossing', 'Dribbling', 'Flair', 'Concentration', 'Agility', 'Aggression', 'Reflexes', 'Handling', 'OneOnOnes', 'AerialReach', 'CommandOfArea', 'Kicking', 'RushingOut'];
const p = (id: number, positions: string, base: number, extra: Record<string, unknown> = {}) =>
  normalizePlayer({ id, name: `J${id}`, positions, age: 18, attributes: Object.fromEntries(ATTRS.map((k) => [k, base])), ...extra });
const engine = new TacticEngine(mergeReference(undefined));

describe('jeunes et équipe B', () => {
  it('statut : au niveau, prêt, faible potentiel, à développer', () => {
    expect(youthStatus({ age: 18, stars: { potential: 4 } }, 11, 11)).toBe('promote');
    expect(youthStatus({ age: 18, stars: { potential: 4 } }, 10.2, 11)).toBe('promote');
    expect(youthStatus({ age: 20, stars: { potential: 3.5 } }, 8, 11)).toBe('loan');
    expect(youthStatus({ age: 21, stars: { potential: 2 } }, 8, 11)).toBe('low');
    expect(youthStatus({ age: 17, stars: { potential: 2 } }, 8, 11)).toBe('develop');
    expect(youthStatus({ age: 19, stars: null }, null, 11)).toBe('develop');
  });

  it('range les joueurs par équipe, les plus prêts d’abord', () => {
    const reserve = [
      p(1, 'MC', 8, { team: 'Malženice U19' }),
      p(2, 'MC', 14, { team: 'Malženice U19' }),
      p(3, 'BT', 9, { team: 'Malženice II', age: 20 }),
      p(4, 'DC', 9, { team: null }),
    ];
    const pr = buildProject(engine, reserve, { style: 'possession', target: 55 })!;
    const teams = youthTeams(pr.plans, pr.threshold);
    expect(teams.map((t) => t.team)).toEqual(['Malženice II', 'Malženice U19']);
    const u19 = teams[1]!;
    expect(u19.rows[0]!.plan.player.id).toBe('2');
    expect(u19.rows[0]!.status).toBe('promote');
    expect(u19.counts.promote + u19.counts.develop).toBe(2);
    // Moins de 23 ans, joueur de champ : priorité individuelle mesurée (vitesse).
    expect(u19.rows[1]!.focus).toBe('quickness');
  });

  it('repère de l’équipe première : adéquation médiane des titulaires', () => {
    expect(firstTeamBar([{ fit: 12, player: {} }, { fit: 10, player: {} }, { fit: 14, player: {} }, { fit: null, player: {} }, { fit: 20, player: null }])).toBe(12);
    expect(firstTeamBar([{ fit: 12, player: {} }, { fit: 10, player: {} }])).toBe(11);
    expect(firstTeamBar([])).toBeNull();
  });

  it('semaine type orientée progression, match supposé le samedi', () => {
    const w = youthWeek({ gameDate: '2027-10-06', seasonStart: 7 });
    expect(w.plan.days[5]!.kind).toBe('match');
    const grow = w.plan.days.flatMap((d) => d.why ?? []).filter((x) => x === 'grow' || x === 'noCondition' || x === 'indiv').length;
    const tactical = w.plan.days.flatMap((d) => d.why ?? []).filter((x) => x === 'weak' || x === 'top').length;
    expect(grow).toBeGreaterThan(tactical);
    expect(w.workload).toBe('medium');
  });
});
