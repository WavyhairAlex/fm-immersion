import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { meQueryKey, useMe } from '../lib/auth';

export function Header() {
  const { t, i18n } = useTranslation();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: () => {
      qc.setQueryData(meQueryKey, null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
      navigate('/');
    },
  });

  const otherLang = i18n.resolvedLanguage === 'fr' ? 'en' : 'fr';

  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
      <Link to={me ? '/app' : '/'} aria-label="Simloom">
        <img src="/brand/logo.svg" alt="Simloom" className="h-9 w-auto" />
      </Link>
      <nav className="flex items-center gap-3 text-sm font-bold">
        <button type="button" className="text-canard/70 hover:text-canard" onClick={() => i18n.changeLanguage(otherLang)}>
          {t('nav.language')}
        </button>
        {me ? (
          <>
            <Link to="/app" className="hidden sm:inline">
              {t('nav.dashboard')}
            </Link>
            <button type="button" className="btn-secondary" onClick={() => logout.mutate()}>
              {t('nav.logout')}
            </button>
          </>
        ) : (
          <Link to="/login" className="btn-primary">
            {t('nav.login')}
          </Link>
        )}
      </nav>
    </header>
  );
}
