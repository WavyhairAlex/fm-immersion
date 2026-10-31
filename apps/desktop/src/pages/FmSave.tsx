import { alertGroups, normalizePlayer, type FmPlayer, type Line } from '@simloom/module-fm';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { fmData, savesData } from '../lib/data';
import { FmAnalysis } from './FmAnalysis';
import { FmBridge } from './FmBridge';
import { FmSummary } from './FmSummary';
import { FmTactic } from './FmTactic';

const LINES: Line[] = ['GB', 'DEF', 'MIL', 'ATT'];

/** Partie Football Manager : import depuis le plugin, alertes, effectif. */
export function FmSave() {
  const { saveId = '' } = useParams();
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const key = ['fm', saveId] as const;

  const { data: save } = useQuery({
    queryKey: ['saves'],
    queryFn: savesData.list,
    select: (rows) => rows.find((s) => s.id === saveId),
  });
  const { data: snapshot, isLoading } = useQuery({ queryKey: [...key, 'latest'], queryFn: () => fmData.latest(saveId) });
  const { data: settings } = useQuery({ queryKey: [...key, 'settings'], queryFn: () => fmData.settings(saveId) });
  const { data: defaultFolder } = useQuery({
    queryKey: ['fm', 'default-folder'],
    queryFn: () => invoke<string | null>('fm_default_folder'),
  });

  const [tab, setTab] = useState<'squad' | 'analysis' | 'tactic'>('squad');
  const [folder, setFolder] = useState('');
  useEffect(() => {
    setFolder(settings?.fmFolder ?? defaultFolder ?? '');
  }, [settings?.fmFolder, defaultFolder]);

  const importSnap = useMutation({
    mutationFn: async () => {
      const text = await invoke<string>('fm_read_snapshot', { folder });
      if (folder !== settings?.fmFolder) await fmData.setFolder(saveId, folder);
      return fmData.importSnapshot(saveId, JSON.parse(text));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ['saves'] });
    },
  });

  const players = useMemo(() => snapshot?.data.players.map(normalizePlayer) ?? [], [snapshot]);
  const groups = snapshot ? alertGroups(players, snapshot.gameDate) : null;
  const dateFmt = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: 'long' });

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <Link to="/" className="text-sm font-bold text-canard/70 hover:text-canard">
        ← {t('fm.back')}
      </Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-canard/60">{t('home.for', { game: 'Football Manager' })}</p>
          <h1 className="text-3xl font-semibold">{save?.name ?? '…'}</h1>
          {snapshot && (
            <p className="mt-1 text-sm text-brun">
              {t('fm.context', { club: snapshot.club, date: dateFmt.format(new Date(snapshot.gameDate)), count: snapshot.playerCount })}
            </p>
          )}
        </div>
      </div>


      <form
        className="mt-4 flex flex-wrap items-center gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          importSnap.mutate();
        }}
      >
        <button className="btn-primary" disabled={importSnap.isPending || !folder}>
          {t('fm.import')}
        </button>
        <details className="text-sm" open={!snapshot}>
          <summary className="cursor-pointer font-bold text-canard/70">{t('fm.folder')}</summary>
          <input className="input mt-2 min-w-[24rem]" required value={folder} onChange={(e) => setFolder(e.target.value)} aria-label={t('fm.folder')} />
          <p className="mt-1 max-w-xl text-xs text-canard/60">{t('fm.folderHelp')}</p>
        </details>
        {importSnap.isError && <p className="w-full text-sm text-corail">{t('fm.importError', { reason: String(importSnap.error?.message ?? importSnap.error) })}</p>}
      </form>

      <FmBridge dataFolder={folder} />

      {!isLoading && !snapshot && (
        <div className="card mt-6 flex flex-col items-center gap-3 py-10 text-center">
          <img src="/brand/football-sm.webp" alt="" className="h-28 w-auto rounded-2xl" />
          <p className="max-w-md text-brun">{t('fm.empty')}</p>
        </div>
      )}

      {snapshot && players.length > 0 && <FmSummary snap={snapshot.data} players={players} />}

      {groups && (
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <AlertTile title={t('fm.alert.injured', { count: groups.injured.length })} list={groups.injured} urgent />
          <AlertTile title={t('fm.alert.expiring', { count: groups.expiring.length })} list={groups.expiring} />
          <AlertTile title={t('fm.alert.tired', { count: groups.tired.length })} list={groups.tired} />
        </div>
      )}

      {snapshot && players.length > 0 && (
        <>
          <div className="mt-8 flex gap-2" role="tablist">
            {(['squad', 'analysis', 'tactic'] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={`rounded-full px-4 py-1.5 font-bold ${tab === k ? 'bg-canard text-white' : 'bg-white text-canard ring-1 ring-canard/15'}`}
              >
                {t(`fm.tabs.${k}`)}
              </button>
            ))}
          </div>
          {tab === 'squad' && <SquadTable players={players} />}
          {tab === 'analysis' && <FmAnalysis players={players} gameDate={snapshot.gameDate} />}
          {tab === 'tactic' && <FmTactic players={players} folder={folder} gameFormation={snapshot.data.tactic?.formation ?? null} />}
        </>
      )}
    </div>
  );
}

