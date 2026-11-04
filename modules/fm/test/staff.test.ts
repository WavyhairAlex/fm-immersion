import { describe, expect, it } from 'vitest';
import { assignDomains, bestFreeAgents, domainScore, jobScore, staffCard, type DbStaff } from '../src';

const KEYS = ['Attacking', 'Defending', 'Possession', 'Technical', 'Tactical', 'Fitness', 'Goalkeeping', 'SetPieces', 'TacticalKnowledge', 'WorkingWithYoungsters', 'PeopleManagement', 'Determination', 'Authority', 'Motivating', 'JudgingPlayerAbility', 'JudgingPlayerPotential', 'JudgingStaffAbility', 'Negotiating', 'Physiotherapy', 'SportsScience', 'AnalysingData', 'Adaptability'];
const s = (id: number, base: number, over: Record<string, number> = {}, clubId: number | null = 1): DbStaff => ({
  id,
  name: `S${id}`,
  birthDate: null,
  age: 45,
  club: clubId ? 'Malženice' : null,
  clubId,
  nation: null,
  jobCode: null,
  wageWeekly: null,
  contractEnd: null,
  attributes: { ...Object.fromEntries(KEYS.map((k) => [k, base])), ...over },
});

describe('staff', () => {
  it('note un domaine : la note du domaine compte triple, plus les qualités de meneur', () => {
    const c = s(1, 10, { Attacking: 16, Determination: 14, Authority: 12, Motivating: 10 });
    expect(domainScore(c, 'Attacking')).toBe(14);
    expect(domainScore(c, 'Defending')).toBe(11);
    expect(jobScore(s(2, 10, { Physiotherapy: 18 }), 'physio')).toBe(16);
  });

  it('repère un membre du staff meilleur hors du terrain', () => {
    expect(staffCard(s(3, 8, { Physiotherapy: 19, SportsScience: 15 })).bestJob).toBe('physio');
    expect(staffCard(s(4, 10, { Defending: 17 })).bestJob).toBeNull();
    expect(staffCard(s(4, 10, { Defending: 17, Tactical: 15 })).best).toEqual(['Defending', 'Tactical']);
  });

  it('affecte chaque domaine au meilleur entraîneur, deux domaines au plus chacun', () => {
    const star = s(10, 10, { Attacking: 18, Possession: 17, Technical: 16 });
    const def = s(11, 10, { Defending: 15 });
    const r = assignDomains([star, def]);
    const by = Object.fromEntries(r.map((a) => [a.domain, a.coach?.id ?? null]));
    expect(by.Attacking).toBe(10);
    expect(by.Possession).toBe(10);
    // Déjà deux domaines pour le meilleur : la technique revient à l'autre entraîneur.
    expect(by.Technical).toBe(11);
    expect(by.Defending).toBe(11);
    // Plus personne de libre pour le reste.
    expect(r.filter((a) => a.coach == null).length).toBe(4);
    expect(r.find((a) => a.domain === 'Goalkeeping')!.weak).toBe(true);
  });

  it('propose le staff libre qui ferait mieux, et le classe', () => {
    const own = [s(20, 10)];
    const free = [s(30, 9, { Goalkeeping: 17 }, null), s(31, 9, { Goalkeeping: 13 }, null)];
    const gk = assignDomains(own, free).find((a) => a.domain === 'Goalkeeping')!;
    expect(gk.freeAgent?.staff.id).toBe(30);
    expect(bestFreeAgents(free, 'Goalkeeping', 1).map((x) => x.staff.id)).toEqual([30]);
  });
});
