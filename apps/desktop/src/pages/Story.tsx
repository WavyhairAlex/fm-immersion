import { useTranslation } from 'react-i18next';
import { PageTitle } from '../components/PageTitle';
import { Discord } from './Discord';
import { Feed } from './Feed';
import { Gazette } from './Gazette';
import { Press } from './Press';

const TITLE = { gazette: 'layout.navShort.gazette', presse: 'layout.navShort.press', discord: 'layout.navShort.discord', fil: 'layout.navShort.feed' } as const;

/** Gazette, Presse, Le Fil ou Live Discord : chacun a son entrée dans la barre latérale, un titre et une phrase qui dit ce qu'on y trouve. */
export function Story({ tab }: { tab: 'gazette' | 'presse' | 'fil' | 'discord' }) {
  const { t } = useTranslation();
  return (
    <div className="page">
      <PageTitle eyebrow={t('topbar.media')} title={t(TITLE[tab])}>
        {t(`layout.storySub.${tab}`)}
      </PageTitle>
      {tab === 'gazette' ? <Gazette /> : tab === 'presse' ? <Press /> : tab === 'fil' ? <Feed /> : <Discord />}
    </div>
  );
}
