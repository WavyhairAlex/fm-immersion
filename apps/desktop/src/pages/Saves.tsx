import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useCareer } from '../lib/career';
import { fmData } from '../lib/data';
import type { FmSaveFile } from '../lib/fm';
import { useFmFolder } from '../lib/fm-sync';
import { BACKUP_KEEP_CHOICES, BACKUP_KEEP_DEFAULT, makeBackup, useBackupErrors, useBackups } from '../lib/save-backup';
import { UNSAVED_DAYS_WARN, useSaveFiles, useSaveStatus } from '../lib/save-files';
import type { Save } from '../lib/saves';

/** « il y a 2 h », « hier »… à partir d'une date réelle en millisecondes. */
function useAgo() {
  const { i18n } = useTranslation();
  const rtf = new Intl.RelativeTimeFormat(i18n.resolvedLanguage, { numeric: 'auto' });
  return (ms: number) => {
    const min = Math.round((ms - Date.now()) / 60_000);
    if (Math.abs(min) < 60) return rtf.format(min, 'minute');
    const h = Math.round(min / 60);
    if (Math.abs(h) < 24) return rtf.format(h, 'hour');
    return rtf.format(Math.round(h / 24), 'day');
  };
}

/** Dossier games affiché : à côté du dossier du plugin (même règle que `games_dir` côté Rust). */
const gamesDirOf = (folder: string) => {
  const parent = folder.replace(/[\\/]+$/, '').replace(/[\\/][^\\/]*$/, '');
  return parent ? `${parent}\\games` : '';
};

/**
 * Mes sauvegardes : les fichiers .fm du dossier games, la carrière que chacun suit, et pour celles-ci la date de jeu
 * de la dernière sauvegarde. Consultatif : l'appli lit le nom, la taille et la date des fichiers, rien d'autre.
 */
export function Saves() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { saveId, fmSaves } = useCareer();
  const folder = useFmFolder(saveId);
  const { data: files, isLoading, isError } = useSaveFiles(folder);
  const settings = useQueries({
    queries: fmSaves.map((s) => ({ queryKey: ['fm', s.id, 'settings'], queryFn: () => fmData.settings(s.id) })),
  });
  const linkOf = new Map<string, Save>();
  fmSaves.forEach((s, i) => {
    const f = settings[i]?.data?.fmSaveFile;
    if (f) linkOf.set(f, s);
  });
  const names = new Set((files ?? []).map((f) => f.name));
  const missing = files ? fmSaves.filter((s, i) => { const f = settings[i]?.data?.fmSaveFile; return f && !names.has(f); }) : [];
  const unlinked = fmSaves.filter((_, i) => settings[i]?.data && !settings[i].data.fmSaveFile);

  const link = useMutation({
    mutationFn: async ({ file, career, previous }: { file: string; career: string; previous?: string }) => {
      if (career) await fmData.linkSave(career, file);
      else if (previous) await fmData.linkSave(previous, null);
    },
    onSuccess: () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'fm' && q.queryKey[2] === 'settings' }),
  });
  const onLink = (file: string, career: string, previous?: string) => link.mutate({ file, career, previous });

  return (
    <div className="w-full px-6 py-6 xl:px-10">
      <h1 className="text-3xl font-semibold">{t('saveFiles.title')}</h1>
      <p className="mt-1 max-w-3xl text-brun">{t('saveFiles.intro', { days: UNSAVED_DAYS_WARN })}</p>

      {!folder ? (
        <div className="card mt-6 max-w-2xl">
          <p className="text-brun">{t('saveFiles.noFolder')}</p>
          <Link to={saveId ? '/reglages' : '/parties'} className="btn-primary mt-4 px-4 py-1.5 text-sm">
            {t(saveId ? 'saveFiles.toSettings' : 'layout.career.create')}
          </Link>
        </div>
      ) : (
        <div className="card mt-6 overflow-x-auto p-4">
          <p className="mb-3 text-xs text-brun">{t('saveFiles.folder', { folder: gamesDirOf(folder) })}</p>
          {isLoading ? (
            <p className="text-sm text-brun">{t('saveFiles.loading')}</p>
          ) : isError || !files?.length ? (
            <p className="text-sm text-brun">{t('saveFiles.empty')}</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('saveFiles.cols.file')}</th>
                  <th>{t('saveFiles.cols.written')}</th>
                  <th>{t('saveFiles.cols.size')}</th>
                  <th>{t('saveFiles.cols.career')}</th>
                  <th>{t('saveFiles.cols.club')}</th>
                  <th>{t('saveFiles.cols.status')}</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <FileRow key={f.name} file={f} career={linkOf.get(f.name)} careers={fmSaves} current={saveId} busy={link.isPending} onLink={onLink} />
                ))}
              </tbody>
            </table>
          )}
          {link.isError && <p className="mt-2 text-sm text-corail">{t('saveFiles.linkError')}</p>}
        </div>
      )}

      {folder &&
        files &&
        fmSaves.map((s, i) => {
          const f = files.find((x) => x.name === settings[i]?.data?.fmSaveFile);
          return f ? <BackupPanel key={s.id} career={s} file={f} /> : null;
        })}

      {missing.length > 0 && (
        <div className="card mt-4 space-y-2 p-4">
          <h2 className="text-lg font-semibold">{t('saveFiles.missingTitle')}</h2>
          {missing.map((s) => (
            <p key={s.id} className="flex flex-wrap items-center gap-3 text-sm">
              <span>
                <strong>{s.name}</strong> · {t('saveFiles.missingFile', { name: settings[fmSaves.indexOf(s)]?.data?.fmSaveFile })}
              </span>
              <button type="button" className="btn-secondary px-3 py-1 text-xs" disabled={link.isPending} onClick={() => link.mutate({ file: '', career: '', previous: s.id })}>
                {t('saveFiles.unlink')}
              </button>
            </p>
          ))}
          <p className="text-xs text-brun">{t('saveFiles.missingHelp')}</p>
        </div>
      )}

      {unlinked.length > 0 && files && files.length > 0 && (
        <p className="mt-4 max-w-3xl text-sm text-brun">{t('saveFiles.unlinked', { names: unlinked.map((s) => s.name).join(', ') })}</p>
      )}
    </div>
  );
}

