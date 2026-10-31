import { z } from 'zod';
import type { FmPlayer } from './player';
import type { PosCode } from './positions';

/*
 * Tactique : rôles avec et sans ballon, schémas, onze conseillé et équilibre de l'équipe.
 * Les repères de rôles (poids des attributs) et les styles de jeu sont fournis à l'exécution
 * (`TacticReference`) : ils ne sont pas embarqués dans le dépôt.
 */

export const roleRefSchema = z
  .object({
    code: z.string(),
    fr: z.string(),
    en: z.string().optional(),
    phase: z.enum(['ip', 'oop', 'both']),
    positions: z.array(z.string()),
    group: z.string(),
    weights: z.record(z.number()),
    weightsOOP: z.record(z.number()).nullish(),
  })
  .passthrough();

export const styleRefSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    nameEn: z.string().optional(),
    summary: z.string().optional(),
    inPossession: z.array(z.string()).default([]),
    outOfPossession: z.array(z.string()).default([]),
    weights: z.record(z.number()),
    mentality: z.string().optional(),
    signatureRoles: z.object({ ip: z.array(z.string()), oop: z.array(z.string()) }),
  })
  .passthrough();

export const tacticReferenceSchema = z.object({ roles: z.array(roleRefSchema), styles: z.array(styleRefSchema) }).passthrough();

export type RoleRef = z.infer<typeof roleRefSchema>;
export type StyleRef = z.infer<typeof styleRefSchema>;
export type TacticReference = z.infer<typeof tacticReferenceSchema>;
export type Phase = 'ip' | 'oop';

/** Coordonnées des postes en % du terrain (x de gauche à droite, y du but adverse vers le sien). */
export const FORMATIONS: Record<string, [PosCode, number, number][]> = {
  '4-3-3': [['GB', 50, 92], ['DG', 15, 72], ['DC', 38, 76], ['DC', 62, 76], ['DD', 85, 72], ['MDF', 50, 57], ['MC', 30, 44], ['MC', 70, 44], ['MOG', 15, 22], ['BT', 50, 12], ['MOD', 85, 22]],
  '4-2-3-1': [['GB', 50, 92], ['DG', 15, 72], ['DC', 38, 76], ['DC', 62, 76], ['DD', 85, 72], ['MDF', 35, 57], ['MDF', 65, 57], ['MOG', 15, 34], ['MOC', 50, 34], ['MOD', 85, 34], ['BT', 50, 12]],
  '4-4-2': [['GB', 50, 92], ['DG', 15, 72], ['DC', 38, 76], ['DC', 62, 76], ['DD', 85, 72], ['MG', 15, 48], ['MC', 38, 50], ['MC', 62, 50], ['MD', 85, 48], ['BT', 38, 16], ['BT', 62, 16]],
  '4-1-4-1': [['GB', 50, 92], ['DG', 15, 72], ['DC', 38, 76], ['DC', 62, 76], ['DD', 85, 72], ['MDF', 50, 60], ['MG', 15, 42], ['MC', 36, 44], ['MC', 64, 44], ['MD', 85, 42], ['BT', 50, 12]],
  '4-4-1-1': [['GB', 50, 92], ['DG', 15, 72], ['DC', 38, 76], ['DC', 62, 76], ['DD', 85, 72], ['MG', 15, 50], ['MC', 38, 52], ['MC', 62, 52], ['MD', 85, 50], ['MOC', 50, 30], ['BT', 50, 12]],
  '4-3-1-2': [['GB', 50, 92], ['DG', 15, 72], ['DC', 38, 76], ['DC', 62, 76], ['DD', 85, 72], ['MDF', 50, 60], ['MC', 28, 48], ['MC', 72, 48], ['MOC', 50, 32], ['BT', 36, 13], ['BT', 64, 13]],
  '3-5-2': [['GB', 50, 92], ['DC', 25, 76], ['DC', 50, 78], ['DC', 75, 76], ['DLG', 10, 52], ['MDF', 50, 60], ['MC', 32, 44], ['MC', 68, 44], ['DLD', 90, 52], ['BT', 38, 15], ['BT', 62, 15]],
  '3-4-3': [['GB', 50, 92], ['DC', 25, 76], ['DC', 50, 78], ['DC', 75, 76], ['DLG', 12, 50], ['MC', 38, 54], ['MC', 62, 54], ['DLD', 88, 50], ['MOG', 18, 22], ['BT', 50, 12], ['MOD', 82, 22]],
  '5-3-2': [['GB', 50, 92], ['DLG', 10, 66], ['DC', 30, 77], ['DC', 50, 79], ['DC', 70, 77], ['DLD', 90, 66], ['MC', 28, 48], ['MDF', 50, 56], ['MC', 72, 48], ['BT', 38, 15], ['BT', 62, 15]],
  '5-4-1': [['GB', 50, 92], ['DLG', 10, 66], ['DC', 30, 77], ['DC', 50, 79], ['DC', 70, 77], ['DLD', 90, 66], ['MG', 15, 45], ['MC', 38, 50], ['MC', 62, 50], ['MD', 85, 45], ['BT', 50, 14]],
  '5-2-3': [['GB', 50, 92], ['DLG', 10, 66], ['DC', 30, 77], ['DC', 50, 79], ['DC', 70, 77], ['DLD', 90, 66], ['MC', 35, 50], ['MC', 65, 50], ['MOG', 18, 24], ['BT', 50, 13], ['MOD', 82, 24]],
};

