import {
  POS_LABEL,
  REACH_ORDER,
  baseTarget,
  clubReach,
  divisionLevels,
  replacementFor,
  replacementPositions,
  reachCaps,
  reachOf,
  storedTargets,
  type DbPlayer,
  type DivisionLevel,
  type FmPlayer,
  type OwnAbility,
  type Project,
  type Reach,
  type ReachLevel,
  type ReplacementCandidate,
  type TacticEngine,
  type Target,
} from '@fm-immersion/module-fm';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PosBadge } from './FmFoot';
import { fmData } from '../lib/data';
import { CompatTag, Empty, Fit, More, Panel, Tag, fitGap, useNames, type Tone } from './FmUi';

type Engine = TacticEngine;

const VERDICT_TONE: Record<'better' | 'holds' | 'recruit', Tone> = { better: 'good', holds: 'info', recruit: 'warn' };
const REACH_TONE: Record<ReachLevel, Tone> = { easy: 'good', possible: 'info', hard: 'warn', out: 'bad' };

/** Écart de note signé, en vert s'il gagne, en corail s'il perd. */
function Gap({ d }: { d: number }) {
  return <span className={`text-xs font-bold tabular-nums ${d >= 0 ? 'text-eau-fonce' : 'text-corail'}`}>{d >= 0 ? '+' : '−'}{fitGap(Math.abs(d))}</span>;
}

/** Bande de CA cherchée autour du partant : un peu moins bon jusqu'à nettement meilleur. */
const CA_BELOW = 10;
const CA_ABOVE = 25;

/**
 * Remplaçant d'un partant : ses remplaçants possibles au même poste du onze cible, parmi les cibles suivies
 * et, à la demande, dans toute la base du jeu (lecture seule), avec l'écart de note avec lui.
 */
