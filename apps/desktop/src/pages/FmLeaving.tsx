import { POS_ORDER, LEAVING_REASONS, loanedInFrom, loanedInUntil, type FmPlayer, type FmSnapshot, type LeavingMarks, type LeavingReason } from '@fm-immersion/module-fm';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fmData } from '../lib/data';
import { useFmSaveScope } from '../lib/save-store';
import { More, Tag } from './FmUi';
import { PosBadge } from './FmFoot';

/**
 * Partants signalés par le coach (refus de prolonger, laissé libre, vendu, veut partir), gardés dans la partie.
 * Le mercato planifie sans eux et cherche leur remplaçant.
 */
export function useLeaving() {
  const { saveId } = useFmSaveScope();
  const qc = useQueryClient();
  const key = ['fm', saveId, 'settings'];
  const { data: settings } = useQuery({ queryKey: key, queryFn: () => fmData.settings(saveId), enabled: !!saveId });
  // Prêtés chez nous (lus par le plugin) : partants d'office à la fin du prêt, en plus des signalements du coach.
  const { data: latest } = useQuery({ queryKey: ['fm', saveId, 'latest'], queryFn: () => fmData.latest(saveId), enabled: !!saveId });
  const stored: LeavingMarks = useMemo(() => settings?.fmLeaving ?? {}, [settings]);
  const loanedIn = useMemo(() => (latest ? loanedInFrom(latest.data as FmSnapshot) : new Map<string, string | null>()), [latest]);
  /** Fin du prêt de chaque prêté chez nous (null si le plugin ne la lit pas). */
  const loanUntil = useMemo(() => (latest ? loanedInUntil(latest.data as FmSnapshot) : new Map<string, string | null>()), [latest]);
  const marks: LeavingMarks = useMemo(() => {
    if (!latest || !loanedIn.size) return stored;
    const snap = latest.data as FmSnapshot;
    const auto: LeavingMarks = {};
    for (const [id] of loanedIn) {
      const p = snap.players.find((x) => String(x.id) === id);
      if (p && !stored[id]) auto[id] = { reason: 'loanIn', since: snap.gameDate, name: p.name };
    }
    return { ...auto, ...stored };
  }, [stored, loanedIn, latest]);
  /**
   * `ids` : les partants de la saison (signalés par le coach) : le mercato et les décisions planifient sans eux.
   * Un prêté chez nous n'en fait pas partie : il joue la saison et compte dans les plans (`loanIds`), mais ni vente ni
   * prolongation ; il ne quitte l'effectif qu'à la fin du prêt (`nextSeasonIds`, pour l'intersaison).
   */
  const loanIds = useMemo(() => new Set(Object.entries(marks).filter(([id, m]) => m.reason === 'loanIn' && !stored[id]).map(([id]) => id)), [marks, stored]);
  const ids = useMemo(() => new Set(Object.keys(marks).filter((id) => !loanIds.has(id))), [marks, loanIds]);
  const nextSeasonIds = useMemo(() => new Set(Object.keys(marks)), [marks]);
  const set = useMutation({
    mutationFn: ({ player, reason, gameDate }: { player: FmPlayer; reason: LeavingReason | null; gameDate: string }) =>
      fmData.setLeaving(saveId, player.id, reason ? { reason, since: gameDate, name: player.name } : null),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
  return { marks, ids, loanIds, loanUntil, nextSeasonIds, set, loanedIn, stored };
}

/**
 * « Il part » : choisir la raison signale le joueur partant ; s'il l'est déjà, sa raison et « Annuler ».
 * `onMarked` est appelé juste après un signalement (pour lancer la recherche du remplaçant).
 */
export function LeaveButton({ player, gameDate, onMarked }: { player: FmPlayer; gameDate: string; onMarked?: (id: string) => void }) {
  const { t } = useTranslation();
  const { marks, set, stored, loanedIn } = useLeaving();
  const [open, setOpen] = useState(false);
  const mark = marks[player.id];
  // Prêt lu dans le jeu : rien à annuler, il rentre dans son club à la fin du prêt.
  if (mark && !stored[player.id])
    return <Tag tone="warn">{loanedIn.get(player.id) ? t('fm.leave.loanFrom', { club: loanedIn.get(player.id) }) : t('fm.leave.reason.loanIn')}</Tag>;
  if (mark)
    return (
      <span className="inline-flex items-center gap-1.5">
        <Tag tone="bad">{t(`fm.leave.reason.${mark.reason}`)}</Tag>
        <button type="button" className="text-xs font-bold text-orange-fonce hover:underline" disabled={set.isPending} onClick={() => set.mutate({ player, reason: null, gameDate })}>
          {t('fm.leave.cancel')}
        </button>
      </span>
    );
  if (!open)
    return (
      <button type="button" className="text-xs font-bold text-orange-fonce hover:underline" onClick={() => setOpen(true)}>
        {t('fm.leave.mark')}
      </button>
    );
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {LEAVING_REASONS.map((reason) => (
        <button
          key={reason}
          type="button"
          className="chip !px-2 !py-0.5 !text-xs"
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

/**
 * « Sur le départ » : tout l'effectif en cases à cocher, pour signaler d'un clic les joueurs sous offre ou à vendre.
 * Coché = signalé vendu ; le mercato, « Recrues pour ma tactique » et Saisons planifient sans eux et cherchent
 * leur remplaçant. `interest` : clubs intéressés lus par le plugin (mis en avant).
 */
export function DepartureChecklist({ players, gameDate, interest }: { players: FmPlayer[]; gameDate: string; interest?: ReadonlyMap<string, number> }) {
  const { t } = useTranslation();
  const { marks, set, stored } = useLeaving();
  const list = useMemo(
    () =>
      players
        .filter((p) => !(marks[p.id] && !stored[p.id]))
        .sort((a, b) => POS_ORDER.indexOf(a.positions[0] ?? 'BT') - POS_ORDER.indexOf(b.positions[0] ?? 'BT') || (b.level ?? 0) - (a.level ?? 0)),
    [players, marks, stored],
  );
  const n = list.filter((p) => stored[p.id]).length;
  return (
    <section className="card p-5" aria-labelledby="merc-departures">
      <h2 id="merc-departures" className="font-display text-xl font-semibold">
        {t('fm.leave.check.title', { count: n })}
      </h2>
      <More>{t('fm.leave.check.help')}</More>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {list.map((p) => {
          const on = !!stored[p.id];
          const clubs = interest?.get(p.id) ?? 0;
          return (
            <label key={p.id} className={`chip cursor-pointer ${on ? 'chip-on' : ''}`} title={on ? t(`fm.leave.reason.${stored[p.id]!.reason}`) : undefined}>
              <input
                type="checkbox"
                className="mr-1"
                checked={on}
                disabled={set.isPending}
                onChange={(e) => set.mutate({ player: p, reason: e.target.checked ? 'sold' : null, gameDate })}
              />
              {p.positions[0] && <PosBadge pos={p.positions[0]} />} {p.name}
              {clubs > 0 && <span className="ml-1 text-[11px] font-bold text-orange-fonce">{t('fm.leave.check.interest', { count: clubs })}</span>}
            </label>
          );
        })}
      </div>
    </section>
  );
}
