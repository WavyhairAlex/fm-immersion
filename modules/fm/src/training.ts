import type { EffArea } from './project';

/**
 * Planning d'entraînement hebdomadaire de FM27, d'après la méthode « Freedom » publiée sur FM Scout
 * (« FM27 training schedules ») :
 * - présaison P1 à P4, bloc tactique T1 à T4, puis trois phases de saison A (4 premiers mois),
 *   B (3 mois suivants) et C (jusqu'à la fin) ;
 * - chaque phase tourne sur 4 semaines à thème (construction et possession, pressing et cohésion
 *   défensive, création et attaque, équilibre et coups de pied arrêtés) ; après la 4e on revient à la 1re,
 *   et une nouvelle phase repart à la semaine 1 ;
 * - chaque semaine de saison existe en 3 variantes selon les matchs : -0 (aucun), -1 (samedi),
 *   -2 (mercredi et samedi) ;
 * - veille de match = préparation de match ; lendemain de match = Récupération, Récupération,
 *   Esprit d'équipe ; aucune séance de Repos.
 * L'article ne fournit pas les fichiers .fmf : Archivix reconstruit chaque journée en appliquant ces
 * règles avec les séances de FM27 (noms relevés dans les textes du jeu), orientées par le style visé.
 */

/** Les séances de FM27 (libellés FR/EN dans fm.train.session.<id>). */
export const SESSIONS = {
  // Physique et récupération
  rest: 'physical',
  recovery: 'physical',
  lightConditioning: 'physical',
  conditioning: 'physical',
  heavyConditioning: 'physical',
  // Compréhension tactique (une séance par zone d'efficacité)
  passingStyle: 'tactical',
  buildUpStrategy: 'tactical',
  chanceCreation: 'tactical',
  inPossessionShape: 'tactical',
  lineOfEngagement: 'tactical',
  pressingIntensity: 'tactical',
  pressingTrap: 'tactical',
  outOfPossessionShape: 'tactical',
  // Préparation de match
  pressAvoidance: 'matchPrep',
  ballProgression: 'matchPrep',
  finalThird: 'matchPrep',
  defensiveBlock: 'matchPrep',
  defensivePositioning: 'matchPrep',
  defensiveEngagement: 'matchPrep',
  corners: 'matchPrep',
  freeKicks: 'matchPrep',
  // Développement footballistique (travail avec ballon)
  possessionBallWork: 'ballWork',
  attackingBalanced: 'ballWork',
  attackingPatient: 'ballWork',
  attackingDirect: 'ballWork',
  attackingWings: 'ballWork',
  defendingBalanced: 'ballWork',
  defendingEngaged: 'ballWork',
  defendingDisengaged: 'ballWork',
  defendingWide: 'ballWork',
  theoryAttacking: 'ballWork',
  theoryDefensive: 'ballWork',
  techChanceCreation: 'ballWork',
  techChanceConversion: 'ballWork',
  techBallRetention: 'ballWork',
  techGroundDefense: 'ballWork',
  techAerialDefense: 'ballWork',
  transitionRestrict: 'ballWork',
  transitionPress: 'ballWork',
  transitionProgress: 'ballWork',
  setPiecesDelivery: 'ballWork',
  setPiecesPenalties: 'ballWork',
  individualDevelopment: 'individual',
  // Autres activités (créneau « extra »)
  teamBonding: 'extra',
  communityOutreach: 'extra',
  travel: 'extra',
  // Le match lui-même
  match: 'match',
} as const;
export type SessionId = keyof typeof SESSIONS;
export type SessionCategory = (typeof SESSIONS)[SessionId];
export const sessionCategory = (s: SessionId): SessionCategory => SESSIONS[s];

export const TRAINING_PHASES = ['P', 'T', 'A', 'B', 'C'] as const;
export type TrainingPhase = (typeof TRAINING_PHASES)[number];
export type CycleWeek = 1 | 2 | 3 | 4;
/** Thème de chaque semaine du cycle (1 à 4). */
export const WEEK_THEMES = ['buildUp', 'pressing', 'attack', 'balance'] as const;
export type WeekTheme = (typeof WEEK_THEMES)[number];
export type DayKind = 'match' | 'recovery' | 'prep' | 'dev' | 'off';
/** Statut du club : un club semi-professionnel ou amateur ne s'entraîne que certains jours. */
export const CLUB_STATUSES = ['pro', 'semi', 'amateur'] as const;
export type ClubStatus = (typeof CLUB_STATUSES)[number];
/** Jours d'entraînement par défaut d'un club non professionnel (mardi et jeudi soir), réglables. */
export const PART_TIME_DAYS = [1, 3];