/** Schémas naturels de chaque style (avec ballon, du plus naturel au plus alternatif). */
export const STYLE_FORMS: Record<string, string[]> = {
  possession: ['4-3-3', '4-2-3-1', '4-1-4-1'],
  tikitaka: ['4-3-3', '4-1-4-1', '3-4-3'],
  'tikitaka-v': ['4-3-1-2', '4-2-3-1'],
  gegenpress: ['4-2-3-1', '4-3-3', '4-4-2'],
  wings: ['4-4-2', '4-2-3-1', '3-4-3', '5-2-3'],
  longball: ['4-4-2', '4-4-1-1', '3-5-2'],
  'counter-fluid': ['4-2-3-1', '4-3-3', '4-4-2'],
  'counter-direct': ['4-4-2', '4-4-1-1', '3-5-2'],
  catenaccio: ['5-3-2', '3-5-2'],
  'ultra-def': ['5-4-1', '5-3-2', '4-1-4-1'],
};

const ROLE_POS: Record<string, PosCode> = { GK: 'GB', DC: 'DC', DL: 'DG', DR: 'DD', WBL: 'DLG', WBR: 'DLD', DM: 'MDF', MC: 'MC', ML: 'MG', MR: 'MD', AML: 'MOG', AMR: 'MOD', AMC: 'MOC', ST: 'BT' };
const DEFAULT_ROLE: Record<PosCode, string> = { GB: 'GK', DC: 'CB', DG: 'FB', DD: 'FB', DLG: 'WB', DLD: 'WB', MDF: 'DM', MC: 'CM', MG: 'W', MD: 'W', MOG: 'W', MOD: 'W', MOC: 'AM', BT: 'CF' };

