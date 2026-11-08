import { describe, expect, it } from 'vitest';
import { isHighThreat, matchPlan, mergeReference, oppositionInstructions, styleOptions, weakFootOf, type FmPlayer, type FormationPlan, type OpponentReport } from '../src';

const styles = mergeReference(undefined).styles;
const possession = styles.find((s) => s.id === 'possession')!;
const player = (name: string, attrs: Record<string, number>) => ({ id: name, name, attributes: attrs, level: 10 }) as unknown as FmPlayer;
const plan = (form: string, slots: [string, FmPlayer | null][]) => ({ form, slots: slots.map(([pos, player]) => ({ pos, player, ip: '', oop: '', x: 50, y: 50, fit: null })) }) as unknown as FormationPlan;

// Nitra (capture du 07/11/2026) : 4-2-4 préféré, 4-4-2 2MD sans ballon, pressing équilibré, marquage individuel, mentalité prudente.
const nitra = {
  name: 'Nitra',
  manager: { name: 'Vladimír Kúkoľ', formation: '4-2-4 MD Jeu large', mentality: 'Prudent', pressing: 'Équilibrée', marking: 'Individuel' },
  scorer: { name: 'Michal Klec', value: 3 },
  assister: { name: 'Jonathan Stato', value: 2 },
  rated: { name: 'Michal Klec', value: 7.34 },
  squad: [
    { name: 'Michal Klec', positions: 'M/MO (C), BT (C)', stars: 19 },
    { name: 'Jonathan Stato', positions: 'MO (DGC)', stars: 17 },
  ],
  formations: {
    ip: [{ form: '4-2-3-1 MD MO Jeu large', pct: 70, minutes: 394, chances: 4, every: 98 }],
    oop: [{ form: '4-4-2 2MD', pct: 73, minutes: 345, chances: 6, every: 57 }],
  },
  advice: [],
} as unknown as OpponentReport;

describe('plan de match (réglages contre l’adversaire)', () => {
  it('lit les consignes que le style règle déjà', () => {
    const set = styleOptions(possession);
    expect(set.get(24)).toBe(0); // Jouer malgré le pressing
    expect(set.get(8)).toBe(2); // Pressing haut
  });

  it('axe fermé par deux milieux défensifs et bloc bas : largeur et ballon dans la surface, liberté contre le marquage individuel', () => {
    const p = matchPlan(possession, nitra, plan('4-3-3', [['MC', player('Rossi', { Marking: 14, Tackling: 13, Pace: 12 })], ['MDF', player('Bene', { Marking: 16, Tackling: 15, Pace: 11 })], ['DC', player('Horvath', { Marking: 15 })]]));
    const labels = p.team.map((a) => a.label);
    expect(labels).toContain('Plus large');
    expect(labels).toContain('Jouez sur les deux flancs');
    // Le style de possession joue déjà « Soyez plus expressifs » : rien à changer contre le marquage individuel.
    expect(labels).not.toContain('Soyez plus expressifs');
    expect(matchPlan(styles.find((s) => s.id === 'gegenpress')!, nitra, null).team.map((a) => a.label)).toContain('Soyez plus expressifs');
    // Idem pour « Jouer le ballon dans la surface » contre leur bloc bas : déjà dans le style, proposé à un style direct.
    expect(labels).not.toContain('Jouer le ballon dans la surface');
    expect(matchPlan(styles.find((s) => s.id === 'longball')!, nitra, null).team.map((a) => a.label)).toContain('Jouer le ballon dans la surface');
    expect(p.team.length).toBeLessThanOrEqual(4);
    expect(new Set(p.team.map((a) => a.title)).size).toBe(p.team.length);
    // Pas de mentalité changée : leur défense ne concède pas souvent (57 min) et la menace n'est pas connue.
    expect(p.mentality).toBeNull();
    // Le créateur (passeur) est pris par notre meilleur marqueur de l'axe ; le buteur (M/MO (C), même règle) par le
    // suivant : jamais le même homme sur deux adversaires.
    expect(p.marking.map((x) => [x.target, x.player])).toEqual([
      ['Jonathan Stato', 'Bene'],
      ['Michal Klec', 'Rossi'],
    ]);
    // Un seul joueur de l'axe : le second adversaire reste sans marqueur nommé plutôt que de doubler.
    const solo = matchPlan(possession, nitra, plan('4-3-3', [['MDF', player('Bene', { Marking: 16 })], ['DC', player('Horvath', { Marking: 15 })]]));
    expect(solo.marking.map((x) => x.player)).toEqual(['Bene', null]);
  });

  it('pressing haut adverse : contourner, plus direct, dans les espaces ; jamais une consigne que le style règle pareil', () => {
    const press = { ...nitra, manager: { ...nitra.manager, pressing: 'Plus souvent', marking: 'Zone', mentality: 'Offensive' } } as OpponentReport;
    const p = matchPlan(possession, press, plan('4-2-3-1', []));
    const labels = p.team.map((a) => a.label);
    expect(labels[0]).toBe('Contourner le pressing');
    expect(p.team[0]!.replaces).toBe('Jouer malgré le pressing');
    expect(labels).toContain('Faites plus de passes directes');
    expect(p.team.length).toBe(4);
    // Mentalité : « Positive » reste, car leur défense ne concède pas assez souvent.
    expect(p.mentality).toBeNull();
  });

  it('deux attaquants sans couverture dans notre schéma : la ligne recule', () => {
    const two = { ...nitra, manager: { ...nitra.manager, pressing: null, marking: null, mentality: null }, formations: { ip: [{ form: '4-4-2', pct: 100, minutes: 900, chances: 10, every: 90 }], oop: [] } } as unknown as OpponentReport;
    // Sans formation lue sans ballon, leur 4-4-2 vaut deux lignes de quatre : on joue dans l'axe.
    expect(matchPlan(possession, two, plan('4-4-2', [])).team.map((a) => a.label)).toEqual(['Ligne défensive plus basse', 'Rester plus bas', "Concentrez le jeu dans l'axe"]);
    expect(matchPlan(possession, two, plan('4-2-3-1', [])).team.map((a) => a.reason)).toEqual(['betweenLines']);
  });

  it('mentalité : un cran de plus contre une défense qui concède, un cran de moins face à plus fort', () => {
    const leaky = { ...nitra, formations: { ip: [], oop: [{ form: '4-4-2', pct: 100, minutes: 900, chances: 40, every: 22 }] } } as unknown as OpponentReport;
    expect(matchPlan(possession, leaky, null).mentality).toEqual({ from: 'Positive', to: 'Offensive', reason: 'leaky' });
    expect(matchPlan(possession, nitra, null, 'Élevé').mentality).toEqual({ from: 'Positive', to: 'Équilibrée', reason: 'threat' });
    expect(matchPlan(possession, leaky, null, 'Élevé').mentality).toBeNull();
    expect(isHighThreat('Faible')).toBe(false);
  });
});

