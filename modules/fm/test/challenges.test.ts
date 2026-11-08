import { describe, expect, it } from 'vitest';
import {
  buildCertificate,
  challengeFacts,
  evaluateChallenge,
  hasNationality,
  isRewind,
  isTopFlight,
  resultsBetween,
  shortDigest,
  verifyCertificate,
  type FmSnapshot,
  type Rewind,
} from '../src';

type Match = [gf: number, ga: number];
interface Opts {
  club?: string;
  league?: string;
  start?: string;
  ages?: number[];
  nats?: string[];
  editor?: boolean;
  /** Indices de matchs regroupés avec le suivant (deux matchs entre deux instantanés). */
  merge?: number[];
}

/** Une saison de championnat, un instantané avant le 1er match puis un après chaque match (11 titulaires, 90 minutes). */
function season(matches: Match[], o: Opts = {}): { gameDate: string; data: FmSnapshot }[] {
  const club = o.club ?? 'Toulouse FC';
  const league = o.league ?? 'Ligue 1 McDonald’s';
  const start = new Date(o.start ?? '2026-08-01');
  const ids = Array.from({ length: 11 }, (_, i) => `p${i}`);
  const tot = { tg: 0, tc: 0, won: 0, lost: 0, n: 0 };
  const out: { gameDate: string; data: FmSnapshot }[] = [];
  const shot = (k: number) => {
    const d = new Date(start.getTime() + k * 7 * 86_400_000).toISOString().slice(0, 10);
    const left = matches.length - tot.n;
    const data = {
      schema: 'archivix/1',
      game: 'FM27',
      club,
      gameDate: d,
      players: ids.map((id, i) => ({ id, name: `Joueur ${i}`, age: o.ages?.[i] ?? 25, apps: tot.n })),
      nextMatch: { opponent: `Adversaire ${tot.n}`, competition: league, location: 'Domicile', inDays: 3 },
      custom: {
        partie: { editeurUtilise: o.editor ?? false },
        equipe: { classementNom: league, classementPosition: 1, calendrierChampionnatRestant: Array.from({ length: left }, () => ({})) },
        joueurs: Object.fromEntries(
          ids.map((id, i) => [
            id,
            {
              id,
              nationalites: o.nats?.[i] ?? 'France',
              stat_Minutes: 90 * tot.n,
              stat_StartingAppearances: tot.n,
              stat_TeamGoals: tot.tg,
              stat_TeamConceded: tot.tc,
              stat_GamesWon: tot.won,
              stat_GamesLost: tot.lost,
            },
          ]),
        ),
      },
    } as unknown as FmSnapshot;
    out.push({ gameDate: d, data });
  };
  shot(0);
  let k = 1;
  matches.forEach(([gf, ga], i) => {
    tot.tg += gf;
    tot.tc += ga;
    tot.won += Number(gf > ga);
    tot.lost += Number(gf < ga);
    tot.n++;
    if (!o.merge?.includes(i)) shot(k++);
  });
  return out;
}

const facts = (h: ReturnType<typeof season>, more: Partial<Parameters<typeof challengeFacts>[1]> = {}) =>
  challengeFacts(h, { start: h[0]!.gameDate, unemployedStart: false, ...more });

const unbeaten: Match[] = [[2, 0], [1, 1], [3, 1], [0, 0]];

