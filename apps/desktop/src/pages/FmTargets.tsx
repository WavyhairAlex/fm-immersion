import { POS_LABEL, buildProject, rankTargets, shortlist, type FmPlayer, type FmSnapshot } from '@simloom/module-fm';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useTacticEngine } from './FmTactic';
import { Empty, Fit, Level, Panel, useCoach, useFormat, useNames } from './FmUi';

/** Cibles du mercato : la liste de suivi du jeu, classée selon ce que chaque joueur apporte au onze cible. */
export function FmTargets({ snap, players, folder, go }: { snap: FmSnapshot; players: FmPlayer[]; folder: string; go: (view: string) => void }) {
  const { t } = useTranslation();
  const names = useNames();
  const f = useFormat();
  const { engine } = useTacticEngine(folder, players);
  const [coach] = useCoach();
  const own = useMemo(() => players.filter((p) => !p.injury && Object.keys(p.attributes).length), [players]);
  const pr = useMemo(() => buildProject(engine, own, coach), [engine, own, coach]);
  const targets = useMemo(() => shortlist(snap).filter((p) => Object.keys(p.attributes).length), [snap]);
  const rows = useMemo(() => (pr ? rankTargets(engine, targets, pr) : []), [engine, targets, pr]);
  if (!pr) return <Empty>{t('fm.tac.noAttributes')}</Empty>;

  const compare = (id: string) => {
    try {
      localStorage.setItem('simloom.fm.compare', JSON.stringify([id]));
    } catch {
      /* stockage indisponible : le comparateur choisira lui-même */
    }
    go('compare');
  };

  return (
    <Panel title={t('fm.targets.title', { style: names.style(pr.style), form: pr.form })}>
      <p className="-mt-2 mb-3 text-xs text-brun">{t('fm.targets.help')}</p>
      {targets.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-canard/70">
              <tr>
                {['player', 'age', 'club', 'pos', 'fit', 'gain', 'level', 'eff', 'wage', 'value'].map((k) => (
                  <th key={k} className="px-2 py-1">
                    {t(`fm.targets.col.${k}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ target: p, best }) => (
                <tr key={p.id} className="cursor-pointer border-t border-canard/5 hover:bg-creme/60" onClick={() => compare(p.id)} title={t('fm.targets.compare')}>
                  <td className="px-2 py-1.5 font-bold">{p.name}</td>
                  <td className="px-2 py-1.5 tabular-nums">{p.age ?? '–'}</td>
                  <td className="px-2 py-1.5">{p.club ?? '–'}</td>
                  <td className="px-2 py-1.5">
                    {best ? (
                      <>
                        <span className="pill">{POS_LABEL[best.slot.pos]}</span> {names.role(engine.roles.get(best.slot.ip))}
                      </>
                    ) : (
                      <span className="text-xs text-brun">{t('fm.targets.outside')}</span>
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
                  <td className="px-2 py-1.5 tabular-nums">{p.projectedEffectiveness ? Math.round(p.projectedEffectiveness.mid!) : '–'}</td>
                  <td className="px-2 py-1.5 tabular-nums">{f.money(p.wage)}</td>
                  <td className="px-2 py-1.5 tabular-nums">{f.money(p.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <Empty>{t('fm.targets.none')}</Empty>
          <button type="button" className="mt-3 text-sm font-bold text-eau-fonce hover:underline" onClick={() => go('project')}>
            {t('fm.targets.toProject')} →
          </button>
        </>
      )}
    </Panel>
  );
}
