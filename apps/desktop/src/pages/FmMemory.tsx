import { useMutation } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

/** Joueur lu directement dans la base de FM27 (voir `src-tauri/src/fm_memory.rs`). */
type DbPlayer = {
  id: number;
  name: string;
  age: number | null;
  birthDate: string | null;
  club: string | null;
  loanClub: string | null;
  loanEnd: string | null;
  ca: number;
  pa: number;
  positionsText: string;
  positionRatings: Record<string, number>;
  attributes: Record<string, number>;
  attributeScale: number;
  wageWeekly: number | null;
  contractEnd: string | null;
  valueRaw: number | null;
};

type Probe = {
  knownVersion: boolean;
  gameDate: string | null;
  gameDateRaw: { day: number; year: number } | null;
  playerCount: number;
  checked: number;
  plausible: number;
  humans: { name: string | null; club: string | null }[];
  squad: DbPlayer[];
};

const errorText = (e: unknown) => String((e as Error)?.message ?? e);

function PlayerRows({ players }: { players: DbPlayer[] }) {
  const { t } = useTranslation();
  if (!players.length) return <p className="mt-2 text-sm text-brun">{t('fm.memory.none')}</p>;
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-brun">
          <tr>
            <th className="py-1 pr-3">{t('fm.memory.col.name')}</th>
            <th className="py-1 pr-3">{t('fm.memory.col.age')}</th>
            <th className="py-1 pr-3">{t('fm.memory.col.club')}</th>
            <th className="py-1 pr-3">{t('fm.memory.col.caPa')}</th>
            <th className="py-1 pr-3">{t('fm.memory.col.positions')}</th>
            <th className="py-1 pr-3">{t('fm.memory.col.wage')}</th>
            <th className="py-1 pr-3">{t('fm.memory.col.contractEnd')}</th>
            <th className="py-1 pr-3">{t('fm.memory.col.value')}</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => (
            <tr key={p.id} className="border-t border-canard/10 align-top text-canard">
              <td className="py-1 pr-3">
                <details>
                  <summary className="cursor-pointer font-bold">{p.name}</summary>
                  <p className="mt-1 text-xs text-brun">
                    {t('fm.memory.scale', { scale: p.attributeScale })} · {t('fm.memory.birth', { date: p.birthDate ?? '?' })}
                  </p>
                  <ul className="mt-1 grid grid-cols-2 gap-x-4 text-xs sm:grid-cols-3">
                    {Object.entries(p.attributes).map(([k, v]) => (
                      <li key={k}>
                        {k} <b>{v}</b>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-xs text-brun">
                    {Object.entries(p.positionRatings)
                      .map(([k, v]) => `${k} ${v}`)
                      .join(' · ')}
                  </p>
                </details>
              </td>
              <td className="py-1 pr-3">{p.age ?? '?'}</td>
              <td className="py-1 pr-3">
                {p.club ?? '?'}
                {p.loanClub && <span className="block text-xs text-brun">{t('fm.memory.loan', { club: p.loanClub, end: p.loanEnd ?? '?' })}</span>}
              </td>
              <td className="py-1 pr-3">
                {p.ca} / {p.pa}
              </td>
              <td className="py-1 pr-3">{p.positionsText || '?'}</td>
              <td className="py-1 pr-3">{p.wageWeekly ?? '?'}</td>
              <td className="py-1 pr-3">{p.contractEnd ?? '?'}</td>
              <td className="py-1 pr-3">{p.valueRaw ?? '?'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Essai de lecture directe de la base de FM27 (lecture seule, de l'extérieur du jeu), à lancer par le joueur :
 * sert à comparer les valeurs lues avec les fiches du jeu avant de s'en servir pour le mercato.
 */
export function FmMemory() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const probe = useMutation({ mutationFn: () => invoke<Probe>('fm_memory_probe') });
  const find = useMutation({ mutationFn: (q: string) => invoke<DbPlayer[]>('fm_memory_find', { query: q }) });

  if (!open)
    return (
      <p className="mt-1 text-xs text-brun">
        <button type="button" className="font-bold text-orange-fonce hover:underline" onClick={() => setOpen(true)}>
          {t('fm.memory.open')}
        </button>
      </p>
    );

  const p = probe.data;
  return (
    <section className="rounded-xl bg-creme/60 p-4 ring-1 ring-canard/10">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">{t('fm.memory.title')}</h2>
        <button type="button" className="text-sm font-bold text-orange-fonce hover:underline" onClick={() => setOpen(false)}>
          {t('fm.bridge.hide')}
        </button>
      </div>
      <p className="mt-1 text-sm text-brun">{t('fm.memory.intro')}</p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary" disabled={probe.isPending} onClick={() => probe.mutate()}>
          {probe.isPending ? t('fm.memory.reading') : t('fm.memory.run')}
        </button>
        {probe.isError && <p className="text-sm text-corail">{t('fm.memory.error', { reason: errorText(probe.error) })}</p>}
      </div>

      {p && (
        <>
          <ul className="mt-4 grid gap-1 text-sm text-canard sm:grid-cols-2">
            <li>{t('fm.memory.date', { date: p.gameDate ?? '?', day: p.gameDateRaw?.day ?? '?', year: p.gameDateRaw?.year ?? '?' })}</li>
            <li>{t('fm.memory.count', { count: p.playerCount })}</li>
            <li>{t('fm.memory.plausible', { ok: p.plausible, total: p.checked })}</li>
            <li>{p.knownVersion ? t('fm.memory.known') : t('fm.memory.patched')}</li>
            {p.humans.map((h, i) => (
              <li key={i} className="sm:col-span-2">
                {t('fm.memory.human', { name: h.name ?? '?', club: h.club ?? t('fm.memory.noClub') })}
              </li>
            ))}
          </ul>
          <h3 className="mt-4 font-display font-semibold">{t('fm.memory.squad')}</h3>
          <PlayerRows players={p.squad} />
        </>
      )}

      <form
        className="mt-6 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim().length >= 3) find.mutate(query.trim());
        }}
      >
        <label className="block text-sm font-bold">
          {t('fm.memory.search')}
          <input className="input mt-1 font-normal" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('fm.memory.searchHint')} />
        </label>
        <button type="submit" className="btn-secondary" disabled={find.isPending || query.trim().length < 3}>
          {find.isPending ? t('fm.memory.reading') : t('fm.memory.find')}
        </button>
      </form>
      {find.isError && <p className="mt-2 text-sm text-corail">{t('fm.memory.error', { reason: errorText(find.error) })}</p>}
      {find.data && <PlayerRows players={find.data} />}
    </section>
  );
}
