import { monthsBetween } from './alerts';
import type { FmPlayer } from './player';
import { lineOf, POS_ORDER, type Line, type PosCode } from './positions';

const avg = (xs: (number | null | undefined)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

/** Titulaires par ligne dans un 4-2-3-1 : milieux axiaux et latéraux en MIL, meneurs et ailiers avec l'attaque. */
const NEED: Record<Line, number> = { GB: 1, DEF: 4, MIL: 3, ATT: 3 };

export interface LineReport {
  line: Line;
  players: FmPlayer[];
  starters: number | null;
  bench: number | null;
  age: number | null;
}

export interface AgeBucket {
  key: 'u21' | 'u25' | 'u30' | 'o30';
  squad: number;
  xi: number;
}

/**
 * Priorités dans l'ordre d'urgence. `kind` est une clé i18n (fm.todo.<kind>),
 * `names` / `pos` complètent la phrase.
 */
export interface Todo {
  kind: 'doublePos' | 'secondKeeper' | 'extend' | 'payroll' | 'youngXi';
  level: 'urgent' | 'warning' | 'info';
  names?: string[];
  pos?: PosCode;
}

export interface SquadAnalysis {
  xi: FmPlayer[];
  xiLevel: number | null;
  benchLevel: number | null;
  xiAge: number | null;
  squadAge: number | null;
  lines: LineReport[];
  strongest: Line | null;
  weakest: Line | null;
  depth: { pos: PosCode; players: FmPlayer[] }[];
  ages: AgeBucket[];
  todo: Todo[];
}

const AGE_TEST: Record<AgeBucket['key'], (a: number) => boolean> = {
  u21: (a) => a <= 21,
  u25: (a) => a >= 22 && a <= 25,
  u30: (a) => a >= 26 && a <= 29,
  o30: (a) => a >= 30,
};

/** Onze type : les meilleurs de chaque ligne, selon le poste principal. */
export function bestEleven(players: FmPlayer[]): FmPlayer[] {
  const fit = players.filter((p) => p.level != null && !p.injury && p.positions[0]);
  return (Object.keys(NEED) as Line[]).flatMap((l) =>
    fit
      .filter((p) => lineOf(p.positions[0]!) === l)
      .sort((a, b) => b.level! - a.level!)
      .slice(0, NEED[l]),
  );
}

/**
 * Diagnostic de l'effectif, sans dépendre des rôles : niveau du onze et du banc,
 * lignes fortes et faibles, profondeur par poste, âges, contrats, masse salariale.
 */
export function analyseSquad(players: FmPlayer[], gameDate: string): SquadAnalysis {
  const list = players.filter((p) => p.level != null);
  const xi = bestEleven(list);
  const xiIds = new Set(xi.map((p) => p.id));
  const benchList = list.filter((p) => !xiIds.has(p.id));
  const benchLevel = avg(benchList.map((p) => p.level));

  const lines: LineReport[] = (Object.keys(NEED) as Line[]).map((line) => {
    const ps = list.filter((p) => p.line === line).sort((a, b) => b.level! - a.level!);
    const n = NEED[line];
    return {
      line,
      players: ps,
      starters: avg(ps.slice(0, n).map((p) => p.level)),
      bench: avg(ps.slice(n, 2 * n).map((p) => p.level)),
      age: avg(ps.map((p) => p.age)),
    };
  });
  const ranked = lines.filter((l) => l.starters != null).sort((a, b) => b.starters! - a.starters!);

  const depth = POS_ORDER.map((pos) => ({
    pos,
    players: list.filter((p) => p.positions.includes(pos)).sort((a, b) => b.level! - a.level!),
  }));

  const ages = (Object.keys(AGE_TEST) as AgeBucket['key'][]).map((key) => ({
    key,
    squad: list.filter((p) => p.age != null && AGE_TEST[key](p.age)).length,
    xi: xi.filter((p) => p.age != null && AGE_TEST[key](p.age)).length,
  }));

  const todo: Todo[] = [];
  for (const d of depth) {
    if (['DC', 'DD', 'DG', 'MC', 'BT'].includes(d.pos) && d.players.length <= 1) {
      todo.push({ kind: 'doublePos', level: d.players.length ? 'warning' : 'urgent', pos: d.pos, names: d.players.map((p) => p.name) });
    }
  }
  if ((depth.find((d) => d.pos === 'GB')?.players.length ?? 0) < 2) todo.push({ kind: 'secondKeeper', level: 'warning' });
  const extend = xi.filter((p) => p.contractEnd && monthsBetween(gameDate, p.contractEnd) <= 12);
  if (extend.length) todo.push({ kind: 'extend', level: 'warning', names: extend.map((p) => p.name) });
  // Remplaçants de 27 ans et plus, nettement sous le niveau du banc : ils pèsent sur les salaires sans faire progresser le groupe.
  const deadwood = benchList.filter((p) => p.age != null && p.age >= 27 && p.level! < (benchLevel ?? 0) - 0.5);
  if (deadwood.length) todo.push({ kind: 'payroll', level: 'info', names: deadwood.map((p) => p.name) });
  const young = xi.filter((p) => p.age != null && p.age <= 21);
  if (young.length) todo.push({ kind: 'youngXi', level: 'info', names: young.map((p) => p.name) });

  return {
    xi,
    xiLevel: avg(xi.map((p) => p.level)),
    benchLevel,
    xiAge: avg(xi.map((p) => p.age)),
    squadAge: avg(list.map((p) => p.age)),
    lines,
    strongest: ranked[0]?.line ?? null,
    weakest: ranked.length > 1 ? ranked.at(-1)!.line : null,
    depth,
    ages,
    todo: todo.sort((a, b) => ['urgent', 'warning', 'info'].indexOf(a.level) - ['urgent', 'warning', 'info'].indexOf(b.level)),
  };
}