function AlertTile({ title, list, urgent }: { title: string; list: FmPlayer[]; urgent?: boolean }) {
  const { t } = useTranslation();
  const dot = list.length === 0 ? 'bg-eau' : urgent ? 'bg-corail' : 'bg-ambre';
  return (
    <div className="card p-5">
      <p className="flex items-center gap-2 font-display font-semibold">
        <span className={`h-2.5 w-2.5 rounded-full ${dot}`} aria-hidden />
        {title}
      </p>
      <p className="mt-2 text-sm text-brun">
        {list.length ? list.slice(0, 4).map((p) => p.name).join(', ') + (list.length > 4 ? '…' : '') : t('fm.alert.none')}
      </p>
    </div>
  );
}

type SortKey = 'name' | 'age' | 'level' | 'condition' | 'contractEnd' | 'wage';

function SquadTable({ players }: { players: FmPlayer[] }) {
  const { t, i18n } = useTranslation();
  const [line, setLine] = useState<Line | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'level', desc: true });
  const money = new Intl.NumberFormat(i18n.resolvedLanguage, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const date = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: 'medium' });

  const rows = useMemo(() => {
    const list = line ? players.filter((p) => p.line === line) : players;
    const val = (p: FmPlayer) => p[sort.key];
    return [...list].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      if (x == null) return 1;
      if (y == null) return -1;
      const c = typeof x === 'string' ? x.localeCompare(String(y)) : x - (y as number);
      return sort.desc ? -c : c;
    });
  }, [players, line, sort]);

  const head = (key: SortKey, label: string) => (
    <th className="px-3 py-2 text-left">
      <button
        type="button"
        className="font-bold hover:text-canard"
        onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== 'name' }))}
      >
        {label}
        {sort.key === key ? (sort.desc ? ' ▾' : ' ▴') : ''}
      </button>
    </th>
  );

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {[null, ...LINES].map((l) => (
            <button
              key={l ?? 'all'}
              type="button"
              onClick={() => setLine(l)}
              className={`rounded-full px-3 py-1 text-sm font-bold ${line === l ? 'bg-canard text-white' : 'bg-white text-canard ring-1 ring-canard/15'}`}
            >
              {t(`fm.line.${l ?? 'all'}`)} · {l ? players.filter((p) => p.line === l).length : players.length}
            </button>
          ))}
        </div>
      </div>
      <div className="card mt-4 overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-canard/10 text-canard/70">
            <tr>
              {head('name', t('fm.col.name'))}
              <th className="px-3 py-2 text-left font-bold">{t('fm.col.positions')}</th>
              {head('age', t('fm.col.age'))}
              {head('level', t('fm.col.level'))}
              {head('condition', t('fm.col.condition'))}
              {head('contractEnd', t('fm.col.contract'))}
              {head('wage', t('fm.col.wage'))}
              <th className="px-3 py-2 text-left font-bold">{t('fm.col.status')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-b border-canard/5 odd:bg-creme/40">
                <td className="px-3 py-2 font-bold">
                  {p.name}
                  {p.injury && <span className="ml-2 rounded-full bg-corail/15 px-2 py-0.5 text-xs text-canard">{p.injury}</span>}
                </td>
                <td className="px-3 py-2">
                  <span className="flex flex-wrap gap-1">
                    {p.positionsLabel.split(', ').map((pos) => (
                      <span key={pos} className="rounded-full bg-eau/20 px-2 py-0.5 text-xs font-bold">
                        {pos}
                      </span>
                    ))}
                  </span>
                </td>
                <td className="px-3 py-2">{p.age ?? '–'}</td>
                <td className="px-3 py-2 font-bold">{p.level?.toFixed(1) ?? '–'}</td>
                <td className="px-3 py-2">{p.condition != null ? `${Math.round(p.condition)} %` : '–'}</td>
                <td className="px-3 py-2">{p.contractEnd ? date.format(new Date(p.contractEnd)) : '–'}</td>
                <td className="px-3 py-2">{p.wage != null ? money.format(p.wage) : '–'}</td>
                <td className="px-3 py-2 text-brun">{p.squadStatus ?? '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
