import { invoke } from '@tauri-apps/api/core';

/** Lien webhook Discord du joueur, gardé seulement sur ce PC. */
const KEY = 'fmi.discord.webhook';

export function getWebhook(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function setWebhook(url: string) {
  try {
    if (url.trim()) localStorage.setItem(KEY, url.trim());
    else localStorage.removeItem(KEY);
  } catch {
    /* stockage indisponible : le lien sera redemandé */
  }
}

/** Même contrôle que côté Rust, pour prévenir avant d'envoyer. */
export const isWebhook = (url: string) =>
  /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(url.trim());

export const sendDiscord = (payload: unknown, webhook = getWebhook()) => invoke<void>('discord_send', { webhook, payload });

/** Message avec une image PNG jointe (la une de la gazette), affichée dans l'encart par `attachment://une.png`. */
export const sendDiscordImage = (payload: unknown, png: Uint8Array, webhook = getWebhook()) =>
  invoke<void>('discord_send_image', { webhook, payload, png: Array.from(png) });

/** Message dont on garde l'identifiant, pour le modifier ensuite (tableau de score du match en direct). */
export const postDiscord = (payload: unknown, webhook = getWebhook()) => invoke<string>('discord_post', { webhook, payload });

export const editDiscord = (messageId: string, payload: unknown, webhook = getWebhook()) =>
  invoke<void>('discord_edit', { webhook, messageId, payload });

/** Direct des matchs sur Discord, activé par le joueur (gardé sur ce PC). */
const LIVE_KEY = 'fmi.discord.live';

export function getLiveEnabled(): boolean {
  try {
    return localStorage.getItem(LIVE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setLiveEnabled(on: boolean) {
  try {
    if (on) localStorage.setItem(LIVE_KEY, '1');
    else localStorage.removeItem(LIVE_KEY);
  } catch {
    /* stockage indisponible : le direct reste coupé */
  }
}
