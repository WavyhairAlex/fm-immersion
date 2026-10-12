import nodemailer from 'nodemailer';
import type { Locale } from '@simloom/shared';
import type { Env } from '../env';

export interface Mailer {
  sendLoginCode(to: string, code: string, locale: Locale): Promise<void>;
}

const texts: Record<Locale, { subject: (c: string) => string; intro: string; expiry: string; ignore: string }> = {
  fr: {
    subject: (c) => `Ton code de connexion Simloom : ${c}`,
    intro: 'Voici ton code de connexion à Simloom :',
    expiry: 'Il est valable 10 minutes et ne sert qu’une fois.',
    ignore: 'Tu n’as rien demandé ? Ignore simplement cet email.',
  },
  en: {
    subject: (c) => `Your Simloom sign-in code: ${c}`,
    intro: 'Here is your Simloom sign-in code:',
    expiry: 'It is valid for 10 minutes and can only be used once.',
    ignore: 'Didn’t ask for it? Just ignore this email.',
  },
};

/**
 * Envoi SMTP via Nodemailer. Le fournisseur se change par configuration :
 * Mailpit en local, SMTP OVH en développement, Scaleway TEM en production.
 */
export function createMailer(env: Env): Mailer {
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });

  return {
    async sendLoginCode(to, code, locale) {
      const t = texts[locale];
      await transport.sendMail({
        from: env.MAIL_FROM,
        to,
        subject: t.subject(code),
        text: `${t.intro}\n\n${code}\n\n${t.expiry}\n${t.ignore}\n`,
        html: `<div style="font-family:system-ui,sans-serif;color:#0F4B58;max-width:480px">
<p>${t.intro}</p>
<p style="font-size:32px;font-weight:800;letter-spacing:8px;margin:24px 0">${code}</p>
<p>${t.expiry}</p>
<p style="color:#8B5E3C;font-size:13px">${t.ignore}</p>
</div>`,
      });
    },
  };
}
