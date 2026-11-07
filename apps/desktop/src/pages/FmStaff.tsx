import {
  COACH_DOMAINS,
  STAFF_JOBS,
  WEAK_DOMAIN,
  assignDomains,
  bestFreeAgents,
  staffCard,
  type CoachDomain,
  type DbStaff,
  type StaffJob,
} from '@fm-immersion/module-fm';
import { useMutation } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Empty, More, Panel, Tag } from './FmUi';

/** Réponse de `fm_memory_staff` (voir `src-tauri/src/fm_memory.rs`). */
interface StaffRead {
  gameDate: string | null;
  clubId: number | null;
  staff: DbStaff[];
  freeAgents: DbStaff[];
}

const JOBS = Object.keys(STAFF_JOBS) as StaffJob[];

/** Note sur 20, en gras quand elle est bonne, en corail quand elle est faible. */
function Score({ value }: { value: number | null }) {
  if (value == null) return <span className="text-canard/40">–</span>;
  const tone = value >= 15 ? 'font-bold' : value < WEAK_DOMAIN ? 'text-corail' : '';
  return <span className={`tabular-nums ${tone}`}>{value.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>;
}

/**
 * Staff : notes de nos entraîneurs par domaine, affectations proposées (deux domaines au plus chacun), et
 * meilleurs membres du staff libre là où on est faible. Lecture seule de la base du jeu, à la demande.
 */
export function FmStaff() {
  const { t } = useTranslation();
  const [withFree, setWithFree] = useState(true);
  const [freeKey, setFreeKey] = useState<CoachDomain | StaffJob>('Goalkeeping');
  const read = useMutation({ mutationFn: async (free: boolean) => invoke<StaffRead>('fm_memory_staff', { freeAgents: free }) });
  const data = read.data;
  const cards = useMemo(() => (data ? data.staff.map(staffCard).sort((a, b) => b.domains[b.best[0]!] - a.domains[a.best[0]!]) : []), [data]);
  const plan = useMemo(() => (data ? assignDomains(data.staff, data.freeAgents) : []), [data]);
  const free = useMemo(() => (data ? bestFreeAgents(data.freeAgents, freeKey, 10) : []), [data, freeKey]);
  const weak = plan.filter((a) => a.weak);
  const label = (k: CoachDomain | StaffJob) => t(`fm.staff.k.${k}`);

  return (
    <div className="space-y-5">
      <Panel title={t('fm.staff.title')}>
        <p className="help">{t('fm.staff.teaser')}</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button type="button" className="btn-secondary" disabled={read.isPending} onClick={() => read.mutate(withFree)}>
            {t('fm.staff.read')}
          </button>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={withFree} onChange={(e) => setWithFree(e.target.checked)} />
            {t('fm.staff.withFree')}
          </label>
          {read.isPending && <span className="text-xs text-brun">{t('fm.staff.reading')}</span>}
          {read.isError && <span className="text-xs text-corail">{String(read.error)}</span>}
        </div>
        {data && data.clubId == null && <p className="mt-2 text-sm text-brun">{t('fm.staff.noClub')}</p>}
        {data && data.clubId != null && !data.staff.length && <p className="mt-2 text-sm text-brun">{t('fm.staff.none')}</p>}
        <More>{t('fm.staff.help')}</More>
      </Panel>

      {plan.length > 0 && data!.staff.length > 0 && (
        <Panel title={t('fm.staff.planTitle')}>
          {weak.length > 0 && <p className="mb-2 text-sm">{t('fm.staff.weak', { count: weak.length, list: weak.map((a) => label(a.domain)).join(', ') })}</p>}
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('fm.staff.domain')}</th>
                  <th>{t('fm.staff.coach')}</th>
                  <th>{t('fm.staff.score')}</th>
                  <th>{t('fm.staff.freeBetter')}</th>
                </tr>
              </thead>
              <tbody>
                {plan.map((a) => (
                  <tr key={a.domain}>
                    <td className="font-bold">{label(a.domain)}</td>
                    <td>{a.coach ? a.coach.name : <span className="text-brun">{t('fm.staff.nobody')}</span>}</td>
                    <td>
                      <Score value={a.score} /> {a.weak && <Tag tone="warn">{t('fm.staff.toStrengthen')}</Tag>}
                    </td>
                    <td>
                      {a.freeAgent ? (
                        <>
                          {a.freeAgent.staff.name} <Score value={a.freeAgent.score} />
                          {a.freeAgent.staff.age != null && <span className="text-xs text-brun"> · {t('fm.staff.age', { age: a.freeAgent.staff.age })}</span>}
                        </>
                      ) : (
                        <span className="text-canard/40">–</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {cards.length > 0 && (
        <Panel title={t('fm.staff.listTitle', { count: cards.length })}>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('fm.staff.name')}</th>
                  <th>{t('fm.staff.job')}</th>
                  {COACH_DOMAINS.map((d) => (
                    <th key={d} className="text-right">{t(`fm.staff.short.${d}`)}</th>
                  ))}
                  <th>{t('fm.staff.bestJob')}</th>
                </tr>
              </thead>
              <tbody>
                {cards.map((c) => (
                  <tr key={c.staff.id}>
                    <td>
                      <span className="font-bold">{c.staff.name}</span>
                      {c.staff.age != null && <span className="text-xs text-brun"> · {t('fm.staff.age', { age: c.staff.age })}</span>}
                    </td>
                    <td className="text-xs text-brun">{c.staff.jobCode != null ? t('fm.staff.jobCode', { code: c.staff.jobCode }) : '–'}</td>
                    {COACH_DOMAINS.map((d) => (
                      <td key={d} className={`text-right ${c.best.includes(d) ? 'bg-eau/15' : ''}`}>
                        <Score value={c.domains[d]} />
                      </td>
                    ))}
                    <td className="text-sm">{c.bestJob ? <>{label(c.bestJob)} <Score value={c.jobs[c.bestJob]} /></> : <span className="text-canard/40">–</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-brun">{t('fm.staff.jobNote')}</p>
        </Panel>
      )}

      {data && data.freeAgents.length > 0 && (
        <Panel title={t('fm.staff.freeTitle', { count: data.freeAgents.length })}>
          <label className="block text-xs font-bold text-canard">
            {t('fm.staff.freeFor')}
            <select className="input mt-1 min-w-[12rem] font-normal" value={freeKey} onChange={(e) => setFreeKey(e.target.value as CoachDomain | StaffJob)}>
              {[...COACH_DOMAINS, ...JOBS].map((k) => (
                <option key={k} value={k}>{label(k)}</option>
              ))}
            </select>
          </label>
          {free.length ? (
            <ol className="mt-2 grid gap-x-6 text-sm sm:grid-cols-2">
              {free.map((f, i) => (
                <li key={f.staff.id} className="flex items-center justify-between gap-2 border-b border-canard/5 py-1">
                  <span>
                    {i + 1}. {f.staff.name}
                    {f.staff.age != null && <span className="text-xs text-brun"> · {t('fm.staff.age', { age: f.staff.age })}</span>}
                    {f.staff.nation && <span className="text-xs text-brun"> · {f.staff.nation}</span>}
                  </span>
                  <Score value={f.score} />
                </li>
              ))}
            </ol>
          ) : (
            <Empty>{t('fm.staff.none')}</Empty>
          )}
        </Panel>
      )}
    </div>
  );
}
