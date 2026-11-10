import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { Discord } from './Discord';
import { Gazette } from './Gazette';
import { Press } from './Press';

/** « Gazette et Discord » : le journal de la carrière, la conférence de presse et l'envoi dans un salon Discord, sur un seul écran. */
export function Story({ tab }: { tab: 'gazette' | 'presse' | 'discord' }) {
  const { t } = useTranslation();
  const link = ({ isActive }: { isActive: boolean }) =>
    `-mb-px rounded-t-lg border-b-2 px-3 py-1.5 text-sm font-bold ${isActive ? 'border-orange text-canard' : 'border-transparent text-canard/60 hover:text-canard'}`;
  return (
    <div className="w-full px-6 py-6 xl:px-10">
      <p className="text-xs font-bold uppercase tracking-wide text-canard/50">{t('layout.groups.story')}</p>
      <h1 className="text-3xl font-semibold">{t('layout.nav.story')}</h1>
      <nav className="mb-5 mt-3 flex gap-1 border-b border-canard/10" aria-label={t('layout.nav.story')}>
        <NavLink to="/gazette" className={link}>
          {t('modes.gazette.title')}
        </NavLink>
        <NavLink to="/presse" className={link}>
          {t('modes.press.title')}
        </NavLink>
        <NavLink to="/discord" className={link}>
          {t('modes.discord.title')}
        </NavLink>
      </nav>
      {tab === 'gazette' ? <Gazette /> : tab === 'presse' ? <Press /> : <Discord />}
    </div>
  );
}
