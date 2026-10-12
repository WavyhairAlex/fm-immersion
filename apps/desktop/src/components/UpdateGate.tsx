import { isTauri } from '@tauri-apps/api/core';
import { relaunch } from '@tauri-apps/plugin-process';
import { check } from '@tauri-apps/plugin-updater';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

type State =
  | { step: 'checking' }
  | { step: 'installing'; version: string; progress: number | null }
  | { step: 'ready' };

/**
 * Au démarrage : s'il existe une nouvelle version, on la télécharge, on l'installe
 * et on relance l'appli. Sans réseau ou en cas d'erreur, on démarre normalement.
 */
export function UpdateGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [state, setState] = useState<State>(isTauri() && import.meta.env.PROD ? { step: 'checking' } : { step: 'ready' });

  useEffect(() => {
    if (state.step !== 'checking') return;
    let cancelled = false;

    (async () => {
      try {
        const update = await check({ timeout: 8000 });
        if (!update || cancelled) return setState({ step: 'ready' });

        let total = 0;
        let received = 0;
        setState({ step: 'installing', version: update.version, progress: null });
        await update.downloadAndInstall((event) => {
          if (event.event === 'Started') total = event.data.contentLength ?? 0;
          if (event.event === 'Progress') {
            received += event.data.chunkLength;
            if (total) setState({ step: 'installing', version: update.version, progress: received / total });
          }
        });
        await relaunch();
      } catch (e) {
        console.warn('Mise à jour impossible, démarrage normal', e);
        if (!cancelled) setState({ step: 'ready' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [state.step]);

  if (state.step === 'ready') return <>{children}</>;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <img src="/brand/mascotte-sm.webp" alt="" className="h-32 w-auto" />
      <p className="font-display text-2xl font-semibold">
        {state.step === 'checking' ? t('update.checking') : t('update.installing', { version: state.version })}
      </p>
      {state.step === 'installing' && (
        <div className="h-2 w-64 overflow-hidden rounded-full bg-canard/10">
          <div
            className="h-full rounded-full bg-eau-soutenu transition-[width]"
            style={{ width: `${Math.round((state.progress ?? 0.05) * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
