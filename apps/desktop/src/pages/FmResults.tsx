import { analyzeResults, type FmPlayer, type FmSnapshot, type Insight, type MatchResult, type Outcome } from '@fm-immersion/module-fm';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Empty, Kpi, More, Panel, PlayerLink, Tag, type Tone } from './FmUi';

const TONE: Record<Outcome, Tone> = { W: 'good', D: 'info', L: 'bad' };

/**
 * Résultats : chaque match retrouvé entre deux instantanés (score, onze, note et stats de chaque joueur), puis ce
 * qui marche ou pas (bilan par tactique, points avec / sans chaque titulaire, buts contre occasions).
 */
export function FmResults({ players, history }: { players: FmPlayer[]; history?: { gameDate: string; data: FmSnapshot }[] }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;
  const an = useMemo(() => analyzeResults(history ?? []), [history]);
  const [open, setOpen] = useState<string | null>(null);
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const num = (x: number | null | undefined, d = 1) => (x == null ? '–' : new Intl.NumberFormat(lang, { maximumFractionDigits: d, minimumFractionDigits: d }).format(x));
  const date = (d: string) => new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d));
  const letter = (o: Outcome) => t(`fm.results.outcome.${o}`);
  const score = (r: MatchResult) => (r.goalsFor == null || r.goalsAgainst == null ? '–' : `${r.goalsFor} - ${r.goalsAgainst}`);
  const insight = (i: Insight) => {
    const p = Object.fromEntries(Object.entries(i.params).map(([k, v]) => [k, typeof v === 'number' && !Number.isInteger(v) ? num(v, 2) : v]));
    return t(`fm.results.insight.${i.kind}`, p);
  };

  if (!an.results.length)
    return (
      <Panel title={t('fm.results.title')}>
        <Empty>{t('fm.results.none')}</Empty>
        <More>{t('fm.results.how')}</More>
      </Panel>
    );

  const rec = an.record;
  return (
    <div className="space-y-4">
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

      <Panel title={t('fm.results.works')}>
        {an.insights.length ? (
          <ul className="space-y-1.5 text-sm">
            {an.insights.map((i, k) => (
              <li key={k} className="flex gap-2">
                <span aria-hidden className={i.kind === 'merged' ? 'text-brun' : /Best|Plus|lucky/.test(i.kind) ? 'text-eau-fonce' : 'text-corail'}>●</span>
                <span>{insight(i)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>{t('fm.results.fewMatches', { min: 3 })}</Empty>
        )}
        <More>{t('fm.results.how')}</More>
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

      <Panel title={t('fm.results.list')}>
        <ul className="divide-y divide-canard/10">
          {an.results.map((r) => {
            const key = `${r.since}|${r.date}`;
            const shown = open === key;
            return (
              <li key={key} className="py-2">
                <button type="button" className="flex w-full flex-wrap items-center gap-3 text-left text-sm" onClick={() => setOpen(shown ? null : key)} aria-expanded={shown}>
                  <span className="w-28 text-brun">{date(r.date)}</span>
                  {r.outcome ? <Tag tone={TONE[r.outcome]}>{letter(r.outcome)}</Tag> : <Tag>{t('fm.results.merged', { count: r.matches })}</Tag>}
                  <span className="font-display text-lg font-semibold tabular-nums">{score(r)}</span>
                  <span className="font-bold">
                    {r.opponent ? (r.home == null ? r.opponent : t(r.home ? 'fm.results.home' : 'fm.results.away', { team: r.opponent })) : r.matches > 1 ? `${r.wins}-${r.draws}-${r.losses}` : t('fm.results.unknownOpponent')}
                  </span>
                  {r.competition && <span className="text-xs text-brun">{r.competition}</span>}
                  <span className="ml-auto text-xs text-brun">
                    {[r.tactic ?? r.formation, r.xg != null ? t('fm.results.xg', { xg: num(r.xg, 2) }) : null].filter(Boolean).join(' · ')}
                  </span>
                </button>
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
  );
}
