import { useTranslation } from 'react-i18next';
import { PageTitle } from '../components/PageTitle';
import { Discord } from './Discord';
import { Gazette } from './Gazette';
import { Press } from './Press';

const TITLE = { gazette: 'layout.navShort.gazette', presse: 'layout.navShort.press', discord: 'layout.navShort.discord' } as const;

/** Gazette, Presse ou Live Discord : chacun a son entrée dans la barre latérale, un titre et une phrase qui dit ce qu'on y trouve. */
export function Story({ tab }: { tab: 'gazette' | 'presse' | 'discord' }) {
  const { t } = useTranslation();
  return (
    <div className="w-full px-6 py-6 xl:px-10">
      <PageTitle eyebrow={t('layout.groups.story')} title={t(TITLE[tab])}>
        {t(`layout.storySub.${tab}`)}
      </PageTitle>
      {tab === 'gazette' ? <Gazette /> : tab === 'presse' ? <Press /> : <Discord />}
    </div>
  );
}