export interface TrainingDay {
  /** Date ISO (AAAA-MM-JJ). */
  date: string;
  /** 0 = lundi … 6 = dimanche. */
  weekday: number;
  kind: DayKind;
  /** Séance 1, séance 2, créneau « extra ». */
  sessions: [SessionId | null, SessionId | null, SessionId | null];
}

export interface TrainingWeek {
  /** Code de la méthode : P1, T3, A2-1… */
  code: string;
  phase: TrainingPhase;
  week: CycleWeek;
  /** Variante de saison (0, 1 ou 2 matchs) ; null en présaison et en bloc tactique. */
  variant: 0 | 1 | 2 | null;
  theme: WeekTheme | null;
  days: TrainingDay[];
}

export interface TrainingInput {
  /** Lundi de la semaine (ISO). */
  monday: string;
  phase: TrainingPhase;
  week: CycleWeek;
  /** Jours de match de la semaine (0 = lundi … 6 = dimanche), amicaux compris. */
  matchDays: number[];
  /** Match la veille du lundi (dimanche précédent) : le lundi devient une journée de récupération. */
  matchBeforeMonday?: boolean;
  /**
   * Jours où le club s'entraîne (0 = lundi … 6 = dimanche). Absent : tous les jours (club professionnel).
   * Les autres jours sans match sont libres : pas de séance.
   */
  trainingDays?: number[];
  /** Zones tactiques à prioriser, de la plus importante à la moins importante (style visé, efficacité). */
  priorities?: EffArea[];
  /** Identifiant du style visé, pour choisir la variante des séances offensives et défensives. */
  style?: string;
}

/* ---------- Dates ---------- */

const DAY = 864e5;
const utc = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (isoDate: string, n: number) => iso(new Date(utc(isoDate).getTime() + n * DAY));
/** Lundi de la semaine qui contient la date. */
export function mondayOf(isoDate: string): string {
  const d = utc(isoDate);
  return addDays(isoDate, -((d.getUTCDay() + 6) % 7));
}

/**
 * Phase et semaine du cycle pour une date, à partir du mois de reprise du championnat (1 à 12).
 * Présaison : les 4 semaines qui précèdent le 1er du mois de reprise. A : 4 premiers mois,
 * B : 3 mois suivants, C : le reste. La semaine du cycle compte les lundis depuis le début de la phase.
 */
export function autoPhase(isoDate: string, seasonStart: number): { phase: TrainingPhase; week: CycleWeek } {
  const monday = mondayOf(isoDate);
  const y = utc(monday).getUTCFullYear();
  const startOf = (year: number) => `${year}-${String(seasonStart).padStart(2, '0')}-01`;
  // Reprise retenue : la plus récente dont la présaison (4 semaines avant) a commencé.
  const start = [y + 1, y, y - 1].map(startOf).find((s) => mondayOf(addDays(s, -28)) <= monday)!;
  const weekFrom = (from: string) => (Math.floor((utc(monday).getTime() - utc(mondayOf(from)).getTime()) / (7 * DAY)) % 4) + 1;
  if (monday < mondayOf(start)) return { phase: 'P', week: weekFrom(addDays(start, -28)) as CycleWeek };
  const monthAdd = (m: number) => {
    const s = utc(start);
    s.setUTCMonth(s.getUTCMonth() + m);
    return iso(s);
  };
  const b = monthAdd(4);
  const c = monthAdd(7);
  if (monday < mondayOf(b)) return { phase: 'A', week: weekFrom(start) as CycleWeek };
  if (monday < mondayOf(c)) return { phase: 'B', week: weekFrom(b) as CycleWeek };
  return { phase: 'C', week: weekFrom(c) as CycleWeek };
}