export function ReplacementFinder({
  saveId,
  gameDate,
  engine,
  project,
  leaving,
  squad,
  onClose,
  autoSearch = false,
  finances = null,
}: {
  saveId: string;
  gameDate: string;
  engine: Engine;
  project: Project;
  leaving: FmPlayer;
  squad: FmPlayer[];
  /** Sans bouton Masquer (cadre toujours ouvert, ex. joueur signalé partant). */
  onClose?: () => void;
  /** Lancer d'emblée la recherche dans la base (le joueur vient d'être signalé partant : c'est son action). */
  autoSearch?: boolean;
  /** Budget de transferts (brut du plugin) et marge salariale affichée par mois : ce que le club peut payer. */
  finances?: { transferBudget: number | null; wageRoom: number | null } | null;
}) {
  const { t } = useTranslation();
  const names = useNames();
  const qc = useQueryClient();
  const { data: rows } = useQuery({ queryKey: ['fm', saveId, 'targets', gameDate], queryFn: () => fmData.targets(saveId) });
  const followed = useMemo(() => storedTargets(rows ?? [], squad).filter((x) => !x.dismissed && Object.keys(x.attributes).length), [rows, squad]);
  const followedIds = new Set(followed.map((x) => x.id));

  // Joueurs hors de portée du club (salaire, réputation, indemnité) : masqués sauf demande du joueur.
  const [wide, setWide] = useState(false);
  // Recherche dans la base : CA réel du partant (lu en mémoire), puis joueurs du même poste dans une bande de CA,
  // plafonnés à ce que le club peut attirer et payer (repères tirés de son propre effectif lu dans la base).
  const search = useMutation({
    mutationFn: async (all: boolean) => {
      const own = await invoke<{ players: (OwnAbility & { id: number; ca: number })[] }>('fm_memory_abilities');
      const me = own.players.find((x) => String(x.id) === leaving.id);
      const ca = me?.ca ?? null;
      const club = clubReach(own.players, squad, finances, me?.wageWeekly ?? 0);
      const found = await invoke<DbPlayer[]>('fm_memory_search', {
        filter: {
          positions: replacementPositions(engine, project, leaving),
          minCa: ca == null ? undefined : Math.max(0, ca - CA_BELOW),
          maxCa: ca == null ? undefined : ca + CA_ABOVE,
          excludeInjured: true,
          excludeOwn: true,
          limit: 300,
          ...(all ? {} : reachCaps(club)),
        },
      });
      return { ca, found, club, all };
    },
  });
  // Une seule fois par signalement : la lecture de la base reste une action du joueur.
  const started = useRef(false);
  useEffect(() => {
    if (autoSearch && !started.current) {
      started.current = true;
      search.mutate(wide);
    }
  }, [autoSearch, search]);
  const add = useMutation({
    mutationFn: (p: DbPlayer) => fmData.addBaseTarget(saveId, p, gameDate),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fm', saveId, 'targets'] }),
  });

  const raw = useMemo(() => new Map((search.data?.found ?? []).map((p) => [`t${p.id}`, p])), [search.data]);
  // Portée de chaque joueur lu dans la base ; les cibles suivies (choisies par le joueur) ne sont pas jugées.
  const reach = useMemo(() => {
    const d = search.data;
    return new Map<string, Reach>(d ? d.found.map((p) => [`t${p.id}`, reachOf(p, d.club, gameDate)]) : []);
  }, [search.data, gameDate]);
  const hidden = wide ? 0 : [...reach.values()].filter((x) => x.level === 'out').length;
  const r = useMemo(() => {
    const fromBase = (search.data?.found ?? []).flatMap((p) => baseTarget(p) ?? []).filter((x) => wide || reach.get(x.id)?.level !== 'out');
    const pool = new Map<string, Target>([...fromBase, ...followed].map((x) => [x.id, x]));
    const res = replacementFor(engine, project, leaving, [...pool.values()], squad);
    // À la portée du club d'abord (facile, dans ses moyens), puis difficile, puis hors de portée ; la note départage.
    const group = (id: string) => {
      const l = reach.get(id)?.level;
      return l == null || l === 'easy' || l === 'possible' ? 0 : REACH_ORDER.indexOf(l) - 1;
    };
    const candidates = [...res.candidates].sort((a, b) => group(a.player.id) - group(b.player.id));
    // Le meilleur choix se prend d'abord parmi les recrues à la portée du club.
    const easy = [...pool.values()].filter((x) => group(x.id) === 0);
    const upgrade = res.upgrade && group(res.upgrade.player.id) > 0 ? (replacementFor(engine, project, leaving, easy, squad).upgrade ?? res.upgrade) : res.upgrade;
    return { ...res, candidates, upgrade };
  }, [engine, project, leaving, squad, followed, search.data, reach, wide]);

  const line = (c: ReplacementCandidate<Target>) => {
    const d = raw.get(c.player.id);
    const rc = reach.get(c.player.id);
    return (
      <tr key={c.player.id} className="border-b border-canard/5 last:border-0">
        <td className="py-1.5 pr-2 font-bold">
          {c.player.name}
          {followedIds.has(c.player.id) && <> <Tag tone="good">{t('fm.dbSearch.followed')}</Tag></>}
          {r.upgrade?.player.id === c.player.id && <> <Tag tone="good">{t('fm.repl.best')}</Tag></>}
        </td>
        <td className="px-2 py-1.5"><CompatTag c={c.compat} /></td>
        <td className="px-2 py-1.5 tabular-nums">{c.player.age ?? '–'}</td>
        <td className="px-2 py-1.5">
          {c.player.club ?? '–'}
          {d?.division && <div className="text-xs text-brun">{d.division}</div>}
        </td>
        <td className="px-2 py-1.5">
          {rc ? (
            <>
              <Tag tone={REACH_TONE[rc.level]}>{t(`fm.reach.level.${rc.level}`)}</Tag>
              {rc.why.length > 0 && <div className="text-xs text-brun">{rc.why.map((w) => t(`fm.reach.why.${w}`)).join(', ')}</div>}
            </>
          ) : (
            '–'
          )}
        </td>
        <td className="whitespace-nowrap px-2 py-1.5 tabular-nums">{d ? `${d.ca} / ${d.pa < 0 ? '?' : d.pa}` : '–'}</td>
        <td className="px-2 py-1.5"><Fit value={c.fit} /></td>
        <td className="px-2 py-1.5"><Gap d={c.delta} /></td>
        <td className="px-2 py-1.5 text-right">
          {d && !followedIds.has(c.player.id) && (
            <button type="button" className="text-xs font-bold text-orange-fonce hover:underline" disabled={add.isPending} onClick={() => add.mutate(d)}>
              {t('fm.dbSearch.add')}
            </button>
          )}
        </td>
      </tr>
    );
  };

  return (
    <div className="mt-2 rounded-xl border border-canard/10 bg-creme/60 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm">
          {r.slot ? (
            <>
              {t(r.starter ? 'fm.repl.slotStarter' : 'fm.repl.slot', { name: leaving.name })}{' '}
              <PosBadge pos={r.slot.pos} /> {names.role(engine.roles.get(r.slot.ip))} · <Fit value={r.fit} />
            </>
          ) : (
            t('fm.repl.noSlot', { name: leaving.name })
          )}
        </p>
        {onClose && (
          <button type="button" className="text-sm font-bold text-orange-fonce hover:underline" onClick={onClose}>
            {t('fm.bridge.hide')}
          </button>
        )}
      </div>
      {r.slot && (
        <>
          <p className="mt-1 text-xs text-brun">
            {r.internal ? (
              <>
                {t('fm.repl.internal', { name: r.internal.player.name })} <Fit value={r.internal.fit} /> <Gap d={r.internal.delta} /> <CompatTag c={r.internal.compat} />
              </>
            ) : (
              t('fm.repl.noInternal')
            )}
          </p>
          {/* Verdict : le remplaçant fait-il progresser l'équipe vers le projet, ou faut-il recruter ? */}
          <p className="mt-2 rounded-lg bg-white/70 px-3 py-2 text-sm">
            <Tag tone={VERDICT_TONE[r.verdict]}>{t(`fm.repl.verdict.${r.verdict}`)}</Tag>{' '}
            {t(`fm.repl.why.${r.why}`, { name: r.internal?.player.name ?? '', leaving: leaving.name })}
            {r.upgrade && (
              <>
                {' '}
                {t('fm.repl.upgrade', { name: r.upgrade.player.name })} <Gap d={r.upgrade.delta} />
              </>
            )}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" className="btn-secondary" disabled={search.isPending} onClick={() => search.mutate(wide)}>
              {search.isPending ? t('fm.repl.searching') : t('fm.repl.search')}
            </button>
            <label className="flex items-center gap-1 text-xs text-brun">
              <input
                type="checkbox"
                checked={wide}
                onChange={(e) => {
                  setWide(e.target.checked);
                  // La recherche déjà lue était plafonnée : la relire sans plafond pour montrer les autres.
                  if (e.target.checked && search.data && !search.data.all) search.mutate(true);
                }}
              />
              {t('fm.reach.wide')}
            </label>
            {hidden > 0 && <span className="text-xs text-brun">{t('fm.reach.hidden', { count: hidden })}</span>}
            {search.data && (
              <span className="text-xs text-brun">
                {search.data.ca == null ? t('fm.repl.foundNoCa', { count: search.data.found.length }) : t('fm.repl.found', { count: search.data.found.length, min: Math.max(0, search.data.ca - CA_BELOW), max: search.data.ca + CA_ABOVE })}
              </span>
            )}
            {search.isError && <span className="text-xs text-corail">{String(search.error)}</span>}
          </div>
          {r.candidates.length ? (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-canard/60">
                  <tr>
                    <th className="py-1 pr-2">{t('fm.dbSearch.col.player')}</th>
                    <th className="px-2 py-1">{t('fm.col.compat')}</th>
                    <th className="px-2 py-1">{t('fm.dbSearch.col.age')}</th>
                    <th className="px-2 py-1">{t('fm.dbSearch.col.club')}</th>
                    <th className="px-2 py-1">{t('fm.col.reach')}</th>
                    <th className="px-2 py-1">{t('fm.dbSearch.col.caPa')}</th>
                    <th className="px-2 py-1">{t('fm.dbSearch.col.fit')}</th>
                    <th className="px-2 py-1">{t('fm.repl.gap')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>{r.candidates.slice(0, 12).map(line)}</tbody>
              </table>
            </div>
          ) : (
            <p className="mt-2 text-sm text-brun">{t('fm.repl.none')}</p>
          )}
          <More>
            {t('fm.repl.help')} {t('fm.reach.help')}
          </More>
        </>
      )}
    </div>
  );
}

/** Réponse de `fm_memory_division` (voir `src-tauri/src/fm_memory.rs`). */
interface DivisionRead {
  ownClubId: number | null;
  ownDivision: string | null;
  players: DbPlayer[];
}

/**
 * Niveau de la division : le meilleur onze de chaque club de notre championnat (ou d'un autre, par son nom),
 * calculé sur le schéma du projet, lu dans la base du jeu à la demande. Dit où se situe notre onze et quel
 * niveau il faut viser pour jouer le haut du tableau ou l'échelon au-dessus.
 */
export function DivisionLevelPanel({ engine, project, ownXiFit }: { engine: Engine; project: Project; ownXiFit: number | null }) {
  const { t } = useTranslation();
  const [other, setOther] = useState('');
  const read = useMutation({
    mutationFn: async (division: string | null) => invoke<DivisionRead>('fm_memory_division', { division }),
  });
  const levels = useMemo<DivisionLevel[]>(
    () => (read.data ? divisionLevels(engine, project.slots, read.data.players, read.data.ownClubId) : []),
    [read.data, engine, project.slots],
  );
  const n1 = (x: number) => x.toLocaleString(undefined, { maximumFractionDigits: 0 });

  return (
    <Panel title={t('fm.divLevel.title')}>
      <p className="help">{t('fm.divLevel.teaser')}</p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <button type="button" className="btn-secondary" disabled={read.isPending} onClick={() => read.mutate(null)}>
          {t('fm.divLevel.own')}
        </button>
        <label className="block text-xs font-bold text-canard">
          {t('fm.divLevel.other')}
          <input className="input mt-1 w-56 font-normal" placeholder={t('fm.dbSearch.f.divisionHint')} value={other} onChange={(e) => setOther(e.target.value)} />
        </label>
        <button type="button" className="btn-secondary" disabled={read.isPending || !other.trim()} onClick={() => read.mutate(other.trim())}>
          {t('fm.divLevel.compare')}
        </button>
        {read.isPending && <span className="text-xs text-brun">{t('fm.divLevel.reading')}</span>}
        {read.isError && <span className="text-xs text-corail">{String(read.error)}</span>}
      </div>
      {read.data && !levels.length && <Empty>{t('fm.divLevel.none')}</Empty>}
      {levels.map((d) => {
        const own = d.clubs.find((c) => c.own);
        const ours = own?.xiFit ?? ownXiFit;
        return (
          <div key={d.division} className="mt-4">
            <h3 className="font-semibold">
              {d.division} {d.reputation != null && <span className="text-xs font-normal text-brun">· {t('fm.divLevel.reputation', { value: d.reputation })}</span>}
            </h3>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <span>{t('fm.divLevel.top3')} <Fit value={d.top3} /> <span className="text-xs text-brun">CA {n1(d.top3Ca)}</span></span>
              <span>{t('fm.divLevel.median')} <Fit value={d.median} /> <span className="text-xs text-brun">CA {n1(d.medianCa)}</span></span>
              <span>{t('fm.divLevel.bottom')} <Fit value={d.bottom} /></span>
              {ours != null && (
                <span>
                  {t('fm.divLevel.ours')} <Fit value={ours} />
                  {d.top3 != null && <> <Gap d={ours - d.top3} /> <span className="text-xs text-brun">{t('fm.divLevel.vsTop3')}</span></>}
                </span>
              )}
            </div>
            {d.ownRank != null && <p className="mt-1 text-sm">{t('fm.divLevel.rank', { rank: d.ownRank, count: d.clubs.length })}</p>}
            <ol className="mt-2 grid gap-x-6 text-sm sm:grid-cols-2">
              {d.clubs.map((c, i) => (
                <li key={c.clubId} className={`flex items-center justify-between gap-2 border-b border-canard/5 py-1 ${c.own ? 'font-bold' : ''}`}>
                  <span>{i + 1}. {c.club}</span>
                  <span className="flex items-center gap-2"><span className="text-xs text-brun tabular-nums">CA {n1(c.xiCa)}</span><Fit value={c.xiFit} /></span>
                </li>
              ))}
            </ol>
          </div>
        );
      })}
      <More>{t('fm.divLevel.help')}</More>
    </Panel>
  );
}
