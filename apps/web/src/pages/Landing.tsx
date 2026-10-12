import { GAMES } from '@simloom/shared';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

const ILLUSTRATION: Record<string, string> = {
  tf3: '/brand/transport-sm.webp',
  pz2: '/brand/zoo-sm.webp',
  fm: '/brand/football-sm.webp',
};

export function Landing() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <section className="grid items-center gap-8 py-10 md:grid-cols-2 md:py-16">
        <div>
          <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">{t('landing.title')}</h1>
          <p className="mt-4 text-lg text-brun">{t('landing.subtitle')}</p>
          <Link to="/login" className="btn-primary mt-8">
            {t('landing.cta')}
          </Link>
        </div>
        <img src="/brand/mascotte.webp" alt="" className="mx-auto w-full max-w-sm" />
      </section>

      <section className="py-10">
        <h2 className="text-2xl font-semibold">{t('landing.gamesTitle')}</h2>
        <div className="mt-6 grid gap-6 sm:grid-cols-3">
          {Object.values(GAMES).map((g) => (
            <article key={g.id} className="card flex flex-col items-center text-center">
              <img src={ILLUSTRATION[g.id]} alt="" className="h-40 w-auto" loading="lazy" />
              <h3 className="mt-4 text-lg font-semibold">{t('landing.for', { game: g.name })}</h3>
              <span
                className={`mt-2 rounded-full px-3 py-1 text-xs font-bold ${
                  g.status === 'available' ? 'bg-eau/30 text-canard' : 'bg-canard/10 text-canard/70'
                }`}
              >
                {g.status === 'available' ? t('landing.available') : t('landing.soon')}
              </span>
            </article>
          ))}
        </div>
      </section>

      <footer className="border-t border-canard/10 py-8 text-xs text-canard/60">{t('landing.disclaimer')}</footer>
    </div>
  );
}
