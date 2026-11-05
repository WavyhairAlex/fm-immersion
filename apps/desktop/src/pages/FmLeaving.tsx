import { LEAVING_REASONS, type FmPlayer, type LeavingMarks, type LeavingReason } from '@simloom/module-fm';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fmData } from '../lib/data';
import { useFmSaveScope } from '../lib/save-store';
import { Tag } from './FmUi';

/**
 * Partants signalés par le coach (refus de prolonger, laissé libre, vendu, veut partir), gardés dans la partie.
 * Le mercato planifie sans eux et cherche leur remplaçant.
 */
export function useLeaving() {
  const { saveId } = useFmSaveScope();
  const qc = useQueryClient();
  const key = ['fm', saveId, 'settings'];
  const { data: settings } = useQuery({ queryKey: key, queryFn: () => fmData.settings(saveId), enabled: !!saveId });
  const marks: LeavingMarks = useMemo(() => settings?.fmLeaving ?? {}, [settings]);
  const ids = useMemo(() => new Set(Object.keys(marks)), [marks]);
  const set = useMutation({
    mutationFn: ({ player, reason, gameDate }: { player: FmPlayer; reason: LeavingReason | null; gameDate: string }) =>
      fmData.setLeaving(saveId, player.id, reason ? { reason, since: gameDate, name: player.name } : null),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
  return { marks, ids, set };
}

/**
 * « Il part » : choisir la raison signale le joueur partant ; s'il l'est déjà, sa raison et « Annuler ».
 * `onMarked` est appelé juste après un signalement (pour lancer la recherche du remplaçant).
 */
export function LeaveButton({ player, gameDate, onMarked }: { player: FmPlayer; gameDate: string; onMarked?: (id: string) => void }) {
  const { t } = useTranslation();
  const { marks, set } = useLeaving();
  const [open, setOpen] = useState(false);
  const mark = marks[player.id];
  if (mark)
    return (
      <span className="inline-flex items-center gap-1.5">
        <Tag tone="bad">{t(`fm.leave.reason.${mark.reason}`)}</Tag>
        <button type="button" className="text-xs font-bold text-eau-fonce hover:underline" disabled={set.isPending} onClick={() => set.mutate({ player, reason: null, gameDate })}>
          {t('fm.leave.cancel')}
        </button>
      </span>
    );
  if (!open)
    return (
      <button type="button" className="text-xs font-bold text-eau-fonce hover:underline" onClick={() => setOpen(true)}>
        {t('fm.leave.mark')}
      </button>
    );
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {LEAVING_REASONS.map((reason) => (
        <button
          key={reason}
          type="button"
          className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-canard ring-1 ring-canard/15 hover:bg-creme"
          disabled={set.isPending}
          onClick={() =>
            set.mutate(
              { player, reason, gameDate },
              {
                onSuccess: () => {
                  setOpen(false);
                  onMarked?.(player.id);
                },
              },
            )
          }
        >
          {t(`fm.leave.reason.${reason}`)}
        </button>
      ))}
      <button type="button" className="text-xs text-brun hover:underline" onClick={() => setOpen(false)}>
        {t('fm.leave.close')}
      </button>
    </span>
  );
}
