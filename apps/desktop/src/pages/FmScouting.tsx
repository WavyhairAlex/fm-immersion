import {
  POS_LABEL,
  POS_ORDER,
  baseTarget,
  buildProject,
  clubFinances,
  clubReach,
  rankTargets,
  reachCaps,
  tradeIdeas,
  valueModel,
  type ClubReach,
  type DbPlayer,
  type FmPlayer,
  type FmSnapshot,
  type OwnAbility,
  type PlayRole,
  type PosCode,
  type ReachLevel,
  type TradeIdea,
  type TradeKind,
} from '@fm-immersion/module-fm';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fmData } from '../lib/data';
import { PosBadge } from './FmFoot';
import { useTacticEngine } from './FmTactic';
import { Chips, Empty, Fit, Kpi, More, Panel, Tag, useCoach, useFormat, type Tone } from './FmUi';

/** Ce que l'on cherche : chaque repère lit une tranche différente de la base (la lecture garde 300 joueurs, meilleur CA d'abord). */
type Preset = 'all' | TradeKind;
const PRESETS: Preset[] = ['all', 'nugget', 'undervalued', 'expiring', 'free'];
const PRESET_FILTER: Record<Preset, { maxAge?: number; freeOnly?: boolean }> = {
  all: { maxAge: 25 },
  nugget: { maxAge: 21 },
  undervalued: { maxAge: 24 },
  expiring: { maxAge: 27 },
  free: { maxAge: 27, freeOnly: true },
};
type Sort = 'perYear' | 'profit' | 'roi';

const KIND_TONE: Record<TradeKind, Tone> = { nugget: 'good', undervalued: 'good', expiring: 'info', free: 'info' };
const ROLE_TONE: Record<PlayRole, Tone> = { starter: 'good', backup: 'info', none: 'warn' };
const REACH_TONE: Record<ReachLevel, Tone> = { easy: 'good', possible: 'info', hard: 'warn', out: 'bad' };

/**
 * Repérage (la data du mercato) : dans toute la base de FM27, lue en mémoire à la demande, les joueurs à acheter peu
 * cher, faire progresser puis revendre. Achat, salaires, progression et revente estimés (`trading.ts`), place dans le
 * projet (titulaire, doublure ou à prêter) et portée du club.
 */