describe('défis vérifiés', () => {
  it('reconnaît les premières divisions et les nationalités', () => {
    expect(isTopFlight('Ligue 1 McDonald’s')).toBe(true);
    expect(isTopFlight('Ligue 2 BKT')).toBe(false);
    expect(isTopFlight('Bundesliga')).toBe(true);
    expect(isTopFlight('2. Bundesliga')).toBe(false);
    expect(hasNationality('France (Algérie)', 'france')).toBe(true);
    expect(hasNationality('Algérie', 'France')).toBe(false);
    expect(hasNationality(null, 'France')).toBeNull();
  });

  it('Invincibles : une saison suivie de bout en bout sans défaite', () => {
    const f = facts(season(unbeaten));
    expect(f.seasons[0]).toMatchObject({ ended: true, fixturesAtStart: 4 });
    expect(evaluateChallenge('invincibles', f).status).toBe('success');
    expect(evaluateChallenge('invincibles', facts(season([...unbeaten.slice(0, 3), [0, 1]]))).status).toBe('running');
  });

  it('Invincibles : une saison prise en cours de route ne prouve rien', () => {
    const h = season(unbeaten);
    const r = evaluateChallenge('invincibles', challengeFacts(h, { start: h[2]!.gameDate, unemployedStart: false }));
    expect(r.status).toBe('unproven');
    expect(r.issues[0]).toMatchObject({ kind: 'untracked' });
  });

  it('Invincibles : une défaite dans des matchs regroupés laisse la saison non prouvée', () => {
    const r = evaluateChallenge('invincibles', facts(season([[2, 0], [0, 1], [3, 0], [1, 0]], { merge: [0] })));
    expect(r.issues.some((i) => i.kind === 'unknownLoss')).toBe(true);
    expect(r.status).not.toBe('success');
  });

  it("l'éditeur en jeu élimine", () => {
    const r = evaluateChallenge('invincibles', facts(season(unbeaten, { editor: true })));
    expect(r.status).toBe('failed');
    expect(r.issues[0]).toMatchObject({ kind: 'editor' });
  });

  it('De zéro à héros : départ sans club et titre en première division', () => {
    const h = season(unbeaten);
    expect(evaluateChallenge('zero-to-hero', facts(h, { unemployedStart: true })).status).toBe('success');
    expect(evaluateChallenge('zero-to-hero', facts(season(unbeaten, { league: 'National' }), { unemployedStart: true })).status).toBe('running');
    expect(evaluateChallenge('zero-to-hero', facts(h)).status).toBe('failed');
  });

  it('Génération U19 : 10 matchs avec au moins 3 titulaires de moins de 19 ans', () => {
    const young = [17, 18, 18, 25, 25, 25, 25, 25, 25, 25, 25];
    const ten: Match[] = Array.from({ length: 10 }, () => [1, 0]);
    expect(evaluateChallenge('u19', facts(season(ten, { ages: young }))).status).toBe('success');
    const r = evaluateChallenge('u19', facts(season(ten.slice(0, 6), { ages: young })));
    expect(r).toMatchObject({ status: 'running', steps: [{ value: 6, target: 10 }] });
    expect(evaluateChallenge('u19', facts(season(ten, { ages: [17, 18, 25, 25, 25, 25, 25, 25, 25, 25, 25] }))).status).toBe('running');
  });

  it('Que des locaux : un étranger aligné fait échouer la saison', () => {
    expect(evaluateChallenge('locals', facts(season(unbeaten)), { nationality: 'France' }).status).toBe('success');
    const r = evaluateChallenge('locals', facts(season(unbeaten, { nats: ['France', 'Brésil'] })), { nationality: 'France' });
    expect(r.status).toBe('failed');
    expect(r.steps[1]!.detail).toContain('Brésil');
  });

  it('rechargement : noté une fois, et un match rejoué avec une autre issue fait échouer', () => {
    const first = season(unbeaten);
    expect(isRewind(first[4]!.gameDate, first[1]!.gameDate, true, [])).toBe(true);
    expect(isRewind(first[4]!.gameDate, first[1]!.gameDate, false, [])).toBe(false);
    const rewind: Rewind = { to: first[1]!.gameDate, from: first[4]!.gameDate, seenAt: '2026-11-07T20:00:00Z', results: resultsBetween(first, first[1]!.gameDate, first[4]!.gameDate) };
    expect(rewind.results).toHaveLength(3);
    expect(isRewind(first[4]!.gameDate, first[2]!.gameDate, true, [rewind])).toBe(false);

    // Même résultats après le rechargement : simple note.
    const same = evaluateChallenge('invincibles', facts(first, { rewinds: [rewind] }));
    expect(same.status).toBe('success');
    expect(same.issues).toEqual([{ kind: 'rewind', to: rewind.to, from: rewind.from }]);

    // Le 3e match, perdu puis rejoué jusqu'à un nul : échec.
    const lost = season([[2, 0], [1, 1], [0, 1], [0, 0]]);
    const rw: Rewind = { ...rewind, results: resultsBetween(lost, lost[1]!.gameDate, lost[4]!.gameDate) };
    const replay = season([[2, 0], [1, 1], [1, 1], [0, 0]]);
    const r = evaluateChallenge('invincibles', facts(replay, { rewinds: [rw] }));
    expect(r.status).toBe('failed');
    expect(r.issues[0]).toMatchObject({ kind: 'replayed', before: '0-1', after: '1-1' });
  });

  it('certificat : vérifié tel quel, refusé une fois modifié', async () => {
    const cert = await buildCertificate({
      challenge: 'invincibles',
      params: {},
      coach: 'Amnesix',
      appVersion: '0.1.46',
      createdAt: '2026-11-07T20:00:00Z',
      facts: facts(season(unbeaten)),
    });
    expect(cert.status).toBe('success');
    expect(shortDigest(cert.digest)).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
    const ok = await verifyCertificate(JSON.parse(JSON.stringify(cert)));
    expect(ok).toMatchObject({ ok: true, problems: [] });

    // Défaite effacée à la main : l'empreinte ne correspond plus.
    const edited = JSON.parse(JSON.stringify(cert));
    edited.facts.matches[1].ga = 0;
    expect((await verifyCertificate(edited)).problems).toEqual(expect.arrayContaining(['digest', 'scores']));

    // Faits refaits avec une nouvelle empreinte, mais un statut qui ne suit pas les règles.
    const forged = await buildCertificate({ ...cert, facts: facts(season([[0, 1], [1, 1], [3, 1], [0, 0]])) });
    const lie = { ...forged, status: 'success' };
    const { digest: _d, ...body } = lie;
    void _d;
    const re = await verifyCertificate({ ...body, digest: forged.digest });
    expect(re.ok).toBe(false);
    expect((await verifyCertificate({ format: 'autre' })).problems).toEqual(['format']);
  });
});
