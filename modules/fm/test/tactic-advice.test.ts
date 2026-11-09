import { describe, expect, it } from 'vitest';
import { bestTactic, DEFAULT_TACTIC_REFERENCE, effectiveness, formationOfSlots, gameText, normalizePlayer, rankTactics, rolePrint, tacticAdvice, tacticSlots, TacticEngine } from '../src';
import type { FmSnapshot } from '../src/snapshot';

// Onze postes au format du plugin 0.5.5 (TacticalPositionsCombined) : 4-3-3 avec un gardien relanceur.
const row = (pos: number, ip: number, oop: number) => ({ IPPosition: pos, IPRole: ip, OOPPosition: pos, OOPRole: oop, PlayerIndex: -1 });
const SUPPORT = 4194304;
// Poste en masque de bits, comme le jeu (relevé le 09/11/2026) : bit de côté pour un créneau axial décalé.
const RIGHT = 2 ** 20;
const LEFT = 2 ** 21;
const f433 = [
  row(1, 4096, 1), // GK, gardien relanceur
  row(4, 4, 512), // DR, latéral
  row(16 + RIGHT, 2, 8), // DCR
  row(16 + LEFT, 2, 8), // DCL
  row(8, 4, 512), // DL
  row(128, 16, 32768), // DMC
  row(1024 + RIGHT, 65536 + SUPPORT, 1048576), // MCR, box-to-box en soutien
  row(1024 + LEFT, 32, 1048576), // MCL
  row(2048, 128, 274877906944), // AMR, ailier
  row(4096, 128, 274877906944), // AML
  row(16384, 2048, 4398046511104), // ST, avant-centre
];

describe('postes de la tactique lus par le plugin', () => {
  it('traduit postes et rôles du jeu, mission ignorée', () => {
    const slots = tacticSlots({ positionsCombined: f433 })!;
    expect(slots).toHaveLength(11);
    expect(slots[0]).toEqual({ pos: 'GB', posOOP: 'GB', roleIP: 'BallPlayingGoalkeeper', roleOOP: 'OPGoalkeeper' });
    expect(slots[6]!.roleIP).toBe('BoxToBoxMidfielder');
    expect(slots[10]!.roleOOP).toBe('OPCentreForward');
    expect(formationOfSlots(slots)).toBe('4-3-3');
  });

  it('rien sans les onze postes (plugin avant 0.5.5 ou tactique vide)', () => {
    expect(tacticSlots({ name: '4-4-2' })).toBeNull();
    expect(tacticSlots({ positionsCombined: f433.slice(0, 5) })).toBeNull();
  });

  it('schéma le plus proche quand un seul poste diffère, rien au-delà', () => {
    const slots = tacticSlots({ positionsCombined: f433 })!;
    // Un ailier droit descendu milieu droit : toujours plus proche d'un schéma connu que d'aucun.
    expect(formationOfSlots(slots.map((s, i) => (i === 8 ? { ...s, pos: 'MD' as const } : s)))).not.toBeNull();
    const far = slots.map((s, i) => (i >= 6 ? { ...s, pos: 'BT' as const } : s));
    expect(formationOfSlots(far)).toBeNull();
  });
});

describe('conseils du jeu (efficacité tactique)', () => {
  it('lit un conseil par pilier et retire les liens du jeu', () => {
    const snap = {
      effectiveness: {
        overall: { min: 43, max: 43 },
        advice: {
          tacticalAreas: { Text: "Nous devons consacrer plus de temps au style de passes à l'entraînement.", IsPro: 'False' },
          nextMatch: { Text: 'Il faut que nous en apprenions davantage sur l’équipe \u0001AwAAACAx\u0002du Slovan Bratislava B\u0001 et ses joueurs.', IsPro: 'False' },
          playerBuyIn: { Text: 'Certains joueurs apprécient votre football spectaculaire.', IsPro: 'True' },
        },
      },
    } as unknown as FmSnapshot;
    const e = effectiveness(snap)!;
    expect(e.overall?.mid).toBe(43);
    expect(e.advice).toHaveLength(3);
    expect(e.advice[1]!.text).toBe('Il faut que nous en apprenions davantage sur l’équipe du Slovan Bratislava B et ses joueurs.');
    expect(e.advice[2]!.pro).toBe(true);
    expect(gameText('a \u0001x\u0002b\u0001 c')).toBe('a b c');
  });
});

describe('garder ou changer de tactique', () => {
  const snap = (date: string, name: string, rows = f433, te: number | null = null) =>
    ({ gameDate: date, data: { gameDate: date, players: [], tactic: { name, positionsCombined: rows }, ...(te != null ? { effectiveness: { overall: { min: te, max: te } } } : {}) } as unknown as FmSnapshot });

  it("signale un rôle changé d'un instantané à l'autre", () => {
    const changed = f433.map((r, i) => (i === 7 ? { ...r, IPRole: 32768 } : r));
    const a = tacticAdvice([snap('2027-09-01', 'T'), snap('2027-09-02', 'T', changed)]);
    expect(a?.kind).toBe('tacticRoles');
    expect(a?.values.count).toBe(1);
    expect(rolePrint(tacticSlots({ positionsCombined: f433 }))).toHaveLength(11);
  });

  it('alerte après plusieurs changements de tactique', () => {
    const a = tacticAdvice([snap('2027-09-01', 'A'), snap('2027-09-10', 'B'), snap('2027-09-20', 'A')]);
    expect(a?.kind).toBe('tacticSwitches');
    expect(a?.values.count).toBe(2);
  });

  it('ignore les instantanés sans les onze postes (ancienne tactique « 4-4-2 » par défaut)', () => {
    const old = { gameDate: '2027-08-01', data: { gameDate: '2027-08-01', players: [], tactic: { name: '4-4-2' } } as unknown as FmSnapshot };
    expect(tacticAdvice([old, snap('2027-09-01', 'A')])).toBeNull();
  });
});

describe('la base garde aussi son schéma', () => {
  it('compare la tactique jouée dans son vrai schéma', () => {
    const engine = new TacticEngine(DEFAULT_TACTIC_REFERENCE);
    const squad = ['GB', 'D (C)', 'D (C)', 'D (D)', 'D (G)', 'MD', 'M (C)', 'M (C)', 'MO (G)', 'MO (D)', 'BT'].map((pos, i) =>
      normalizePlayer({ id: i + 1, name: `J${i + 1}`, positions: pos, attributes: { Passing: 12, Tackling: 12, Finishing: 12, Reflexes: 12, Handling: 12, Pace: 12, Stamina: 12 } }),
    );
    const ranked = rankTactics(engine, squad);
    const base = ranked[0]!;
    const other = base.plans.find((p) => p.form !== base.form)!;
    const pick = bestTactic(engine, squad, {}, ranked, base.style, other.form)!;
    // Le meilleur schéma du même style ne vaut pas un changement s'il ne gagne pas SWITCH_POINTS.
    expect(pick.style.id).toBe(base.style.id);
    if (base.plan.score - other.score < 1) expect(pick.form).toBe(other.form);
  });
});