/** Attributs de base de chaque famille de poste, du plus au moins important. */
const POS_BASE: Record<string, string[]> = {
  GK: ['Reflexes', 'OneOnOnes', 'Agility', 'Handling', 'AerialReach', 'CommandOfArea', 'Positioning', 'Anticipation', 'Concentration', 'Communication', 'Kicking', 'Decisions', 'Composure'],
  CB: ['Marking', 'Tackling', 'Heading', 'Positioning', 'Strength', 'JumpingReach', 'Pace', 'Anticipation', 'Composure', 'Decisions'],
  FB: ['Tackling', 'Marking', 'Crossing', 'Stamina', 'Pace', 'Positioning', 'Acceleration', 'WorkRate', 'Teamwork', 'Decisions'],
  WB: ['Crossing', 'Stamina', 'Pace', 'Acceleration', 'WorkRate', 'Dribbling', 'Tackling', 'Teamwork', 'Passing', 'Decisions'],
  DM: ['Tackling', 'Positioning', 'Anticipation', 'Passing', 'Teamwork', 'Concentration', 'Decisions', 'Composure', 'Stamina', 'WorkRate'],
  CM: ['Passing', 'Decisions', 'Vision', 'FirstTouch', 'Teamwork', 'Stamina', 'WorkRate', 'Technique', 'Composure', 'Anticipation'],
  WM: ['Crossing', 'Passing', 'Stamina', 'WorkRate', 'Pace', 'Dribbling', 'Technique', 'Teamwork', 'Acceleration', 'Decisions'],
  W: ['Dribbling', 'Crossing', 'Pace', 'Acceleration', 'Technique', 'Agility', 'Flair', 'FirstTouch', 'Passing', 'Movement'],
  AM: ['Passing', 'Vision', 'Technique', 'FirstTouch', 'Decisions', 'Flair', 'Movement', 'Composure', 'Dribbling', 'LongShots'],
  ST: ['Finishing', 'Movement', 'Composure', 'FirstTouch', 'Anticipation', 'Acceleration', 'Pace', 'Technique', 'Heading', 'Strength'],
};
const POS_BASE_OF: Record<PosCode, string> = { GB: 'GK', DC: 'CB', DD: 'FB', DG: 'FB', DLD: 'WB', DLG: 'WB', MDF: 'DM', MC: 'CM', MD: 'WM', MG: 'WM', MOD: 'W', MOG: 'W', MOC: 'AM', BT: 'ST' };
const ENGINE_KEYS = ['Acceleration', 'Pace', 'Anticipation', 'Decisions'];
const FIT_W = { keys: 0.7, base: 0.2, engine: 0.1 };
export const INVERTED = new Set(['IFB', 'IWB', 'IF', 'IW', 'IOW']);

/** Signaux agrégés de l'effectif, comparés aux exigences des styles. */
const SIGNALS: Record<string, string[]> = {
  technical: ['Passing', 'FirstTouch', 'Technique', 'Composure'],
  creators: ['Vision', 'Passing', 'Flair', 'Decisions'],
  physical: ['Stamina', 'Strength', 'NaturalFitness', 'WorkRate'],
  pace: ['Pace', 'Acceleration'],
  press: ['WorkRate', 'Stamina', 'Aggression', 'Teamwork', 'Anticipation'],
  aerial: ['Heading', 'JumpingReach', 'Strength'],
  wide: ['Crossing', 'Dribbling', 'Acceleration', 'Stamina'],
  finishing: ['Finishing', 'Composure', 'Movement'],
  defense: ['Marking', 'Tackling', 'Positioning', 'Concentration'],
};

