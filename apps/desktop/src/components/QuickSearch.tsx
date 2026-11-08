import { loanedOutIds, normalizePlayer, squadSnapshot } from '@fm-immersion/module-fm';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCareer } from '../lib/career';
import { CLUB_PAGES, PARTS, clubPath } from '../lib/club-nav';
import { fmData } from '../lib/data';
import { useFmFolder } from '../lib/fm-sync';
import { useUi } from '../lib/ui-store';

/** Texte comparable : minuscules, sans accents. */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

interface Hit {
  key: string;
  label: string;
  sub: string;
  kind: 'action' | 'screen' | 'player';
  run: () => void;
}

/**
 * Recherche rapide (Ctrl+K, ou le bouton de la barre latérale) : un joueur de l'équipe première (ouvre sa fiche)
 * ou un écran de l'appli. Flèches pour choisir, Entrée pour ouvrir, Échap pour fermer.
 */
export function QuickSearch() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const open = useUi((s) => s.searchOpen);
  const setOpen = useUi((s) => s.setSearchOpen);
  const openPlayer = useUi((s) => s.setOpenPlayer);
  const { saveId } = useCareer();
  const folder = useFmFolder(saveId);
  const { data: snapshot } = useQuery({ queryKey: ['fm', saveId, 'latest'], queryFn: () => fmData.latest(saveId), enabled: !!saveId });
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(!useUi.getState().searchOpen);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  useEffect(() => {
    if (open) {
      setQ('');
      setSel(0);
    }
  }, [open]);

  // Équipe première présente au club : les joueurs dont la fiche peut s'ouvrir.
  const players = useMemo(() => {
    if (!snapshot) return [];
    const out = loanedOutIds(snapshot.data);
    return squadSnapshot(snapshot.data)
      .players.map(normalizePlayer)
      .filter((p) => !p.team && !out.has(p.id));
  }, [snapshot]);

  const all = useMemo<Hit[]>(() => {
    const go = (to: string) => () => navigate(to);
    const screens: Hit[] = [];
    if (saveId) {
      screens.push({ key: 's:home', label: t('layout.nav.today'), sub: '', kind: 'screen', run: go('/') });
      for (const page of CLUB_PAGES)
        for (const v of PARTS[page]) screens.push({ key: `s:${v}`, label: t(`fm.views.${v}`), sub: t(`layout.nav.${page}`), kind: 'screen', run: go(clubPath(v)) });
    }
    screens.push(
      { key: 's:gazette', label: t('layout.nav.story'), sub: '', kind: 'screen', run: go('/gazette') },
      { key: 's:defis', label: t('modes.challenges.title'), sub: '', kind: 'screen', run: go('/defis') },
      { key: 's:faces', label: t('layout.nav.faces'), sub: '', kind: 'screen', run: go('/visages') },
    );
    if (saveId) screens.push({ key: 's:settings', label: t('layout.nav.settings'), sub: '', kind: 'screen', run: go('/reglages') });
    const people: Hit[] = players.map((p) => ({
      key: `p:${p.id}`,
      label: p.name,
      sub: p.positionsLabel,
      kind: 'player',
      run: () => {
        // La fiche s'ouvre sur l'écran du club en cours, sinon sur l'Effectif.
        if (!(pathname === '/' || pathname.startsWith('/club/'))) navigate(clubPath('squad'));
        openPlayer(p.id);
      },
    }));
    // Actions : ce que l'appli fait elle-même, sans passer par un écran.
    const other = i18n.resolvedLanguage === 'en' ? 'fr' : 'en';
    const actions: Hit[] = [
      ...(saveId && folder
        ? [
            {
              key: 'a:read',
              label: t('search.actions.read'),
              sub: t('search.actions.readSub'),
              kind: 'action' as const,
              run: () => {
                void invoke<string>('fm_read_snapshot', { folder })
                  .then((text) => fmData.importSnapshot(saveId, JSON.parse(text), {}))
                  .then(() => qc.invalidateQueries({ queryKey: ['fm', saveId] }))
                  .catch(() => undefined);
              },
            },
          ]
        : []),
      { key: 'a:careers', label: t('search.actions.careers'), sub: '', kind: 'action', run: go('/parties') },
      { key: 'a:lang', label: t('search.actions.lang'), sub: '', kind: 'action', run: () => void i18n.changeLanguage(other) },
    ];
    return [...actions, ...people, ...screens];
  }, [players, saveId, folder, t, i18n, qc, navigate, pathname, openPlayer]);

  const hits = useMemo(() => {
    const words = fold(q).split(/\s+/).filter(Boolean);
    if (!words.length) return all.filter((h) => h.kind !== 'player').slice(0, 8);
    return all.filter((h) => words.every((w) => fold(`${h.label} ${h.sub}`).includes(w))).slice(0, 8);
  }, [all, q]);

  if (!open) return null;
  const close = () => setOpen(false);
  const pick = (h: Hit | undefined) => {
    if (!h) return;
    close();
    h.run();
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, hits.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') pick(hits[sel]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-canard/40 px-4 pt-[12vh]" onMouseDown={close}>
      <div role="dialog" aria-modal="true" aria-label={t('search.label')} className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-canard/10" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={input}
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSel(0);
          }}
          onKeyDown={onKey}
          placeholder={t('search.placeholder')}
          aria-label={t('search.label')}
          className="w-full border-b border-canard/10 px-5 py-4 text-lg outline-none"
        />
        {hits.length ? (
          <ul role="listbox" className="max-h-[60vh] overflow-y-auto py-2">
            {hits.map((h, i) => (
              <li key={h.key} role="option" aria-selected={i === sel}>
                <button
                  type="button"
                  onMouseEnter={() => setSel(i)}
                  onClick={() => pick(h)}
                  className={`flex w-full items-baseline gap-3 px-5 py-2 text-left ${i === sel ? 'bg-orange-clair' : ''}`}
                >
                  <span className="w-16 shrink-0 text-xs font-bold uppercase text-brun">{t(`search.${h.kind}`)}</span>
                  <span className="font-bold">{h.label}</span>
                  {h.sub && <span className="truncate text-sm text-brun">{h.sub}</span>}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-4 text-sm text-brun">{t('search.none')}</p>
        )}
        <p className="border-t border-canard/10 px-5 py-2 text-xs text-brun">{t('search.keys')}</p>
      </div>
    </div>
  );
}
