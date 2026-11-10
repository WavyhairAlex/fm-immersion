import type { GazetteIssue, GazetteStory } from '@fm-immersion/module-fm';
import type { TFunction } from 'i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let answer: string | Error = '';
const calls: { cmd: string; args: Record<string, unknown> }[] = [];
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args: Record<string, unknown>) => {
    calls.push({ cmd, args });
    if (answer instanceof Error) throw answer;
    return answer;
  }),
}));

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

const { aiFor, headlineCase, aiLiveComment, factsKept, gazettePrompt, getAiSettings, livePrompt, parseComment, parseWriting, setAiSettings } = await import('../src/lib/ai');
const { articleText, editorialText, headlineText } = await import('../src/lib/gazette-text');

const t = ((k: string, o?: Record<string, unknown>) => (o ? `${k} ${JSON.stringify(o)}` : k)) as unknown as TFunction;

const cupExit: GazetteStory = {
  kind: 'result',
  weight: 85,
  params: { outcome: 'L', opponent: 'Nitra', home: 0, goalsFor: 1, goalsAgainst: 2, scorers: 'Bukata', competition: 'Slovnaft Cup', compKind: 'cup', cup: 'out', legs: 1, rounds: 3, friendly: 0, date: '2027-10-02' },
};
const issue: GazetteIssue = {
  number: 9,
  club: 'Malženice',
  weekStart: '2027-09-27',
  weekEnd: '2027-10-03',
  date: '2027-10-03',
  headline: cupExit,
  stories: [{ kind: 'injury', weight: 30, params: { name: 'M. Fábry', days: 12 } }],
  board: 'Viser le maintien',
};

beforeEach(() => {
  store.clear();
  calls.length = 0;
  answer = '';
});

describe('réglages de l’IA', () => {
  it('coupée par défaut, puis prête pour la gazette et le direct', () => {
    expect(getAiSettings().provider).toBeNull();
    expect(aiFor('gazette')).toBeNull();
    setAiSettings({ provider: 'ollama', models: {}, tone: 'tabloid', gazette: true, live: false });
    expect(aiFor('gazette')).toEqual({ provider: 'ollama', model: 'gemma3:12b', tone: 'tabloid' });
    expect(aiFor('live')).toBeNull();
  });

  it('ignore un réglage abîmé', () => {
    store.set('fmi.ai', '{"provider":"openai","tone":"x"');
    expect(getAiSettings().provider).toBeNull();
    store.set('fmi.ai', '{"provider":"openai","tone":"x"}');
    expect(getAiSettings()).toMatchObject({ provider: null, tone: 'regional' });
  });
});

describe('consigne de la gazette', () => {
  it('donne l’enjeu (élimination en coupe), le score, le ton et la langue', () => {
    const { system, prompt } = gazettePrompt(t, issue, 'fr', 'regional');
    expect(system).toContain('quotidien régional');
    expect(system).toContain('français');
    expect(system).toContain('élimination en coupe nationale');
    expect(prompt).toContain('type : cup');
    expect(prompt).toContain('ÉLIMINÉ');
    expect(prompt).toContain('1-2 contre Nitra');
    expect(prompt).toContain('Viser le maintien');
    expect(prompt).toContain('M. Fábry');
    expect(gazettePrompt(t, issue, 'en', 'classic').system).toContain('anglais');
  });

  it('se base toujours sur les phrases toutes faites, même pour une gazette déjà rédigée', () => {
    const written = { ...issue, written: { title: 'X', article: 'Y', editorial: 'Z', fans: 'F', board: 'B' } };
    expect(gazettePrompt(t, written, 'fr', 'regional').prompt).toBe(gazettePrompt(t, issue, 'fr', 'regional').prompt);
  });
});

