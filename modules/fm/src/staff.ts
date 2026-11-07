/**
 * Staff : notes de nos entraîneurs (et du staff libre) par domaine, et affectations proposées.
 *
 * Les notes 1-20 viennent de la base du jeu (lecture seule, `fm_memory_staff`). La note d'un domaine est une
 * formule FM Immersion, pas celle du jeu (ses étoiles d'entraîneur ne sont pas encore retrouvées) : la note du domaine
 * compte triple, plus la détermination, l'autorité (discipline) et la motivation, le tout sur 20.
 */

/** Membre du staff tel que le renvoie `fm_memory_staff` (voir `src-tauri/src/fm_memory.rs`). */
export interface DbStaff {
  id: number;
  name: string;
  birthDate: string | null;
  age: number | null;
  club: string | null;
  clubId: number | null;
  nation: string | null;
  /** Code brut de la fonction dans le contrat (correspondance avec les intitulés du jeu à confirmer). */
  jobCode: number | null;
  wageWeekly: number | null;
  contractEnd: string | null;
  attributes: Record<string, number>;
}

/** Domaines d'entraînement : chacun repose sur une note d'entraîneur du même nom. */
export const COACH_DOMAINS = ['Attacking', 'Defending', 'Possession', 'Technical', 'Tactical', 'Fitness', 'Goalkeeping', 'SetPieces'] as const;
export type CoachDomain = (typeof COACH_DOMAINS)[number];

/** Autres emplois du staff et les notes qui les portent (poids). */
export const STAFF_JOBS = {
  assistant: { TacticalKnowledge: 2, PeopleManagement: 1, Tactical: 1, Motivating: 1 },
  youth: { WorkingWithYoungsters: 3, JudgingPlayerPotential: 1, Determination: 1 },
  scout: { JudgingPlayerAbility: 2, JudgingPlayerPotential: 2, Adaptability: 1 },
  physio: { Physiotherapy: 3, SportsScience: 1 },
  sportsScientist: { SportsScience: 3, Fitness: 1 },
  analyst: { AnalysingData: 3, TacticalKnowledge: 1 },
} as const satisfies Record<string, Record<string, number>>;
export type StaffJob = keyof typeof STAFF_JOBS;

const note = (s: DbStaff, k: string) => s.attributes[k] ?? 0;
const round1 = (x: number) => Math.round(x * 10) / 10;

/** Note sur 20 d'un entraîneur dans un domaine (formule FM Immersion). */
export function domainScore(s: DbStaff, d: CoachDomain): number {
  return round1((3 * note(s, d) + note(s, 'Determination') + note(s, 'Authority') + note(s, 'Motivating')) / 6);
}

/** Note sur 20 d'un membre du staff pour un emploi hors terrain (moyenne pondérée de ses notes). */
export function jobScore(s: DbStaff, job: StaffJob): number {
  const w = STAFF_JOBS[job] as Record<string, number>;
  let sum = 0;
  let total = 0;
  for (const [k, v] of Object.entries(w)) {
    sum += v * note(s, k);
    total += v;
  }
  return round1(sum / total);
}

export interface StaffCard {
  staff: DbStaff;
  domains: Record<CoachDomain, number>;
  jobs: Record<StaffJob, number>;
  /** Ses deux meilleurs domaines. */
  best: CoachDomain[];
  /** Son meilleur emploi hors terrain, s'il y est meilleur qu'au terrain. */
  bestJob: StaffJob | null;
}

export function staffCard(s: DbStaff): StaffCard {
  const domains = Object.fromEntries(COACH_DOMAINS.map((d) => [d, domainScore(s, d)])) as Record<CoachDomain, number>;
  const jobs = Object.fromEntries((Object.keys(STAFF_JOBS) as StaffJob[]).map((j) => [j, jobScore(s, j)])) as Record<StaffJob, number>;
  const best = [...COACH_DOMAINS].sort((a, b) => domains[b] - domains[a]).slice(0, 2);
  const topJob = (Object.keys(jobs) as StaffJob[]).sort((a, b) => jobs[b] - jobs[a])[0]!;
  return { staff: s, domains, jobs, best, bestJob: jobs[topJob] > domains[best[0]!] ? topJob : null };
}

/** Domaines au plus par entraîneur (au-delà, chaque domaine est moins bien suivi). */
export const MAX_DOMAINS_PER_COACH = 2;
/** Sous cette note, le domaine est à renforcer (environ « moyen » sur l'échelle du jeu). */
export const WEAK_DOMAIN = 12;

export interface DomainAssignment {
  domain: CoachDomain;
  coach: DbStaff | null;
  score: number | null;
  weak: boolean;
  /** Meilleur membre du staff libre pour ce domaine, s'il ferait mieux. */
  freeAgent: { staff: DbStaff; score: number } | null;
}

/**
 * Affectations proposées : chaque domaine au meilleur entraîneur disponible, au plus `MAX_DOMAINS_PER_COACH`
 * domaines chacun, en servant d'abord les paires (domaine, entraîneur) les mieux notées. Les membres du staff
 * dont le meilleur emploi est hors terrain (kiné, recruteur, analyste…) ne sont pris qu'en dernier recours.
 */
export function assignDomains(staff: DbStaff[], freeAgents: DbStaff[] = []): DomainAssignment[] {
  const cards = staff.map(staffCard);
  const pairs = cards
    .flatMap((c) => COACH_DOMAINS.map((d) => ({ c, d, score: c.domains[d], offPitch: c.bestJob != null })))
    .sort((a, b) => Number(a.offPitch) - Number(b.offPitch) || b.score - a.score || a.c.staff.id - b.c.staff.id);
  const load = new Map<number, number>();
  const chosen = new Map<CoachDomain, { staff: DbStaff; score: number }>();
  for (const { c, d, score } of pairs) {
    if (chosen.has(d) || (load.get(c.staff.id) ?? 0) >= MAX_DOMAINS_PER_COACH) continue;
    chosen.set(d, { staff: c.staff, score });
    load.set(c.staff.id, (load.get(c.staff.id) ?? 0) + 1);
  }
  return COACH_DOMAINS.map((domain) => {
    const own = chosen.get(domain) ?? null;
    let free: { staff: DbStaff; score: number } | null = null;
    for (const f of freeAgents) {
      const score = domainScore(f, domain);
      if (!free || score > free.score) free = { staff: f, score };
    }
    const better = free && free.score > (own?.score ?? 0) ? free : null;
    return { domain, coach: own?.staff ?? null, score: own?.score ?? null, weak: (own?.score ?? 0) < WEAK_DOMAIN, freeAgent: better };
  });
}

/** Meilleurs membres du staff libre pour un domaine ou un emploi. */
export function bestFreeAgents(freeAgents: DbStaff[], key: CoachDomain | StaffJob, limit = 10): { staff: DbStaff; score: number }[] {
  const score = (s: DbStaff) => ((COACH_DOMAINS as readonly string[]).includes(key) ? domainScore(s, key as CoachDomain) : jobScore(s, key as StaffJob));
  return freeAgents
    .map((s) => ({ staff: s, score: score(s) }))
    .sort((a, b) => b.score - a.score || a.staff.id - b.staff.id)
    .slice(0, limit);
}
