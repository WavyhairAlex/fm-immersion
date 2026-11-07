import { POS_LABEL, type FmPlayer, type NeedPriority, type Project, type RecruitNeed, type TacticEngine } from '@fm-immersion/module-fm';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ReplacementFinder } from './FmReplacement';
import { Empty, Fit, More, Panel, PlayerLink, Tag, type Tone } from './FmUi';

const PRIORITY_TONE: Record<NeedPriority, Tone> = { 1: 'bad', 2: 'warn', 3: 'info' };

/**
 * Postes à recruter : la liste de courses du mercato, du plus urgent (partant sans remplaçant) à la profondeur de banc.
 * « Chercher » ouvre le chercheur de remplaçant au poste du joueur concerné (cibles suivies, puis base du jeu).
 */
export function NeedsPanel({
  needs,
  saveId,
  gameDate,
  engine,
  project,
  squad,
}: {
  needs: RecruitNeed[];
  saveId: string;
  gameDate: string;
  engine: TacticEngine;
  project: Project | null;
  squad: FmPlayer[];
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<number | null>(null);
  const attr = (k: string) => t(`fm.attr.${k}`, { defaultValue: k });
  return (
    <Panel title={t('fm.needs.title', { count: needs.length })}>
      <p className="help">{t('fm.needs.help')}</p>
      {needs.length ? (
        needs.map((n, i) => (
          <div key={`${n.pos}-${n.player?.id ?? i}`} className="border-b border-canard/5 py-2 last:border-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <Tag tone={PRIORITY_TONE[n.priority]}>{t(`fm.needs.priority.${n.priority}`)}</Tag>
              <b>{POS_LABEL[n.pos]}</b>
              {n.why.map((w) => (
                <span key={w} className="text-sm text-brun">
                  {t(`fm.needs.why.${w}`, { name: n.player?.name ?? '' })}
                </span>
              ))}
              {n.player && <PlayerLink player={n.player} />}
              {n.target != null && (
                <span className="inline-flex items-center gap-1 text-xs text-brun">
                  {t('fm.needs.target')} <Fit value={n.target} />
                </span>
              )}
              {project && n.player && open !== i && (
                <button type="button" className="text-xs font-bold text-orange-fonce hover:underline" onClick={() => setOpen(i)}>
                  {t('fm.needs.search')}
                </button>
              )}
            </div>
            {n.attrs.length > 0 && <p className="text-xs text-brun">{t('fm.needs.attrs', { list: n.attrs.map(attr).join(', ') })}</p>}
            {project && n.player && open === i && (
              <ReplacementFinder saveId={saveId} gameDate={gameDate} engine={engine} project={project} leaving={n.player} squad={squad} onClose={() => setOpen(null)} />
            )}
          </div>
        ))
      ) : (
        <Empty>{t('fm.needs.none')}</Empty>
      )}
      <More>{t('fm.needs.more')}</More>
    </Panel>
  );
}
