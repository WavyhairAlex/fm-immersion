import { useTranslation } from 'react-i18next';
import { WhatsNewBlock } from '../components/WhatsNew';
import { WHATS_NEW } from '../lib/whats-new';

/** Historique des nouveautés, de la plus récente à la plus ancienne (lien du numéro de version, barre latérale). */
export function WhatsNewPage() {
  const { t } = useTranslation();
  return (
    <div className="w-full px-6 py-6 xl:px-10">
      <h1 className="text-3xl font-semibold">{t('whatsNew.pageTitle')}</h1>
      <p className="mt-1 text-brun">{t('whatsNew.pageIntro', { version: __APP_VERSION__ })}</p>
      <div className="card mt-6 max-w-3xl space-y-6">
        {WHATS_NEW.map((e) => (
          <WhatsNewBlock key={e.version} entry={e} />
        ))}
      </div>
    </div>
  );
}
