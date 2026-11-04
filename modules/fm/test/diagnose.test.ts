import { describe, expect, it } from 'vitest';
import { diagnoseLineup, mergeReference, rankTactics, ratingsByPlayer, TacticEngine } from '../src';
import { normalizePlayer } from '../src/player';

const ATTRS = ['Passing', 'FirstTouch', 'Technique', 'Composure', 'Vision', 'Decisions', 'Teamwork', 'WorkRate', 'Stamina', 'Strength', 'Pace', 'Acceleration', 'Tackling', 'Marking', 'Positioning', 'Anticipation', 'Heading', 'JumpingReach', 'Finishing', 'Movement', 'Crossing', 'Dribbling', 'Flair', 'Concentration', 'Agility', 'Aggression', 'Reflexes', 'Handling', 'OneOnOnes', 'AerialReach', 'CommandOfArea', 'Kicking', 'RushingOut'];
const p = (id: number, positions: string, base: number, extra: Record<string, unknown> = {}) =>
  normalizePlayer({ id, name: `J${id}`, positions, age: 26, apps: 10, avgRating: 7, attributes: Object.fromEntries(ATTRS.map((k) => [k, base])), ...extra });

const engine = new TacticEngine(mergeReference(undefined));

describe('pourquoi un joueur ne performe pas à son poste', () => {
  it('signale le titulaire sous la moyenne et ses causes (attributs du rôle, forme, mieux sur le banc)', () => {
    const squad = [
      p(1, 'GB', 13), p(2, 'D (D)', 13), p(3, 'D (C)', 13), p(4, 'D (C)', 13), p(5, 'D (G)', 13), p(6, 'MD (C)', 13),
      p(7, 'M (C)', 13), p(8, 'M (C)', 13), p(9, 'MO (D)', 13), p(10, 'MO (G)', 13), p(11, 'BT', 13),
      p(12, 'BT', 15),
    ];
    const plan = rankTactics(engine, squad)[0]!.plans[0]!;
    // L'attaquant titulaire est remplacé par un joueur faible, fatigué et sans moral ; l'autre reste sur le banc.
    const st = plan.slots.findIndex((s) => s.player?.id === '12');
    expect(st).toBeGreaterThanOrEqual(0);
    const weak = p(99, 'BT', 9, { condition: 78, morale: 'Catastrophique' });
    plan.slots[st] = { ...plan.slots[st]!, player: weak, fit: 6 };
    const ratings = ratingsByPlayer([{ players: [{ id: '99', rating: 6.2, started: true }] }]);
    const d = diagnoseLineup(engine, plan, [...squad, weak], { ratings }).find((x) => x.player.id === '99')!;
    expect(d.under).toBe(true);
    expect(d.ratedMatches).toBe(1);
    const kinds = d.reasons.map((r) => r.kind);
    expect(kinds).toContain('keyAttrs');
    expect(kinds).toContain('condition');
    expect(kinds).toContain('morale');
    expect(kinds).toContain('better');
  });

  it('un titulaire dans la moyenne n’est pas signalé', () => {
    const squad = [p(1, 'GB', 13), p(2, 'D (D)', 13), p(3, 'D (C)', 13), p(4, 'D (C)', 13), p(5, 'D (G)', 13), p(6, 'MD (C)', 13), p(7, 'M (C)', 13), p(8, 'M (C)', 13), p(9, 'MO (D)', 13), p(10, 'MO (G)', 13), p(11, 'BT', 13)];
    const plan = rankTactics(engine, squad)[0]!.plans[0]!;
    expect(diagnoseLineup(engine, plan, squad).some((d) => d.under)).toBe(false);
  });
});
