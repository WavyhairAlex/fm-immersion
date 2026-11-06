import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { MODES } from '../lib/modes';

/** Barre latérale anthracite : un lien par mode, le mode ouvert souligné d'orange. */
export function Sidebar() {
  const { t, i18n } = useTranslation();
  const otherLang = i18n.resolvedLanguage === 'fr' ? 'en' : 'fr';

  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col bg-canard px-3 py-5 text-white">
      <NavLink to="/" className="px-3" aria-label="FM Immersion">
        <span className="font-display text-2xl font-semibold">
          FM <span className="text-orange">Immersion</span>
        </span>
      </NavLink>
      <span className="mt-1 px-3 text-xs font-bold text-white/60">{t('nav.version', { version: __APP_VERSION__ })}</span>

      <nav className="mt-8 flex flex-col gap-1" aria-label={t('nav.modes')}>
        <NavLink to="/" end className="nav-link">
          {t('modes.home.title')}
        </NavLink>
        {MODES.map((m) => (
          <NavLink key={m.id} to={m.path} className="nav-link">
            <span>{t(`modes.${m.id}.title`)}</span>
            {m.status === 'soon' && (
              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[0.6875rem] font-bold uppercase tracking-wide text-white/70">
                {t('modes.soon')}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <button
        type="button"
        className="mt-auto px-3 text-left text-sm font-bold text-white/70 hover:text-white"
        onClick={() => i18n.changeLanguage(otherLang)}
      >
        {t('nav.language')}
      </button>
    </aside>
  );
}
