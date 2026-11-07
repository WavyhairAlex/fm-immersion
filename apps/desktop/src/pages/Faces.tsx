import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

type FacesState = 'noGame' | 'missing' | 'original' | 'photorealV1' | 'unknown';
type FacesStatus = { state: FacesState; size: number | null };

/** Même clé que le plugin : le dossier de FM27 n'est demandé qu'une fois pour toute l'appli. */
const GAME_DIR_KEY = 'fmi.gameDir';
const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* stockage indisponible : le dossier sera redemandé */
  }
};

const DOT: Record<FacesState, string> = {
  noGame: 'bg-corail',
  missing: 'bg-corail',
  original: 'bg-ambre',
  photorealV1: 'bg-eau-soutenu',
  unknown: 'bg-ambre',
};

const RELEASE_URL = 'https://github.com/amnesix-nt/FM27-Photorealistic-Faces/releases/latest';

/** Mode « Visages photoréalistes » : état du pack dans FM27 (lecture seule pour l'instant). */
export function Faces() {
  const { t } = useTranslation();
  const [gameDir, setGameDir] = useState(read(GAME_DIR_KEY) ?? '');

  const { data: defaultDir } = useQuery({ queryKey: ['fm', 'bridge', 'default-dir'], queryFn: () => invoke<string | null>('fm_bridge_default_game_dir') });
  useEffect(() => {
    if (!gameDir && defaultDir) setGameDir(defaultDir);
  }, [defaultDir, gameDir]);

  const { data: status } = useQuery({
    queryKey: ['faces', 'status', gameDir],
    queryFn: () => invoke<FacesStatus>('faces_status', { gameDir }),
    enabled: !!gameDir,
    refetchInterval: 5000,
  });
  useEffect(() => {
    if (status && status.state !== 'noGame' && gameDir) write(GAME_DIR_KEY, gameDir);
  }, [status, gameDir]);

  const state: FacesState = status?.state ?? 'noGame';

  return (
    <div className="w-full px-6 py-6 xl:px-10">
      <h1 className="text-3xl font-semibold">{t('modes.faces.title')}</h1>
      <p className="mt-2 max-w-3xl text-brun">{t('faces.intro')}</p>

      <section className="card mt-6 max-w-3xl">
        <h2 className="text-xl font-semibold">{t('faces.statusTitle')}</h2>
        <label className="mt-4 block text-sm font-bold">
          {t('faces.gameDir')}
          <input className="input mt-1" value={gameDir} onChange={(e) => setGameDir(e.target.value)} spellCheck={false} />
        </label>
        <p className="mt-4 flex items-start gap-3">
          <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${DOT[state]}`} aria-hidden />
          <span>
            <span className="font-bold">{t(`faces.state.${state}`)}</span>
            {status?.size != null && (
              <span className="ml-2 text-sm text-brun">{t('faces.size', { mb: Math.round(status.size / 1_000_000) })}</span>
            )}
          </span>
        </p>
      </section>

      <section className="card mt-6 max-w-3xl">
        <h2 className="text-xl font-semibold">{t('faces.installTitle')}</h2>
        <p className="mt-2 text-sm text-brun">{t('faces.installSoon')}</p>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
          <li>{t('faces.step1')}</li>
          <li>{t('faces.step2')}</li>
          <li>{t('faces.step3')}</li>
        </ol>
        <p className="mt-3 select-all break-all rounded-lg bg-creme px-3 py-2 font-mono text-xs">{RELEASE_URL}</p>
      </section>
    </div>
  );
}
