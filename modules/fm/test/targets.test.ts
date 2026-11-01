import { describe, expect, it } from 'vitest';
import { addBaseTarget, baseTarget, mergeTargets, squadSnapshot, targetOf, trialistIds, shortlist, storedTargets, type TargetRecord } from '../src/targets';
import type { FmSnapshot } from '../src/snapshot';

const snap = (gameDate: string, shortlist?: unknown[]): FmSnapshot => ({ schema: 'archivix/1', game: 'FM27', club: 'V', gameDate, players: [], ...(shortlist ? { shortlist } : {}) });
const cible = {
  id: 2001,
  name: 'Lucas Berg',
  age: 20,
  positionsText: 'M (C), MO (C)',
  club: 'IK Oddevold',
  attributes: { Passing: { min: 12, max: 15 }, Vision: 13 },
  scout: { knowledge: 72, scoutCurrentStars: { MinValue: 8, MaxValue: 10 }, scoutPotentialStars: { MinValue: 14, MaxValue: 16 }, recommendationText: 'Bonne recrue', minValue: 20000, maxValue: 45000 },
  sources: ['listeSuivi', 'cibles'],
};

describe('cibles du mercato', () => {
  it("normalise une cible du plugin comme un joueur de l'effectif, avec l'avis du recrutement", () => {
    const [t] = shortlist(snap('2026-09-01', [cible]));
    expect(t).toMatchObject({ id: 't2001', name: 'Lucas Berg', club: 'IK Oddevold', positions: ['MC', 'MOC'], sources: ['listeSuivi', 'cibles'] });
    expect(t!.attributes).toEqual({ Passing: 13.5, Vision: 13 });
    expect(t!.scout).toMatchObject({ knowledge: 72, recommendation: 'Bonne recrue', value: { min: 20000, max: 45000, mid: 32500 } });
    expect(t!.stars).toEqual({ current: 2.5, potential: 4 });
  });

  it("n'écrit rien quand l'instantané n'a pas de cibles", () => {
    expect(mergeTargets([], snap('2026-09-01'))).toBeNull();
  });

  it('suit les entrées, les sorties de liste, et ignore un instantané plus ancien', () => {
    const first = mergeTargets([], snap('2026-09-01', [cible]))!;
    expect(first.map((r) => [r.playerId, r.firstSeen, r.lastSeen, r.inList])).toEqual([['2001', '2026-09-01', '2026-09-01', true]]);
    const known: TargetRecord[] = first.map((r) => ({ ...r, dismissed: true }));

    const later = mergeTargets(known, snap('2026-09-10', [{ ...cible, club: 'GAIS' }]))!;
    expect(later[0]).toMatchObject({ firstSeen: '2026-09-01', lastSeen: '2026-09-10', club: 'GAIS', dismissed: true });

    const gone = mergeTargets(later, snap('2026-09-12', []))!;
    expect(gone[0]).toMatchObject({ inList: false, lastSeen: '2026-09-10' });

    expect(mergeTargets(later, snap('2026-09-05', []))).toEqual([]);
    expect(storedTargets(gone)[0]).toMatchObject({ id: 't2001', inList: false, dismissed: true, club: 'GAIS' });
  });
});

describe('cibles non observées', () => {
  it('traite les étoiles -1 comme inconnues', () => {
    const t = targetOf({ id: 9, name: 'X', attributes: {}, scout: { currentStars: { MinValue: -1, MaxValue: -1 }, potentialStars: -1 } });
    expect(t?.scout?.stars).toBeNull();
  });
});

describe("joueurs à l'essai", () => {
  const sous = { id: 1, name: 'Sous Contrat', positionsText: 'BT', contractEnd: '2027-06-30', wage: 1500, squadStatus: 'Joueur secondaire', attributes: { Finishing: 12 } };
  const essai = { id: 2, name: 'À Essai', positionsText: 'MO (C)', contractEnd: null, wage: null, squadStatus: '-', attributes: { Passing: 14 } };
  const base = (players: unknown[], shortlist?: unknown[]) => ({ ...snap('2026-11-26', shortlist), players }) as FmSnapshot;

  it("sort de l'effectif les joueurs sans contrat et les range dans les cibles", () => {
    const s = base([sous, essai]);
    expect([...trialistIds(s)]).toEqual(['2']);
    expect(squadSnapshot(s).players.map((p) => p.id)).toEqual([1]);
    const [t] = shortlist(s);
    expect(t).toMatchObject({ id: 't2', name: 'À Essai', club: null, sources: ['essai'] });
  });

  it('ne prend pas tout un vieil instantané sans contrats pour des essais', () => {
    const s = base([{ id: 3, name: 'A', attributes: {} }, { id: 4, name: 'B', attributes: {} }]);
    expect(trialistIds(s).size).toBe(0);
    expect(mergeTargets([], s)).toBeNull();
  });

  it("marque hors liste un essai terminé, même sans listes lues, sans toucher aux autres cibles", () => {
    const first = mergeTargets([], base([sous, essai]))!;
    const known: TargetRecord[] = [...first, { playerId: '9', name: 'Liste', club: 'X', firstSeen: '2026-11-01', lastSeen: '2026-11-01', inList: true, dismissed: false, data: { ...cible, id: 9 } }];
    const next = mergeTargets(known, base([sous, { ...essai, contractEnd: '2027-06-30', wage: 800, squadStatus: 'Espoir' }, { ...essai, id: 5 }]))!;
    expect(next.find((r) => r.playerId === '2')).toMatchObject({ inList: false });
    expect(next.find((r) => r.playerId === '9')).toBeUndefined();
    expect(next.find((r) => r.playerId === '5')).toMatchObject({ inList: true });
  });
});

