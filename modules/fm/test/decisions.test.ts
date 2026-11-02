import { describe, expect, it } from 'vitest';
import { decisions, mergeReference, rankTactics, TacticEngine } from '../src';
import { normalizePlayer } from '../src/player';

const ATTRS = ['Passing', 'FirstTouch', 'Technique', 'Composure', 'Vision', 'Decisions', 'Teamwork', 'WorkRate', 'Stamina', 'Strength', 'Pace', 'Acceleration', 'Tackling', 'Marking', 'Positioning', 'Anticipation', 'Heading', 'JumpingReach', 'Finishing', 'Movement', 'Crossing', 'Dribbling', 'Flair', 'Concentration', 'Agility', 'Aggression', 'Reflexes', 'Handling', 'OneOnOnes', 'AerialReach', 'CommandOfArea', 'Kicking', 'RushingOut'];
const p = (id: number, positions: string, base: number, extra: Record<string, unknown> = {}) =>
  normalizePlayer({ id, name: `J${id}`, positions, age: 26, contractEnd: '2029-06-30', value: 100_000, wage: 1000, attributes: Object.fromEntries(ATTRS.map((k) => [k, base])), ...extra });

const engine = new TacticEngine(mergeReference(undefined));
const eleven = [p(1, 'GB', 12), p(2, 'D (D)', 12), p(3, 'D (C)', 13), p(4, 'D (C)', 13), p(5, 'D (G)', 12), p(6, 'MD (C)', 13), p(7, 'M (C)', 13), p(8, 'M (C)', 13), p(9, 'MO (D)', 13), p(10, 'MO (G)', 13), p(11, 'BT', 13)];
const DATE = '2027-02-14';

describe('aide à la décision', () => {
  it('met en premier le contrat à trancher, avec sa raison et son échéance', () => {
    const squad = [...eleven.slice(0, 10), p(11, 'BT', 13, { age: 24, contractEnd: '2027-06-30' })];
    const list = decisions(engine, squad, DATE, { style: 'possession' });
    const first = list[0]!;
    expect(first.kind).toBe('contract');
    expect(first.action).toBe('extend');
    expect(first.players.map((x) => x.id)).toEqual(['11']);
    expect(first.deadline).toBe('2027-06-30');
    expect(first.why).toBe('starter');
    // Triées par échéance.
    const dated = list.filter((d) => d.deadline).map((d) => d.deadline!);
    expect(dated).toEqual([...dated].sort());
  });

  it('dit de garder la tactique jouée quand une autre ne gagne pas assez', () => {
    const ranked = rankTactics(engine, eleven);
    const other = ranked[1]!.style;
    const list = decisions(engine, eleven, DATE, {}, [], other);
    const tac = list.find((d) => d.kind === 'tactic');
    if (ranked[0]!.fit - ranked[1]!.fit < 1) {
      expect(tac?.action).toBe('keepTactic');
      expect(tac?.style?.id).toBe(other.id);
      expect(tac?.unless).toBe('bigGain');
    } else expect(tac?.action).toBe('changeTactic');
  });

  it('demande de recruter un poste du projet que personne ne tient', () => {
    const list = decisions(engine, eleven.filter((x) => x.id !== '1'), DATE, { style: 'possession' });
    expect(list.some((d) => d.kind === 'recruit' && d.pos === 'GB' && d.why === 'emptySlot')).toBe(true);
  });
});