/** Jours de match de la semaine d'après le calendrier de l'instantané (amicaux compris). */
export function weekMatches(fixtures: unknown, monday: string): { days: number[]; before: boolean; opponents: Record<number, string | null> } {
  const list = Array.isArray(fixtures) ? (fixtures as Record<string, unknown>[]) : [];
  const days = new Set<number>();
  const opponents: Record<number, string | null> = {};
  let before = false;
  const sunday = addDays(monday, 6);
  const eve = addDays(monday, -1);
  for (const f of list) {
    if (typeof f.date !== 'string') continue;
    const d = f.date.slice(0, 10);
    if (d === eve) before = true;
    if (d < monday || d > sunday) continue;
    const wd = Math.round((utc(d).getTime() - utc(monday).getTime()) / DAY);
    days.add(wd);
    opponents[wd] = typeof f.opponent === 'string' ? f.opponent : null;
  }
  return { days: [...days].sort((a, b) => a - b), before, opponents };
}

/** Jours de match par défaut de la méthode quand le calendrier n'est pas connu. */
export function defaultMatchDays(phase: TrainingPhase, week: CycleWeek, variant: 0 | 1 | 2): number[] {
  if (phase === 'P') return week === 3 ? [2, 5] : week === 4 ? [2] : [];
  if (phase === 'T') return [2];
  return variant === 2 ? [2, 5] : variant === 1 ? [5] : [];
}

/* ---------- Contenu des semaines ---------- */

type Pick = SessionId | 'ATT' | 'DEF';
interface ThemeContent {
  tactical: EffArea[];
  ball: Pick[];
  prep: SessionId[];
}
/** Séances de chaque thème : compréhension tactique, travail avec ballon, préparation de match. */
const THEMES: Record<WeekTheme, ThemeContent> = {
  buildUp: {
    tactical: ['buildUpStrategy', 'passingStyle', 'inPossessionShape'],
    ball: ['possessionBallWork', 'techBallRetention', 'transitionProgress', 'ATT'],
    prep: ['pressAvoidance', 'ballProgression'],
  },
  pressing: {
    tactical: ['pressingIntensity', 'pressingTrap', 'lineOfEngagement', 'outOfPossessionShape'],
    ball: ['DEF', 'transitionPress', 'techGroundDefense', 'theoryDefensive'],
    prep: ['defensiveEngagement', 'defensiveBlock'],
  },
  attack: {
    tactical: ['chanceCreation', 'inPossessionShape', 'passingStyle'],
    ball: ['ATT', 'techChanceCreation', 'techChanceConversion', 'theoryAttacking'],
    prep: ['finalThird', 'ballProgression'],
  },
  balance: {
    tactical: ['outOfPossessionShape', 'inPossessionShape', 'lineOfEngagement'],
    ball: ['defendingBalanced', 'attackingBalanced', 'techAerialDefense', 'transitionRestrict', 'setPiecesDelivery'],
    prep: ['defensivePositioning', 'corners', 'freeKicks'],
  },
};

/** Variante offensive et défensive des séances avec ballon selon le style visé. */
const ATTACK_BY_STYLE: Record<string, SessionId> = {
  possession: 'attackingPatient',
  tikitaka: 'attackingPatient',
  'tikitaka-v': 'attackingPatient',
  catenaccio: 'attackingPatient',
  longball: 'attackingDirect',
  'counter-direct': 'attackingDirect',
  'counter-fluid': 'attackingDirect',
  gegenpress: 'attackingDirect',
  wings: 'attackingWings',
};
const DEFENCE_BY_STYLE: Record<string, SessionId> = {
  gegenpress: 'defendingEngaged',
  tikitaka: 'defendingEngaged',
  'tikitaka-v': 'defendingEngaged',
  possession: 'defendingEngaged',
  catenaccio: 'defendingDisengaged',
  'ultra-def': 'defendingDisengaged',
  'counter-direct': 'defendingDisengaged',
  'counter-fluid': 'defendingDisengaged',
  wings: 'defendingWide',
};

/** Ordonne les séances tactiques : celles des zones prioritaires d'abord, dans l'ordre des priorités. */
function byPriority(list: EffArea[], priorities: EffArea[]): EffArea[] {
  const rank = (a: EffArea) => {
    const i = priorities.indexOf(a);
    return i < 0 ? 99 : i;
  };
  return [...list].sort((a, b) => rank(a) - rank(b));
}

/** Tirage circulaire dans une liste. */
function cycler<T>(list: T[]) {
  let i = 0;
  return () => list[i++ % list.length]!;
}

