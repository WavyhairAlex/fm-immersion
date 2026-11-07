import { useTranslation } from 'react-i18next';
import type { ModeId } from '../lib/modes';

/** Mode prévu mais pas encore construit : on explique ce qu'il fera. */
export function Soon({ mode }: { mode: ModeId }) {
  const { t } = useTranslation();
  return (
    <div className="w-full px-6 py-6 xl:px-10">
      <div className="flex items-center gap-3">
        <h1 className="text-3xl font-semibold">{t(`modes.${mode}.title`)}</h1>
        <span className="pill bg-canard/10">{t('modes.soon')}</span>
      </div>
      <div className="card mt-6 max-w-3xl">
        <p className="text-brun">{t(`modes.${mode}.details`)}</p>
      </div>
    </div>
  );
}
