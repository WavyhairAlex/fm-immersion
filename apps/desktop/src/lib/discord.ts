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
