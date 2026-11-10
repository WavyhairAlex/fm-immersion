import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { packDate, useFacesUpdate, v2Count, type PackManifest, type PackOffer, pcState } from '../lib/faces';

type FacesState = 'noGame' | 'missing' | 'original' | 'photorealV1' | 'photorealCustom' | 'unknown';
type FacesStatus = {
  state: FacesState;
  size: number | null;
  running: boolean;
  backup: boolean;
  /** Pack en place mais catalogue remis d'origine par une mise à jour Steam (carrés blancs en jeu). */
  catalogMismatch?: boolean;
  catalogUnknown?: boolean;
  stalePack?: boolean;
};
type LotState = 'none' | 'running' | 'paused' | 'stopped' | 'finished';
type Stage = {
  done: number;
  state: LotState;
  eta: string | null;
  updatedMs: number | null;
};
type Progress = {
  found: boolean;
  total: number;
  v1: Stage;
  v2: Stage;
  ages: { age: number; done: number }[];
  completePermille: number;
  builtPack: string | null;
  builtMs: number | null;
};
type InstallReport = { crc: number; size: number; already: boolean };
type AgeSwapStatus = {
  bepinex: boolean;
  installed: boolean;
  version: string | null;
  enabled: boolean | null;
  variantsDir: string | null;
  running: boolean;
};

/** Même clé que le plugin : le dossier de FM27 n'est demandé qu'une fois pour toute l'appli. */
const GAME_DIR_KEY = 'fmi.gameDir';
const WORKSHOP_KEY = 'fmi.faces.workshop';
const PACK_KEY = 'fmi.faces.pack';
/** Mode atelier : « 1 » coché, « 0 » décoché, absent = automatique (atelier trouvé sur ce PC). */
const ATELIER_KEY = 'fmi.faces.atelier';
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
  photorealCustom: 'bg-eau-soutenu',
  unknown: 'bg-ambre',
};

const RELEASE_URL = 'https://github.com/amnesix-nt/FM27-Photorealistic-Faces/releases/latest';