export function buildTrainingWeek(input: TrainingInput): TrainingWeek {
  const { phase, week, monday } = input;
  const priorities = input.priorities ?? [];
  const matchDays = new Set(input.matchDays.filter((d) => d >= 0 && d <= 6));
  const seasonal = phase === 'A' || phase === 'B' || phase === 'C';
  const variant = seasonal ? (Math.min(2, matchDays.size) as 0 | 1 | 2) : null;
  const theme: WeekTheme | null = phase === 'P' ? null : WEEK_THEMES[week - 1]!;
  const code = seasonal ? `${phase}${week}-${variant}` : `${phase}${week}`;

  const training = input.trainingDays ? new Set(input.trainingDays) : null;
  const kindOf = (d: number): DayKind => {
    if (matchDays.has(d)) return 'match';
    if (training && !training.has(d)) return 'off';
    if (d === 0 ? input.matchBeforeMonday : matchDays.has(d - 1)) return 'recovery';
    if (matchDays.has(d + 1)) return 'prep';
    return 'dev';
  };
  const kinds = Array.from({ length: 7 }, (_, d) => kindOf(d));
  if (training) {
    // Club à temps partiel : la dernière séance avant un match (jusqu'à 2 jours avant) sert de préparation.
    for (const m of matchDays) {
      for (const d of [m - 1, m - 2]) {
        if (d < 0) break;
        if (kinds[d] === 'match' || kinds[d] === 'recovery') break;
        if (kinds[d] === 'dev' || kinds[d] === 'prep') {
          kinds[d] = 'prep';
          break;
        }
      }
    }
  }

  const resolve = (p: Pick): SessionId => (p === 'ATT' ? ATTACK_BY_STYLE[input.style ?? ''] ?? 'attackingBalanced' : p === 'DEF' ? DEFENCE_BY_STYLE[input.style ?? ''] ?? 'defendingBalanced' : p);
  const content = theme ? THEMES[theme] : null;
  const tactical = cycler<SessionId>(
    phase === 'T'
      ? byPriority([...new Set<EffArea>([...priorities, ...(content?.tactical ?? []), 'inPossessionShape', 'outOfPossessionShape'])], priorities)
      : byPriority(content?.tactical ?? ['inPossessionShape'], priorities),
  );
  const ball = cycler<SessionId>((content?.ball ?? ['possessionBallWork']).map(resolve));
  const prep = cycler<SessionId>(content?.prep ?? ['pressAvoidance']);
  const setPieces = cycler<SessionId>(['corners', 'freeKicks']);

  const devDays = kinds.flatMap((k, d) => (k === 'dev' ? [d] : []));
  const lastDev = devDays.at(-1);
  // Jour de condition physique de la semaine : premier jour de travail qui n'est pas l'avant-veille d'un match.
  const fitnessDay = devDays.find((d) => !matchDays.has(d + 2)) ?? null;
  const bondingDay = devDays.length >= 2 ? devDays[Math.floor(devDays.length / 2)] : null;

  const devSessions = (d: number): TrainingDay['sessions'] => {
    const weekend = d >= 5;
    switch (phase) {
      case 'P': {
        if (week === 1) return weekend ? ['lightConditioning', 'recovery', null] : [d % 2 ? 'heavyConditioning' : 'conditioning', 'lightConditioning', null];
        if (week === 2) return weekend ? ['lightConditioning', 'recovery', 'lightConditioning'] : ['conditioning', d % 2 ? 'heavyConditioning' : 'lightConditioning', 'lightConditioning'];
        if (week === 3) return [(['possessionBallWork', 'techBallRetention', 'attackingBalanced', 'defendingBalanced'] as SessionId[])[d % 4]!, 'conditioning', null];
        return [(['passingStyle', 'buildUpStrategy', resolve('ATT'), resolve('DEF')] as SessionId[])[d % 4]!, d % 2 ? 'conditioning' : 'lightConditioning', null];
      }
      case 'T':
        return [tactical(), d === lastDev ? 'individualDevelopment' : tactical(), null];
      default: {
        let s2: SessionId = ball();
        if (d === fitnessDay && variant !== 2) s2 = phase === 'C' ? 'lightConditioning' : 'conditioning';
        else if (phase === 'C' && d % 2 === 0) s2 = 'setPiecesDelivery';
        else if (variant === 0 && d === lastDev) s2 = 'individualDevelopment';
        const extra: SessionId | null = phase === 'B' && d === bondingDay ? 'teamBonding' : null;
        return [tactical(), s2, extra];
      }
    }
  };

  const prepSessions = (): TrainingDay['sessions'] => {
    if (phase === 'P') return ['lightConditioning', 'possessionBallWork', null];
    if (phase === 'A') return [prep(), 'lightConditioning', null];
    if (phase === 'B') return [prep(), prep(), null];
    return [prep(), setPieces(), null];
  };

  const days: TrainingDay[] = kinds.map((kind, d) => ({
    date: addDays(monday, d),
    weekday: d,
    kind,
    sessions:
      kind === 'off' ? [null, null, null] : kind === 'match' ? ['match', null, null] : kind === 'recovery' ? ['recovery', 'recovery', 'teamBonding'] : kind === 'prep' ? prepSessions() : devSessions(d),
  }));

  // Le projet oriente l'entraînement : la zone n° 1 du style visé est travaillée au moins une fois par semaine.
  const top = priorities[0];
  if (top && seasonal && !days.some((x) => x.sessions.includes(top))) {
    const first = days.find((x) => x.kind === 'dev');
    const prepDay = days.find((x) => x.kind === 'prep');
    if (first) first.sessions[0] = top;
    else if (prepDay) prepDay.sessions[1] = top;
  }
  return { code, phase, week, variant, theme, days };
}