describe('écran Adversaire du jeu (consignes sur leurs joueurs)', () => {
  const squad = [
    { name: 'Tomáš Lukošík', positions: 'GB', stars: 14, foot: 'Droit' },
    { name: 'Andrej Štrba', positions: 'D (C)', stars: 15, foot: 'Gauche' },
    { name: 'Manuel Yendare', positions: 'D (C)', stars: 17, foot: 'Droit' },
    { name: 'Daniel Prekop', positions: 'D (D)', stars: 16, foot: 'Droit' },
    { name: 'Michal Klec', positions: 'M/MO (C), BT (C)', stars: 19, foot: 'Les deux' },
    { name: 'Jonathan Stato', positions: 'MO (DGC)', stars: 17, foot: 'Gauche' },
  ];
  const opp = { ...nitra, squad } as OpponentReport;

  it('marquage strict sur les joueurs clés, pied faible et tacles doux sur le créateur qui joue devant', () => {
    const rows = oppositionInstructions(opp, possession);
    const stato = rows.find((r) => r.name === 'Jonathan Stato')!;
    expect(stato).toMatchObject({ marking: 'always', tackling: 'softer', weakFoot: 'right' });
    expect(stato.reasons).toEqual(['creator', 'weakFoot', 'softTackle']);
    const klec = rows.find((r) => r.name === 'Michal Klec')!;
    expect(klec).toMatchObject({ marking: 'always', weakFoot: null, tackling: null });
    expect(klec.reasons).toEqual(['scorer', 'rated']);
  });

  it('pressing haut : gardien et centraux pressés toujours ; sinon seulement les moins bien notés', () => {
    const high = oppositionInstructions(opp, possession).filter((r) => r.pressing === 'always').map((r) => r.name);
    expect(high).toEqual(['Tomáš Lukošík', 'Andrej Štrba', 'Manuel Yendare']);
    const low = oppositionInstructions(opp, styles.find((s) => s.id === 'ultra-def')!).filter((r) => r.pressing === 'always');
    expect(low.map((r) => r.name)).toEqual(['Tomáš Lukošík']);
    expect(low[0]!.reasons).toContain('pressWeak');
  });

  it('ne renvoie que les joueurs qui reçoivent une consigne', () => {
    expect(oppositionInstructions(opp, possession).some((r) => r.name === 'Daniel Prekop')).toBe(false);
    expect(weakFootOf('Droit uniquement')).toBe('left');
    expect(weakFootOf(null)).toBeNull();
  });
});
