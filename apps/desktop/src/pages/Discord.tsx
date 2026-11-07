import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { getWebhook, isWebhook, sendDiscord, setWebhook } from '../lib/discord';

/** Mode Live Discord (solo) : le joueur colle le lien webhook de son salon, puis envoie ses gazettes. */
export function Discord() {
  const { t } = useTranslation();
  const [url, setUrl] = useState(getWebhook());
  const [saved, setSaved] = useState(isWebhook(getWebhook()));
  const valid = isWebhook(url);

  const test = useMutation({ mutationFn: () => sendDiscord({ username: 'FM Immersion', content: t('discord.testMessage') }, url) });

  return (
    <div className="w-full px-6 py-6 xl:px-10">
      <h1 className="text-3xl font-semibold">{t('modes.discord.title')}</h1>
      <p className="mt-2 max-w-3xl text-brun">{t('discord.intro')}</p>

      <section className="card mt-6 max-w-3xl">
        <h2 className="text-xl font-semibold">{t('discord.webhookTitle')}</h2>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
          <li>{t('discord.step1')}</li>
          <li>{t('discord.step2')}</li>
          <li>{t('discord.step3')}</li>
        </ol>
        <label className="mt-4 block text-sm font-bold">
          {t('discord.webhook')}
          <input
            className="input mt-1 font-mono text-sm"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setSaved(false);
            }}
            placeholder="https://discord.com/api/webhooks/…"
            spellCheck={false}
          />
        </label>
        {url && !valid && <p className="mt-2 text-sm font-bold text-corail">{t('discord.invalid')}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn-primary"
            disabled={!valid && !!url}
            onClick={() => {
              setWebhook(url);
              setSaved(isWebhook(url));
            }}
          >
            {url ? t('discord.save') : t('discord.remove')}
          </button>
          <button type="button" className="btn-secondary" disabled={!valid || test.isPending} onClick={() => test.mutate()}>
            {t('discord.test')}
          </button>
          {saved && <span className="text-sm font-bold text-eau-fonce">{t('discord.saved')}</span>}
        </div>
        {test.isSuccess && <p className="mt-2 text-sm font-bold text-eau-fonce">{t('discord.testOk')}</p>}
        {test.isError && <p className="mt-2 text-sm font-bold text-corail">{String(test.error)}</p>}
      </section>

      <section className="card mt-6 max-w-3xl">
        <h2 className="text-xl font-semibold">{t('discord.whatTitle')}</h2>
        <p className="mt-2 text-sm text-brun">{t('discord.what')}</p>
        <Link to="/gazette" className="btn-secondary mt-4 text-sm">
          {t('modes.gazette.title')}
        </Link>
        <p className="mt-4 text-xs text-brun">{t('discord.privacy')}</p>
      </section>
    </div>
  );
}
