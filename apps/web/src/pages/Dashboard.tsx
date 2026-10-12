import { GAME_IDS, GAMES, type GameId } from '@simloom/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useUi } from '../lib/ui-store';

const savesKey = ['saves'] as const;

export function Dashboard() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { data: saves = [], isLoading } = useQuery({ queryKey: savesKey, queryFn: api.saves });
  const { createSaveOpen, setCreateSaveOpen } = useUi();

  const remove = useMutation({
    mutationFn: api.deleteSave,
    onSuccess: () => qc.invalidateQueries({ queryKey: savesKey }),
  });

  const dateFmt = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: 'medium' });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">{t('dashboard.title')}</h1>
        <button className="btn-primary" onClick={() => setCreateSaveOpen(true)}>
          {t('dashboard.add')}
        </button>
      </div>

      {createSaveOpen && <CreateSaveForm onDone={() => setCreateSaveOpen(false)} />}

      {!isLoading && saves.length === 0 && !createSaveOpen && (
        <p className="mt-10 text-center text-brun">{t('dashboard.empty')}</p>
      )}

      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {saves.map((s) => (
          <article key={s.id} className="card border-t-4" style={{ borderTopColor: GAMES[s.gameId].accent }}>
            <p className="text-xs font-bold uppercase tracking-wide text-canard/60">
              {GAMES[s.gameId].name}
              {s.gameVersion ? ` · ${s.gameVersion}` : ''}
            </p>
            <h2 className="mt-1 text-xl font-semibold">{s.name}</h2>
            <p className="mt-3 text-xs text-canard/60">
              {t('dashboard.updated', { date: dateFmt.format(new Date(s.updatedAt)) })}
            </p>
            <button
              className="mt-4 text-sm font-bold text-corail hover:underline"
              onClick={() => remove.mutate(s.id)}
            >
              {t('dashboard.delete')}
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}

function CreateSaveForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const available = GAME_IDS.filter((id) => GAMES[id].status === 'available');
  const [gameId, setGameId] = useState<GameId>(available[0] ?? 'tf3');
  const [name, setName] = useState('');
  const [gameVersion, setGameVersion] = useState('');

  const create = useMutation({
    mutationFn: () => api.createSave({ gameId, name, gameVersion: gameVersion || undefined }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: savesKey });
      onDone();
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  return (
    <form onSubmit={onSubmit} className="card mt-6 grid gap-4 sm:grid-cols-3">
      <label className="text-sm font-bold">
        {t('dashboard.game')}
        <select className="input mt-1" value={gameId} onChange={(e) => setGameId(e.target.value as GameId)}>
          {available.map((id) => (
            <option key={id} value={id}>
              {GAMES[id].name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-bold">
        {t('dashboard.name')}
        <input className="input mt-1" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="text-sm font-bold">
        {t('dashboard.version')}
        <input className="input mt-1" maxLength={40} value={gameVersion} onChange={(e) => setGameVersion(e.target.value)} />
      </label>
      <div className="flex gap-3 sm:col-span-3">
        <button className="btn-primary" disabled={create.isPending}>
          {t('dashboard.create')}
        </button>
        <button type="button" className="btn-secondary" onClick={onDone}>
          {t('dashboard.cancel')}
        </button>
      </div>
    </form>
  );
}