describe('vérification des faits', () => {
  const facts = 'Score de Malženice : 1-2 contre Nitra. Blessé 12 jours. 3e tour. xG 1,06.';
  it('accepte les nombres et scores des faits, dans un sens ou dans l’autre', () => {
    expect(factsKept('Nitra s’impose 2-1, Malženice sort au 3e tour', facts)).toBe(true);
    expect(factsKept('Défaite 1 - 2, xG 1.06', facts)).toBe(true);
    expect(factsKept('Aucun chiffre ici.', facts)).toBe(true);
  });
  it('refuse un score ou un nombre inventé', () => {
    expect(factsKept('Défaite 0-2', facts)).toBe(false);
    expect(factsKept('But à la 89e minute', facts)).toBe(false);
  });

  it('lit le JSON de l’IA, même entouré de texte, et refuse ce qui manque ou déborde', () => {
    const ok = JSON.stringify({ titre: '« La coupe s’arrête là »', article: 'Battu 1-2 par Nitra.', billet: 'Dur.', tribunes: 'Colère.', direction: '**Calme.**' });
    expect(parseWriting(`Voici :\n\`\`\`json\n${ok}\n\`\`\``, facts)).toEqual({ title: 'La coupe s’arrête là', article: 'Battu 1-2 par Nitra.', editorial: 'Dur.', fans: 'Colère.', board: 'Calme.' });
    expect(parseWriting(JSON.stringify({ titre: 'T', article: 'Battu 0-3.', billet: 'B', tribunes: 'T', direction: 'D' }), facts)).toBeNull();
    expect(parseWriting(JSON.stringify({ titre: 'T', article: 'A' }), facts)).toBeNull();
    expect(parseWriting(JSON.stringify({ titre: 'T'.repeat(200), article: 'A', billet: 'B', tribunes: 'T', direction: 'D' }), facts)).toBeNull();
    expect(parseWriting('pas du json', facts)).toBeNull();
  });
});

describe('gazette rédigée par l’IA', () => {
  it('remplace le gros titre, l’article et le billet', () => {
    const written = { ...issue, written: { title: 'Nitra brise le rêve', article: 'Récit.', editorial: 'Billet.', fans: 'Tribunes.', board: 'Direction.' } };
    expect(headlineText(t, written, 'fr').title).toBe('Nitra brise le rêve');
    expect(articleText(t, written, 'fr')).toBe('Récit.');
    expect(editorialText(t, written, 'fr')).toEqual({ title: 'gazette.editorial.title', body: 'Billet.', fans: 'Tribunes.', board: 'Direction.' });
    expect(headlineText(t, issue, 'fr').title).toContain('title_cupOut');
  });
});

describe('commentaire du direct', () => {
  const moment = {
    home: 'Inter Bratislava',
    away: 'Malženice',
    score: '0 - 1',
    minute: '23 min.',
    club: 'Malženice',
    competition: 'Slovnaft Cup',
    fact: 'But pour Malženice : M. Fábry (23). Score : 0 - 1.',
    said: 'Malženice ouvre le score !',
    timeline: ['23 but M. Fábry (Malženice)'],
    context: ['Malženice est 4e du championnat'],
  };

  it('envoie le fait, la phrase prévue et le contexte', () => {
    const { system, prompt } = livePrompt(moment, 'fr', 'tabloid');
    expect(system).toContain('commentateur');
    expect(system).toContain('tabloïd');
    expect(prompt).toContain('M. Fábry (23)');
    expect(prompt).toContain('Slovnaft Cup');
    expect(prompt).toContain('4e du championnat');
  });

  it('garde une ou deux lignes et refuse un score inventé', () => {
    expect(parseComment('Fábry fait trembler les filets, 0-1 !\nQuel but.\nTroisième ligne', 'Score : 0 - 1')).toBe('Fábry fait trembler les filets, 0-1 ! Quel but.');
    expect(parseComment('2-0 pour Malženice', 'Score : 0 - 1')).toBeNull();
  });

  it('n’appelle pas l’IA quand elle est coupée, et rend null si elle échoue', async () => {
    expect(await aiLiveComment(moment, 'fr')).toBeNull();
    expect(calls).toHaveLength(0);
    setAiSettings({ provider: 'mistral', models: {}, tone: 'regional', gazette: true, live: true });
    answer = 'Fábry, 0-1, la tribune explose !';
    expect(await aiLiveComment(moment, 'fr')).toBe('Fábry, 0-1, la tribune explose !');
    expect(calls[0]).toMatchObject({ cmd: 'ai_complete', args: { provider: 'mistral', model: 'mistral-small-latest', json: false } });
    answer = new Error('Ollama ne répond pas');
    expect(await aiLiveComment(moment, 'fr')).toBeNull();
  });

  it('titre ramené à la casse de la presse quand chaque mot a sa majuscule', () => {
    const facts = 'Faits de la semaine :\nÀ LA UNE : Infirmerie : Mauricio Cuero absent 6 jours\n- Prochain match : TU Košice, club de Ružomberok en UEFA Conference League';
    expect(headlineCase("Cuero Blessé : Ružomberok Affronté à l'Absence", facts)).toBe("Cuero blessé : Ružomberok affronté à l'absence");
    expect(headlineCase('Le TU Košice Attend Ružomberok De Pied Ferme', facts)).toBe('Le TU Košice attend Ružomberok de pied ferme');
    expect(headlineCase('La coupe s’arrête là pour Ružomberok', facts)).toBe('La coupe s’arrête là pour Ružomberok');
  });
});