function FileRow({
  file,
  career,
  careers,
  current,
  busy,
  onLink,
}: {
  file: FmSaveFile;
  career: Save | undefined;
  careers: Save[];
  current: string;
  busy: boolean;
  onLink: (file: string, career: string, previous?: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const ago = useAgo();
  const stampFmt = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: 'medium', timeStyle: 'short' });
  const mbFmt = new Intl.NumberFormat(i18n.resolvedLanguage, { style: 'unit', unit: 'megabyte', maximumFractionDigits: 0 });
  return (
    <tr className={career?.id === current ? 'bg-orange/5' : ''}>
      <td className="font-bold">{file.name.replace(/\.fm$/i, '')}</td>
      <td title={file.modifiedMs != null ? stampFmt.format(new Date(file.modifiedMs)) : undefined}>{file.modifiedMs != null ? ago(file.modifiedMs) : '—'}</td>
      <td>{mbFmt.format(file.bytes / 1_000_000)}</td>
      <td>
        <select
          className="input w-auto py-1 pr-8 text-sm"
          value={career?.id ?? ''}
          disabled={busy}
          aria-label={t('saveFiles.cols.career')}
          onChange={(e) => onLink(file.name, e.target.value, career?.id)}
        >
          <option value="">{t('saveFiles.none')}</option>
          {careers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </td>
      {career ? <LinkedCells career={career} current={career.id === current} /> : <td colSpan={2} className="text-brun">—</td>}
    </tr>
  );
}

/** Club, date de jeu de la dernière sauvegarde et jours de jeu depuis, pour un fichier lié à une carrière. */
function LinkedCells({ career, current }: { career: Save; current: boolean }) {
  const { t, i18n } = useTranslation();
  const { snapshot, savedGameDate, days } = useSaveStatus(career.id, current);
  const dateFmt = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: 'medium' });
  return (
    <>
      <td>
        {snapshot?.club ?? '—'}
        {current && <span className="pill ml-2">{t('saveFiles.followed')}</span>}
      </td>
      <td>
        {days == null ? (
          <span className="text-brun">{t('saveFiles.statusUnknown')}</span>
        ) : days >= UNSAVED_DAYS_WARN ? (
          <span className="num-pill whitespace-nowrap bg-ambre text-canard">{t('saveFiles.unsaved', { count: days })}</span>
        ) : (
          <span className="num-pill whitespace-nowrap bg-eau text-canard">{t('saveFiles.upToDate')}</span>
        )}
        {savedGameDate && <span className="ml-2 text-xs text-brun">{t('saveFiles.savedAt', { date: dateFmt.format(new Date(savedGameDate)) })}</span>}
      </td>
    </>
  );
}