export function FmScouting({ saveId, snap, players, folder, gameDate }: { saveId: string; snap?: FmSnapshot; players: FmPlayer[]; folder: string; gameDate: string }) {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const { engine } = useTacticEngine(folder, players);
  const [coach] = useCoach();
  const own = useMemo(() => players.filter((p) => !p.injury && Object.keys(p.attributes).length), [players]);
  const pr = useMemo(() => buildProject(engine, own, coach), [engine, own, coach]);
  const fin = useMemo(() => (snap ? clubFinances(snap, players) : null), [snap, players]);
  const [preset, setPreset] = useState<Preset>('all');
  const [positions, setPositions] = useState<PosCode[]>([]);
  const [sort, setSort] = useState<Sort>('perYear');
  const [shown, setShown] = useState(25);

  const { data: rows } = useQuery({ queryKey: ['fm', saveId, 'targets', gameDate], queryFn: () => fmData.targets(saveId) });
  const followed = useMemo(() => new Set((rows ?? []).map((r) => r.playerId)), [rows]);
  const add = useMutation({
    mutationFn: (p: DbPlayer) => fmData.addBaseTarget(saveId, p, gameDate),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fm', saveId, 'targets'] }),
  });

  const search = useMutation({
    mutationFn: async ({ preset, positions }: { preset: Preset; positions: PosCode[] }) => {
      const mine = await invoke<{ players: (OwnAbility & { id: number; ca: number })[] }>('fm_memory_abilities');
      const club: ClubReach = clubReach(mine.players, players, fin);
      const found = await invoke<DbPlayer[]>('fm_memory_search', {
        filter: { positions, excludeInjured: true, excludeOwn: true, limit: 300, ...PRESET_FILTER[preset], ...reachCaps(club) },
      });
      return { club, found, preset };
    },
  });
  const run = (p: Preset, pos: PosCode[]) => {
    setShown(25);
    search.mutate({ preset: p, positions: pos });
  };

  const result = useMemo(() => {
    const d = search.data;
    if (!d) return null;
    // Place de chaque joueur dans le onze cible : la progression dépend de son temps de jeu.
    const targets = d.found.flatMap((p) => baseTarget(p) ?? []);
    const ranked = pr ? rankTargets(engine, targets, pr, own) : [];
    const fit = new Map(ranked.map((r) => [r.target.id.replace(/^t/, ''), r.best]));
    const play = new Map<string, PlayRole>([...fit].map(([id, b]) => [id, b?.verdict ?? 'none']));
    const ideas = tradeIdeas(d.found, d.club, gameDate, { play }).filter((x) => d.preset === 'all' || x.kinds.includes(d.preset));
    const key = (x: TradeIdea) => (sort === 'profit' ? x.profit : sort === 'roi' ? (x.buy === 0 ? Infinity : (x.roi ?? 0)) : x.profit / x.years);
    ideas.sort((a, b) => key(b) - key(a));
    return { ideas, fit, read: d.found.length, model: valueModel(d.found) };
  }, [search.data, engine, pr, own, gameDate, sort]);

  const togglePos = (p: PosCode) => setPositions((xs) => (xs.includes(p) ? xs.filter((x) => x !== p) : [...xs, p]));
  const best = result?.ideas[0];
  const freeCount = result?.ideas.filter((x) => x.buy === 0).length ?? 0;

  return (
    <div className="space-y-5">
      <Panel title={t('fm.scout.title')}>
        <p className="text-sm text-brun">{t('fm.scout.lead')}</p>
        <div className="mt-3">
          <p className="text-xs font-bold text-canard">{t('fm.scout.preset')}</p>
          <div className="mt-1">
            <Chips
              value={preset}
              options={PRESETS.map((p) => [p, t(`fm.scout.presets.${p}`)])}
              onChange={(p) => {
                setPreset(p);
                if (search.data) run(p, positions);
              }}
            />
          </div>
          <p className="mt-1 text-xs text-brun">{t(`fm.scout.presetHelp.${preset}`)}</p>
        </div>
        <div className="mt-3">
          <p className="text-xs font-bold text-canard">{t('fm.scout.positions')}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {POS_ORDER.map((p) => (
              <button key={p} type="button" onClick={() => togglePos(p)} className={`chip ${positions.includes(p) ? 'chip-on' : ''}`}>
                {POS_LABEL[p]}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" className="btn-primary" disabled={search.isPending} onClick={() => run(preset, positions)}>
            {search.isPending ? t('fm.memory.reading') : search.data ? t('fm.scout.rerun') : t('fm.scout.run')}
          </button>
          {search.isError && <p className="text-sm text-corail">{t('fm.memory.error', { reason: String((search.error as Error)?.message ?? search.error) })}</p>}
        </div>
        <More>{t('fm.scout.help')}</More>
      </Panel>

      {result && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label={t('fm.scout.kpi.ideas')} value={result.ideas.length} sub={t('fm.scout.kpi.read', { count: result.read })} />
            <Kpi label={t('fm.scout.kpi.best')} value={best ? f.signed(best.profit) : '–'} sub={best ? t('fm.scout.kpi.bestSub', { name: best.player.name, count: best.years }) : undefined} tone={best ? 'good' : undefined} />
            <Kpi label={t('fm.scout.kpi.free')} value={freeCount} sub={t('fm.scout.kpi.freeSub')} />
            <Kpi label={t('fm.scout.kpi.model')} value={result.model.n ? t('fm.scout.kpi.modelFit') : t('fm.scout.kpi.modelGeneric')} sub={result.model.n ? t('fm.scout.kpi.modelSub', { count: result.model.n }) : t('fm.scout.kpi.modelGenericSub')} />
          </div>

          <Panel
            title={t('fm.scout.list')}
            action={<Chips value={sort} options={(['perYear', 'profit', 'roi'] as Sort[]).map((s) => [s, t(`fm.scout.sort.${s}`)])} onChange={setSort} />}
          >
            {result.ideas.length === 0 ? (
              <Empty>{t('fm.scout.none')}</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead className="text-left text-canard/70">
                    <tr>
                      {['player', 'role', 'growth', 'buy', 'wages', 'sale', 'profit', 'reach', ''].map((k) => (
                        <th key={k} className="px-2 py-1">
                          {k && t(`fm.scout.col.${k}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.ideas.slice(0, shown).map((x) => {
                      const p = x.player;
                      const b = result.fit.get(String(p.id));
                      return (
                        <tr key={p.id} className="border-t border-canard/5 align-top hover:bg-creme/60">
                          <td className="px-2 py-1.5">
                            <span className="font-bold">{p.name}</span> <span className="text-xs text-brun">{t('fm.scout.age', { count: p.age ?? 0 })}</span>
                            <div className="text-xs text-brun">
                              {p.club ?? t('fm.dbSearch.free')}
                              {p.division && <> · {p.division}</>}
                            </div>
                            <div className="mt-0.5 flex flex-wrap gap-1">
                              {x.kinds.map((k) => (
                                <Tag key={k} tone={KIND_TONE[k]}>
                                  {t(`fm.scout.kind.${k}`)}
                                </Tag>
                              ))}
                            </div>
                          </td>
                          <td className="px-2 py-1.5">
                            <div className="flex items-center gap-1.5">
                              {b && <PosBadge pos={b.slot.pos} />}
                              <Fit value={b?.fit} />
                            </div>
                            <div className="mt-0.5">
                              <Tag tone={ROLE_TONE[x.role ?? 'none']}>{t(`fm.scout.role.${x.role ?? 'none'}`)}</Tag>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-2 py-1.5 tabular-nums">
                            <span className="font-bold">{p.ca}</span> → <span className="font-bold text-eau-fonce">{Math.round(x.caAtSale)}</span>
                            <div className="text-xs text-brun">{t('fm.scout.pa', { pa: p.pa < 0 ? `~${x.pa}` : x.pa })}</div>
                          </td>
                          <td className="whitespace-nowrap px-2 py-1.5 tabular-nums">
                            {x.buy === 0 ? <Tag tone="good">{t('fm.scout.costless')}</Tag> : f.money(x.buy)}
                            {x.priceRatio != null && <div className="text-xs text-brun">{t('fm.scout.ratio', { pct: Math.round(x.priceRatio * 100) })}</div>}
                            {x.months != null && <div className="text-xs text-brun">{t('fm.scout.months', { count: Math.max(0, x.months) })}</div>}
                          </td>
                          <td className="whitespace-nowrap px-2 py-1.5 tabular-nums">
                            {f.money(x.wages)}
                            <div className="text-xs text-brun">{t('fm.scout.seasons', { count: x.years })}</div>
                          </td>
                          <td className="whitespace-nowrap px-2 py-1.5 tabular-nums">
                            {f.money(x.sale)}
                            <div className="text-xs text-brun">{t('fm.scout.saleAt', { age: x.ageAtSale })}</div>
                          </td>
                          <td className="whitespace-nowrap px-2 py-1.5 tabular-nums">
                            <span className="font-bold text-eau-fonce">{f.signed(x.profit)}</span>
                            <div className="text-xs text-brun">{x.buy === 0 || x.roi == null ? t('fm.scout.roiFree') : t('fm.scout.roi', { pct: Math.round(x.roi * 100) })}</div>
                          </td>
                          <td className="px-2 py-1.5">
                            <Tag tone={REACH_TONE[x.reach.level]}>{t(`fm.reach.level.${x.reach.level}`)}</Tag>
                            {/* Le prêt ne compte pas ici : on achète pour revendre. */}
                            {x.reach.why.some((w) => w !== 'loan') && <div className="mt-0.5 text-xs text-brun">{x.reach.why.filter((w) => w !== 'loan').map((w) => t(`fm.reach.why.${w}`)).join(', ')}</div>}
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            {followed.has(String(p.id)) ? (
                              <Tag tone="good">{t('fm.dbSearch.followed')}</Tag>
                            ) : (
                              <button type="button" className="text-xs font-bold text-orange-fonce hover:underline" disabled={add.isPending} onClick={() => add.mutate(p)}>
                                {t('fm.dbSearch.add')}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {result.ideas.length > shown && (
                  <button type="button" className="btn-secondary mt-3" onClick={() => setShown((n) => n + 25)}>
                    {t('fm.scout.more', { count: result.ideas.length - shown })}
                  </button>
                )}
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
