import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { AiLink } from '../components/AiSettingsCard';
import { DiscordEmbed } from '../components/DiscordEmbed';
import { aiFor } from '../lib/ai';
import { getLiveEnabled, getWebhook, isWebhook, sendDiscord, setLiveEnabled, setWebhook } from '../lib/discord';
import { autoLastError, autoLastSent, getBreakingAuto, getGazetteAuto, setBreakingAuto, setGazetteAuto } from '../lib/gazette-auto';
import { useCareer } from '../lib/career';
import { fmData } from '../lib/data';
import { livePreviewPayload } from '../lib/live-discord';

/**
 * Live Discord (solo) : en haut, ce qui est branché en une phrase (direct, gazette automatique, IA) ;
 * puis le salon à relier (replié une fois relié) et ce qui part dans le salon, en interrupteurs, avec un exemple
 * de l'encart du direct pour voir ce que recevront les amis avant de l'activer.
 */
export function Discord() {
  const { t } = useTranslation();
  const [url, setUrl] = useState(getWebhook());
  const [saved, setSaved] = useState(isWebhook(getWebhook()));
  const [editing, setEditing] = useState(!isWebhook(getWebhook()));
  const valid = isWebhook(url);
  const [live, setLive] = useState(getLiveEnabled());
  const [auto, setAuto] = useState(getGazetteAuto());
  const [breaking, setBreaking] = useState(getBreakingAuto());
  const ai = aiFor('gazette') ?? aiFor('live');
  // Exemple d'encart du direct, au nom du club de la carrière suivie quand on le connaît.
  const { saveId } = useCareer();
  const { data: snapshot } = useQuery({ queryKey: ['fm', saveId, 'latest'], queryFn: () => fmData.latest(saveId), enabled: !!saveId });
  const preview = useMemo(
    () => livePreviewPayload(t, snapshot?.club || t('discord.preview.club'), t('discord.preview.opponent')),
    [t, snapshot?.club],
  );

  const test = useMutation({
    mutationFn: () => sendDiscord({ username: 'FM Immersion', content: t('discord.testMessage') }, url),
  });

  return (
    <div className="w-full max-w-3xl">
      <p className="text-brun">{t('discord.intro')}</p>

      {/* État du salon en une phrase : ce qui part vraiment, et vers où. */}
      <section className={`mt-5 rounded-xl border px-4 py-3 ${saved ? 'border-eau-soutenu bg-eau/15' : 'border-canard/10 bg-white'}`} aria-label={t('discord.status.title')}>
        <p className="text-xs font-bold uppercase tracking-wide text-brun">{t('discord.status.title')}</p>
        <p className={`mt-1 font-extrabold ${saved ? 'text-eau-fonce' : 'text-canard/70'}`}>
          {saved
            ? [t(live ? 'discord.status.liveOn' : 'discord.status.liveOff'), t(auto ? 'discord.status.autoOn' : 'discord.status.autoOff')].join(' · ')
            : t('discord.status.none')}
        </p>
        <p className="mt-1 text-sm text-brun">{ai ? t('discord.status.aiOn', { model: ai.model }) : t('discord.status.aiOff')}</p>
        {saved && (auto || breaking) && <AutoState />}
      </section>

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
          <details className="pb-3" open={!live}>
            <summary className="cursor-pointer text-sm font-bold text-orange-fonce">{t('discord.preview.title')}</summary>
            <p className="mt-1 text-sm text-brun">{t('discord.preview.help')}</p>
            <div className="mt-2">
              <DiscordEmbed embed={preview.embeds[0]!} label={t('discord.preview.title')} />
            </div>
          </details>
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
          <Toggle
            on={breaking}
            disabled={!saved}
            title={t('discord.breakingEnable')}
            help={t('discord.breakingShort')}
            onChange={(v) => {
              setBreakingAuto(v);
              setBreaking(v);
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

/** Ce qu'a fait l'envoi automatique : dernière gazette partie, dernier envoi raté (relus chaque minute). */
function AutoState() {
  const { t, i18n } = useTranslation();
  const [, tick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const when = (iso: string) => new Date(iso).toLocaleString(i18n.resolvedLanguage, { dateStyle: 'short', timeStyle: 'short' });
  const sent = autoLastSent();
  const error = autoLastError();
  const showError = error && (!sent || error.at > sent.at);
  return (
    <>
      <p className="mt-1 text-sm text-brun">{sent ? t('discord.status.lastSent', { number: sent.number, date: when(sent.at) }) : t('discord.status.noneSent')}</p>
      {showError && (
        <p className="mt-1 text-sm font-bold text-corail">
          {t('discord.status.lastError', { what: t(`discord.status.what.${error.what}`, { defaultValue: error.what }), date: when(error.at), error: error.error })}
          {error.dropped && ` ${t('discord.status.dropped')}`}
        </p>
      )}
    </>
  );
}

const Step = ({ n }: { n: number }) => (
  <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-canard align-[2px] text-sm font-extrabold text-white">{n}</span>
);

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
