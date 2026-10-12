import type { Locale } from '@simloom/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { meQueryKey, useMe } from '../lib/auth';

export function Login() {
  const { t, i18n } = useTranslation();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');

  const locale: Locale = i18n.resolvedLanguage === 'en' ? 'en' : 'fr';

  const requestCode = useMutation({
    mutationFn: () => api.requestCode(email, locale),
    onSuccess: () => setStep('code'),
  });
  const verifyCode = useMutation({
    mutationFn: () => api.verifyCode(email, code),
    onSuccess: (user) => {
      qc.setQueryData(meQueryKey, user);
      navigate('/app');
    },
  });

  if (me) return <Navigate to="/app" replace />;

  const onEmail = (e: FormEvent) => {
    e.preventDefault();
    requestCode.mutate();
  };
  const onCode = (e: FormEvent) => {
    e.preventDefault();
    verifyCode.mutate();
  };

  const verifyError =
    verifyCode.error instanceof ApiError && verifyCode.error.code === 'invalid_code'
      ? t('login.invalidCode')
      : verifyCode.error
        ? t('login.error')
        : null;

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="card">
        <img src="/brand/mascotte-sm.webp" alt="" className="mx-auto h-28 w-auto" />
        <h1 className="mt-4 text-center text-2xl font-semibold">{t('login.title')}</h1>

        {step === 'email' ? (
          <form onSubmit={onEmail} className="mt-6 space-y-4">
            <p className="text-sm text-brun">{t('login.intro')}</p>
            <label className="block text-sm font-bold">
              {t('login.email')}
              <input
                className="input mt-1"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            {requestCode.isError && <p className="text-sm text-corail">{t('login.error')}</p>}
            <button className="btn-primary w-full" disabled={requestCode.isPending}>
              {t('login.send')}
            </button>
          </form>
        ) : (
          <form onSubmit={onCode} className="mt-6 space-y-4">
            <p className="text-sm text-brun">{t('login.codeSent', { email })}</p>
            <label className="block text-sm font-bold">
              {t('login.code')}
              <input
                className="input mt-1 text-center font-mono text-2xl tracking-[0.5em]"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                required
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
            </label>
            {verifyError && <p className="text-sm text-corail">{verifyError}</p>}
            <button className="btn-primary w-full" disabled={verifyCode.isPending || code.length !== 6}>
              {t('login.verify')}
            </button>
            <div className="flex justify-between text-sm font-bold text-canard/70">
              <button type="button" onClick={() => { setStep('email'); setCode(''); }}>
                {t('login.changeEmail')}
              </button>
              <button type="button" onClick={() => requestCode.mutate()} disabled={requestCode.isPending}>
                {t('login.resend')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
