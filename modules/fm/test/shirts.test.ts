import { describe, expect, it } from 'vitest';
import { FORMATIONS, shirtNumbers, slotNumbers, type FmPlayer, type FormationPlan } from '../src';

const pl = (id: string, line: string, level = 12, pos = 'MC') => ({ id, name: id, line, level, positions: [pos] }) as unknown as FmPlayer;
const slots = (form: string) => FORMATIONS[form]!.map(([pos, x, y]) => ({ pos, x, y }));
const plan = (form: string, who: (FmPlayer | null)[]) =>
  ({ form, slots: slots(form).map((s, i) => ({ ...s, ip: '', oop: '', fit: 12, player: who[i] ?? null })), subs: [], score: 12, fit: 12, penalty: 0, holes: 0 }) as unknown as FormationPlan;

describe('numéros de maillot', () => {
  it('donne les numéros classiques selon le poste', () => {
    const n = (form: string) => Object.fromEntries(slots(form).map((s, i) => [`${s.pos}@${s.x}`, slotNumbers(slots(form))[i]]));
    expect(n('4-3-3')).toMatchObject({ 'GB@50': 1, 'DD@85': 2, 'DG@15': 3, 'MDF@50': 6, 'BT@50': 9, 'MOD@85': 7, 'MOG@15': 11 });
    const n442 = slots('4-4-2').map((s, i) => [s.pos, slotNumbers(slots('4-4-2'))[i]]);
    expect(n442.filter(([p]) => p === 'BT').map(([, k]) => k).sort()).toEqual([10, 9]);
    expect(n442.filter(([p]) => p === 'DC').map(([, k]) => k).sort()).toEqual([4, 5]);
    // Tous les schémas : 1 à 11, chacun une fois.
    for (const f of Object.keys(FORMATIONS)) expect([...slotNumbers(slots(f))].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('titulaires 1-11, doublures +10, gardien remplaçant 30, reste à partir de 22 par ligne', () => {
    const a = slots('4-3-3').map((s, i) => pl(`a${i}`, s.pos === 'GB' ? 'GB' : 'MIL'));
    const b = slots('4-3-3').map((s, i) => pl(`b${i}`, s.pos === 'GB' ? 'GB' : 'MIL'));
    const rest = [pl('att', 'ATT', 10, 'BT'), pl('def', 'DEF', 11, 'DC'), pl('gk3', 'GB', 9, 'GB'), pl('def2', 'DEF', 14, 'DD')];
    const out = shirtNumbers(plan('4-3-3', a), plan('4-3-3', b.slice(0, 10)), [...a, ...b, ...rest]);
    const of = (id: string) => out.find((x) => x.player.id === id)?.number;
    expect(of('a0')).toBe(1);
    expect(of('b0')).toBe(30);
    expect(of('b4')).toBe(12); // doublure du DD (2)
    expect(of('b10')).toBe(24); // pas de place dans B : reste de l'effectif, après les défenseurs
    expect(of('gk3')).toBe(40);
    expect([of('def2'), of('def'), of('att')]).toEqual([22, 23, 25]);
    expect(new Set(out.map((x) => x.number)).size).toBe(out.length);
    expect(out).toHaveLength(a.length + b.length + rest.length);
  });
});
