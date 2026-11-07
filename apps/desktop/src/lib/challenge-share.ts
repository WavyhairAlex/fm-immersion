import { shortDigest, type ChallengeCertificate, type ChallengeResult, type ChallengeIssue, type ChallengeStep } from '@fm-immersion/module-fm';
import { invoke } from '@tauri-apps/api/core';
import type { TFunction } from 'i18next';
import { getWebhook } from './discord';

/** Textes d'un défi (étapes, problèmes) et partage du certificat : fichier ou salon Discord. */

export const stepText = (t: TFunction, s: ChallengeStep) =>
  t(`challenges.step.${s.key}`, { value: s.value ?? '', target: s.target ?? '', detail: s.detail ?? '' });

export const issueText = (t: TFunction, i: ChallengeIssue) => t(`challenges.issue.${i.kind}`, { ...i });

export const certificateFileName = (c: ChallengeCertificate) => `defi-${c.challenge}-${c.digest.slice(0, 8)}.json`;

/** Message Discord du certificat : statut, étapes, et empreinte pour reconnaître le fichier joint. */
export function certificatePayload(t: TFunction, c: ChallengeCertificate, r: ChallengeResult) {
  const mark = (done: boolean) => (done ? '✅' : '▫️');
  const lines = r.steps.map((s) => `${mark(s.done)} ${stepText(t, s)}`);
  const issues = r.issues.map((i) => `⚠️ ${issueText(t, i)}`);
  return {
    username: 'FM Immersion',
    embeds: [
      {
        title: t('challenges.discord.title', { coach: c.coach, challenge: t(`challenges.def.${c.challenge}.name`) }),
        description: [t(`challenges.status.${c.status}`), '', ...lines, ...(issues.length ? ['', ...issues] : [])].join('\n').slice(0, 4000),
        color: c.status === 'success' ? 0x2e8b57 : c.status === 'failed' ? 0xd93c3c : 0xf26b1d,
        footer: { text: t('challenges.discord.footer', { digest: shortDigest(c.digest), version: c.appVersion }) },
      },
    ],
  };
}

export const sendCertificate = (t: TFunction, c: ChallengeCertificate, r: ChallengeResult, webhook = getWebhook()) =>
  invoke<void>('discord_send_certificate', { webhook, payload: certificatePayload(t, c, r), name: certificateFileName(c), certificate: JSON.stringify(c) });

/** Enregistre le certificat dans Documents\\FM Immersion\\Défis et renvoie le chemin du fichier. */
export const saveCertificate = (c: ChallengeCertificate) =>
  invoke<string>('certificate_save', { name: certificateFileName(c).replace(/\.json$/, ''), certificate: JSON.stringify(c, null, 1) });
