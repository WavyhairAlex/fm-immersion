import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useUi } from '../lib/ui-store';

/**
 * Premier lancement (aucune carrière) : deux entrées selon ce que le joueur veut faire. Suivre sa partie FM27
 * (principal) ou installer les visages, qui marchent sans carrière (secondaire). Le reste tient en une ligne.
 */
export function Overview() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setCreateSaveOpen = useUi((s) => s.setCreateSaveOpen);
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10 xl:px-10">
      <h1 className="text-4xl font-semibold">{t('modes.home.heading')}</h1>
      <p className="mt-2 max-w-2xl text-brun">{t('modes.home.lead')}</p>

      <div className="mt-8 grid gap-5 md:grid-cols-[3fr_2fr]">
        <section className="card flex flex-col gap-3 border-t-4 border-orange p-6">
          <h2 className="font-display text-2xl font-semibold normal-case tracking-normal">{t('modes.home.follow')}</h2>
          <p className="text-brun">{t('modes.home.followText')}</p>
          <button
            type="button"
            className="btn-primary mt-auto self-start"
            onClick={() => {
              setCreateSaveOpen(true);
              navigate('/parties');
            }}
          >
            {t('layout.career.create')}
          </button>
        </section>
        <section className="card flex flex-col gap-3 p-6">
          <h2 className="font-display text-2xl font-semibold normal-case tracking-normal">{t('modes.home.faces')}</h2>
          <p className="text-brun">{t('modes.home.facesText')}</p>
          <Link to="/visages" className="btn-secondary mt-auto self-start">
            {t('modes.home.facesGo')}
          </Link>
        </section>
      </div>

      <p className="mt-6 text-sm text-brun">{t('modes.home.later')}</p>

      <footer className="mt-12 border-t border-canard/10 py-6 text-xs text-brun">
        <p>{t('footer.disclaimer')}</p>
        <p className="mt-1">{t('footer.privacy')}</p>
      </footer>
    </div>
  );
}
