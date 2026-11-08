import { analyzeResults, competitionKind, figuresForResultIn, type CompetitionKind, type FmPlayer, type FmSnapshot, type Insight, type MatchResult, type Outcome } from '@fm-immersion/module-fm';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { clubPath } from '../lib/club-nav';
import { Empty, Kpi, More, Panel, PlayerLink, Tag, type Tone } from './FmUi';

const TONE: Record<Outcome, Tone> = { W: 'good', D: 'info', L: 'bad' };
const KINDS: CompetitionKind[] = ['league', 'cup', 'europe', 'friendly', 'other'];

/**
 * Résultats : chaque match retrouvé entre deux instantanés (score, onze, note et stats de chaque joueur), puis ce
 * qui marche ou pas (bilan par tactique, points avec / sans chaque titulaire, buts contre occasions).
 */
export function FmResults({ players, history }: { players: FmPlayer[]; history?: { gameDate: string; data: FmSnapshot }[] }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;
  const an = useMemo(() => analyzeResults(history ?? []), [history]);
  const [open, setOpen] = useState<string | null>(null);
  // Filtre par nature de compétition : la liste des matchs et un bilan réduit (le bilan global ignore déjà les amicaux).
  const [kind, setKind] = useState<CompetitionKind | 'all'>('all');
  // Preuve d'une conclusion : la liste des matchs réduite à ceux qui la justifient.
  const [proof, setProof] = useState<Insight | null>(null);
  const navigate = useNavigate();
  const kinds = useMemo(() => KINDS.filter((k) => an.results.some((r) => competitionKind(r.competition) === k)), [an]);
  const listed = useMemo(() => {
    const byKind = kind === 'all' ? an.results : an.results.filter((r) => competitionKind(r.competition) === kind);
    return proof ? byKind.filter((r) => backs(proof, r)) : byKind;
  }, [an, kind, proof]);
  const sub = useMemo(() => {
    if (kind === 'all') return null;
    const w = listed.reduce((n, r) => n + r.wins, 0);
    const d = listed.reduce((n, r) => n + r.draws, 0);
    const l = listed.reduce((n, r) => n + r.losses, 0);
    return { record: `${w}-${d}-${l}`, goals: `${listed.reduce((n, r) => n + (r.goalsFor ?? 0), 0)} - ${listed.reduce((n, r) => n + (r.goalsAgainst ?? 0), 0)}` };
  }, [listed, kind]);
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  // Chiffres du jeu (possession, tirs, xG, homme du match) de chaque match : le jeu ne garde que le dernier, mais
  // l'instantané du jour qui suit chaque match les a conservés.
  const gameFigures = useMemo(() => {
    const snaps = history ?? [];
    return new Map(an.results.map((r, i) => [`${r.since}|${r.date}`, figuresForResultIn(snaps, r, an.results[i - 1]?.date ?? null)]));
  }, [history, an]);
  const num = (x: number | null | undefined, d = 1) => (x == null ? '–' : new Intl.NumberFormat(lang, { maximumFractionDigits: d, minimumFractionDigits: d }).format(x));
  const date = (d: string) => new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d));
  const letter = (o: Outcome) => t(`fm.results.outcome.${o}`);
  const score = (r: MatchResult) => (r.goalsFor == null || r.goalsAgainst == null ? '–' : `${r.goalsFor} - ${r.goalsAgainst}`);
  const params = (i: Insight) => Object.fromEntries(Object.entries(i.params).map(([k, v]) => [k, typeof v === 'number' && !Number.isInteger(v) ? num(v, 2) : v]));
  const insight = (i: Insight) => t(`fm.results.insight.${i.kind}`, params(i));

  if (!an.results.length)
    return (
      <Panel title={t('fm.results.title')}>
        <Empty>{t('fm.results.none')}</Empty>
        <More>{t('fm.results.how')}</More>
      </Panel>
    );

  const rec = an.record;
  const showProof = (i: Insight) => {
    setProof(i);
    setKind('all');
    requestAnimationFrame(() => document.getElementById('res-matches')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  // Que puis-je ajuster ? Chaque conclusion parlante devient une piste, avec l'écran où agir.
  const moves = an.insights.flatMap((i) => {
    const to = MOVE_VIEW[i.kind];
    return to ? [{ i, to }] : [];
  });
  const q = (id: string, key: string) => (
    <a href={`#${id}`} onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} className="card flex-1 p-3 text-sm font-bold hover:ring-orange/40">
      {t(`fm.results.q.${key}`)} <span className="text-orange-fonce">↓</span>
    </a>
  );
  return (
    <div className="space-y-4">
      <nav className="flex flex-col gap-2 sm:flex-row" aria-label={t('fm.results.q.label')}>
        {q('res-what', 'what')}
        {q('res-repeat', 'repeat')}
        {q('res-adjust', 'adjust')}
      </nav>
      <h2 id="res-what" className="scroll-mt-28 text-xl font-semibold">{t('fm.results.q.what')}</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label={t('fm.results.kpi.matches')} value={rec.matches} sub={t('fm.results.kpi.matchesSub')} />
        <Kpi label={t('fm.results.kpi.record')} value={`${rec.wins}-${rec.draws}-${rec.losses}`} sub={t('fm.results.kpi.recordSub')} />
        <Kpi label={t('fm.results.kpi.ppm')} value={num(rec.ppm, 2)} />
        <Kpi label={t('fm.results.kpi.goals')} value={`${rec.goalsFor} - ${rec.goalsAgainst}`} />
        <Kpi
          label={t('fm.results.kpi.form')}
          value={
            <span className="flex gap-1">
              {an.form.length ? an.form.map((o, i) => <Tag key={i} tone={TONE[o]}>{letter(o)}</Tag>) : '–'}
            </span>
          }
        />
      </div>

      <h2 id="res-repeat" className="scroll-mt-28 pt-2 text-xl font-semibold">{t('fm.results.q.repeat')}</h2>
      <Panel title={t('fm.results.works')}>
        {an.insights.length ? (
          <ul className="space-y-1.5 text-sm">
            {an.insights.map((i, k) => (
              <li key={k} className="flex flex-wrap items-baseline gap-2">
                <span aria-hidden className={i.kind === 'merged' ? 'text-brun' : /Best|Plus|lucky/.test(i.kind) ? 'text-eau-fonce' : 'text-corail'}>●</span>
                <span className="flex-1">{insight(i)}</span>
                {i.kind !== 'merged' && (
                  <button type="button" className="shrink-0 text-xs font-bold text-orange-fonce hover:underline" onClick={() => showProof(i)}>
                    {t('fm.results.q.proof', { count: an.results.filter((r) => backs(i, r)).length })} →
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <Empty>{t('fm.results.fewMatches', { min: 3 })}</Empty>
        )}
        <More>{t('fm.results.how')}</More>
      </Panel>

      <h2 id="res-adjust" className="scroll-mt-28 pt-2 text-xl font-semibold">{t('fm.results.q.adjust')}</h2>
      <Panel title={t('fm.results.q.adjustTitle')}>
        {moves.length ? (
          <ul className="space-y-2 text-sm">
            {moves.map(({ i, to }, k) => (
              <li key={k} className="flex flex-wrap items-baseline gap-2">
                <span className="flex-1">{t(`fm.results.move.${i.kind}`, params(i))}</span>
                <button type="button" className="shrink-0 text-xs font-bold text-brun hover:underline" onClick={() => showProof(i)}>
                  {t('fm.results.q.proof', { count: an.results.filter((r) => backs(i, r)).length })}
                </button>
                <button type="button" className="shrink-0 text-xs font-bold text-orange-fonce hover:underline" onClick={() => navigate(clubPath(to))}>
                  {t(`fm.views.${to}`)} →
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>{t('fm.results.q.nothing')}</Empty>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t('fm.results.byTactic')}>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-canard/60">
              <tr>
                <th className="py-1">{t('fm.results.col.tactic')}</th>
                <th className="text-right">{t('fm.results.col.matches')}</th>
                <th className="text-right">{t('fm.results.kpi.record')}</th>
                <th className="text-right">{t('fm.results.kpi.ppm')}</th>
                <th className="text-right">{t('fm.results.kpi.goals')}</th>
              </tr>
            </thead>
            <tbody>
              {an.byTactic.map((x) => (
                <tr key={x.key} className="border-t border-canard/10">
                  <td className="py-1.5 font-bold">{x.key === '?' ? t('fm.results.unknownTactic') : x.key}</td>
                  <td className="text-right tabular-nums">{x.matches}</td>
                  <td className="text-right tabular-nums">{`${x.wins}-${x.draws}-${x.losses}`}</td>
                  <td className="text-right font-bold tabular-nums">{num(x.ppm, 2)}</td>
                  <td className="text-right tabular-nums">{`${x.goalsFor} - ${x.goalsAgainst}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title={t('fm.results.byPlayer')}>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-canard/60">
              <tr>
                <th className="py-1">{t('fm.results.col.player')}</th>
                <th className="text-right">{t('fm.results.col.starts')}</th>
                <th className="text-right">{t('fm.results.col.with')}</th>
                <th className="text-right">{t('fm.results.col.without')}</th>
                <th className="text-right">{t('fm.results.col.rating')}</th>
              </tr>
            </thead>
            <tbody>
              {an.players
                .filter((p) => p.starts > 0)
                .slice(0, 16)
                .map((p) => {
                  const pl = byId.get(p.id);
                  const tone = p.impact == null ? '' : p.impact >= 0.5 ? 'text-eau-fonce' : p.impact <= -0.5 ? 'text-corail' : '';
                  return (
                    <tr key={p.id} className="border-t border-canard/10">
                      <td className="py-1.5">{pl ? <PlayerLink player={pl} /> : <span className="font-bold">{p.name}</span>}</td>
                      <td className="text-right tabular-nums">{p.starts}</td>
                      <td className={`text-right font-bold tabular-nums ${tone}`}>{num(p.ppmWith, 2)}</td>
                      <td className="text-right tabular-nums">{num(p.ppmWithout, 2)}</td>
                      <td className="text-right tabular-nums">{num(p.avgRating, 2)}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-brun">{t('fm.results.withHelp', { min: 3 })}</p>
        </Panel>
      </div>

      <div id="res-matches" className="scroll-mt-28">
      <Panel title={t('fm.results.list')}>
        {proof && (
          <p className="mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-orange-clair/60 px-3 py-2 text-sm">
            <span className="font-bold">{t('fm.results.q.proofOf')}</span> <span className="flex-1">{insight(proof)}</span>
            <button type="button" className="text-xs font-bold text-orange-fonce hover:underline" onClick={() => setProof(null)}>
              {t('fm.results.q.all')}
            </button>
          </p>
        )}
        {kinds.length > 1 && (
          <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
            <label htmlFor="fm-results-kind" className="text-brun">
              {t('fm.results.filter.label')}
            </label>
            <select id="fm-results-kind" className="rounded border border-canard/20 bg-white px-2 py-1" value={kind} onChange={(e) => setKind(e.target.value as CompetitionKind | 'all')}>
              <option value="all">{t('fm.results.filter.all')}</option>
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {t(`fm.results.filter.${k}`)}
                </option>
              ))}
            </select>
            {sub && <span className="font-bold">{t('fm.results.filtered', { label: t(`fm.results.filter.${kind}`), record: sub.record, goals: sub.goals })}</span>}
          </div>
        )}
        <ul className="divide-y divide-canard/10">
          {listed.map((r) => {
            const key = `${r.since}|${r.date}`;
            const shown = open === key;
            return (
              <li key={key} className="py-2">
                <button type="button" className="flex w-full flex-wrap items-center gap-3 text-left text-sm" onClick={() => setOpen(shown ? null : key)} aria-expanded={shown}>
                  <span className="w-28 text-brun">{date(r.played ?? r.date)}</span>
                  {r.outcome ? <Tag tone={TONE[r.outcome]}>{letter(r.outcome)}</Tag> : <Tag>{t('fm.results.merged', { count: r.matches })}</Tag>}
                  <span className="font-display text-lg font-semibold tabular-nums">{score(r)}</span>
                  <span className="font-bold">
                    {r.opponent ? (r.home == null ? r.opponent : t(r.home ? 'fm.results.home' : 'fm.results.away', { team: r.opponent })) : r.matches > 1 ? `${r.wins}-${r.draws}-${r.losses}` : t('fm.results.unknownOpponent')}
                  </span>
                  {r.friendly ? <Tag>{t('fm.results.friendly')}</Tag> : r.competition && <span className="text-xs text-brun">{r.competition}</span>}
                  <span className="ml-auto text-xs text-brun">
                    {[r.tactic ?? r.formation, r.xg != null ? t('fm.results.xg', { xg: num(r.xg, 2) }) : null].filter(Boolean).join(' · ')}
                  </span>
                </button>
                {(() => {
                  const g = gameFigures.get(key);
                  return g ? (
                  <p className="mt-1 pl-28 text-xs text-brun">
                    {[
                      g.possession && t('fm.results.game.possession', { us: Math.round(g.possession[0]), them: Math.round(g.possession[1]) }),
                      g.shots && t('fm.results.game.shots', { us: g.shots[0], them: g.shots[1], usOn: g.onTarget?.[0] ?? '?', themOn: g.onTarget?.[1] ?? '?' }),
                      g.xg && t('fm.results.game.xg', { us: num(g.xg[0], 2), them: num(g.xg[1], 2) }),
                      g.motm && t('fm.results.game.motm', { name: g.motm.name, rating: g.motm.rating != null ? num(g.motm.rating, 1) : '–' }),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  ) : null;
                })()}
                {shown && (
                  <table className="mt-2 w-full text-xs">
                    <thead className="text-left uppercase text-canard/60">
                      <tr>
                        <th className="py-1">{t('fm.results.col.player')}</th>
                        <th className="text-right">{t('fm.results.col.minutes')}</th>
                        <th className="text-right">{t('fm.results.col.rating')}</th>
                        <th className="text-right">{t('fm.results.col.goals')}</th>
                        <th className="text-right">xG</th>
                        <th className="text-right">{t('fm.stats.col.passPct')}</th>
                        <th className="text-right">{t('fm.stats.col.keyPass90')}</th>
                        <th className="text-right">{t('fm.stats.col.tackles90')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.players.map((p) => {
                        const pl = byId.get(p.id);
                        // Stats « par 90 » ramenées au match : valeur × minutes / 90.
                        const total = (v: number | undefined) => (v == null ? null : (v * p.minutes) / 90);
                        return (
                          <tr key={p.id} className="border-t border-canard/10">
                            <td className="py-1">
                              {pl ? <PlayerLink player={pl} className={p.started ? 'font-bold' : ''} /> : p.name}
                              {!p.started && <span className="ml-1 text-brun">{t('fm.results.sub')}</span>}
                            </td>
                            <td className="text-right tabular-nums">{p.minutes}</td>
                            <td className="text-right font-bold tabular-nums">{num(p.rating, 1)}</td>
                            <td className="text-right tabular-nums">{p.goals || ''}</td>
                            <td className="text-right tabular-nums">{num(p.stats.xg, 2)}</td>
                            <td className="text-right tabular-nums">{p.stats.passPct == null ? '–' : `${num(p.stats.passPct, 0)} %`}</td>
                            <td className="text-right tabular-nums">{num(total(p.stats.keyPass90), 0)}</td>
                            <td className="text-right tabular-nums">{num(total(p.stats.tackles90), 0)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </li>
            );
          })}
        </ul>
      </Panel>
      </div>
    </div>
  );
}

/** Écran où agir sur une conclusion des résultats. */
const MOVE_VIEW: Partial<Record<Insight['kind'], string>> = {
  tacticBest: 'tactic',
  tacticWorst: 'tactic',
  playerPlus: 'tactic',
  playerMinus: 'tactic',
  wasteful: 'training',
  leaky: 'instructions',
};

/** Le match (ou la période) appuie-t-il la conclusion ? Sert à montrer la preuve dans la liste. */
function backs(i: Insight, r: MatchResult): boolean {
  if (r.friendly) return false;
  const name = String(i.params.name ?? '');
  switch (i.kind) {
    case 'tacticBest':
      return (r.tactic ?? '?') === name || (r.tactic ?? '?') === String(i.params.other ?? '');
    case 'tacticWorst':
      return (r.tactic ?? '?') === name;
    case 'playerPlus':
    case 'playerMinus':
      return r.matches === 1 && r.players.some((p) => p.name === name && p.started);
    case 'wasteful':
    case 'lucky':
      return r.xg != null;
    case 'leaky':
      return (r.goalsAgainst ?? 0) >= 2;
    default:
      return true;
  }
}
