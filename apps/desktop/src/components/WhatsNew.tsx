import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { entriesToShow, entryLines, markSeen, readSeen, type WhatsNewEntry } from '../lib/whats-new';

/** Date de sortie lisible : « 9 novembre 2026 ». */
export function releaseDate(date: string, lang: string) {
  const d = new Date(`${date}T12:00:00`);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString(lang.startsWith('en') ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Une version et ses nouveautés, en liste à puces. */
export function WhatsNewBlock({ entry }: { entry: WhatsNewEntry }) {
  const { t, i18n } = useTranslation();
  return (
    <section>
      <h3 className="flex flex-wrap items-baseline gap-x-2 font-display text-lg font-semibold">
        {t('whatsNew.version', { version: entry.version })}
        <span className="font-sans text-xs font-bold text-brun">{releaseDate(entry.date, i18n.language)}</span>
      </h3>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
        {entryLines(entry, i18n.language).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Fenêtre « Quoi de neuf », montrée une fois au démarrage qui suit une mise à jour, avec les notes des versions
 * pas encore vues. La version est notée comme vue dès l'affichage : fermer l'appli ne la fait pas revenir.
 */
export function WhatsNew() {
  const { t } = useTranslation();
  const [entries] = useState(() => {
    const { seen, usedBefore } = readSeen();
    return entriesToShow(seen, __APP_VERSION__, usedBefore);
  });
  const [open, setOpen] = useState(entries.length > 0);

  useEffect(() => {
    markSeen(__APP_VERSION__);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;
  const close = () => setOpen(false);
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="whats-new-title" onClick={close}>
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-white text-canard shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-canard/10 px-6 pb-4 pt-5">
          <p className="text-xs font-extrabold uppercase tracking-wider text-orange-fonce">{t('whatsNew.kicker', { version: __APP_VERSION__ })}</p>
          <h2 id="whats-new-title" className="mt-1 font-display text-2xl font-semibold">
            {t('whatsNew.title')}
          </h2>
          <p className="mt-1 text-sm text-brun">{t('whatsNew.intro')}</p>
        </div>
        <div className="space-y-5 overflow-y-auto px-6 py-4">
          {entries.map((e) => (
            <WhatsNewBlock key={e.version} entry={e} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-canard/10 px-6 py-4">
          <button type="button" className="btn-primary" onClick={close} autoFocus>
            {t('whatsNew.ok')}
          </button>
          <Link to="/nouveautes" className="text-sm font-bold text-orange-fonce hover:underline" onClick={close}>
            {t('whatsNew.history')}
          </Link>
        </div>
      </div>
    </div>,
    document.body,
  );
}
