import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

type BridgeStatus = { gameFound: boolean; bepinex: boolean; running: boolean; installedVersion: string | null };

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

/** Compare « X.Y.Z » numériquement. */
const isNewer = (a: string, b: string) => {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d > 0;
  }
  return false;
};

/** Installation et mise à jour du plugin FM27 depuis GitHub Releases (sur demande, jeu fermé). */
export function FmBridge({ dataFolder, onHealth }: { dataFolder: string; onHealth?: (ok: boolean) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [gameDir, setGameDir] = useState(read(GAME_DIR_KEY) ?? '');
  const [open, setOpen] = useState(false);

  const { data: defaultDir } = useQuery({ queryKey: ['fm', 'bridge', 'default-dir'], queryFn: () => invoke<string | null>('fm_bridge_default_game_dir') });
  useEffect(() => {
    if (!gameDir && defaultDir) setGameDir(defaultDir);
  }, [defaultDir, gameDir]);

  const { data: status } = useQuery({
    queryKey: ['fm', 'bridge', 'status', gameDir],
    queryFn: () => invoke<BridgeStatus>('fm_bridge_status', { gameDir }),
    enabled: !!gameDir,
    refetchInterval: 5000,
  });
  // Mémorise le dossier dès qu'il est reconnu (fm.exe trouvé), pour ne pas le redemander au prochain démarrage.
  useEffect(() => {
    if (status?.gameFound && gameDir) write(GAME_DIR_KEY, gameDir);
  }, [status?.gameFound, gameDir]);
  const latest = useQuery({ queryKey: ['fm', 'bridge', 'latest'], queryFn: () => invoke<string>('fm_bridge_latest'), retry: false, staleTime: 10 * 60_000 });

  const install = useMutation({
    mutationFn: () => invoke<BridgeStatus>('fm_bridge_install', { gameDir, dataDir: dataFolder }),
    onSuccess: () => {
      write(GAME_DIR_KEY, gameDir);
      qc.invalidateQueries({ queryKey: ['fm', 'bridge', 'status'] });
    },
  });

  const installed = status?.installedVersion ?? null;
  const upToDate = !!installed && !!latest.data && !isNewer(latest.data, installed);
  const canInstall = !!status?.gameFound && status.bepinex && !status.running && !!dataFolder && !!latest.data && !upToDate;
  const dot = (ok: boolean | undefined, warn = false) => (
    <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${ok ? 'bg-eau' : warn ? 'bg-ambre' : 'bg-corail'}`} aria-hidden />
  );

  // Tout va bien : une seule ligne discrète. La carte complète reste affichée dès qu'il y a quelque chose à faire.
  const healthy = !!status?.gameFound && status.bepinex && !!installed && (upToDate || latest.isError);
  // Signale à l'en-tête si le plugin demande une action (réglages ouverts d'office, pastille sur le bouton).
  const known = !gameDir || !!status;
  useEffect(() => {
    if (known) onHealth?.(healthy);
  }, [known, healthy, onHealth]);
  if (gameDir && !status) return null;
  if (healthy && !open)
    return (
      <p className="mt-1 flex items-center gap-2 text-xs text-brun">
        <span className="h-2 w-2 rounded-full bg-eau" aria-hidden />
        {t('fm.bridge.compact', { version: installed })}
        <button type="button" className="font-bold text-orange-fonce hover:underline" onClick={() => setOpen(true)}>
          {t('fm.bridge.details')}
        </button>
      </p>
    );

  return (
    <section className="rounded-xl bg-creme/60 p-4 ring-1 ring-canard/10">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">{t('fm.bridge.title')}</h2>
        {healthy && (
          <button type="button" className="text-sm font-bold text-orange-fonce hover:underline" onClick={() => setOpen(false)}>
            {t('fm.bridge.hide')}
          </button>
        )}
      </div>
      <p className="mt-1 text-sm text-brun">{t('fm.bridge.intro')}</p>

      <label className="mt-4 block text-sm font-bold">
        {t('fm.bridge.gameDir')}
        <input className="input mt-1 font-normal" value={gameDir} onChange={(e) => setGameDir(e.target.value)} />
      </label>

      {status && (
        <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <li className="flex gap-2">
            {dot(status.gameFound)}
            {status.gameFound ? t('fm.bridge.gameFound') : t('fm.bridge.gameMissing')}
          </li>
          <li className="flex gap-2">
            {dot(status.bepinex)}
            {status.bepinex ? t('fm.bridge.bepinex') : t('fm.bridge.bepinexMissing')}
          </li>
          <li className="flex gap-2">
            {dot(!!installed, true)}
            {installed ? t('fm.bridge.installed', { version: installed }) : t('fm.bridge.notInstalled')}
          </li>
          <li className="flex gap-2">
            {dot(upToDate || !latest.isError, true)}
            {latest.isError ? t('fm.bridge.offline') : upToDate ? t('fm.bridge.upToDate') : latest.data ? t('fm.bridge.latest', { version: latest.data }) : '…'}
          </li>
          {status.running && (
            <li className="flex gap-2 sm:col-span-2">
              {dot(false, true)}
              {t('fm.bridge.running')}
            </li>
          )}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {!upToDate && (
          <button type="button" className="btn-primary" disabled={!canInstall || install.isPending} onClick={() => install.mutate()}>
            {installed && latest.data ? t('fm.bridge.update', { version: latest.data }) : t('fm.bridge.install')}
          </button>
        )}
        {install.isSuccess && <p className="text-sm text-canard">{t('fm.bridge.done')}</p>}
        {install.isError && <p className="text-sm text-corail">{t('fm.bridge.error', { reason: String(install.error?.message ?? install.error) })}</p>}
      </div>
    </section>
  );
}
