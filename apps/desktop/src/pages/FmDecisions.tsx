import { POS_LABEL, decisions, formationOfSlots, knownFormation, styleOfGameTactic, tacticSlots, type Basis, type Decision, type FmPlayer, type FmSnapshot, type SquadAt } from '@fm-immersion/module-fm';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useTacticChoice } from './FmTactic';
import { useLeaving } from './FmLeaving';
import { Empty, More, Panel, Tag, useCoach, useNames, type Tone } from './FmUi';

const KIND_TONE: Record<Decision['kind'], Tone> = { contract: 'warn', recruit: 'info', departure: 'info', tactic: 'good' };
const BASIS_TONE: Record<Basis, Tone> = { read: 'good', real: 'good', computed: 'info' };
/** Écran où trouver le détail de chaque type de décision. */
const KIND_VIEW: Record<Decision['kind'], string> = { contract: 'contracts', recruit: 'project', departure: 'mercato', tactic: 'tactic' };

/** Décisions calculées pour l'accueil (cartes « Décisions » et plan d'intersaison), une seule fois. */
export function useDecisions(snap: FmSnapshot, players: FmPlayer[], folder: string, history: SquadAt[] = []): Decision[] {
  const { engine } = useTacticChoice(players, folder, null);
  const [coach] = useCoach();
  const gameTactic = typeof snap.tactic?.name === 'string' ? snap.tactic.name : null;
  const base = useMemo(() => styleOfGameTactic(gameTactic, engine.ref.styles), [gameTactic, engine]);
  const { ids: leavingIds } = useLeaving();
  const baseForm = useMemo(() => knownFormation(gameTactic) ?? formationOfSlots(tacticSlots(snap.tactic)), [gameTactic, snap.tactic]);
  return useMemo(() => decisions(engine, players, snap.gameDate, coach, history, base, leavingIds, baseForm), [engine, players, snap.gameDate, coach, history, base, leavingIds, baseForm]);
}

/** Valeurs des textes d'une décision (noms, poste, styles traduits). */
export function useDecisionVals() {
  const names = useNames();
  return (d: Decision) => ({
    ...d.values,
    names: d.players.map((p) => p.name).join(', '),
    pos: d.pos ? POS_LABEL[d.pos] : '',
    style: d.style ? names.style(d.style) : '',
    other: d.other ? names.style(d.other) : '',
    count: Number(d.values.years ?? 0),
  });
}

/** Décisions à prendre : une carte par décision (quoi, pourquoi, avant quand, sur quoi repose le conseil). */
export function FmDecisions({ list, go }: { list: Decision[]; go: (view: string) => void }) {
  const { t, i18n } = useTranslation();
  const vals = useDecisionVals();
  const date = new Intl.DateTimeFormat(i18n.resolvedLanguage, { day: 'numeric', month: 'short', year: 'numeric' });
  const when = (d: Decision) => (d.deadline ? t('fm.dec.before', { date: date.format(new Date(`${d.deadline}T00:00:00Z`)) }) : t('fm.dec.anytime'));

  // Rien à décider : une ligne discrète plutôt qu'un grand cadre vide.
  if (!list.length)
    return (
      <p className="card flex items-center gap-2 px-5 py-3 text-sm text-brun">
        <span className="h-2 w-2 rounded-full bg-eau" aria-hidden />
        {t('fm.dec.none')}
      </p>
    );
  return (
    <Panel title={t('fm.dec.title', { count: list.length })}>
      <More>{t('fm.dec.help')}</More>
      {list.length ? (
        <ul className="space-y-2">
          {list.map((d, i) => {
            const v = vals(d);
            return (
              <li key={i}>
                <button type="button" className="w-full rounded-xl bg-creme/50 px-3 py-2 text-left text-sm hover:bg-creme" onClick={() => go(KIND_VIEW[d.kind])}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span>
                      <Tag tone={KIND_TONE[d.kind]}>{t(`fm.dec.kind.${d.kind}`)}</Tag> <b className="text-canard">{t(`fm.dec.action.${d.action}`, v)}</b>
                    </span>
                    <span className="text-xs font-bold text-canard/70">{when(d)}</span>
                  </div>
                  <p className="mt-0.5 text-brun">{t(`fm.dec.why.${d.why}`, v)}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-brun">
                    <Tag tone={BASIS_TONE[d.basis]}>{t(`fm.dec.basis.${d.basis}`)}</Tag>
                    {d.unless && <span>{t(`fm.dec.unless.${d.unless}`, v)}</span>}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty>{t('fm.dec.none')}</Empty>
      )}
    </Panel>
  );
}
