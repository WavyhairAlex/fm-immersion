import { useMutation } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { AiLink } from '../components/AiSettingsCard';
import { aiFor } from '../lib/ai';
import { getLiveEnabled, getWebhook, isWebhook, sendDiscord, setLiveEnabled, setWebhook } from '../lib/discord';
import { getGazetteAuto, setGazetteAuto } from '../lib/gazette-auto';

/**
 * Live Discord (solo) : en haut, ce qui est branché d'un coup d'œil (salon, direct, gazette automatique, IA) ;
 * puis le salon à relier (replié une fois relié) et ce qui part dans le salon, en interrupteurs.
 */
export function Discord() {
  const { t } = useTranslation();
  const [url, setUrl] = useState(getWebhook());
  const [saved, setSaved] = useState(isWebhook(getWebhook()));
  const [editing, setEditing] = useState(!isWebhook(getWebhook()));
  const valid = isWebhook(url);
  const [live, setLive] = useState(getLiveEnabled());
  const [auto, setAuto] = useState(getGazetteAuto());
  const ai = aiFor('gazette') ?? aiFor('live');

  const test = useMutation({
    mutationFn: () => sendDiscord({ username: 'FM Immersion', content: t('discord.testMessage') }, url),
  });

  return (
    <div className="w-full max-w-3xl">
      <p className="text-brun">{t('discord.intro')}</p>

      <ul className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4" aria-label={t('discord.status.title')}>
        <Status label={t('discord.status.channel')} on={saved} value={saved ? t('discord.status.linked') : t('discord.status.notLinked')} />
        <Status label={t('discord.status.live')} on={saved && live} value={saved && live ? t('discord.status.on') : t('discord.status.off')} />
        <Status label={t('discord.status.auto')} on={saved && auto} value={saved && auto ? t('discord.status.on') : t('discord.status.off')} />
        <Status label={t('discord.status.ai')} on={!!ai} value={ai ? ai.model : t('discord.status.off')} />
      </ul>

      <section className="card mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">
            <Step n={1} />
            {t('discord.webhookTitle')}
          </h2>
          {saved && !editing && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn-secondary text-sm" disabled={test.isPending} onClick={() => test.mutate()}>
                {t('discord.test')}
              </button>
              <button type="button" className="btn-secondary text-sm" onClick={() => setEditing(true)}>
                {t('discord.change')}
              </button>
            </div>
          )}
        </div>
        {saved && !editing ? (
          <p className="mt-2 text-sm font-bold text-eau-fonce">{t('discord.saved')}</p>
        ) : (
          <>
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
                  const ok = isWebhook(url);
                  setSaved(ok);
                  setEditing(!ok);
                }}
              >
                {url ? t('discord.save') : t('discord.remove')}
              </button>
              <button type="button" className="btn-secondary" disabled={!valid || test.isPending} onClick={() => test.mutate()}>
                {t('discord.test')}
              </button>
            </div>
          </>
        )}
        {test.isSuccess && <p className="mt-2 text-sm font-bold text-eau-fonce">{t('discord.testOk')}</p>}
        {test.isError && <p className="mt-2 text-sm font-bold text-corail">{String(test.error)}</p>}
      </section>

      <section className="card mt-6">
        <h2 className="text-xl font-semibold">
          <Step n={2} />
          {t('discord.sendTitle')}
        </h2>
        {!saved && <p className="mt-2 text-sm font-bold text-ambre">{t('live.needWebhook')}</p>}
        <div className="mt-3 divide-y divide-canard/10">
          <Toggle
            on={live}
            disabled={!saved}
            title={t('live.enable')}
            help={
              <>
                {t('discord.liveShort')} <span className="text-canard/60">{t('discord.livePlugin')}</span>
              </>
            }
            onChange={(v) => {
              setLiveEnabled(v);
              setLive(v);
            }}
          />
          <Toggle
            on={auto}
            disabled={!saved}
            title={t('discord.autoEnable')}
            help={t('discord.autoShort')}
            onChange={(v) => {
              setGazetteAuto(v);
              setAuto(v);
            }}
          />
          <div className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <p className="text-sm font-bold">{t('discord.manualTitle')}</p>
              <p className="text-sm text-brun">{t('discord.manualShort')}</p>
            </div>
            <Link to="/gazette" className="btn-secondary text-sm">
              {t('modes.gazette.title')}
            </Link>
          </div>
        </div>
      </section>

      <AiLink />

      <p className="mt-6 text-xs text-brun">{t('discord.privacy')}</p>
    </div>
  );
}

const Step = ({ n }: { n: number }) => (
  <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-canard align-[2px] text-sm font-extrabold text-white">{n}</span>
);

/** Une case d'état en haut de page : vert quand c'est branché, gris sinon. */
function Status({ label, value, on }: { label: string; value: string; on: boolean }) {
  return (
    <li className={`rounded-xl border px-3 py-2 ${on ? 'border-eau-soutenu bg-eau/15' : 'border-canard/10 bg-white'}`}>
      <p className="text-xs font-bold uppercase tracking-wide text-brun">{label}</p>
      <p className={`mt-0.5 truncate text-sm font-extrabold ${on ? 'text-eau-fonce' : 'text-canard/60'}`} title={value}>
        {on ? '● ' : '○ '}
        {value}
      </p>
    </li>
  );
}

/** Interrupteur d'un envoi : titre, explication courte, case à droite. */
function Toggle({ on, disabled, title, help, onChange }: { on: boolean; disabled: boolean; title: string; help: ReactNode; onChange: (v: boolean) => void }) {
  return (
    <label className={`flex items-start justify-between gap-4 py-3 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
      <span>
        <span className="block text-sm font-bold">{title}</span>
        <span className="block text-sm text-brun">{help}</span>
      </span>
      <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-orange-fonce" checked={on && !disabled} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}
