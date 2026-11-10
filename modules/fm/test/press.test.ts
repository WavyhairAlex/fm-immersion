import { describe, expect, it } from 'vitest';
import { pendingConference, postMatchConference, preMatchConference, type FmSnapshot, type GazetteStory } from '../src';

type P = { id: string; name?: string; min: number; starts: number; tg: number; tc: number; goals?: number; injury?: string };

/** Instantané minimal (même forme que dans gazette.test.ts). */
function snap(date: string, given: P[], equipe: Record<string, unknown> = {}, extra: Record<string, unknown> = {}): FmSnapshot {
  const gk = given.find((p) => p.id === 'gk');
  const mates = gk ? Array.from({ length: 9 }, (_, i) => ({ ...gk, id: `f${i}`, name: `F${i}`, goals: 0, injury: undefined })) : [];
  const ps = [...given, ...mates];
  return {
    schema: 'archivix/1',
    game: 'FM27',
    club: 'FCV Dender',
    gameDate: date,
    players: ps.map((p) => ({ id: p.id, name: p.name ?? `J${p.id}`, positions: p.id === 'gk' ? 'GB' : 'MC', apps: p.starts, goals: p.goals ?? 0, injury: p.injury ?? null })),
    custom: {
      equipe,
      joueurs: Object.fromEntries(
        ps.map((p) => [p.id, { id: p.id, stat_Minutes: p.min, stat_StartingAppearances: p.starts, stat_SubAppearances: 0, stat_TeamGoals: p.tg, stat_TeamConceded: p.tc, stat_ManOfMatch: 0 }]),
      ),
    },
    ...extra,
  } as unknown as FmSnapshot;
}

const before = snap('2026-10-18', [
  { id: 'gk', min: 90, starts: 1, tg: 1, tc: 1 },
  { id: 'st', name: 'Diallo', min: 90, starts: 1, tg: 1, tc: 1, goals: 1 },
], {}, { nextMatch: { opponent: 'Eupen', competition: 'Pro League', location: 'Domicile', inDays: 'Dans 1 jour' } });
// Victoire 3-0, triplé de Diallo, puis une affiche de coupe annoncée dans 3 jours.
const after = snap(
  '2026-10-20',
  [
    { id: 'gk', min: 180, starts: 2, tg: 4, tc: 1 },
    { id: 'st', name: 'Diallo', min: 180, starts: 2, tg: 4, tc: 1, goals: 4 },
  ],
  { classementPosition: 5, advButeur: 'Dolberg', advButs: 7 },
  { nextMatch: { opponent: 'Anderlecht', competition: 'Croky Cup', location: 'Extérieur', inDays: 'Dans 3 jours' } },
);
const history = [before, after].map((data) => ({ gameDate: data.gameDate, data }));

describe('conférences de presse', () => {
  it("après-match : le résultat d'abord, puis le héros du match", () => {
    const c = postMatchConference(history)!;
    expect(c).toMatchObject({ kind: 'post', opponent: 'Eupen', club: 'FCV Dender' });
    expect(c.questions[0]).toMatchObject({ id: 'result', params: { outcome: 'W', goalsFor: 3, goalsAgainst: 0 } });
    expect(c.questions.find((q) => q.id === 'hero')?.params).toMatchObject({ name: 'Diallo', goals: 3 });
    expect(c.questions.length).toBeLessThanOrEqual(3);
  });

  it("avant-match : seulement pour une affiche, avec l'enjeu et le buteur adverse", () => {
    const c = preMatchConference(history)!;
    expect(c).toMatchObject({ kind: 'pre', opponent: 'Anderlecht', date: '2026-10-23', competition: 'Croky Cup' });
    expect(c.questions.map((q) => q.id)).toEqual(['stakes', 'theirScorer', 'ourScorer']);
    expect(c.questions[1]!.params).toMatchObject({ name: 'Dolberg', goals: 7 });
    const ordinary = snap(after.gameDate, [{ id: 'gk', min: 180, starts: 2, tg: 4, tc: 1 }], { classementPosition: 9, advClassement: '15e' }, { nextMatch: { opponent: 'Eupen', competition: 'Pro League', inDays: 'Dans 3 jours' } });
    expect(preMatchConference([{ gameDate: ordinary.gameDate, data: ordinary }])).toBeNull();
  });

  it("propose l'avant-match en priorité, puis l'après-match, sans reproposer une conférence tenue", () => {
    const pre = pendingConference(history, new Set())!;
    expect(pre.kind).toBe('pre');
    const post = pendingConference(history, new Set([pre.key]))!;
    expect(post.kind).toBe('post');
    expect(pendingConference(history, new Set([pre.key, post.key]))).toBeNull();
  });

  it("après-match trop ancien : plus d'actualité", () => {
    const later = snap('2026-10-30', [{ id: 'gk', min: 180, starts: 2, tg: 4, tc: 1 }, { id: 'st', name: 'Diallo', min: 180, starts: 2, tg: 4, tc: 1, goals: 4 }]);
    expect(postMatchConference([...history, { gameDate: later.gameDate, data: later }])).toBeNull();
  });
});

describe('conférences dans la gazette', () => {
  it('cite le coach dans la semaine du match, ou dit qu’il a refusé de parler', async () => {
    const { withPress } = await import('../src');
    const issues: { weekStart: string; weekEnd: string; stories: GazetteStory[] }[] = [
      { weekStart: '2026-10-19', weekEnd: '2026-10-25', stories: [] },
      { weekStart: '2026-10-12', weekEnd: '2026-10-18', stories: [] },
    ];
    const out = withPress(issues, [
      {
        kind: 'post',
        matchDate: '2026-10-20',
        opponent: 'Eupen',
        questions: [{ id: 'result', text: 'Q1' }, { id: 'hero', text: 'Q2' }],
        answers: [
          { question: 'result', tone: 'calm', text: 'Court.' },
          { question: 'hero', tone: null, text: 'Diallo a été immense ce soir.' },
        ],
      },
      { kind: 'pre', matchDate: '2026-10-14', opponent: 'Genk', questions: [], answers: [] },
    ]);
    expect(out[0]!.stories).toEqual([
      { kind: 'press', weight: 45, params: { moment: 'post', opponent: 'Eupen', quote: 'Diallo a été immense ce soir.', topic: 'hero', question: 'Q2' } },
    ]);
    expect(out[1]!.stories[0]!.params.quote).toBeNull();
    expect(withPress(issues, [])).toBe(issues);
  });
});
