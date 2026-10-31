import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

export function Header() {
  const { t, i18n } = useTranslation();
  const otherLang = i18n.resolvedLanguage === 'fr' ? 'en' : 'fr';

  return (
    <header className="flex w-full items-center justify-between px-6 py-4 xl:px-10">
      <div className="flex items-end gap-2">
        <Link to="/" aria-label="Simloom">
          <img src="/brand/logo.svg" alt="Simloom" className="h-9 w-auto" />
        </Link>
        <span className="pb-0.5 text-xs font-bold text-canard/60">{t('nav.version', { version: __APP_VERSION__ })}</span>
      </div>
      <button
        type="button"
        className="text-sm font-bold text-canard/70 hover:text-canard"
        onClick={() => i18n.changeLanguage(otherLang)}
      >
        {t('nav.language')}
      </button>
    </header>
  );
}
