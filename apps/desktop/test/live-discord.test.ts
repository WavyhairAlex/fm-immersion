import type { FmLive } from '@fm-immersion/module-fm';
import type { TFunction } from 'i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: { cmd: string; args: Record<string, unknown> }[] = [];
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args: Record<string, unknown>) => {
    calls.push({ cmd, args });
    return cmd === 'discord_post' ? '42' : undefined;
  }),
}));

const { commentary, goalSituation, lastMatchStats, liveContext, liveStep, matchEnded, matchFigures, matchPhase, minuteOf, progressBar, scoreboardPayload, timeline } = await import('../src/lib/live-discord');
const t = ((k: string, o?: Record<string, unknown>) => (o ? `${k} ${JSON.stringify(o)}` : k)) as unknown as TFunction;

const at = '2026-11-07T07:20:00.000Z';
const now = Date.parse(at);
const base: FmLive = {
  schema: 'archivix-live/1',
  gameDate: '2027-04-21',
  updatedAt: at,
  home: 'Inter Bratislava',
  away: 'Malženice',
  homeScore: 0,
  awayScore: 0,
  minute: '1 min.',
  final: false,
  scorers: '',
};

describe('direct Discord', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it('donne du relief : doublé, buts de la saison, classement au coup d\'envoi, chiffres', () => {
    const ctx = liveContext({
      nextMatch: { competition: '2. liga', threatLevel: 'Il ne sera pas évident de battre Inter Bratislava.' },
      custom: { equipe: { classementPosition: 4 } },
      players: [{ name: 'Marek Fábry', goals: 12 }, { name: 'Arthur', goals: 15 }],
    });
    expect(ctx).toMatchObject({ position: 4, friendly: false, topScorer: { name: 'Arthur', goals: 15 } });
    const one = { ...base, awayScore: 1, minute: '12 min.', scorers: "M. Fábry 11'", context: ctx } as FmLive;
    expect(commentary(t, one, 'Malženice', timeline(one)!.at(-1)!)).toContain('live.fact.tally {"count":13}');
    const two = { ...base, awayScore: 2, minute: '40 min.', scorers: "M. Fábry 11', 38'", context: ctx } as FmLive;
    expect(commentary(t, two, 'Malženice', timeline(two)!.at(-1)!)).toContain('live.fact.brace');
    const ko = commentary(t, { ...base, context: ctx } as FmLive, 'Malženice', null);
    expect(ko).toContain('live.fact.position');
    expect(ko).toContain('Il ne sera pas évident');
    expect(matchFigures(t, { ...two, homeScore: 1, scorers: "Novák 70', M. Fábry 11', 38'" } as FmLive)).toContain('"first":"0 - 2","second":"1 - 0"');
    // Amical : pas de total de la saison.
    const friendly = { ...one, context: { ...ctx, friendly: true } } as FmLive;
    expect(commentary(t, friendly, 'Malženice', timeline(friendly)!.at(-1)!)).not.toContain('tally');
  });

  it("annonce la compétition dans l'encart (match amical)", () => {
    const p = scoreboardPayload(t, { ...base, competition: 'Match Amical' } as FmLive, 'Malženice');
    expect(p.embeds[0]!.author.name).toBe('live.liveTag  ·  MATCH AMICAL');
    expect(scoreboardPayload(t, base, 'Malženice').embeds[0]!.author.name).toBe('live.liveTag');
  });

  it('poste un seul encart puis le modifie : but, puis fin du match', async () => {
    let s = await liveStep(t, base, 'Malženice', null, now);
    expect(calls.map((c) => c.cmd)).toEqual(['discord_post']);
    expect(s?.messageId).toBe('42');
    calls.length = 0;
    s = await liveStep(t, { ...base, awayScore: 1, minute: '11 min.', scorers: "M. Fábry 11'" }, 'Malženice', s, now);
    expect(calls.map((c) => c.cmd)).toEqual(['discord_edit']);
    const embed = (calls[0]!.args.payload as { embeds: { description: string; fields: { value: string }[] }[] }).embeds[0]!;
    expect(embed.description).toContain('live.say.for_opener_');
    expect(embed.description).toContain('M. Fábry');
    expect(embed.description).toContain("⏱️ 11'");
    expect(embed.fields[0]!.value).toContain('**M. Fábry**');
    calls.length = 0;
    s = await liveStep(t, { ...s!.last, minute: 'FDM', final: true }, 'Malženice', s, now);
    expect(calls.map((c) => c.cmd)).toEqual(['discord_edit']);
    expect(s?.done).toBe(true);
    calls.length = 0;
    await liveStep(t, { ...s!.last }, 'Malženice', s, now);
    expect(calls).toEqual([]);
  });

  it("clôt l'encart quand le plugin cesse d'écrire après la 85e (match fini sans relevé final)", async () => {
    let s = await liveStep(t, base, 'Malženice', null, now);
    calls.length = 0;
    const stuck = { ...base, homeScore: 1, minute: '93 min.', scorers: "T. Astorga 23'" } as FmLive;
    s = await liveStep(t, stuck, 'Malženice', s, now);
    calls.length = 0;
    const later = now + 4 * 60_000;
    // Relevé périmé, rien ne dit que le match est fini : on attend.
    expect(matchEnded(stuck, { gameDate: '2027-08-14', nextMatch: { inDays: "Aujourd'hui" } }, now + 60_000)).toBeNull();
    // Trois minutes sans écriture à la 93e : fini.
    const ended = matchEnded(stuck, { gameDate: '2027-08-14' }, later);
    expect(ended).toEqual({ score: null });
    s = await liveStep(t, stuck, 'Malženice', s, later, undefined, ended);
    expect(calls.map((c) => c.cmd)).toEqual(['discord_edit']);
    expect(s?.done).toBe(true);
    expect(s?.last.final).toBe(true);
    const embed = (calls[0]!.args.payload as { embeds: { author: { name: string }; description: string }[] }).embeds[0]!;
    expect(embed.author.name).toContain('live.finalTag');
    expect(embed.description).toContain('live.ended');
    calls.length = 0;
    await liveStep(t, stuck, 'Malženice', s, later, undefined, ended);
    expect(calls).toEqual([]);
    // Score du dernier match dans l'instantané, le lendemain : repris tel quel.
    const snap = { gameDate: '2027-08-15', custom: { equipe: { dernierMatchScoreDomicile: '1', dernierMatchScoreExterieur: '0' } } };
    expect(matchEnded(stuck, snap, now + 150_000)).toEqual({ score: [1, 0] });
    expect(matchEnded({ ...stuck, final: true }, snap, later)).toBeNull();
  });

  it('ignore un relevé ancien ou un match déjà fini', async () => {
    expect(await liveStep(t, base, null, null, now + 10 * 60_000)).toBeNull();
    const s = await liveStep(t, { ...base, final: true }, null, null, now);
    expect(s?.done).toBe(true);
    expect(calls).toEqual([]);
  });

  it('minute, barre de progression, situation du but et déroulé', () => {
    expect(minuteOf('62 min.')).toBe(62);
    expect(minuteOf("90+3'")).toBe(93);
    expect(minuteOf('FDM')).toBeNull();
    expect(progressBar(45)).toBe('▰▰▰▰▰▱▱▱▱▱');
    expect(progressBar(120)).toBe('▰▰▰▰▰▰▰▰▰▰');
    expect([goalSituation(1, 0), goalSituation(1, 1), goalSituation(2, 1), goalSituation(3, 1), goalSituation(1, 2)]).toEqual([
      'opener',
      'equalise',
      'lead',
      'extend',
      'reduce',
    ]);
    const tl = timeline({ ...base, homeScore: 2, awayScore: 1, scorers: "L. Carrero pen 36', M. Kušnír 61', M. Fábry 11'" });
    expect(tl?.map((g) => [g.minute, g.side, g.name])).toEqual([
      [11, 'away', 'M. Fábry'],
      [36, 'home', 'L. Carrero'],
      [61, 'home', 'M. Kušnír'],
    ]);
  });

  it('le commentateur suit le match quand aucun but ne tombe', () => {
    expect([1, 10, 30, 45, 60, 80, 92].map(matchPhase)).toEqual(['kickoff', 'early', 'mid', 'half', 'second', 'late', 'stoppage']);
    expect(commentary(t, { ...base, minute: '45 min.' }, 'Malženice', null)).toMatch(/^live\.say\.half_level_/);
    const l = { ...base, awayScore: 1, minute: '70 min.', scorers: "M. Fábry 11'" };
    const goal = timeline(l)!.at(-1)!;
    expect(commentary(t, l, 'Malženice', goal)).toMatch(/^live\.say\.second_lead_.*"leader":"Malženice"/);
    expect(commentary(t, { ...l, minute: '14 min.' }, 'Malženice', goal)).toMatch(/^live\.say\.for_opener_/);
  });
});

