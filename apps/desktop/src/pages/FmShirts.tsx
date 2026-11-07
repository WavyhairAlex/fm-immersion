import { FORMATIONS, POS_LABEL, lineOf, shirtNumbers, type FmPlayer, type ShirtNumber } from '@fm-immersion/module-fm';
import { useContext, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { LINE_COLOR, Pitch, PosBadge } from './FmFoot';
import { useTacticChoice } from './FmTactic';
import { Empty, More, Panel, PlayerLink, PlayerSheetContext } from './FmUi';

/**
 * Numéros pour toute la saison : on ne tient pas compte de la forme du jour (condition, rythme, moral) ni des
 * blessures et suspensions en cours, sinon le numéro changerait à chaque match.
 */
const seasonLong = (p: FmPlayer): FmPlayer => ({ ...p, condition: null, sharpness: null, morale: null, injury: null, injuryDays: null, suspension: null });

const lastName = (name: string) => name.split(/\s+/).at(-1) ?? name;

/** Numéros de maillot proposés : titulaires 1-11 par poste, doublures +10, puis le reste de l'effectif. */
export function FmShirts({ players, folder, gameFormation, gameTactic }: { players: FmPlayer[]; folder: string; gameFormation: string | null; gameTactic: string | null }) {
  const { t } = useTranslation();
  const open = useContext(PlayerSheetContext);
  // Même style et même schéma que Prochain match > Composition (la tactique de base), onze calculé par FM Immersion.
  const { engine, style, form, pick } = useTacticChoice(players, folder, gameFormation, null, gameTactic);
  const list = useMemo(() => {
    if (!style) return null;
    const season = players.map(seasonLong);
    const pool = season.filter((p) => Object.keys(p.attributes).length > 0);
    if (!pool.length) return null;
    const f = FORMATIONS[form] ? form : (pick?.form ?? '4-3-3');
    // Équipe A : le meilleur onze ; équipe B : le meilleur onze sans les titulaires de A.
    const a = engine.formationPlan(f, style, pool);
    const starters = new Set(a.slots.flatMap((s) => (s.player ? [s.player.id] : [])));
    const b = engine.formationPlan(f, style, pool.filter((p) => !starters.has(p.id)));
    // Les fiches joueur restent celles d'origine (blessure, forme…).
    const byId = new Map(players.map((p) => [p.id, p]));
    const numbers = shirtNumbers(a, b, season).map((n) => ({ ...n, player: byId.get(n.player.id) ?? n.player }));
    return { form: f, slots: a.slots, numbers };
  }, [engine, style, form, pick, players]);

  if (!list) return <Empty>{t('fm.tac.noAttributes')}</Empty>;
  const bySlot = (tier: ShirtNumber['tier'], i: number) => list.numbers.find((n) => n.tier === tier && n.slot === i);
  const rest = list.numbers.filter((n) => n.tier === 'squad');

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,26rem)_1fr]">
        <Panel title={t('fm.shirts.pitch', { form: list.form })}>
          <Pitch className="w-full">
            {list.slots.map((sl, i) => {
              const a = bySlot('A', i);
              const b = bySlot('B', i);
              const c = LINE_COLOR[lineOf(sl.pos)];
              return (
                <div key={i} className="absolute w-24 -translate-x-1/2 -translate-y-1/2 text-center" style={{ left: `${Math.min(86, Math.max(14, sl.x))}%`, top: `${Math.min(90, Math.max(8, sl.y))}%` }}>
                  {a ? (
                    <button type="button" onClick={() => open?.(a.player.id)} className="group inline-flex flex-col items-center" title={`${a.number} · ${a.player.name} · ${POS_LABEL[sl.pos]}`}>
                      <span className={`flex h-8 w-8 items-center justify-center rounded-full font-display text-sm font-bold shadow ring-2 ring-white/80 ${c.bg} ${c.text}`}>{a.number}</span>
                      <span className="mt-0.5 max-w-full truncate rounded bg-white/90 px-1 text-[0.65rem] font-bold text-canard group-hover:bg-white">{lastName(a.player.name)}</span>
                    </button>
                  ) : (
                    <span className="rounded bg-white/60 px-1 text-[0.65rem] font-bold text-canard">{POS_LABEL[sl.pos]} · –</span>
                  )}
                  {b && (
                    <button type="button" onClick={() => open?.(b.player.id)} className="mt-0.5 block w-full truncate rounded bg-canard/60 px-1 text-[0.6rem] font-bold text-white hover:bg-canard/80" title={`${b.number} · ${b.player.name}`}>
                      {b.number} · {lastName(b.player.name)}
                    </button>
                  )}
                </div>
              );
            })}
          </Pitch>
          <p className="mt-2 text-xs text-brun">{t('fm.shirts.legend')}</p>
        </Panel>
        <Panel title={t('fm.shirts.rest', { count: rest.length })}>
          {rest.length ? (
            <div className="table-scroll">
              <table className="data-table">
                <thead className="text-left text-canard/70">
                  <tr>
                    <th className="px-2 py-1">{t('fm.shirts.col.number')}</th>
                    <th className="px-2 py-1">{t('fm.shirts.col.player')}</th>
                    <th className="px-2 py-1">{t('fm.shirts.col.pos')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rest.map((n) => (
                    <tr key={n.player.id}>
                      <td className="px-2 py-1 font-display font-bold tabular-nums text-canard">{n.number}</td>
                      <td className="px-2 py-1">
                        <PlayerLink player={n.player} />
                      </td>
                      <td className="px-2 py-1">{n.pos ? <PosBadge pos={n.pos} /> : '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>{t('fm.shirts.noRest')}</Empty>
          )}
        </Panel>
      </div>
      <More>{t('fm.shirts.how')}</More>
    </div>
  );
}
