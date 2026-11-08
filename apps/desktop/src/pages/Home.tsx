import { GAME_IDS, GAMES, type GameId } from '@fm-immersion/shared';
import type { Save } from '../lib/saves';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useCareer, useCareerStore } from '../lib/career';
import { fmData, savesData } from '../lib/data';
import { useUi } from '../lib/ui-store';

const savesKey = ['saves'] as const;

export function Home() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: saves = [], isLoading } = useQuery({ queryKey: savesKey, queryFn: savesData.list });
  const { createSaveOpen, setCreateSaveOpen } = useUi();
  const { saveId } = useCareer();

  const remove = useMutation({
    mutationFn: savesData.remove,
    onSuccess: () => qc.invalidateQueries({ queryKey: savesKey }),
  });

  return (
    <div className="w-full px-6 py-6 xl:px-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">{t('home.title')}</h1>
        {!createSaveOpen && (
          <button className="btn-primary" onClick={() => setCreateSaveOpen(true)}>
            {t('home.add')}
          </button>
        )}
      </div>

      {createSaveOpen && <CreateSaveForm first={!isLoading && saves.length === 0} onDone={() => setCreateSaveOpen(false)} />}

      {!isLoading && saves.length === 0 && !createSaveOpen && (
        <div className="card mt-8 flex flex-col items-center gap-3 py-10 text-center">
          <p className="max-w-md text-brun">{t('home.empty')}</p>
        </div>
      )}

      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {saves.map((s) => (
          <CareerCard key={s.id} save={s} current={s.id === saveId} onDelete={() => remove.mutate(s.id)} />
        ))}
      </div>
    </div>
  );
}

/**
 * Une carrière : le club et la date en jeu d'abord (les repères pour reprendre la bonne partie), puis « Reprendre ».
 * La suppression est rangée dans le menu de la carte, avec une confirmation.
 */
function CareerCard({ save: s, current, onDelete }: { save: Save; current: boolean; onDelete: () => void }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const setSaveId = useCareerStore((st) => st.setSaveId);
  const { data: latest } = useQuery({ queryKey: ['fm', s.id, 'latest'], queryFn: () => fmData.latest(s.id), enabled: s.gameId === 'fm' });
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const game = GAMES[s.gameId as GameId];
  const dateFmt = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: 'long' });
  const shortFmt = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: 'medium' });
  return (
    <article className={`card relative overflow-hidden p-0 ${current ? 'ring-2 ring-orange' : ''}`}>
      <div className="h-1.5" style={{ backgroundColor: game?.accent }} />
      <div className="p-6">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-wide text-canard/60">
            {game?.name ?? s.gameId}
            {s.gameVersion ? ` · ${s.gameVersion}` : ''}
            {current ? ` · ${t('home.current')}` : ''}
          </p>
          <button type="button" className="-mr-2 -mt-1 rounded px-2 text-lg font-bold leading-none text-brun hover:bg-creme" aria-label={t('home.menu')} aria-expanded={menu} onClick={() => setMenu(!menu)}>
            ⋯
          </button>
        </div>
        {menu && (
          <div className="absolute right-4 top-12 z-10 w-56 rounded-lg bg-white p-2 text-sm shadow-lg ring-1 ring-canard/10">
            {confirm ? (
              <div className="space-y-2 p-1">
                <p>{t('home.confirmDelete', { name: s.name })}</p>
                <div className="flex gap-2">
                  <button type="button" className="rounded bg-corail px-3 py-1 font-bold text-white" onClick={onDelete}>
                    {t('home.delete')}
                  </button>
                  <button type="button" className="btn-secondary px-3 py-1 text-sm" onClick={() => { setConfirm(false); setMenu(false); }}>
                    {t('home.cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="w-full rounded px-2 py-1.5 text-left font-bold text-corail hover:bg-creme" onClick={() => setConfirm(true)}>
                {t('home.delete')}…
              </button>
            )}
          </div>
        )}
        <h2 className="mt-1 font-display text-2xl font-semibold normal-case tracking-normal">{latest?.club ?? s.name}</h2>
        <p className="text-sm text-brun">
          {latest ? t('home.inGame', { date: dateFmt.format(new Date(latest.gameDate)) }) : t('home.notLinked')}
        </p>
        {latest && <p className="mt-1 text-xs text-canard/60">{s.name}</p>}
        <p className="mt-3 text-xs text-canard/60">{t('home.updated', { date: shortFmt.format(new Date(s.updatedAt)) })}</p>
        {s.gameId === 'fm' && (
          <button
            type="button"
            className={`${current ? 'btn-secondary' : 'btn-primary'} mt-4 px-4 py-1.5 text-sm`}
            onClick={() => {
              setSaveId(s.id);
              navigate(latest ? '/' : '/reglages');
            }}
          >
            {t(latest ? 'home.resume' : 'home.link')}
          </button>
        )}
      </div>
    </article>
  );
}

/**
 * Nouvelle carrière : seulement son nom (FM27 est le seul jeu suivi ; la version reste facultative, repliée).
 * Une fois créée, elle devient la carrière suivie et « Plugin et réglages » s'ouvre pour relier la sauvegarde.
 */
function CreateSaveForm({ first, onDone }: { first: boolean; onDone: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const setSaveId = useCareerStore((st) => st.setSaveId);
  const available = GAME_IDS.filter((id) => GAMES[id].status === 'available');
  const [gameId, setGameId] = useState<GameId>(available[0] ?? 'fm');
  const [name, setName] = useState('');
  const [gameVersion, setGameVersion] = useState('');

  const create = useMutation({
    mutationFn: () => savesData.create({ gameId, name, gameVersion: gameVersion || undefined }),
    onSuccess: async (save) => {
      await qc.invalidateQueries({ queryKey: savesKey });
      onDone();
      if (save.gameId === 'fm') {
        setSaveId(save.id);
        navigate('/reglages');
      }
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  return (
    <form onSubmit={onSubmit} className="card mt-6 max-w-xl space-y-4">
      {first && <p className="text-sm text-brun">{t('home.firstHelp')}</p>}
      <label className="block text-sm font-bold">
        {t('home.name')}
        <input className="input mt-1" required autoFocus maxLength={80} placeholder={t('home.namePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <details className="text-sm">
        <summary className="cursor-pointer font-bold text-brun">{t('home.more')}</summary>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {available.length > 1 && (
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
          )}
          <label className="text-sm font-bold">
            {t('home.version')}
            <input className="input mt-1" maxLength={40} value={gameVersion} onChange={(e) => setGameVersion(e.target.value)} />
          </label>
        </div>
      </details>
      {create.isError && <p className="text-sm text-corail">{t('home.error')}</p>}
      <div className="flex gap-3">
        <button className="btn-primary" disabled={create.isPending}>
          {t('home.createLink')}
        </button>
        <button type="button" className="btn-secondary" onClick={onDone}>
          {t('home.cancel')}
        </button>
      </div>
    </form>
  );
}