describe('chiffres du jeu après le match', () => {
  const fin: FmLive = { ...base, homeScore: 1, awayScore: 2, minute: 'FDM', final: true, scorers: "M. Fábry 11', 38', Novák 70'" };
  const snap = {
    gameDate: '2027-04-22',
    custom: { equipe: { dernierMatchScoreDomicile: '1', dernierMatchScoreExterieur: '2', dernierMatchPossDom: 33, dernierMatchPossExt: 67, dernierMatchTirsDom: 5, dernierMatchTirsExt: 12, dernierMatchTirsCadresDom: 1, dernierMatchTirsCadresExt: 6, dernierMatchXgDom: 0.4, dernierMatchXgExt: 2.1, dernierMatchHommeDuMatch: 'Marek Fábry', dernierMatchNoteHommeDuMatch: 8.4 } },
  };

  it('reconnaît le match par son score, dans la semaine, et refuse des chiffres vides', () => {
    expect(lastMatchStats(snap, fin)).toMatchObject({ possession: [33, 67], shots: [5, 12], onTarget: [1, 6], xg: [0.4, 2.1], motm: { name: 'Marek Fábry', rating: 8.4 } });
    expect(lastMatchStats(snap, { ...fin, final: false })).toBeNull();
    expect(lastMatchStats({ ...snap, gameDate: '2027-05-10' }, fin)).toBeNull();
    expect(lastMatchStats({ ...snap, custom: { equipe: { ...snap.custom.equipe, dernierMatchScoreDomicile: '2' } } }, fin)).toBeNull();
    expect(lastMatchStats({ ...snap, custom: { equipe: { ...snap.custom.equipe, dernierMatchPossDom: 50, dernierMatchPossExt: 50, dernierMatchTirsDom: 0, dernierMatchTirsExt: 0 } } }, fin)).toBeNull();
  });

  it('complète l’encart une seule fois quand les chiffres arrivent, même avec un relevé ancien', async () => {
    let s = await liveStep(t, base, 'Malženice', null, now);
    s = await liveStep(t, fin, 'Malženice', s, now);
    expect(s?.done).toBe(true);
    calls.length = 0;
    const late = now + 4 * 60_000;
    s = await liveStep(t, fin, 'Malženice', s, late);
    expect(calls).toEqual([]);
    const withStats = { ...fin, stats: lastMatchStats(snap, fin) } as FmLive;
    s = await liveStep(t, withStats, 'Malženice', s, late);
    expect(calls.map((c) => c.cmd)).toEqual(['discord_edit']);
    const figures = (calls[0]!.args.payload as { embeds: { fields: { name: string; value: string }[] }[] }).embeds[0]!.fields.find((f) => f.name === 'live.figures.title')!.value;
    expect(figures).toContain('live.figures.possession {"home":"33 %","away":"67 %"}');
    expect(figures).toContain('live.figures.shots {"home":5,"away":12,"homeOn":1,"awayOn":6}');
    expect(figures).toContain('live.figures.motm {"name":"Marek Fábry","rating":"8,4"}');
    expect(figures).toContain('live.figures.halves');
    expect(s?.stats).toBe(true);
    calls.length = 0;
    await liveStep(t, withStats, 'Malženice', s, late);
    expect(calls).toEqual([]);
  });
});