/**
 * Copies de secours de la sauvegarde liée à une carrière : copie automatique après chaque sauvegarde de FM27
 * (option), copie à la demande, liste des copies et dossier où les trouver. La restauration reste manuelle.
 */
function BackupPanel({ career, file }: { career: Save; file: FmSaveFile }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const folder = useFmFolder(career.id);
  const { data: settings } = useQuery({ queryKey: ['fm', career.id, 'settings'], queryFn: () => fmData.settings(career.id) });
  const { data: backups } = useBackups(folder, file.name);
  const autoError = useBackupErrors((s) => s.errors[career.id]);
  const keep = settings?.fmBackupKeep ?? BACKUP_KEEP_DEFAULT;
  const ago = useAgo();
  const stampFmt = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: 'medium', timeStyle: 'short' });
  const mbFmt = new Intl.NumberFormat(i18n.resolvedLanguage, { style: 'unit', unit: 'megabyte', maximumFractionDigits: 0 });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['fm', 'backups', folder, file.name] });
    qc.invalidateQueries({ queryKey: ['fm', career.id, 'settings'] });
  };
  const update = useMutation({
    mutationFn: (patch: { fmBackups?: boolean; fmBackupKeep?: number }) => fmData.updateSettings(career.id, patch),
    onSuccess: refresh,
  });
  const now = useMutation({
    mutationFn: () => makeBackup(career.id, folder, file, keep),
    onSuccess: () => {
      useBackupErrors.getState().set(career.id, null);
      refresh();
    },
  });
  const nowError = now.error ? String(now.error) : null;
  const shownError = nowError ?? autoError;
  return (
    <section className="card mt-4 space-y-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{t('saveBackups.title', { name: file.name.replace(/\.fm$/i, '') })}</h2>
        <span className="text-xs text-brun">{career.name}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={!!settings?.fmBackups} disabled={update.isPending} onChange={(e) => update.mutate({ fmBackups: e.target.checked })} />
          {t('saveBackups.auto')}
        </label>
        <label className="flex items-center gap-1.5">
          {t('saveBackups.keep')}
          <select className="input w-auto py-1 pr-8 text-sm" value={keep} disabled={update.isPending} onChange={(e) => update.mutate({ fmBackupKeep: Number(e.target.value) })}>
            {BACKUP_KEEP_CHOICES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn-primary px-4 py-1.5 text-sm" disabled={now.isPending || !folder} onClick={() => now.mutate()}>
          {t(now.isPending ? 'saveBackups.copying' : 'saveBackups.now')}
        </button>
        <button type="button" className="btn-secondary px-4 py-1.5 text-sm" onClick={() => void invoke('fm_backup_open', { folder, name: file.name }).catch(() => undefined)}>
          {t('saveBackups.open')}
        </button>
      </div>
      <p className="text-xs text-brun">{t('saveBackups.help', { size: mbFmt.format((file.bytes * keep) / 1_000_000) })}</p>
      {shownError && <p className="text-sm text-corail">{t(shownError.includes("cours d'écriture") ? 'saveBackups.busy' : 'saveBackups.error', { error: shownError })}</p>}
      {backups && backups.length > 0 ? (
        <ul className="space-y-1 text-sm">
          {backups.map((b) => (
            <li key={b.name} className="flex flex-wrap gap-x-3">
              <span className="font-bold">{b.name}</span>
              <span className="text-brun" title={b.modifiedMs != null ? stampFmt.format(new Date(b.modifiedMs)) : undefined}>
                {b.modifiedMs != null ? ago(b.modifiedMs) : ''}
              </span>
              <span className="text-brun">{mbFmt.format(b.bytes / 1_000_000)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-brun">{t('saveBackups.none')}</p>
      )}
      <p className="text-xs text-brun">{t('saveBackups.restore')}</p>
    </section>
  );
}