export const avg = (xs: (number | null | undefined)[]): number | null => {
  const v = xs.filter((x): x is number => x != null && !Number.isNaN(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
/** Clé d'attribut des repères (« offTheBall », « firstTouch ») vers celle du jeu (« Movement », « FirstTouch »). */
export const attrKey = (k: string) => (k === 'offTheBall' ? 'Movement' : k.charAt(0).toUpperCase() + k.slice(1));
export const attrOf = (p: FmPlayer, k: string): number | null => p.attributes[k] ?? null;

export const sideOf = (pos: PosCode): 'L' | 'R' | null => (/^(DG|DLG|MG|MOG)$/.test(pos) ? 'L' : /^(DD|DLD|MD|MOD)$/.test(pos) ? 'R' : null);

export function footInfo(p: FmPlayer) {
  const f = (p.foot ?? '').toLowerCase();
  if (/deux|ambi|both|either/.test(f)) return { strong: 'B' as const, only: false };
  const strong = /gauch|left/.test(f) ? ('L' as const) : /droit|right/.test(f) ? ('R' as const) : null;
  return { strong, only: /uniquement|only/.test(f) };
}

/** Pénalité de pied : un rôle rentrant veut le pied opposé au côté, les autres le pied du côté. */
function footAdj(p: FmPlayer, code: string, pos: PosCode) {
  const side = sideOf(pos);
  if (!side) return 0;
  const fi = footInfo(p);
  if (!fi.strong || fi.strong === 'B') return 0;
  const want = INVERTED.has(code) ? (side === 'L' ? 'R' : 'L') : side;
  return fi.strong === want ? 0 : fi.only ? -1 : -0.5;
}

function wmean(p: FmPlayer, w: Record<string, number>) {
  let s = 0;
  let t = 0;
  for (const [k, wt] of Object.entries(w)) {
    const a = attrOf(p, attrKey(k));
    if (a != null) {
      s += a * wt;
      t += wt;
    }
  }
  return t ? s / t : null;
}

export class TacticEngine {
  readonly roles: Map<string, RoleRef>;

  constructor(readonly ref: TacticReference) {
    this.roles = new Map(ref.roles.map((r) => [r.code, r]));
  }

  rolePositions(r: RoleRef): PosCode[] {
    return r.positions.map((x) => ROLE_POS[x]).filter((x): x is PosCode => !!x);
  }

  /**
   * Adéquation d'un joueur à un rôle, sur 20 : 70 % attributs-clés du rôle, 20 % base du poste,
   * 10 % « moteur de match » (vitesse, accélération, anticipation, décisions), puis correction du pied.
   */
  roleFit(p: FmPlayer, code: string, phase: Phase, pos?: PosCode): number | null {
    const r = this.roles.get(code);
    if (!r) return null;
    const keys = wmean(p, phase === 'oop' && r.weightsOOP ? r.weightsOOP : r.weights);
    if (keys == null) return null;
    const p0 = pos ?? this.rolePositions(r)[0];
    const bk = (p0 && POS_BASE[POS_BASE_OF[p0]]) || [];
    const third = Math.ceil(bk.length / 3);
    const base = avgWeighted(bk.map((k, i) => [attrOf(p, k), i < third ? 10 : i < 2 * third ? 6 : 3]));
    const eng = r.group === 'GK' ? null : avg(ENGINE_KEYS.map((k) => attrOf(p, k)));
    let s = FIT_W.keys * keys;
    let t = FIT_W.keys;
    if (base != null) {
      s += FIT_W.base * base;
      t += FIT_W.base;
    }
    if (eng != null) {
      s += FIT_W.engine * eng;
      t += FIT_W.engine;
    }
    const foot = pos ? footAdj(p, code, pos) : 0;
    return Math.max(1, Math.min(20, s / t + foot));
  }

  /** Meilleur rôle d'une phase pour le joueur à un poste donné (naturel ou non). */
  bestAtPos(p: FmPlayer, pos: PosCode, phase: Phase): { role: RoleRef; fit: number } | null {
    let best: { role: RoleRef; fit: number } | null = null;
    for (const role of this.ref.roles) {
      if (!(role.phase === phase || role.phase === 'both') || !this.rolePositions(role).includes(pos)) continue;
      const fit = this.roleFit(p, role.code, phase, pos);
      if (fit != null && (!best || fit > best.fit)) best = { role, fit };
    }
    return best;
  }

  /** Meilleur rôle avec ballon du joueur sur l'un de ses postes naturels. */
  bestRole(p: FmPlayer): { role: RoleRef; pos: PosCode; fit: number } | null {
    let best: { role: RoleRef; pos: PosCode; fit: number } | null = null;
    for (const role of this.ref.roles) {
      if (role.phase === 'oop') continue;
      for (const pos of this.rolePositions(role)) {
        if (!p.positions.includes(pos)) continue;
        const fit = this.roleFit(p, role.code, 'ip', pos);
        if (fit != null && (!best || fit > best.fit)) best = { role, pos, fit };
      }
    }
    return best;
  }

  squadSignals(list: FmPlayer[]): Record<string, number | null> {
    const pool = list
      .filter((p) => !p.positions.includes('GB'))
      .sort((a, b) => (b.level ?? 0) - (a.level ?? 0))
      .slice(0, 16);
    return Object.fromEntries(Object.entries(SIGNALS).map(([sig, keys]) => [sig, avg(pool.map((p) => avg(keys.map((k) => attrOf(p, k)))))]));
  }

  /** Styles classés par adéquation à l'effectif (sur 20). */
  rankStyles(list: FmPlayer[]): { style: StyleRef; fit: number | null }[] {
    const sig = this.squadSignals(list);
    return this.ref.styles
      .map((style) => {
        let s = 0;
        let t = 0;
        for (const [k, w] of Object.entries(style.weights)) {
          const v = sig[k];
          if (w > 0 && v != null) {
            s += v * w;
            t += w;
          }
        }
        return { style, fit: t ? s / t : null };
      })
      .sort((a, b) => (b.fit ?? 0) - (a.fit ?? 0));
  }

  /** Rôles typiques du style sur chaque poste du schéma, puis meilleur onze (joueurs naturels au poste). */
  formationPlan(form: string, style: StyleRef, list: FmPlayer[]): FormationPlan {
    const used: Record<Phase, Record<string, number>> = { ip: {}, oop: {} };
    const pickRole = (pos: PosCode, ph: Phase) => {
      const opts = style.signatureRoles[ph].filter((c) => {
        const r = this.roles.get(c);
        return r && this.rolePositions(r).includes(pos);
      });
      if (!opts.length) return DEFAULT_ROLE[pos];
      used[ph][pos] = (used[ph][pos] ?? -1) + 1;
      return opts[used[ph][pos] % opts.length] ?? DEFAULT_ROLE[pos];
    };
    const slots: Slot[] = (FORMATIONS[form] ?? FORMATIONS['4-3-3']!).map(([pos, x, y]) => ({ pos, x, y, ip: pickRole(pos, 'ip'), oop: pickRole(pos, 'oop'), player: null, fit: null }));
    const pairs: { i: number; p: FmPlayer; f: number }[] = [];
    slots.forEach((sl, i) =>
      list.forEach((p) => {
        if (!p.positions.includes(sl.pos)) return;
        const a = this.roleFit(p, sl.ip, 'ip', sl.pos);
        const b = this.roleFit(p, sl.oop, 'oop', sl.pos);
        if (a != null && b != null) pairs.push({ i, p, f: (a + b) / 2 });
      }),
    );
    pairs.sort((a, b) => b.f - a.f);
    const taken = new Set<string>();
    for (const pr of pairs) {
      const sl = slots[pr.i]!;
      if (sl.player || taken.has(pr.p.id)) continue;
      sl.player = pr.p;
      sl.fit = pr.f;
      taken.add(pr.p.id);
    }
    // Remplaçants : chaque joueur hors du onze au plus une fois en premier choix.
    const bench = list.filter((p) => !taken.has(p.id));
    const cands = slots.map((sl) =>
      bench
        .filter((p) => p.positions.includes(sl.pos))
        .map((p) => ({ p, f: ((this.roleFit(p, sl.ip, 'ip', sl.pos) ?? 0) + (this.roleFit(p, sl.oop, 'oop', sl.pos) ?? 0)) / 2 }))
        .sort((a, b) => b.f - a.f),
    );
    const subs: FmPlayer[][] = slots.map(() => []);
    const usedSub = new Set<string>();
    slots
      .map((_, i) => i)
      .sort((a, b) => (cands[b]![0]?.f ?? 0) - (cands[a]![0]?.f ?? 0))
      .forEach((i) => {
        const c = cands[i]!.find((x) => !usedSub.has(x.p.id));
        if (c) {
          subs[i]!.push(c.p);
          usedSub.add(c.p.id);
        }
      });
    slots.forEach((_, i) => {
      const c = cands[i]!.find((x) => !subs[i]!.includes(x.p));
      if (c) subs[i]!.push(c.p);
    });
    const score = slots.reduce((a, s) => a + (s.fit ?? 0), 0) / slots.length;
    return { form, slots, subs, score, holes: slots.filter((s) => !s.player).length };
  }

  /** Équilibre du onze : largeur, création, couverture, présence offensive, vitesse, pressing, jeu aérien, fraîcheur. */
  balance(plan: FormationPlan, style: StyleRef): BalanceCheck[] {
    const xi = plan.slots;
    const P = xi.filter((x): x is Slot & { player: FmPlayer } => !!x.player);
    const lvl = avg(P.map((x) => x.player.level)) ?? 10;
    const grp = (sls: Slot[], keys: string[]) => avg(sls.filter((x) => x.player).map((x) => avg(keys.map((k) => attrOf(x.player!, k)))));
    const rel = (v: number | null, ok = 0.5, warn = -1): Status => (v == null ? 'warn' : v >= lvl + ok ? 'good' : v >= lvl + warn ? 'warn' : 'bad');
    const back = xi.filter((x) => /^(DC|DD|DG|DLD|DLG)$/.test(x.pos));
    const dcs = xi.filter((x) => x.pos === 'DC');
    const outf = xi.filter((x) => x.pos !== 'GB');
    const highLine = style.outOfPossession.some((t) => /plus haute|higher/i.test(t));
    const highPress = style.outOfPossession.some((t) => /pressing haut|beaucoup plus souvent|high press|much more often/i.test(t));
    const vPace = grp(back, ['Pace', 'Acceleration']);
    const vPress = grp(outf, ['WorkRate', 'Stamina', 'Teamwork']);
    const vAir = grp(dcs, ['Heading', 'JumpingReach', 'Strength']);
    const box = xi.filter((x) => BOX.has(x.ip));
    const finisher = box
      .filter((x) => x.player)
      .map((x) => ({ p: x.player!, v: avg(['Finishing', 'Composure', 'Movement'].map((k) => attrOf(x.player!, k))) ?? 0 }))
      .sort((a, b) => b.v - a.v)[0];
    const nCreate = xi.filter((x) => CREATE.has(x.ip)).length;
    const nHold = xi.filter((x) => HOLD.has(x.ip) || ['SCRDM', 'SCRCM', 'DROPDM'].includes(x.oop)).length;
    const wide = (side: 'L' | 'R') => xi.some((sl) => sideOf(sl.pos) === side && WIDE.has(sl.ip));
    const wideL = wide('L');
    const wideR = wide('R');
    const lowCond = P.filter((x) => x.player.condition != null && x.player.condition < 90).map((x) => x.player.name);
    const r1 = (v: number | null) => (v == null ? null : Math.round(v * 10) / 10);
    return [
      { id: 'width', status: wideL && wideR ? 'good' : wideL || wideR ? 'warn' : 'bad', params: { side: !wideL && !wideR ? 'both' : !wideL ? 'L' : !wideR ? 'R' : null } },
      { id: 'creation', status: nCreate > 4 ? 'warn' : nCreate >= 2 ? 'good' : nCreate === 1 ? 'warn' : 'bad', params: { count: nCreate } },
      { id: 'cover', status: nHold >= 1 ? 'good' : 'bad', params: { count: nHold } },
      { id: 'box', status: box.length >= 2 ? 'good' : box.length === 1 ? 'warn' : 'bad', params: { count: box.length, finisher: finisher?.p.name ?? null, value: r1(finisher?.v ?? null) } },
      { id: 'pace', status: rel(vPace, highLine ? 1 : 0, highLine ? -0.5 : -1.5), params: { value: r1(vPace), highLine } },
      { id: 'press', status: rel(vPress, highPress ? 1 : 0, highPress ? -0.5 : -1.5), params: { value: r1(vPress), highPress } },
      { id: 'aerial', status: rel(vAir, 0, -1.5), params: { value: r1(vAir) } },
      { id: 'fitness', status: lowCond.length ? (lowCond.length >= 3 ? 'bad' : 'warn') : 'good', params: { names: lowCond } },
    ];
  }
}

const avgWeighted = (xs: [number | null, number][]) => {
  let s = 0;
  let t = 0;
  for (const [v, w] of xs)
    if (v != null) {
      s += v * w;
      t += w;
    }
  return t ? s / t : null;
};

const WIDE = new Set(['FB', 'WB', 'AWB', 'PMWB', 'WM', 'W', 'WF', 'WP']);
const CREATE = new Set(['DLP', 'B2BPM', 'MFPM', 'AP', 'WP', 'PMWB', 'F9', 'FREE', 'BPCB']);
const HOLD = new Set(['DM', 'HB', 'DLP']);
const BOX = new Set(['CF', 'POA', 'TF', 'CHF', 'DLF', 'IF', 'WF', 'SS', 'BBM']);

export interface Slot {
  pos: PosCode;
  x: number;
  y: number;
  /** Rôle avec ballon (code du repère). */
  ip: string;
  /** Rôle sans ballon. */
  oop: string;
  player: FmPlayer | null;
  /** Adéquation moyenne avec et sans ballon, sur 20. */
  fit: number | null;
}

export interface FormationPlan {
  form: string;
  slots: Slot[];
  /** Remplaçants par poste, du meilleur au suivant. */
  subs: FmPlayer[][];
  score: number;
  holes: number;
}

export type Status = 'good' | 'warn' | 'bad';
export interface BalanceCheck {
  id: 'width' | 'creation' | 'cover' | 'box' | 'pace' | 'press' | 'aerial' | 'fitness';
  status: Status;
  params: Record<string, unknown>;
}

/* ---------- Formes avec et sans ballon ---------- */

/** Déplacement de chaque rôle selon la phase : [vers l'axe (0-1), vers l'extérieur (%), vertical (+ recule, - monte)]. */
const ROLE_MOVE: Record<Phase, Record<string, [number, number, number]>> = {
  ip: {
    IFB: [0.55, 0, -12], FB: [0, 0, -14], CF: [0, 0, -2], IWB: [0.45, 0, -28], WB: [0, 0, -22], AWB: [0, 0, -34], PMWB: [0.25, 0, -22], HB: [0, 0, 12], ADCB: [0, 0, -14],
    B2BDM: [0, 0, -10], B2BPM: [0, 0, -10], BBM: [0, 0, -14], CHM: [0, 12, -12], BBP: [0, 18, 0], WCM: [0.3, 0, 0], W: [0, 4, -8], IF: [0.35, 0, -8], IW: [0.25, 0, -2],
    WF: [0, 0, -10], WP: [0.3, 0, 0], AP: [0, 0, -4], SS: [0, 0, -10], DLF: [0, 0, 10], F9: [0, 0, 12], CHF: [0, 12, 0], TF: [0, 0, -3], POA: [0, 0, -3], BPGK: [0, 0, -4],
  },
  oop: {
    TW: [0, 0, 18], TWM: [0, 0, 6], WOM: [0, 0, -4], WOW: [0, 0, -4], IOW: [0.15, 0, -4], TAM: [0, 0, 12], COAM: [0, 0, -6], SOAM: [0, 18, -4], CCS: [0, 0, 10], COCF: [0, 0, -4],
    DROPDM: [0, 0, 14], WCDM: [0, 20, 0], WCCM: [0, 20, 0], SCRDM: [0, 0, 5], SCRCM: [0, 0, 5], PRSDM: [0, 0, -4], PRSCM: [0, 0, -4], PFB: [0, 0, -3], PWB: [0, 0, -3], HFB: [0, 0, 4], DWB: [0, 0, 6],
    STCB: [0, 0, -5], CCB: [0, 0, 4], SK: [0, 0, -6], LHK: [0, 0, 2],
  },
};

/** Décalage de tout le bloc : il monte avec le ballon, et se place selon la ligne d'engagement sans ballon. */
export type Block = 'high' | 'mid' | 'low';
const blockShift = (ph: Phase, block: Block) => (ph === 'ip' ? -6 : block === 'low' ? 8 : block === 'mid' ? 3 : -3);

export function phaseXY(sl: Slot, ph: Phase, block: Block = 'mid'): [number, number] {
  const mv = ROLE_MOVE[ph][ph === 'ip' ? sl.ip : sl.oop] ?? [0, 0, 0];
  const sh = sl.pos === 'GB' ? 0 : blockShift(ph, block) * (sl.y > 60 ? 0.8 : 1);
  const x = sl.x + (50 - sl.x) * mv[0] + Math.sign(sl.x - 50) * mv[1];
  const y = sl.y + mv[2] + sh;
  return [Math.max(6, Math.min(94, x)), Math.max(6, Math.min(94, y))];
}

/** Poste occupé d'après une position sur le terrain. */
export function zonePos(x: number, y: number): PosCode {
  const side = x < 27 ? 'G' : x > 73 ? 'D' : 'C';
  if (y >= 68) return side === 'C' ? 'DC' : (`D${side}` as PosCode);
  if (y >= 55) return side === 'C' ? 'MDF' : (`DL${side}` as PosCode);
  if (y >= 36) return side === 'C' ? 'MC' : (`M${side}` as PosCode);
  if (y >= 18) return `MO${side}` as PosCode;
  return 'BT';
}

/** Poste occupé selon le rôle seul, sans le décalage du bloc. */
export function rolePos(sl: Slot, ph: Phase): PosCode {
  if (sl.pos === 'GB') return 'GB';
  const mv = ROLE_MOVE[ph][ph === 'ip' ? sl.ip : sl.oop] ?? [0, 0, 0];
  return zonePos(sl.x + (50 - sl.x) * mv[0] + Math.sign(sl.x - 50) * mv[1], sl.y + mv[2]);
}

/** Forme en lignes (« 4-1-4-1 ») à partir des positions des joueurs de champ. */
export function shapeOf(pts: [number, number][]): string {
  if (!pts.length) return '';
  const ys = pts.map((p) => p[1]).sort((a, b) => b - a);
  const lines: number[][] = [];
  let cur: number[] = [];
  for (const y of ys) {
    if (cur.length && cur[cur.length - 1]! - y > 8) {
      lines.push(cur);
      cur = [];
    }
    cur.push(y);
  }
  lines.push(cur);
  return lines.map((l) => l.length).join('-');
}

/** Écarte les cartes qui se chevauchent (affichage seulement). */
export function spreadXY(pts: [number, number][], w = 19, hh = 11): [number, number][] {
  const P = pts.map((p) => [...p] as [number, number]);
  for (let it = 0; it < 30; it++) {
    let moved = false;
    for (let i = 0; i < P.length; i++)
      for (let j = i + 1; j < P.length; j++) {
        const a = P[i]!;
        const b = P[j]!;
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        if (Math.abs(dx) < w && Math.abs(dy) < hh) {
          moved = true;
          const ox = w - Math.abs(dx);
          const oy = hh - Math.abs(dy);
          if (ox < oy) {
            const s = ((dx >= 0 ? 1 : -1) * ox) / 2;
            a[0] -= s;
            b[0] += s;
          } else {
            const s = ((dy >= 0 ? 1 : -1) * oy) / 2;
            a[1] -= s;
            b[1] += s;
          }
        }
      }
    P.forEach((p) => {
      p[0] = Math.max(9, Math.min(91, p[0]));
      p[1] = Math.max(6, Math.min(94, p[1]));
    });
    if (!moved) break;
  }
  return P;
}

/** Ligne d'engagement déduite des consignes sans ballon du style. */
export function styleBlock(style: StyleRef): Block {
  const op = style.outOfPossession.join(' | ');
  return /pressing haut|high press/i.test(op) ? 'high' : /bloc bas|low block/i.test(op) ? 'low' : 'mid';
}

/** Schéma de la tactique du jeu (« 4-2-3-1 DM Wide » → « 4-2-3-1 ») s'il est connu. */
export function knownFormation(name: string | null | undefined): string | null {
  if (!name) return null;
  return Object.keys(FORMATIONS).find((k) => name.startsWith(k)) ?? null;
}

/** Schéma de la tactique active lue par le plugin. « formation » peut n'être que la formation la plus
 *  utilisée de la saison (formationSource = MostUsedFormation) : on préfère alors le nom de la tactique,
 *  s'il désigne un schéma connu. */
export function gameFormationOf(tactic: { name?: string | null; formation?: string | null; formationSource?: unknown } | null | undefined): string | null {
  if (!tactic) return null;
  if (knownFormation(tactic.name)) return tactic.name!;
  if (tactic.formationSource === 'MostUsedFormation') return null;
  return tactic.formation ?? null;
}
