import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useFacesDirs } from '../lib/faces';
import { useGameStatus } from '../lib/game';
import { compatReport, useGameCompat, type CompatItem, type CompatLevel } from '../lib/game-compat';

const DOT: Record<CompatLevel, string> = { ok: 'bg-eau', warn: 'bg-ambre', bad: 'bg-corail' };

function useReport() {
  const { gameDir, status } = useGameStatus();
  const { workshop } = useFacesDirs();
  const { compat, seen, acknowledge, refetch, loading } = useGameCompat(gameDir);
  const { data: faces } = useQuery({
    queryKey: ['faces', 'status', gameDir, 'compat'],
    queryFn: () => invoke<{ catalogMismatch?: boolean; catalogUnknown?: boolean; stalePack?: boolean }>('faces_status', { gameDir, workshopDir: workshop || null }),
    enabled: !!gameDir,
    refetchInterval: 5 * 60_000,
  });
  const report = useMemo(
    () =>
      compat
        ? compatReport(compat, {
            seenKey: seen,
            bridgeInstalled: status?.installedVersion ?? null,
            bepinex: !!status?.bepinex,
            facesMismatch: !!faces?.catalogMismatch,
            facesUnknown: faces?.catalogUnknown ? (faces.stalePack ? 'stale' : 'new') : null,
          })
        : null,
    [compat, seen, status?.installedVersion, status?.bepinex, faces?.catalogMismatch, faces?.catalogUnknown, faces?.stalePack],
  );
  return { compat, report, acknowledge, refetch, loading };
}

function Item({ item }: { item: CompatItem }) {
  const { t, i18n } = useTranslation();
  const params = { ...item.params };
  if (item.id === 'updated' && typeof params.date === 'number') {
    params.date = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: 'long' }).format(new Date(params.date));
  }
  return (
    <li className="flex gap-2">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[item.level]}`} aria-hidden />
      <span>
        {t(`compat.items.${item.key}`, params)}
        {item.to && (
          <>
            {' '}
            <Link to={item.to} className="font-bold text-orange-fonce hover:underline">
              {t(`compat.go.${item.id}`)} →
            </Link>
          </>
        )}
      </span>
    </li>
  );
}

/** Carte des réglages : version de FM27 installée et ce qui marche avec elle. */
export function GameCompatCard() {
  const { t, i18n } = useTranslation();
  const { compat, report, acknowledge, refetch, loading } = useReport();
  if (!compat?.gameFound || !compat.build) return null;
  const date = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: 'long', timeStyle: 'short' }).format(new Date(compat.build.moduleModified));
  return (
    <section className="rounded-xl bg-white p-4 ring-1 ring-canard/10" aria-labelledby="game-compat">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 id="game-compat" className="font-display text-lg font-semibold">{t('compat.title')}</h2>
        <button type="button" className="text-sm font-bold text-orange-fonce hover:underline" disabled={loading} onClick={() => refetch()}>
          {t('compat.recheck')}
        </button>
      </div>
      <p className="mt-1 text-sm text-brun">
        {compat.build.steamBuild ? t('compat.versionSteam', { date, build: compat.build.steamBuild }) : t('compat.version', { date })}
        {compat.log?.unity ? ` · Unity ${compat.log.unity}` : ''}
      </p>
      {report && (
        <ul className="mt-3 space-y-1.5 text-sm">
          {report.items.map((i) => (
            <Item key={i.id} item={i} />
          ))}
        </ul>
      )}
      {report?.updated && (
        <button type="button" className="btn-secondary mt-3 px-3 py-1 text-sm" onClick={acknowledge}>
          {t('compat.ack')}
        </button>
      )}
      <p className="mt-3 text-xs text-brun">{t('compat.help')}</p>
    </section>
  );
}

/** Bandeau de l'accueil : seulement après une mise à jour du jeu ou quand quelque chose ne marche plus. */
export function GameCompatBanner() {
  const { t } = useTranslation();
  const { report, acknowledge } = useReport();
  if (!report) return null;
  const shown = report.items.filter((i) => i.level === 'bad' || (report.updated && i.level !== 'ok'));
  if (!shown.length) return null;
  return (
    <section className={`card mb-4 border-l-4 p-4 ${report.level === 'bad' ? 'border-corail' : 'border-ambre'}`} role="status">
      <h2 className="text-base font-bold">{report.updated ? t('compat.bannerUpdated') : t('compat.bannerProblem')}</h2>
      <ul className="mt-2 space-y-1.5 text-sm">
        {shown.map((i) => (
          <Item key={i.id} item={i} />
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-4 text-sm">
        <Link to="/reglages" className="font-bold text-orange-fonce hover:underline">
          {t('compat.details')} →
        </Link>
        {report.updated && (
          <button type="button" className="font-bold text-orange-fonce hover:underline" onClick={acknowledge}>
            {t('compat.ack')}
          </button>
        )}
      </div>
    </section>
  );
}
