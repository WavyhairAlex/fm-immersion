import { opponentReport, type FmSnapshot } from '@simloom/module-fm';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Empty, Kpi, Panel } from './FmUi';

/** Rapport sur le prochain adversaire : profil de l'entraîneur, joueurs clés et conseils de préparation. */
export function FmOpponent({ snap }: { snap: FmSnapshot }) {
  const { t, i18n } = useTranslation();
  const r = useMemo(() => opponentReport(snap), [snap]);
  const nf = new Intl.NumberFormat(i18n.resolvedLanguage, { maximumFractionDigits: 2 });
  const nf0 = new Intl.NumberFormat(i18n.resolvedLanguage, { maximumFractionDigits: 0 });
  if (!r) return <Empty>{t('fm.opp.none')}</Empty>;
  const dash = (v: string | null) => v ?? '–';
  const keyPlayers = [
    r.scorer && [t('fm.opp.scorer'), r.scorer.name, r.scorer.value != null ? t('fm.opp.goals', { count: r.scorer.value }) : null],
    r.assister && [t('fm.opp.assister'), r.assister.name, r.assister.value != null ? t('fm.opp.assists', { count: r.assister.value }) : null],
    r.rated && [t('fm.opp.rated'), r.rated.name, r.rated.value != null ? nf.format(r.rated.value) : null],
  ].filter((x): x is [string, string, string | null] => !!x);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label={t('fm.opp.club')} value={dash(r.name)} sub={r.position ? t('fm.opp.position', { value: r.position }) : undefined} />
        <Kpi label={t('fm.opp.formation')} value={dash(r.manager.formation)} sub={r.manager.name ?? undefined} />
        <Kpi label={t('fm.opp.mentality')} value={dash(r.manager.mentality)} />
        <Kpi label={t('fm.opp.pressMark')} value={dash(r.manager.pressing)} sub={r.manager.marking ? t('fm.opp.marking', { value: r.manager.marking }) : undefined} />
      </div>

      {(r.formations.ip.length > 0 || r.formations.oop.length > 0) && (
        <Panel title={t('fm.opp.formsTitle')}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-canard/60">
                <tr>
                  <th className="py-1 pr-3">{t('fm.opp.phase')}</th>
                  <th className="py-1 pr-3">{t('fm.opp.formation')}</th>
                  <th className="py-1 pr-3 text-right">{t('fm.opp.share')}</th>
                  <th className="py-1 pr-3 text-right">{t('fm.opp.minutes')}</th>
                  <th className="py-1 pr-3 text-right">{t('fm.opp.chances')}</th>
                  <th className="py-1 text-right">{t('fm.opp.every')}</th>
                </tr>
              </thead>
              <tbody>
                {(['ip', 'oop'] as const).flatMap((ph) =>
                  r.formations[ph].map((f, i) => (
                    <tr key={`${ph}-${f.form}`} className="border-t border-canard/10">
                      <td className="py-1 pr-3 text-brun">{i === 0 ? t(`fm.style.${ph}`) : ''}</td>
                      <td className="py-1 pr-3 font-bold">{f.form}</td>
                      <td className="py-1 pr-3 text-right tabular-nums">{f.pct != null ? `${nf0.format(f.pct)} %` : '–'}</td>
                      <td className="py-1 pr-3 text-right tabular-nums">{f.minutes != null ? nf0.format(f.minutes) : '–'}</td>
                      <td className="py-1 pr-3 text-right tabular-nums">{f.chances != null ? t(ph === 'ip' ? 'fm.opp.created' : 'fm.opp.conceded', { count: f.chances }) : '–'}</td>
                      <td className="py-1 text-right tabular-nums">{f.every != null ? t('fm.opp.everyMin', { count: Math.round(f.every) }) : '–'}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-brun">{t('fm.opp.formsHelp')}</p>
        </Panel>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t('fm.opp.adviceTitle')}>
          {r.advice.length ? (
            <ul className="space-y-2 text-sm">
              {r.advice.map((a) => (
                <li key={a.id} className="rounded-xl bg-creme/50 px-3 py-2">
                  {t(`fm.opp.advice.${a.id}`, { name: a.name })}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>{t('fm.opp.noAdvice')}</Empty>
          )}
          <p className="mt-3 text-xs text-brun">{t('fm.opp.adviceHelp')}</p>
        </Panel>

        <Panel title={t('fm.opp.keyTitle')}>
          {keyPlayers.length ? (
            <ul className="space-y-1 text-sm">
              {keyPlayers.map(([label, name, value]) => (
                <li key={label} className="flex items-baseline justify-between gap-3">
                  <span className="text-brun">{label}</span>
                  <span>
                    <b>{name}</b>
                    {value && <span className="ml-2 tabular-nums text-brun">{value}</span>}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>{t('fm.opp.noKey')}</Empty>
          )}
          {r.squad.length > 0 && (
            <>
              <p className="mt-4 text-xs font-bold uppercase text-canard/60">{t('fm.opp.squad', { count: r.squad.length })}</p>
              <ul className="mt-1 space-y-1 text-sm">
                {r.squad.map((p) => (
                  <li key={p.name} className="flex justify-between gap-3">
                    <span>{p.name}</span>
                    <span className="text-brun">
                      {dash(p.positions)}
                      {p.stars != null && <span className="ml-2">{nf.format(p.stars)} ★</span>}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-brun">{t('fm.opp.squadHelp')}</p>
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}
