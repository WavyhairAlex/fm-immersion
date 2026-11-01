import { POS_LABEL, buildProject, rankTargets, storedTargets, type FmPlayer, type FmSnapshot, type StoredTarget } from '@simloom/module-fm';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fmData } from '../lib/data';
import { useTacticEngine } from './FmTactic';
import { Empty, Fit, Level, Panel, Tag, useCoach, useFormat, useNames } from './FmUi';

type Filter = 'list' | 'all' | 'dismissed';

/**
 * Cibles du mercato : joueurs suivis dans le jeu (liste de suivi, cibles du recrutement), gardés dans la base
 * de Simloom et classés selon ce que chacun apporte au onze cible du projet.
 */
export function FmTargets({ saveId, snap, players, folder, go }: { saveId: string; snap: FmSnapshot; players: FmPlayer[]; folder: string; go: (view: string) => void }) {
  const { t } = useTranslation();
  const names = useNames();
  const f = useFormat();
  const qc = useQueryClient();
  const { engine } = useTacticEngine(folder, players);
  const [coach] = useCoach();
  const [filter, setFilter] = useState<Filter>('list');
  const own = useMemo(() => players.filter((p) => !p.injury && Object.keys(p.attributes).length), [players]);
  const pr = useMemo(() => buildProject(engine, own, coach), [engine, own, coach]);

  // La base est remplie à chaque import d'instantané : on la relit quand l'instantané change.
  const { data: rows } = useQuery({ queryKey: ['fm', saveId, 'targets', snap.gameDate], queryFn: () => fmData.targets(saveId) });
  const all = useMemo(() => storedTargets(rows ?? []), [rows]);
  const shown = useMemo(
    () => all.filter((p) => (filter === 'dismissed' ? p.dismissed : !p.dismissed && (filter === 'all' || p.inList))),
    [all, filter],
  );
  const ranked = useMemo(() => {
    const withAttrs = shown.filter((p) => Object.keys(p.attributes).length);
    const rest = shown.filter((p) => !Object.keys(p.attributes).length).map((target) => ({ target, best: null }));
    return [...(pr ? rankTargets(engine, withAttrs, pr) : withAttrs.map((target) => ({ target, best: null }))), ...rest] as {
      target: StoredTarget;
      best: ReturnType<typeof rankTargets>[number]['best'];
    }[];
  }, [engine, shown, pr]);

  const dismiss = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => fmData.dismissTarget(saveId, id, on),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fm', saveId, 'targets'] }),
  });

  if (!pr) return <Empty>{t('fm.tac.noAttributes')}</Empty>;
  const read = (snap as { collecte?: Record<string, string> }).collecte?.cibles;

  const compare = (id: string) => {
    try {
      localStorage.setItem('simloom.fm.compare', JSON.stringify([id]));
    } catch {
      /* stockage indisponible : le comparateur choisira lui-même */
    }
    go('compare');
  };

  const counts = {
    list: all.filter((p) => p.inList && !p.dismissed).length,
    all: all.filter((p) => !p.dismissed).length,
    dismissed: all.filter((p) => p.dismissed).length,
  };

  return (
    <Panel
      title={t('fm.targets.title', { style: names.style(pr.style), form: pr.form })}
      action={
        all.length ? (
          <div className="flex gap-1 text-xs">
            {(['list', 'all', 'dismissed'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={`rounded-full px-3 py-1 font-bold ${filter === k ? 'bg-canard text-white' : 'bg-canard/5 text-canard hover:bg-canard/10'}`}
              >
                {t(`fm.targets.filter.${k}`, { n: counts[k] })}
              </button>
            ))}
          </div>
        ) : undefined
      }
    >
      <p className="-mt-2 mb-3 text-xs text-brun">{t('fm.targets.help')}</p>
      {ranked.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-canard/70">
              <tr>
                {['player', 'age', 'club', 'pos', 'fit', 'gain', 'level', 'stars', 'knowledge', 'value', 'seen', ''].map((k) => (
                  <th key={k} className="px-2 py-1">
                    {k && t(`fm.targets.col.${k}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ranked.map(({ target: p, best }) => {
                const pid = p.id.replace(/^t/, '');
                const value = p.scout?.value;
                return (
                  <tr key={p.id} className={`border-t border-canard/5 hover:bg-creme/60 ${p.inList ? '' : 'text-canard/60'}`}>
                    <td className="cursor-pointer px-2 py-1.5 font-bold" onClick={() => compare(p.id)} title={t('fm.targets.compare')}>
                      {p.name}
                      {p.scout?.recommendation && <div className="text-xs font-normal text-brun">{p.scout.recommendation}</div>}
                    </td>
                    <td className="px-2 py-1.5 tabular-nums">{p.age ?? '–'}</td>
                    <td className="px-2 py-1.5">{p.club ?? '–'}</td>
                    <td className="px-2 py-1.5">
                      {best ? (
                        <>
                          <span className="rounded-full bg-eau/20 px-2 py-0.5 text-xs font-bold">{POS_LABEL[best.slot.pos]}</span> {names.role(engine.roles.get(best.slot.ip))}
                        </>
                      ) : (
                        <span className="text-xs text-brun">{Object.keys(p.attributes).length ? t('fm.targets.outside') : t('fm.targets.unknown')}</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <Fit value={best?.fit} />
                    </td>
                    <td className={`px-2 py-1.5 font-bold tabular-nums ${best && best.gain > 0 ? 'text-eau-fonce' : 'text-brun'}`}>
                      {best ? `${best.gain > 0 ? '+' : ''}${Math.round((best.gain / 20) * 100)} pts` : '–'}
                    </td>
                    <td className="px-2 py-1.5">
                      <Level value={p.level} />
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-xs tabular-nums">
                      {p.stars?.current != null ? `★ ${p.stars.current}${p.stars.potential != null ? ` / ${p.stars.potential}` : ''}` : '–'}
                    </td>
                    <td className="px-2 py-1.5 tabular-nums">{p.scout?.knowledge != null ? `${Math.round(p.scout.knowledge)} %` : '–'}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 tabular-nums">
                      {value?.min != null && value.max != null && value.min !== value.max ? `${f.money(value.min)} – ${f.money(value.max)}` : f.money(value?.mid ?? p.value)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-xs">{p.inList ? <Tag tone="good">{t('fm.targets.inList')}</Tag> : t('fm.targets.lastSeen', { date: f.date(p.lastSeen) })}</td>
                    <td className="px-2 py-1.5 text-right">
                      <button type="button" className="text-xs font-bold text-eau-fonce hover:underline" onClick={() => dismiss.mutate({ id: pid, on: !p.dismissed })}>
                        {p.dismissed ? t('fm.targets.restore') : t('fm.targets.dismiss')}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <Empty>{all.length ? t('fm.targets.emptyFilter') : read && !read.startsWith('désactivée') ? t('fm.targets.noneRead', { status: read }) : t('fm.targets.none')}</Empty>
          <button type="button" className="mt-3 text-sm font-bold text-eau-fonce hover:underline" onClick={() => go('project')}>
            {t('fm.targets.toProject')} →
          </button>
        </>
      )}
    </Panel>
  );
}