describe('avis du recrutement lu en profond (plugin 0.4.4)', () => {
  it('lit la connaissance sur 5 et les salaires affichés', () => {
    const t = targetOf({
      id: 7,
      name: 'Martin Boda',
      attributes: {},
      scout: {
        knowledge: { ActualValue: 5, MaxValue: 5, Text: 'Grandes connaissances' },
        minWage: { SortValue: 639, DisplayValue: '3,22K € p/m' },
        maxWage: { SortValue: 850, DisplayValue: '4,28K € p/m' },
        minValue: '3,62K €',
        maxValue: '3,62K €',
      },
    });
    expect(t?.scout).toMatchObject({ knowledge: 100, knowledgeText: 'Grandes connaissances', wage: { min: 3220, max: 4280 }, value: { min: 3620, max: 3620 } });
  });

  it("ignore le nom de type renvoyé par l'ancien plugin", () => {
    const t = targetOf({ id: 8, name: 'X', attributes: {}, scout: { knowledge: 'SI.Bindable.DynamicReference', minWage: 'SI.Bindable.DynamicReference' } });
    expect(t?.scout).toMatchObject({ knowledge: null, wage: null });
  });
});

describe('cibles venues de la base du jeu', () => {
  const db = {
    id: 3001,
    name: 'Ľuboš Šarmír',
    age: 22,
    birthDate: '2004-03-01',
    club: 'MFK Skalica',
    clubShort: 'Skalica',
    loanClub: null,
    loanEnd: null,
    ca: 110,
    pa: 140,
    positionsText: 'MC, MOC',
    positionRatings: { MC: 20, MOC: 16, BT: 8 },
    attributes: { Passing: 14, Vision: 15 },
    wageWeekly: 900,
    contractEnd: '2027-06-30',
    valueRaw: 250000,
  };

  it('normalise un joueur de la base comme une cible', () => {
    const t = baseTarget(db)!;
    expect(t).toMatchObject({ id: 't3001', name: 'Ľuboš Šarmír', club: 'MFK Skalica', positions: ['MC', 'MOC'], sources: ['base'] });
    expect(t.familiarity).toMatchObject({ MC: 20, MOC: 16, BT: 8 });
  });

  it("l'ajoute en liste et ne la fait pas sortir quand le jeu ne la liste pas", () => {
    const rec = addBaseTarget([], db, '2026-12-02');
    expect(rec).toMatchObject({ playerId: '3001', inList: true, dismissed: false, firstSeen: '2026-12-02' });
    expect(mergeTargets([rec], snap('2026-12-05', []))).toEqual([]);
  });

  it('garde la marque « base » quand le jeu la liste aussi, et reprend une cible écartée', () => {
    const rec = { ...addBaseTarget([], db, '2026-12-02'), dismissed: true };
    const [merged] = mergeTargets([rec], snap('2026-12-05', [{ ...cible, id: 3001, name: 'Ľuboš Šarmír' }]))!;
    expect((merged!.data as { sources: string[] }).sources).toEqual(['listeSuivi', 'cibles', 'base']);
    expect(addBaseTarget([merged!], db, '2026-12-06')).toMatchObject({ dismissed: false, inList: true, firstSeen: '2026-12-02' });
  });
});

describe('valeurs inconnues du recrutement', () => {
  it('ignore « - », -1 € et le texte « Observation nécessaire » pour un joueur connu', () => {
    const t = targetOf({
      id: 11,
      name: 'Y',
      attributes: {},
      scout: {
        knowledge: { ActualValue: 5, MaxValue: 5, Text: 'Grandes connaissances' },
        minWage: { SortValue: 2147483647, DisplayValue: '-' },
        maxWage: { SortValue: 2147483647, DisplayValue: '-' },
        minValue: '-1 €',
        maxValue: '-1 €',
        recommendationText: 'Observation nécessaire',
      },
    });
    expect(t?.scout).toMatchObject({ wage: null, value: null, recommendation: null });
  });
});
