import { GAME_IDS, GAMES, type GameId } from '@simloom/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { savesData } from '../lib/data';
import { useUi } from '../lib/ui-store';

const savesKey = ['saves'] as const;

const ILLUSTRATION: Record<GameId, string> = {
  tf3: '/brand/transport-sm.webp',
  pz2: '/brand/zoo-sm.webp',
  fm: '/brand/football-sm.webp',
};

export function Home() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { data: saves = [], isLoading } = useQuery({ queryKey: savesKey, queryFn: savesData.list });
  const { createSaveOpen, setCreateSaveOpen } = useUi();

  const remove = useMutation({
    mutationFn: savesData.remove,
    onSuccess: () => qc.invalidateQueries({ queryKey: savesKey }),
  });

  const dateFmt = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: 'medium' });

  return (
    <div className="w-full px-6 py-6 xl:px-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">{t('home.title')}</h1>
        <button className="btn-primary" onClick={() => setCreateSaveOpen(true)}>
          {t('home.add')}
        </button>
      </div>

      {createSaveOpen && <CreateSaveForm onDone={() => setCreateSaveOpen(false)} />}

      {!isLoading && saves.length === 0 && !createSaveOpen && (
        <div className="card mt-8 flex flex-col items-center gap-3 py-10 text-center">
          <img src="/brand/mascotte-sm.webp" alt="" className="h-32 w-auto" />
          <p className="max-w-md text-brun">{t('home.empty')}</p>
        </div>
      )}

      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {saves.map((s) => {
          const game = GAMES[s.gameId as GameId];
          return (
            <article key={s.id} className="card overflow-hidden p-0">
              <div className="h-1.5" style={{ backgroundColor: game?.accent }} />
              <div className="p-6">
                <p className="text-xs font-bold uppercase tracking-wide text-canard/60">
                  {game?.name ?? s.gameId}
                  {s.gameVersion ? ` · ${s.gameVersion}` : ''}
                </p>
                <h2 className="mt-1 text-xl font-semibold">{s.name}</h2>
                <p className="mt-3 text-xs text-canard/60">
                  {t('home.updated', { date: dateFmt.format(new Date(s.updatedAt)) })}
                </p>
                <div className="mt-4 flex items-center gap-4">
                  {(s.gameId === 'fm' || s.gameId === 'pz2' || s.gameId === 'tf3') && (
                    <Link to={`/${s.gameId}/${s.id}`} className="btn-secondary px-4 py-1.5 text-sm">
                      {t('home.open')}
                    </Link>
                  )}
                  <button
                    className="text-sm font-bold text-corail hover:underline"
                    onClick={() => remove.mutate(s.id)}
                  >
                    {t('home.delete')}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <section className="mt-14">
        <h2 className="text-xl font-semibold">{t('home.modules')}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {GAME_IDS.map((id) => (
            <div key={id} className="card flex items-center gap-4 p-4">
              <img src={ILLUSTRATION[id]} alt="" className="h-16 w-16 rounded-2xl object-cover" loading="lazy" />
              <div>
                <p className="font-display font-semibold">{t('home.for', { game: GAMES[id].name })}</p>
                <p className="text-xs font-bold text-canard/60">
                  {GAMES[id].status === 'available' ? t('home.available') : t('home.soon')}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="mt-12 border-t border-canard/10 py-6 text-xs text-canard/60">
        <p>{t('footer.disclaimer')}</p>
        <p className="mt-1">{t('footer.privacy')}</p>
      </footer>
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
    mutationFn: () => savesData.create({ gameId, name, gameVersion: gameVersion || undefined }),
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
        {t('home.game')}
        <select className="input mt-1" value={gameId} onChange={(e) => setGameId(e.target.value as GameId)}>
          {available.map((id) => (
            <option key={id} value={id}>
              {GAMES[id].name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-bold">
        {t('home.name')}
        <input className="input mt-1" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="text-sm font-bold">
        {t('home.version')}
        <input className="input mt-1" maxLength={40} value={gameVersion} onChange={(e) => setGameVersion(e.target.value)} />
      </label>
      {create.isError && <p className="text-sm text-corail sm:col-span-3">{t('home.error')}</p>}
      <div className="flex gap-3 sm:col-span-3">
        <button className="btn-primary" disabled={create.isPending}>
          {t('home.create')}
        </button>
        <button type="button" className="btn-secondary" onClick={onDone}>
          {t('home.cancel')}
        </button>
      </div>
    </form>
  );
}
