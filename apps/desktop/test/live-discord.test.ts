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

const { goalSituation, liveStep, minuteOf, progressBar, timeline } = await import('../src/lib/live-discord');
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
});
