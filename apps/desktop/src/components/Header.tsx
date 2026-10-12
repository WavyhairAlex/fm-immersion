import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

export function Header() {
  const { t, i18n } = useTranslation();
  const otherLang = i18n.resolvedLanguage === 'fr' ? 'en' : 'fr';

  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
      <Link to="/" aria-label="Simloom">
        <img src="/brand/logo.svg" alt="Simloom" className="h-9 w-auto" />
      </Link>
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