/** Barre d'avancement : orange en cours, verte une fois terminée. */
function Bar({ done, total, thin = false }: { done: number; total: number; thin?: boolean }) {
  const pct = total ? Math.min(100, (done / total) * 100) : 0;
  return (
    <div className={`w-full overflow-hidden rounded-full bg-creme ring-1 ring-canard/10 ${thin ? 'h-1.5' : 'h-2.5'}`}>
      <div className={`h-full rounded-full ${done >= total ? 'bg-eau-soutenu' : 'bg-orange'}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Mode « Visages photoréalistes » : état du pack dans FM27, avancement de la génération, installation et âges. */
export function Faces() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [gameDir, setGameDir] = useState(read(GAME_DIR_KEY) ?? '');
  const [workshop, setWorkshop] = useState(read(WORKSHOP_KEY) ?? '');
  // Pack choisi à la main (gardé) ; sinon on suit le plus récent de l'atelier.
  const [customPack, setCustomPack] = useState(() => {
    const v = read(PACK_KEY) ?? '';
    // Ancien réglage par défaut (pack V1 de l'atelier) : on suit désormais le pack le plus récent.
    return /[\\/]build[\\/]portraits_assets_all\.bundle$/i.test(v) ? '' : v;
  });
  const [download, setDownload] = useState<{
    received: number;
    total: number;
    step: string;
  } | null>(null);
  const [atelierPref, setAtelierPref] = useState(read(ATELIER_KEY));

  const num = (n: number) => n.toLocaleString(i18n.language);
  const pct = (done: number, total: number) =>
    (total ? (done / total) * 100 : 0).toLocaleString(i18n.language, {
      maximumFractionDigits: 1,
      minimumFractionDigits: done > 0 && done < total ? 1 : 0,
    });
  const when = (ms: number) =>
    new Date(ms).toLocaleString(i18n.language, {
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    });

  const { data: defaultDir } = useQuery({
    queryKey: ['fm', 'bridge', 'default-dir'],
    queryFn: () => invoke<string | null>('fm_bridge_default_game_dir'),
  });
  useEffect(() => {
    if (!gameDir && defaultDir) setGameDir(defaultDir);
  }, [defaultDir, gameDir]);
  const { data: defaultWorkshop } = useQuery({
    queryKey: ['faces', 'workshop-default'],
    queryFn: () => invoke<string | null>('faces_default_workshop'),
  });
  useEffect(() => {
    if (!workshop && defaultWorkshop) setWorkshop(defaultWorkshop);
  }, [defaultWorkshop, workshop]);

  const { data: status } = useQuery({
    queryKey: ['faces', 'status', gameDir],
    queryFn: () =>
      invoke<FacesStatus>('faces_status', {
        gameDir,
        workshopDir: workshop || null,
      }),
    enabled: !!gameDir,
    refetchInterval: 5000,
  });
  useEffect(() => {
    if (status && status.state !== 'noGame' && gameDir) write(GAME_DIR_KEY, gameDir);
  }, [status, gameDir]);

  const { data: progress } = useQuery({
    queryKey: ['faces', 'progress', workshop],
    queryFn: () => invoke<Progress>('faces_progress', { workshopDir: workshop }),
    enabled: !!workshop,
    refetchInterval: 30_000,
  });
  useEffect(() => {
    if (progress?.found && workshop) write(WORKSHOP_KEY, workshop);
  }, [progress?.found, workshop]);
  // Par défaut, le pack le plus récent de l'atelier (V2 de la bascule plutôt que l'ancien pack V1).
  const pack = customPack || progress?.builtPack || '';
  const setPack = (v: string) => {
    setCustomPack(v === progress?.builtPack ? '' : v);
    write(PACK_KEY, v === progress?.builtPack ? '' : v);
  };

  const update = useFacesUpdate(gameDir, workshop);
  const offer = update.data?.offer ?? null;
  useEffect(() => {
    const off = listen<{ received: number; total: number; step: string }>('faces-download', (e) => setDownload(e.payload));
    return () => {
      off.then((f) => f()).catch(() => undefined);
    };
  }, []);

  const { data: ageswap } = useQuery({
    queryKey: ['faces', 'ageswap', gameDir],
    queryFn: () => invoke<AgeSwapStatus>('faces_ageswap_status', { gameDir }),
    enabled: !!gameDir,
    refetchInterval: 5000,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['faces'] });
  const install = useMutation({
    mutationFn: () =>
      invoke<InstallReport>('faces_install', {
        gameDir,
        pack,
        workshopDir: workshop || null,
        version: null,
      }),
    onSuccess: refresh,
  });
  const uninstall = useMutation({
    mutationFn: () =>
      invoke<boolean>('faces_uninstall', {
        gameDir,
        workshopDir: workshop || null,
      }),
    onSuccess: refresh,
  });
  // Nouveau pack V2 : téléchargement vérifié (pack publié) puis installation, FM27 fermé.
  const installOffer = useMutation({
    mutationFn: async (o: PackOffer) => {
      setDownload(null);
      const path = o.source === 'local' && o.path ? o.path : await invoke<string>('faces_remote_download');
      return invoke<InstallReport>('faces_install', {
        gameDir,
        pack: path,
        workshopDir: workshop || null,
        version: o.manifest.version,
      });
    },
    onSettled: () => setDownload(null),
    onSuccess: refresh,
  });
  const toggleAges = useMutation({
    mutationFn: (enabled: boolean) => invoke<AgeSwapStatus>('faces_ageswap_set', { gameDir, enabled }),
    onSuccess: refresh,
  });

  const state: FacesState = status?.state ?? 'noGame';
  const running = !!status?.running;
  const installed = state === 'photorealV1' || state === 'photorealCustom';
  const busy = install.isPending || uninstall.isPending || installOffer.isPending;
  const error = (e: unknown) => String((e as { message?: string })?.message ?? e);
  const v2 = progress?.v2;
  const total = progress?.total ?? 14_000;
  const agesReady = progress?.ages.filter((a) => a.done > 0).length ?? 0;
  // Écran d'atelier seulement chez qui génère les portraits ; les autres joueurs voient l'écran simple.
  const atelier = atelierPref === '1' || (atelierPref !== '0' && !!progress?.found);
  const setAtelier = (on: boolean) => {
    setAtelierPref(on ? '1' : '0');
    write(ATELIER_KEY, on ? '1' : '0');
  };
  const remote = update.data?.remote ?? null;
  // Pack en place, retrouvé par son CRC parmi les manifestes connus (publié ou atelier).
  const installedManifest: PackManifest | null = [remote, update.data?.local ?? null].find((m) => m != null && m.crc === update.data?.installedCrc) ?? null;
  const date = (v: string | null | undefined) => packDate(v, i18n.language);
  const playerState = (() => {
    if (state === 'photorealV1') return t('faces.player.v1', { n: num(total) });
    if (state === 'photorealCustom') {
      const version = installedManifest?.version ?? update.data?.installedVersion ?? null;
      if (installedManifest && v2Count(installedManifest) > 0)
        return t('faces.player.v2', {
          count: v2Count(installedManifest),
          n: num(v2Count(installedManifest)),
          date: date(version),
        });
      return version ? t('faces.player.v2NoCount', { date: date(version) }) : t('faces.player.custom');
    }
    if (state === 'original') return t('faces.player.original');
    return t(`faces.state.${state}`);
  })();

  return (
    <div className="w-full px-6 py-6 xl:px-10">
      <h1 className="text-3xl font-semibold">{t('modes.faces.title')}</h1>
      <p className="mt-2 max-w-3xl text-brun">{t('faces.intro')}</p>
      {/* L'état de TON PC d'abord ; l'avancement du projet de portraits vient plus bas, avec son propre libellé. */}
      <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm ring-1 ring-canard/10" role="status">
        <span className={`h-2.5 w-2.5 rounded-full ${DOT[state]}`} aria-hidden />
        <span className="text-brun">{t('faces.pc.label')}</span>
        <b>{t(`faces.pc.${pcState(state, !!offer)}`)}</b>
      </p>
      {status?.catalogUnknown && (
        <p className="mt-3 max-w-3xl rounded-lg border-l-4 border-corail bg-white p-3 text-sm" role="alert">
          {t(status.stalePack ? 'faces.newGameStale' : 'faces.newGame')}
        </p>
      )}
      {status?.catalogMismatch && (
        <p className="mt-3 max-w-3xl rounded-lg border-l-4 border-corail bg-white p-3 text-sm" role="alert">
          {t('faces.steamReset')}
        </p>
      )}

      {offer && (
        <section className="card mt-6 max-w-6xl ring-2 ring-orange">
          <h2 className="text-xl font-semibold">{t('faces.update.title', { count: v2Count(offer.manifest) })}</h2>
          <p className="mt-1 text-sm text-brun">
            {t(offer.source === 'local' ? 'faces.update.local' : 'faces.update.remote', {
              version: offer.manifest.version ?? '?',
              mb: Math.round(offer.manifest.size / 1_000_000),
            })}
            {update.data?.installedVersion && ` ${t('faces.update.current', { version: update.data.installedVersion })}`}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" className="btn-primary" disabled={running || busy || state === 'noGame' || !!status?.catalogUnknown} onClick={() => installOffer.mutate(offer)}>
              {installOffer.isPending
                ? download?.step === 'download' && download.total
                  ? t('faces.update.downloading', {
                      pct: Math.floor((download.received / download.total) * 100),
                    })
                  : download?.step === 'download'
                    ? t('faces.update.downloadingMb', {
                        mb: Math.round(download.received / 1_000_000),
                      })
                    : download?.step === 'extract' || download?.step === 'check'
                      ? t('faces.update.checking')
                      : t('faces.installing')
                : offer.source === 'local'
                  ? t('faces.update.installLocal')
                  : installed
                    ? t('faces.update.install')
                    : t('faces.update.installFirst')}
            </button>
            {running && <span className="text-sm font-bold text-canard">{t('faces.running')}</span>}
          </div>
          {installOffer.isSuccess && <p className="mt-3 text-sm text-canard">{t('faces.installed')}</p>}
          {installOffer.isError && <p className="mt-3 text-sm text-corail">{error(installOffer.error)}</p>}
        </section>
      )}
      {!offer && installOffer.isSuccess && <p className="card mt-6 max-w-6xl text-sm text-canard">{t('faces.installed')}</p>}

      <div className="mt-6 grid max-w-6xl gap-6 lg:grid-cols-2">
        {!atelier && (
          <>
            {/* Mode joueur : l'état du jeu en une phrase, sans chemin ni fichier à choisir. */}
            <section className="card">
              <h2 className="text-xl font-semibold">{t('faces.statusTitle')}</h2>
              <p className="mt-4 flex items-start gap-3">
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${DOT[state]}`} aria-hidden />
                <span className="font-bold">{playerState}</span>
              </p>
              {running && <p className="mt-2 text-sm font-bold text-canard">{t('faces.running')}</p>}
              {(state === 'noGame' || state === 'missing') && (
                <label className="mt-4 block text-sm font-bold">
                  {t('faces.gameDir')}
                  <input className="input mt-1 font-normal" value={gameDir} onChange={(e) => setGameDir(e.target.value)} spellCheck={false} />
                </label>
              )}
              {!offer && state !== 'noGame' && state !== 'missing' && (
                <p className="mt-3 text-sm text-brun">
                  {remote ? t('faces.player.upToDate') : update.isFetching ? t('faces.player.checking') : t('faces.player.offline')}
                </p>
              )}
              {(installed || state === 'unknown') && (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button type="button" className="btn-secondary" disabled={running || busy || !status?.backup || !!status?.catalogUnknown} onClick={() => uninstall.mutate()}>
                    {uninstall.isPending ? t('faces.uninstalling') : t('faces.uninstall')}
                  </button>
                </div>
              )}
              {uninstall.isSuccess && <p className="mt-3 text-sm text-canard">{uninstall.data ? t('faces.uninstalled') : t('faces.nothingToRemove')}</p>}
              {uninstall.isError && <p className="mt-3 text-sm text-corail">{error(uninstall.error)}</p>}
              <p className="mt-4 text-xs text-brun">{t('faces.lastStep')}</p>
            </section>

            {/* Avancement publié sur GitHub (manifeste « v2-progression »), le même pour tous les joueurs. */}
            <section className="card">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-xl font-semibold">{t('faces.progressTitle')}</h2>
                {remote && <span className="font-display text-3xl font-semibold text-orange-fonce">{pct(v2Count(remote), total)} %</span>}
              </div>
              <p className="mt-1 text-sm text-brun">{t('faces.player.progressHelp')}</p>
              {remote ? (
                <ul className="mt-5 space-y-4 text-sm">
                  <li>
                    <div className="flex justify-between gap-3">
                      <span className="font-bold">{t('faces.player.v2Line')}</span>
                      <span className="text-brun">
                        {num(v2Count(remote))} / {num(total)} · {pct(v2Count(remote), total)} %
                      </span>
                    </div>
                    <div className="mt-1.5">
                      <Bar done={v2Count(remote)} total={total} />
                    </div>
                    <p className="mt-1 text-xs text-brun">
                      {t('faces.player.published', {
                        date: date(remote.version),
                        mb: Math.round(remote.size / 1_000_000),
                      })}
                    </p>
                  </li>
                  {remote.v1 != null && (
                    <li>
                      <div className="flex justify-between gap-3">
                        <span className="font-bold">{t('faces.player.v1Line')}</span>
                        <span className="text-brun">{num(remote.v1)}</span>
                      </div>
                      <p className="mt-1 text-xs text-brun">{t('faces.player.v1Help')}</p>
                    </li>
                  )}
                </ul>
              ) : (
                <p className="mt-4 text-sm text-brun">{update.isFetching ? t('faces.player.checking') : t('faces.player.offline')}</p>
              )}
            </section>
          </>
        )}

        {atelier && (
          <>
            {/* État dans le jeu + installation en un clic */}
            <section className="card">
              <h2 className="text-xl font-semibold">{t('faces.statusTitle')}</h2>
              <label className="mt-4 block text-sm font-bold">
                {t('faces.gameDir')}
                <input className="input mt-1 font-normal" value={gameDir} onChange={(e) => setGameDir(e.target.value)} spellCheck={false} />
              </label>
              <p className="mt-4 flex items-start gap-3">
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${DOT[state]}`} aria-hidden />
                <span>
                  <span className="font-bold">{t(`faces.state.${state}`)}</span>
                  {status?.size != null && (
                    <span className="ml-2 text-sm text-brun">
                      {t('faces.size', {
                        mb: Math.round(status.size / 1_000_000),
                      })}
                    </span>
                  )}
                </span>
              </p>
              {running && <p className="mt-2 text-sm font-bold text-canard">{t('faces.running')}</p>}

              <h3 className="mt-6 font-bold">{t('faces.installTitle')}</h3>
              <label className="mt-2 block text-sm font-bold">
                {t('faces.packFile')}
                <input
                  className="input mt-1 font-normal"
                  value={pack}
                  onChange={(e) => setPack(e.target.value)}
                  placeholder={t('faces.packPlaceholder')}
                  spellCheck={false}
                />
              </label>
              {progress?.builtPack && pack === progress.builtPack && progress.builtMs != null && (
                <p className="mt-1 text-xs text-brun">{t('faces.packBuilt', { date: when(progress.builtMs) })}</p>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={!pack || running || busy || state === 'noGame' || state === 'missing' || !!status?.catalogUnknown}
                  onClick={() => install.mutate()}
                >
                  {install.isPending ? t('faces.installing') : installed ? t('faces.reinstall') : t('faces.install')}
                </button>
                {(installed || state === 'unknown') && (
                  <button type="button" className="btn-secondary" disabled={running || busy || !status?.backup || !!status?.catalogUnknown} onClick={() => uninstall.mutate()}>
                    {uninstall.isPending ? t('faces.uninstalling') : t('faces.uninstall')}
                  </button>
                )}
              </div>
              {install.isSuccess && <p className="mt-3 text-sm text-canard">{install.data.already ? t('faces.alreadyInstalled') : t('faces.installed')}</p>}
              {uninstall.isSuccess && <p className="mt-3 text-sm text-canard">{uninstall.data ? t('faces.uninstalled') : t('faces.nothingToRemove')}</p>}
              {install.isError && <p className="mt-3 text-sm text-corail">{error(install.error)}</p>}
              {uninstall.isError && <p className="mt-3 text-sm text-corail">{error(uninstall.error)}</p>}
              <p className="mt-4 text-xs text-brun">{t('faces.lastStep')}</p>
              {!progress?.builtPack && (
                <>
                  <p className="mt-3 text-xs text-brun">{t('faces.download')}</p>
                  <p className="mt-1 select-all break-all rounded-lg bg-creme px-3 py-2 font-mono text-xs">{RELEASE_URL}</p>
                </>
              )}
            </section>

            {/* Avancement de la génération (atelier) */}
            <section className="card">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-xl font-semibold">{t('faces.progressTitle')}</h2>
                {progress?.found && (
                  <span className="font-display text-3xl font-semibold text-orange-fonce">
                    {(progress.completePermille / 10).toLocaleString(i18n.language, { maximumFractionDigits: 1 })} %
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs font-bold text-brun">{t('faces.projectNote')}</p>
              <p className="mt-1 text-sm text-brun">{progress?.found ? t('faces.completeHelp') : t('faces.workshopHelp')}</p>
              <label className="mt-4 block text-sm font-bold">
                {t('faces.workshop')}
                <input className="input mt-1 font-normal" value={workshop} onChange={(e) => setWorkshop(e.target.value)} spellCheck={false} />
              </label>
              {workshop && progress && !progress.found && <p className="mt-2 text-sm text-corail">{t('faces.workshopMissing')}</p>}

              {progress?.found && (
                <ul className="mt-5 space-y-4 text-sm">
                  <li>
                    <div className="flex justify-between gap-3">
                      <span className="font-bold">{t('faces.v1')}</span>
                      <span className="text-brun">
                        {num(progress.v1.done)} / {num(total)} · {pct(progress.v1.done, total)} %
                      </span>
                    </div>
                    <div className="mt-1.5">
                      <Bar done={progress.v1.done} total={total} />
                    </div>
                    <p className="mt-1 text-xs text-brun">{t('faces.v1Help')}</p>
                  </li>
                  {v2 && (
                    <li>
                      <div className="flex justify-between gap-3">
                        <span className="font-bold">{t('faces.v2')}</span>
                        <span className="text-brun">
                          {num(v2.done)} / {num(total)} · {pct(v2.done, total)} %
                        </span>
                      </div>
                      <div className="mt-1.5">
                        <Bar done={v2.done} total={total} />
                      </div>
                      <p className="mt-1 text-xs text-brun">
                        {t(`faces.lot.${v2.state}`, {
                          date: v2.updatedMs != null ? when(v2.updatedMs) : '',
                        })}
                        {v2.eta && ` ${t('faces.eta', { eta: v2.eta })}`}
                      </p>
                    </li>
                  )}
                  <li>
                    <span className="font-bold">{t('faces.ages')}</span>
                    <div className="mt-2 grid grid-cols-3 gap-x-4 gap-y-3 sm:grid-cols-6">
                      {progress.ages.map((a) => (
                        <div key={a.age}>
                          <div className="flex justify-between text-xs">
                            <span className="font-bold">{t('faces.ageLabel', { age: a.age })}</span>
                            <span className="text-brun">{num(a.done)}</span>
                          </div>
                          <div className="mt-1">
                            <Bar done={a.done} total={total} thin />
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-brun">{t('faces.agesHelp')}</p>
                  </li>
                </ul>
              )}
            </section>
          </>
        )}

        {/* Portraits selon l'âge (plugin AgeSwap) */}
        <section className="card lg:col-span-2">
          <h2 className="text-xl font-semibold">{t('faces.ageswapTitle')}</h2>
          <p className="mt-1 max-w-3xl text-sm text-brun">{t('faces.ageswapIntro')}</p>
          {ageswap && (
            <>
              <p className="mt-4 flex items-start gap-3">
                <span
                  className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${ageswap.installed ? (ageswap.enabled === false ? 'bg-ambre' : 'bg-eau-soutenu') : 'bg-corail'}`}
                  aria-hidden
                />
                <span className="font-bold">
                  {!ageswap.bepinex
                    ? t('faces.ageswapNoBepinex')
                    : !ageswap.installed
                      ? t('faces.ageswapMissing')
                      : ageswap.enabled === false
                        ? t('faces.ageswapOff', {
                            version: ageswap.version ?? '?',
                          })
                        : ageswap.enabled
                          ? t('faces.ageswapOn', {
                              version: ageswap.version ?? '?',
                            })
                          : t('faces.ageswapNew')}
                </span>
              </p>
              {ageswap.installed && progress?.found && (
                <p className="mt-2 text-sm text-brun">
                  {t('faces.ageswapReady', {
                    count: progress.ages.reduce((m, a) => Math.max(m, a.done), 0),
                    brackets: agesReady,
                  })}
                </p>
              )}
              {ageswap.installed && (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    className={ageswap.enabled ? 'btn-secondary' : 'btn-primary'}
                    disabled={toggleAges.isPending}
                    onClick={() => toggleAges.mutate(!ageswap.enabled)}
                  >
                    {ageswap.enabled ? t('faces.ageswapDisable') : t('faces.ageswapEnable')}
                  </button>
                  <span className="text-xs text-brun">{ageswap.running ? t('faces.ageswapRestart') : t('faces.ageswapNextLaunch')}</span>
                </div>
              )}
              {toggleAges.isError && <p className="mt-3 text-sm text-corail">{error(toggleAges.error)}</p>}
              {ageswap.variantsDir && <p className="mt-3 break-all font-mono text-xs text-brun">{ageswap.variantsDir}</p>}
            </>
          )}
        </section>
      </div>

      {/* Réglage discret : seul qui génère les portraits a besoin des chemins et de l'avancement du lot. */}
      <label className="mt-6 flex max-w-6xl items-center gap-2 text-sm text-brun">
        <input type="checkbox" checked={atelier} onChange={(e) => setAtelier(e.target.checked)} />
        {t('faces.atelierToggle')}
      </label>
    </div>
  );
}
