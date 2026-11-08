import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  aiFor,
  AI_PROVIDERS,
  AI_TONES,
  aiComplete,
  aiKeySet,
  aiKeyStatus,
  aiOllamaModels,
  DEFAULT_MODELS,
  getAiSettings,
  modelOf,
  setAiSettings,
  type AiProvider,
  type AiSettings,
} from '../lib/ai';

/**
 * Réglages de la rédaction par IA : fournisseur (Ollama sur ce PC ou clé API), modèle, ton, usages, test.
 * La clé API part dans le coffre de Windows et n'est jamais réaffichée.
 */
export function AiSettingsCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [s, setS] = useState<AiSettings>(getAiSettings());
  const [key, setKey] = useState('');
  const update = (patch: Partial<AiSettings>) => {
    const next = { ...s, ...patch };
    setS(next);
    setAiSettings(next);
    qc.invalidateQueries({ queryKey: ['gazette', 'ia'] });
  };
  const p = s.provider;
  const needsKey = !!p && p !== 'ollama';
  const keyStatus = useQuery({ queryKey: ['ai', 'key', p], queryFn: () => aiKeyStatus(p!), enabled: needsKey });
  const models = useQuery({ queryKey: ['ai', 'ollama-models'], queryFn: aiOllamaModels, enabled: p === 'ollama', retry: false });
  const saveKey = useMutation({
    mutationFn: (value: string) => aiKeySet(p!, value),
    onSuccess: () => {
      setKey('');
      qc.invalidateQueries({ queryKey: ['ai', 'key', p] });
    },
  });
  const test = useMutation({
    mutationFn: () => aiComplete(p!, modelOf(s, p!), t('ai.testSystem'), t('ai.testPrompt'), false),
  });
  const model = p ? (s.models[p] ?? '') : '';
  const installed = models.data ?? [];
  // Ollama : le modèle choisi doit être installé sur ce PC ; sinon on prend le premier de la liste.
  const current = p === 'ollama' ? modelOf(s, 'ollama') : null;
  useEffect(() => {
    if (p === 'ollama' && installed.length && current && !installed.includes(current)) update({ models: { ...s.models, ollama: installed[0]! } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p, installed.join('|'), current]);

  return (
    <section className="card mt-6 max-w-3xl">
      <h2 className="text-xl font-semibold">{t('ai.title')}</h2>
      <p className="mt-2 text-sm text-brun">{t('ai.intro')}</p>

      <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label={t('ai.provider')}>
        <button type="button" role="radio" aria-checked={!p} className={`chip ${!p ? 'chip-on' : ''}`} onClick={() => update({ provider: null })}>
          {t('ai.off')}
        </button>
        {AI_PROVIDERS.map((x) => (
          <button key={x} type="button" role="radio" aria-checked={p === x} className={`chip ${p === x ? 'chip-on' : ''}`} onClick={() => update({ provider: x })}>
            {t(`ai.providers.${x}.name`)}
          </button>
        ))}
      </div>
      {p && <p className="mt-2 text-xs text-brun">{t(`ai.providers.${p}.help`)}</p>}

      {p === 'ollama' && (
        <div className="mt-3 text-sm">
          {models.isError && <p className="font-bold text-corail">{t('ai.ollamaDown')}</p>}
          {models.isSuccess && !installed.length && <p className="font-bold text-ambre">{t('ai.ollamaEmpty', { model: DEFAULT_MODELS.ollama })}</p>}
          <button type="button" className="btn-secondary mt-2 text-xs" onClick={() => models.refetch()}>
            {t('ai.ollamaRefresh')}
          </button>
        </div>
      )}

      {p && (
        <label className="mt-4 block text-sm font-bold">
          {t('ai.model')}
          {p === 'ollama' && installed.length ? (
            <select className="input mt-1" value={current ?? ''} onChange={(e) => update({ models: { ...s.models, [p]: e.target.value } })}>
              {installed.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="input mt-1 font-mono text-sm"
              value={model}
              placeholder={DEFAULT_MODELS[p as AiProvider]}
              spellCheck={false}
              onChange={(e) => update({ models: { ...s.models, [p]: e.target.value } })}
            />
          )}
        </label>
      )}

      {needsKey && (
        <div className="mt-4">
          <label className="block text-sm font-bold">
            {t('ai.key')}
            <input
              type="password"
              className="input mt-1 font-mono text-sm"
              value={key}
              autoComplete="off"
              spellCheck={false}
              placeholder={keyStatus.data ? t('ai.keySaved') : t('ai.keyPlaceholder')}
              onChange={(e) => setKey(e.target.value)}
            />
          </label>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button type="button" className="btn-primary text-sm" disabled={!key.trim() || saveKey.isPending} onClick={() => saveKey.mutate(key)}>
              {t('ai.keySave')}
            </button>
            {keyStatus.data && (
              <button type="button" className="btn-secondary text-sm" disabled={saveKey.isPending} onClick={() => saveKey.mutate('')}>
                {t('ai.keyRemove')}
              </button>
            )}
            {keyStatus.data && <span className="text-sm font-bold text-eau-fonce">{t('ai.keySaved')}</span>}
          </div>
          {saveKey.isError && <p className="mt-2 text-sm font-bold text-corail">{String(saveKey.error)}</p>}
          <p className="mt-2 text-xs text-brun">{t('ai.keyPrivacy')}</p>
        </div>
      )}

      {p && (
        <>
          <p className="mt-4 text-sm font-bold">{t('ai.tone')}</p>
          <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={t('ai.tone')}>
            {AI_TONES.map((x) => (
              <button key={x} type="button" role="radio" aria-checked={s.tone === x} className={`chip ${s.tone === x ? 'chip-on' : ''}`} onClick={() => update({ tone: x })}>
                {t(`ai.tones.${x}`)}
              </button>
            ))}
          </div>
          <label className="mt-4 flex items-center gap-3 text-sm font-bold">
            <input type="checkbox" className="h-5 w-5 accent-orange-fonce" checked={s.gazette} onChange={(e) => update({ gazette: e.target.checked })} />
            {t('ai.useGazette')}
          </label>
          <label className="mt-2 flex items-center gap-3 text-sm font-bold">
            <input type="checkbox" className="h-5 w-5 accent-orange-fonce" checked={s.live} onChange={(e) => update({ live: e.target.checked })} />
            {t('ai.useLive')}
          </label>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" className="btn-secondary text-sm" disabled={test.isPending || (needsKey && !keyStatus.data)} onClick={() => test.mutate()}>
              {test.isPending ? t('ai.testing') : t('ai.test')}
            </button>
          </div>
          {test.isSuccess && (
            <p className="mt-2 text-sm">
              <span className="font-bold text-eau-fonce">{t('ai.testOk')}</span> <span className="italic">{t('ai.testAnswer', { text: test.data })}</span>
            </p>
          )}
          {test.isError && <p className="mt-2 text-sm font-bold text-corail">{String(test.error)}</p>}
          <p className="mt-4 text-xs text-brun">{t('ai.fallback')}</p>
        </>
      )}
    </section>
  );
}

/** Encart qui mène aux réglages de l'IA (Plugin et réglages), avec son état : branchée sur quel modèle, ou coupée. */
export function AiLink({ use = 'gazette' }: { use?: 'gazette' | 'live' }) {
  const { t } = useTranslation();
  const ai = aiFor(use);
  return (
    <section className="card mt-6 flex max-w-3xl flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold">{t('ai.title')}</h2>
        <p className="mt-1 text-sm text-brun">{ai ? t('ai.linkOn', { model: ai.model }) : t('ai.linkOff')}</p>
      </div>
      <Link to="/reglages" className={ai ? 'btn-secondary text-sm' : 'btn-primary text-sm'}>
        {ai ? t('ai.linkChange') : t('ai.linkSetup')}
      </Link>
    </section>
  );
}