/** Nombre de séances de chaque catégorie dans la semaine (hors match). */
export function weekLoad(w: TrainingWeek): Partial<Record<SessionCategory, number>> {
  const out: Partial<Record<SessionCategory, number>> = {};
  for (const d of w.days) for (const s of d.sessions) if (s && s !== 'match') out[SESSIONS[s]] = (out[SESSIONS[s]] ?? 0) + 1;
  return out;
}

/* ---------- Programme du jeu le plus proche ---------- */

/** Programmes d'entraînement prédéfinis de FM27 (libellés dans fm.train.preset.<id>). */
export const GAME_PRESETS = ['preSeason', 'tacticalBalanced', 'tacticalIP', 'tacticalOOP', 'match', 'mix', 'devBalanced', 'devIP', 'devOOP', 'congestion'] as const;
export type GamePreset = (typeof GAME_PRESETS)[number];

/** Programme prédéfini du jeu le plus proche de la semaine, à charger puis ajuster séance par séance. */
export function nearestPreset(w: TrainingWeek): GamePreset {
  if (w.phase === 'P') return 'preSeason';
  if (w.variant === 2) return 'congestion';
  const side = w.theme === 'pressing' ? 'OOP' : w.theme === 'balance' ? 'Balanced' : 'IP';
  if (w.phase === 'T') return `tactical${side}` as GamePreset;
  if (w.phase === 'A') return `dev${side}` as GamePreset;
  return w.phase === 'B' ? 'mix' : 'match';
}

/* ---------- Entraînement individuel ---------- */

export const INDIVIDUAL_INTENSITIES = ['none', 'low', 'medium', 'high', 'veryHigh'] as const;
export type IndividualIntensity = (typeof INDIVIDUAL_INTENSITIES)[number];
export type IntensityReason = 'injured' | 'veryTired' | 'tired' | 'young' | 'veteran' | 'normal';
export interface IndividualAdvice {
  intensity: IndividualIntensity;
  reason: IntensityReason;
  /** Manque de rythme : a besoin de temps de jeu (match de l'équipe réserve ou entrée en jeu). */
  rusty: boolean;
}

/**
 * Intensité individuelle conseillée : jamais « très élevée » d'office (risque de blessure),
 * baissée si la condition est entamée, montée pour les jeunes qui progressent le plus.
 */
export function individualAdvice(p: { age: number | null; condition: number | null; sharpness: number | null; injury: string | null }): IndividualAdvice {
  const rusty = !p.injury && p.sharpness != null && p.sharpness < 70;
  if (p.injury) return { intensity: 'none', reason: 'injured', rusty: false };
  if (p.condition != null && p.condition < 80) return { intensity: 'low', reason: 'veryTired', rusty };
  if (p.condition != null && p.condition < 90) return { intensity: 'medium', reason: 'tired', rusty };
  if (p.age != null && p.age <= 21) return { intensity: 'high', reason: 'young', rusty };
  if (p.age != null && p.age >= 32) return { intensity: 'medium', reason: 'veteran', rusty };
  return { intensity: 'medium', reason: 'normal', rusty };
}

/* ---------- Groupes d'encadrement ---------- */

