import { EFF_COMPONENTS, EFF_SUBSCORES, effectiveness, type FmSnapshot, type Range, type SquadAt } from '@fm-immersion/module-fm';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Empty, Kpi, Panel, Tag } from './FmUi';

const color = (v: number | null) => (v == null ? 'bg-canard/15' : v >= 70 ? 'bg-eau-fonce' : v >= 50 ? 'bg-eau' : 'bg-corail');
const txt = (r: Range | null | undefined) => (r == null ? '–' : r.min === r.max ? String(Math.round(r.mid!)) : `${Math.round(r.min!)}–${Math.round(r.max!)}`);

function Gauge({ label, sub, r }: { label: string; sub?: string; r: Range | null | undefined }) {
  const lo = Math.max(0, Math.min(100, r?.min ?? 0));
  const hi = Math.max(0, Math.min(100, r?.max ?? 0));
  return (
    <div className="flex items-center gap-3 border-b border-canard/5 py-1.5 text-sm last:border-0">
      <span className="w-44 shrink-0">
        {label}
        {sub && <span className="block text-xs text-brun">{sub}</span>}
      </span>
      <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-canard/10">
        {r && (
          <>
            <i className={`absolute inset-y-0 left-0 ${color(r.mid)}`} style={{ width: `${lo}%` }} />
            <i className={`absolute inset-y-0 opacity-40 ${color(r.mid)}`} style={{ left: `${lo}%`, width: `${hi - lo}%` }} />
          </>
        )}
      </span>
      <span className="w-14 text-right tabular-nums">{txt(r)}</span>
    </div>
  );
}

/** Efficacité tactique : les jauges du jeu quand le plugin les lit, avec les séances à programmer. */
export function FmEffectiveness({ snap, history, go }: { snap: FmSnapshot; history: SquadAt[]; go: (view: string) => void }) {
  const { t } = useTranslation();
  const e = useMemo(() => effectiveness(snap), [snap]);
  const tactic = (snap.tactic ?? {}) as Record<string, unknown>;
  if (!e)
    return (
      <Panel title={t('fm.eff.gauges')}>
        <Empty>{t('fm.eff.none')}</Empty>
        <button type="button" className="mt-3 text-sm font-bold text-orange-fonce hover:underline" onClick={() => go('style')}>
          {t('fm.eff.toStyle')} →
        </button>
      </Panel>
    );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label={t('fm.eff.overall')} value={txt(e.overall)} tone={e.overall?.mid != null && e.overall.mid < 50 ? 'bad' : undefined} sub={typeof tactic.name === 'string' ? tactic.name : undefined} />
        <Kpi label={t('fm.eff.complexity')} value={typeof tactic.complexityLabel === 'string' ? tactic.complexityLabel : txt(e.complexity)} sub={t('fm.eff.comprehension', { value: txt(e.comprehension) })} />
        <Kpi label={t('fm.eff.snaps')} value={history.length} sub={t('fm.eff.snapsSub')} />
      </div>
      {e.flags.length > 0 && (
        <div className="card flex flex-wrap gap-2 p-4">
          {e.flags.map((f) => (
            <Tag key={f} tone="warn">
              {t(`fm.eff.flag.${f}`, { defaultValue: f })}
            </Tag>
          ))}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t('fm.eff.components')}>
          {EFF_COMPONENTS.map((k) => (
            <Gauge key={k} label={t(`fm.eff.comp.${k}`)} r={e.components[k]} />
          ))}
          {EFF_SUBSCORES.some((k) => e.subScores[k]) && (
            <>
              <h3 className="mb-1 mt-4 font-semibold">{t('fm.eff.detail')}</h3>
              {EFF_SUBSCORES.filter((k) => e.subScores[k]).map((k) => (
                <Gauge key={k} label={t(`fm.eff.sub.${k}`)} r={e.subScores[k]} />
              ))}
            </>
          )}
        </Panel>
        <Panel title={t('fm.eff.areas')}>
          {e.areas.length ? e.areas.map((a) => <Gauge key={a.id} label={t(`fm.area.${a.id}`)} sub={t('fm.eff.session', { name: t(`fm.areaSession.${a.id}`) })} r={a.value} />) : <Empty>{t('fm.eff.noAreas')}</Empty>}
          {e.weakest.length > 0 && (
            <p className="mt-3 rounded-xl bg-eau/20 px-3 py-2 text-sm">{t('fm.eff.thisWeek', { list: e.weakest.map((a) => t(`fm.areaSession.${a}`)).join(', ') })}</p>
          )}
        </Panel>
      </div>
      {e.advice.length > 0 && (
        <Panel title={t('fm.eff.advice')}>
          {e.advice.map((a, i) => (
            <div key={i} className="flex items-center justify-between gap-3 border-b border-canard/5 py-1.5 text-sm last:border-0">
              <span>
                {a.pro === true ? <Tag tone="good">+</Tag> : a.pro === false ? <Tag tone="warn">!</Tag> : null} {a.text}
              </span>
              <span className="text-xs text-brun">{t(`fm.eff.group.${a.group}`, { defaultValue: a.group })}</span>
            </div>
          ))}
        </Panel>
      )}
    </div>
  );
}
