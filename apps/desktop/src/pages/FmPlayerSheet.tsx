import { POS_LABEL, levelSeries, matchStatsFull, mercatoAdvice, roleMatrix, statsBoard, type FmPlayer, type FmSnapshot, type SquadAt } from '@simloom/module-fm';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { TONE, useReason } from './FmMercato';
import { Spark } from './FmProgression';
import { useTacticEngine } from './FmTactic';
import { CompatTag, Fit, Level, Tag, useCoach, useFormat, useNames } from './FmUi';

/**
 * Fiche joueur : tout ce que Simloom sait d'un joueur, au même endroit (identité, contrat, meilleurs postes,
 * stats de match, progression, conseil mercato). S'ouvre en panneau à droite depuis un nom cliquable.
 */
export function FmPlayerSheet({ id, players, snap, history, folder, gameDate, onClose }: { id: string; players: FmPlayer[]; snap: FmSnapshot; history: SquadAt[]; folder: string; gameDate: string; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const names = useNames();
  const reason = useReason();
  const [coach] = useCoach();
  const { engine } = useTacticEngine(folder, players);
  const p = players.find((x) => x.id === id);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const roles = useMemo(() => {
    if (!p || !Object.keys(p.attributes).length) return [];
    const cells = roleMatrix(engine, [p], 'ip').rows[0]?.cells ?? [];
    return cells
      .filter((c): c is NonNullable<typeof c> => !!c && (c.natural || c.tryIt))
      .sort((a, b) => b.fit - a.fit)
      .slice(0, 3);
  }, [engine, p]);
  const stats = useMemo(() => {
    const full = matchStatsFull(snap);
    return statsBoard(players, new Map([...full].map(([k, m]) => [k, m.stats]))).players.find((r) => r.player.id === id) ?? null;
  }, [snap, players, id]);
  const advice = useMemo(() => mercatoAdvice(engine, players, gameDate, coach, history)?.advice.find((a) => a.player.id === id) ?? null, [engine, players, gameDate, coach, history, id]);
  const series = useMemo(() => levelSeries(history, id), [history, id]);
  if (!p) return null;
  const nf1 = new Intl.NumberFormat(i18n.resolvedLanguage, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const stat = (k: string) => t(`fm.stats.col.${k}`);

  const facts: [string, string][] = [
    [t('fm.col.condition'), p.condition != null ? `${Math.round(p.condition)} %` : '–'],
    [t('fm.sheet.morale'), p.morale ?? '–'],
    [t('fm.col.contract'), f.date(p.contractEnd)],
    [t('fm.col.wage'), f.money(p.wage)],
    [t('fm.sheet.value'), f.money(p.value)],
    [t('fm.col.status'), p.squadStatus ?? '–'],
  ];

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-canard/20" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={p.name}
        className="h-full w-full max-w-md overflow-y-auto bg-creme p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">{p.name}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-brun">
              {p.age != null && <span>{t('fm.contracts.age', { count: p.age })}</span>}
              {p.positions.map((pos) => (
                <span key={pos} className="pill">
                  {POS_LABEL[pos]}
                </span>
              ))}
              {p.injury && <Tag tone="bad">{p.injury}</Tag>}
              {p.suspension && <Tag tone="bad">{t('fm.home.kind.suspended')}</Tag>}
            </p>
          </div>
          <button type="button" className="rounded-full px-2 text-xl text-canard/60 hover:bg-white hover:text-canard" onClick={onClose} aria-label={t('fm.sheet.close')}>
            ×
          </button>
        </div>

        <section className="card mt-4 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-canard/70">{t('fm.col.level')}</span>
            <span className="flex items-center gap-2">
              {p.stars?.current != null && (
                <span className="text-xs text-brun">
                  ★ {p.stars.current}
                  {p.stars.potential != null ? ` / ${p.stars.potential}` : ''}
                </span>
              )}
              <Level value={p.level} />
            </span>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            {facts.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2 border-b border-canard/5 pb-1">
                <dt className="text-brun">{k}</dt>
                <dd className="text-right font-bold">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        {roles.length > 0 && (
          <section className="card mt-3 p-4">
            <h3 className="font-semibold">{t('fm.sheet.roles')}</h3>
            <ul className="mt-2 space-y-1.5 text-sm">
              {roles.map((c) => (
                <li key={c.pos} className="flex items-center justify-between gap-2">
                  <span>
                    <span className="pill">{POS_LABEL[c.pos]}</span> {names.role(c.role)}
                    {!c.natural && <span className="ml-1 text-xs text-brun">({t('fm.roles.try')})</span>}
                  </span>
                  <Fit value={c.fit} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {series.filter((x) => x != null).length > 1 && (
          <section className="card mt-3 p-4">
            <h3 className="font-semibold">{t('fm.sheet.progress')}</h3>
            <div className="mt-2 flex items-center justify-between gap-3">
              <Spark values={series} />
              <span className="text-sm text-brun">
                {nf1.format(series.find((x) => x != null)!)} → <b className="text-canard">{nf1.format(series.filter((x): x is number => x != null).at(-1)!)}</b>
              </span>
            </div>
          </section>
        )}

        {stats && stats.minutes > 0 && (
          <section className="card mt-3 p-4">
            <h3 className="font-semibold">{t('fm.sheet.stats', { minutes: stats.minutes })}</h3>
            {stats.strengths.length > 0 && (
              <p className="mt-2 text-sm">
                <Tag tone="good">{t('fm.sheet.strengths')}</Tag> {stats.strengths.slice(0, 3).map((m) => stat(m.key)).join(', ')}
              </p>
            )}
            {stats.weaknesses.length > 0 && (
              <p className="mt-1.5 text-sm">
                <Tag tone="bad">{t('fm.sheet.weaknesses')}</Tag> {stats.weaknesses.slice(0, 3).map((m) => stat(m.key)).join(', ')}
              </p>
            )}
            {stats.focus && (
              <p className="mt-1.5 text-sm">
                <Tag tone="warn">{t('fm.sheet.focus')}</Tag> {t(`fm.train.focus.${stats.focus}`)}
              </p>
            )}
            {!stats.enough && <p className="mt-2 text-xs text-brun">{t('fm.sheet.fewMinutes')}</p>}
          </section>
        )}

        {advice && (
          <section className="card mt-3 p-4">
            <h3 className="flex items-center gap-2 font-semibold">
              {t('fm.sheet.mercato')} <Tag tone={TONE[advice.verdict]}>{t(`fm.merc.verdict.${advice.verdict}`)}</Tag> <CompatTag c={advice.compat} />
            </h3>
            <p className="mt-1.5 text-sm text-brun">{advice.reasons.map(reason).join(' · ')}</p>
            {advice.proj[1] != null && (
              <p className="mt-1.5 flex items-center gap-1.5 text-sm text-brun">
                {t('fm.sheet.inTwo')} <Level value={p.level} /> → <Level value={advice.proj[1]} />
              </p>
            )}
          </section>
        )}
      </aside>
    </div>
  );
}
