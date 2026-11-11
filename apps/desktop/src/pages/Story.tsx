import { useTranslation } from 'react-i18next';
import { Discord } from './Discord';
import { Gazette } from './Gazette';
import { Press } from './Press';

const TITLE = { gazette: 'layout.navShort.gazette', presse: 'layout.navShort.press', discord: 'layout.navShort.discord' } as const;

/** Gazette, Presse ou Live Discord : chacun a son entrée dans la barre latérale, un titre et une phrase qui dit ce qu'on y trouve. */
export function Story({ tab }: { tab: 'gazette' | 'presse' | 'discord' }) {
  const { t } = useTranslation();
  return (
    <div className="w-full px-6 py-6 xl:px-10">
      <p className="text-xs font-bold uppercase tracking-wide text-canard/50">{t('layout.groups.story')}</p>
      <h1 className="text-3xl font-semibold">{t(TITLE[tab])}</h1>
      <p className="mb-5 mt-1 max-w-3xl text-sm text-brun">{t(`layout.storySub.${tab}`)}</p>
      {tab === 'gazette' ? <Gazette /> : tab === 'presse' ? <Press /> : <Discord />}
    </div>
  );
}