/** Personnalités défavorables (FR/EN du jeu) : à tenir à l'écart des jeunes, l'influence se transmet. */
const BAD_PERSONALITY = /peu professionnel|unprofessional|peu ambitieux|unambitious|tempéramental|temperamental|mercenaire|mercenary|désinvolte|casual|nonchalant|slack|manque de détermination|low determination|antisportif|unsporting|volatile|facilement découragé|easily discouraged|influençable|spineless|craintif|low self.belief/i;
/** Personnalités favorables : modèles pour les jeunes. */
const GOOD_PERSONALITY = /professionnel|professional|déterminé|determined|résolu|resolute|ambitieux|ambitious|perfectionni|leader|meneur|charismatique|charismatic|vaillant|spirited|dévoué|devoted|loyal|fidèle|honnête|honest|sportif|sporting/i;

export type PersonalityTone = 'good' | 'bad' | 'neutral';
export function personalityTone(p: string | null | undefined): PersonalityTone {
  if (!p) return 'neutral';
  if (BAD_PERSONALITY.test(p)) return 'bad';
  return GOOD_PERSONALITY.test(p) ? 'good' : 'neutral';
}

type MentorPlayer = {
  id: string;
  name: string;
  age: number | null;
  line: string | null;
  level: number | null;
  personality: string | null;
  hierarchy: string | null;
  attributes: Record<string, number>;
  team?: string | null;
};

export interface MentoringGroup<P extends MentorPlayer = MentorPlayer> {
  mentor: P;
  mentees: P[];
}
export interface Mentoring<P extends MentorPlayer = MentorPlayer> {
  groups: MentoringGroup<P>[];
  /** Joueurs d'influence à la personnalité défavorable : à ne pas mettre avec les jeunes. */
  avoid: P[];
  /** Jeunes sans tuteur disponible. */
  unassigned: P[];
}

const influence = (p: MentorPlayer) => (/leader|meneur|chef/i.test(p.hierarchy ?? '') ? 2 : /influen/i.test(p.hierarchy ?? '') ? 1 : 0);

/**
 * Groupes d'encadrement : un tuteur expérimenté (24 ans et plus, personnalité favorable ou détermination
 * élevée, influent dans le vestiaire) avec jusqu'à 3 jeunes (21 ans et moins), du même secteur de préférence.
 * Les jeunes qui ont déjà une bonne personnalité passent après les autres.
 */
export function mentoringGroups<P extends MentorPlayer>(players: P[], maxPerMentor = 3): Mentoring<P> {
  const squad = players.filter((p) => !p.team);
  const det = (p: MentorPlayer) => p.attributes.Determination ?? 10;
  const mentorScore = (p: P) => (personalityTone(p.personality) === 'good' ? 3 : 0) + influence(p) * 1.5 + (det(p) - 10) / 4 + ((p.age ?? 0) >= 28 ? 1 : 0);
  const mentors = squad
    .filter((p) => (p.age ?? 0) >= 24 && personalityTone(p.personality) !== 'bad' && (personalityTone(p.personality) === 'good' || det(p) >= 14))
    .sort((a, b) => mentorScore(b) - mentorScore(a));
  const mentees = squad
    .filter((p) => p.age != null && p.age <= 21)
    .sort((a, b) => (personalityTone(a.personality) === 'good' ? 1 : 0) - (personalityTone(b.personality) === 'good' ? 1 : 0) || (b.level ?? 0) - (a.level ?? 0));
  const avoid = squad.filter((p) => personalityTone(p.personality) === 'bad' && (influence(p) > 0 || (p.age ?? 0) >= 24));

  const groups: MentoringGroup<P>[] = [];
  const unassigned: P[] = [];
  for (const y of mentees) {
    // Tuteur du même secteur s'il a de la place, sinon le premier tuteur avec de la place.
    const open = (m: P) => {
      const g = groups.find((x) => x.mentor.id === m.id);
      return !g || g.mentees.length < maxPerMentor;
    };
    const m = mentors.find((x) => x.line === y.line && open(x)) ?? mentors.find(open);
    if (!m) {
      unassigned.push(y);
      continue;
    }
    let g = groups.find((x) => x.mentor.id === m.id);
    if (!g) groups.push((g = { mentor: m, mentees: [] }));
    g.mentees.push(y);
  }
  return { groups, avoid, unassigned };
}
