import { parseGameRequest, playerForRequest } from '@fm-immersion/module-fm';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCareer } from './career';
import { clubPath } from './club-nav';
import { fmData } from './data';
import { useFmFolder } from './fm-sync';
import { useUi } from './ui-store';

/** Demandes venues de FM27 relues toutes les 2 secondes (un clic dans le jeu doit répondre vite). */
const POLL_MS = 2_000;
const LAST_KEY = 'fmi.gameRequest.last';

const lastHandled = () => {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
};
const remember = (id: string) => {
  try {
    localStorage.setItem(LAST_KEY, id);
  } catch {
    /* stockage indisponible : la demande peut revenir une fois, sans gravité */
  }
};

/**
 * Bouton « FM Immersion » de la fiche d'un joueur dans FM27 : le plugin écrit `fmimmersion-demande.json` (nom du
 * joueur affiché) ; l'appli passe au premier plan et ouvre la fiche de ce joueur. Lecture seule du fichier.
 */
export function useGameRequests() {
  const { saveId } = useCareer();
  const folder = useFmFolder(saveId);
  const navigate = useNavigate();
  useEffect(() => {
    if (!folder || !saveId) return;
    let stop = false;
    const tick = async () => {
      try {
        const text = await invoke<string | null>('fm_read_request', { folder });
        const req = text ? parseGameRequest(text) : null;
        if (stop || !req || req.id === lastHandled()) return;
        remember(req.id);
        const snap = await fmData.latest(saveId);
        const players = (snap?.data.players ?? []).map((p) => ({ id: String(p.id), name: p.name }));
        const player = playerForRequest(players, req.nom);
        navigate(clubPath('squad'));
        if (player) useUi.getState().setOpenPlayer(player.id);
        const w = getCurrentWindow();
        await w.unminimize().catch(() => {});
        await w.setFocus().catch(() => {});
      } catch {
        /* fichier absent ou en cours d'écriture */
      }
    };
    const timer = setInterval(tick, POLL_MS);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [folder, saveId, navigate]);
}
