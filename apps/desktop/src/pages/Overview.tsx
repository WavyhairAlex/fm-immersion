import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { MODES } from '../lib/modes';

/** Présentation de l'appli, montrée à l'accueil tant qu'aucune carrière n'existe : créer la sienne, puis un cadre par mode. */
export function Overview() {
  const { t } = useTranslation();
  return (
    <div className="w-full px-6 py-6 xl:px-10">
      <h1 className="text-3xl font-semibold">{t('modes.home.heading')}</h1>
      <p className="mt-2 max-w-2xl text-brun">{t('modes.home.intro')}</p>
      <Link to="/parties" className="btn-primary mt-5">
        {t('layout.career.create')}
      </Link>

      <div className="mt-8 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {MODES.map((m) => (
          <Link
            key={m.id}
            to={m.path}
            className="card group flex flex-col gap-2 rounded-xl border-t-4 border-orange transition hover:shadow-md"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xl font-semibold">{t(`modes.${m.id}.title`)}</h2>
              <span className={m.status === 'available' ? 'pill' : 'pill bg-canard/10'}>
                {m.status === 'available' ? t('modes.available') : t('modes.soon')}
              </span>
            </div>
            <p className="text-sm text-brun">{t(`modes.${m.id}.summary`)}</p>
            <span className="mt-auto pt-2 text-sm font-bold text-orange-fonce group-hover:underline">{t('modes.open')}</span>
          </Link>
        ))}
      </div>

      <footer className="mt-12 border-t border-canard/10 py-6 text-xs text-brun">
        <p>{t('footer.disclaimer')}</p>
        <p className="mt-1">{t('footer.privacy')}</p>
      </footer>
    </div>
  );
}
