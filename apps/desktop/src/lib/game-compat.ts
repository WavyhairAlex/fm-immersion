import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useState } from 'react';

/** État renvoyé par `fm_compat_status` (lecture seule de fichiers du jeu). */
export type Compat = {
  gameFound: boolean;
  build: { key: string; moduleSize: number; moduleModified: number; steamBuild: string | null } | null;
  memory: 'known' | 'patterns' | 'broken' | 'unchecked';
  log: { modified: number; unity: string | null; plugins: { name: string; version: string }[]; started: boolean; errors: string[] } | null;
};

export type CompatLevel = 'ok' | 'warn' | 'bad';
export type CompatItem = {
  id: 'updated' | 'launch' | 'bepinex' | 'bridge' | 'bridgeErrors' | 'memory' | 'faces';
  level: CompatLevel;
  /** Clé i18n `compat.items.<key>`. */
  key: string;
  params?: Record<string, string | number>;
  /** Écran où agir. */
  to?: string;
};

export type CompatReport = {
  /** La version du jeu a changé depuis la dernière fois que le joueur a vu ce bilan. */
  updated: boolean;
  /** Le jeu a été lancé (journal BepInEx écrit) depuis sa dernière mise à jour. */
  launchedSince: boolean;
  level: CompatLevel;
  items: CompatItem[];
};

export const BRIDGE_PLUGIN = 'Archivix Bridge';

const worst = (items: CompatItem[]): CompatLevel =>
  items.some((i) => i.level === 'bad') ? 'bad' : items.some((i) => i.level === 'warn') ? 'warn' : 'ok';

/**
 * Bilan de compatibilité après une mise à jour de FM27 : uniquement des constats et l'écran où agir.
 * `seenKey` : empreinte de la version au dernier bilan vu (null au premier lancement : rien de « nouveau »).
 */
export function compatReport(
  c: Compat,
  opts: { seenKey: string | null; bridgeInstalled: string | null; bepinex: boolean; facesMismatch: boolean },
): CompatReport | null {
  if (!c.gameFound || !c.build) return null;
  const items: CompatItem[] = [];
  const updated = !!opts.seenKey && opts.seenKey !== c.build.key;
  const launchedSince = !!c.log && c.log.modified >= c.build.moduleModified;

  if (updated) items.push({ id: 'updated', level: 'warn', key: 'updated', params: { date: c.build.moduleModified } });

  if (opts.bepinex) {
    if (!launchedSince) {
      items.push({ id: 'launch', level: 'warn', key: 'launch' });
    } else if (c.log && !c.log.started) {
      items.push({ id: 'bepinex', level: 'bad', key: 'bepinexStuck' });
    }
  }

  if (opts.bridgeInstalled && launchedSince && c.log) {
    const loaded = c.log.plugins.find((p) => p.name === BRIDGE_PLUGIN);
    if (!loaded) {
      items.push({ id: 'bridge', level: 'bad', key: 'bridgeMissing', to: '/reglages' });
    } else {
      items.push({ id: 'bridge', level: 'ok', key: 'bridgeOk', params: { version: loaded.version } });
    }
    const errors = c.log.errors.filter((e) => e.includes(BRIDGE_PLUGIN));
    if (errors.length) items.push({ id: 'bridgeErrors', level: 'warn', key: 'bridgeErrors', params: { count: errors.length, first: errors[0]! } });
  }

  if (c.memory === 'known') items.push({ id: 'memory', level: 'ok', key: 'memoryKnown' });
  else if (c.memory === 'patterns') items.push({ id: 'memory', level: 'warn', key: 'memoryPatterns' });
  else if (c.memory === 'broken') items.push({ id: 'memory', level: 'bad', key: 'memoryBroken' });

  if (opts.facesMismatch) items.push({ id: 'faces', level: 'bad', key: 'facesMismatch', to: '/visages' });

  return { updated, launchedSince, level: worst(items), items };
}

/** Empreinte de la version de FM27 au dernier bilan vu par le joueur (par PC, dans ce navigateur de l'appli). */
export const COMPAT_SEEN_KEY = 'fmi.gameBuildSeen';

const readSeen = () => {
  try {
    return localStorage.getItem(COMPAT_SEEN_KEY);
  } catch {
    return null;
  }
};

/** État de compatibilité du jeu, relu toutes les 5 min (le module n'est relu en entier qu'après une mise à jour). */
export function useGameCompat(gameDir: string) {
  const query = useQuery({
    queryKey: ['fm', 'compat', gameDir],
    queryFn: () => invoke<Compat>('fm_compat_status', { gameDir }),
    enabled: !!gameDir,
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });
  const [seen, setSeen] = useState<string | null>(readSeen);
  const key = query.data?.build?.key ?? null;
  // Premier bilan sur ce PC : la version actuelle sert de référence, rien n'est signalé comme « mis à jour ».
  useEffect(() => {
    if (key && seen == null) {
      try {
        localStorage.setItem(COMPAT_SEEN_KEY, key);
      } catch {
        /* stockage indisponible */
      }
      setSeen(key);
    }
  }, [key, seen]);
  const acknowledge = useCallback(() => {
    if (!key) return;
    try {
      localStorage.setItem(COMPAT_SEEN_KEY, key);
    } catch {
      /* stockage indisponible */
    }
    setSeen(key);
  }, [key]);
  return { compat: query.data ?? null, seen, acknowledge, refetch: query.refetch, loading: query.isLoading };
}
