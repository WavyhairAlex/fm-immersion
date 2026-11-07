import {
  buildProject,
  isUnwanted,
  monthsBetween,
  moraleLevel,
  compatMap,
  gameFormationOf,
  gameLineup,
  forNextMatch,
  loanedOutIds,
  nextMatchInDays,
  normalizePlayer,
  squadSnapshot,
  withAbilities,
  withExtended,
  firstTeamSnapshot,
  type FmPlayer,
  type FmSnapshot,
  type Line,
  type SquadAt,
  formationOfPositions,
  knownFormation,
} from '@fm-immersion/module-fm';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { TodayCards } from '../components/TodayCards';
import { useCareer, useCareerStore } from '../lib/career';
import { clubPath, pageOf, PARTS, VISIBLE_PARTS, type ClubPage } from '../lib/club-nav';
import { fmData } from '../lib/data';
import { importMissingHistory, type FmHistoryFile } from '../lib/fm-history';
import { useFmFolder } from '../lib/fm-sync';
import { FmOtherSaveError, type FmSaveFile } from '../lib/fm';
import { FmSaveScopeContext, type FmSaveScope } from '../lib/save-store';
import { FmAnalysis } from './FmAnalysis';
import { FmBridge } from './FmBridge';
import { FmMemory } from './FmMemory';
import { FmMercato } from './FmMercato';
import { FmCalendar } from './FmCalendar';
import { FmCompare } from './FmCompare';
import { FmContracts } from './FmContracts';
import { FmDepth } from './FmDepth';
import { FmSquadPitch } from './FmSquadPitch';
import { FmDressing } from './FmDressing';
import { FmEffectiveness } from './FmEffectiveness';
import { FmFinances } from './FmFinances';
import { FmHome } from './FmHome';
import { FmLoans } from './FmLoans';
import { FmShirts } from './FmShirts';
import { FmOpponent } from './FmOpponent';
import { FmPlaytime } from './FmPlaytime';
import { FmProgression } from './FmProgression';
import { FmProject } from './FmProject';
import { FmRoles } from './FmRoles';
import { FmStaff } from './FmStaff';
import { FmStats } from './FmStats';
import { FmResults } from './FmResults';
import { FmDiagnosis } from './FmDiagnosis';
import { FmStyle } from './FmStyle';
import { FmTactic, ReserveContext, useTacticEngine } from './FmTactic';
import { FmTargets } from './FmTargets';
import { FmTraining } from './FmTraining';
import { FmWages } from './FmWages';
import { CompatTag, PlayerLink, PlayerSheetContext, useCoach } from './FmUi';
import { FmPlayerSheet } from './FmPlayerSheet';

const LINES: Line[] = ['GB', 'DEF', 'MIL', 'ATT'];

/** Nom d'un écran : son nom propre s'il regroupe plusieurs parties, sinon celui de la partie. */
const pageLabel = (t: (k: string, o?: Record<string, unknown>) => string, v: string) => t(`fm.pages.${v}`, { defaultValue: t(`fm.views.${v}`) });

/**
 * Carrière suivie, vue par écran : « Aujourd'hui » (`page="home"`), un écran du club (`/club/:view`, la partie
 * demandée d'un écran regroupé) ou « Plugin et réglages » (`page="settings"`). La lecture du plugin tourne pour
 * toute l'appli (`useFmSync`) ; ici, on affiche.
 */
export function FmSave({ page }: { page?: 'home' | 'settings' }) {
  const params = useParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { saveId, save, fmSaves } = useCareer();
  const key = ['fm', saveId] as const;

  // Les réglages d'écran d'avant le lien partie ↔ sauvegarde reviennent à la plus ancienne partie FM.
  const scope = useMemo<FmSaveScope | null>(() => {
    if (!saveId) return null;
    const oldest = [...fmSaves].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    return { saveId, inheritsLegacy: oldest?.id === saveId };
  }, [fmSaves, saveId]);
  const { data: snapshot, isLoading } = useQuery({
    queryKey: [...key, 'latest'],
    queryFn: () => fmData.latest(saveId),
    enabled: !!saveId,
  });
  const { data: all } = useQuery({
    queryKey: [...key, 'all'],
    queryFn: () => fmData.all(saveId),
    enabled: !!saveId,
  });
  const { data: settings } = useQuery({
    queryKey: [...key, 'settings'],
    queryFn: () => fmData.settings(saveId),
    enabled: !!saveId,
  });

  // Écran affiché et, pour un écran regroupé, la partie demandée (sous-onglet) ; sinon sa première partie.
  const current = page ?? params.view ?? 'home';
  const view = page === 'settings' ? 'settings' : pageOf(current);
  const go = (v: string) => {
    navigate(clubPath(v));
    window.scrollTo({ top: 0 });
  };
  // Fiche joueur ouverte depuis n'importe quel nom cliquable.
  const [sheet, setSheet] = useState<string | null>(null);
  const folder = useFmFolder(saveId);
  // Ce que le briefing laisse à faire, par écran : une pastille dans la barre latérale (remise à zéro à chaque nouvelle date).
  const setTodo = useCareerStore((s) => s.setTodo);
  const todoAt = `${saveId}|${snapshot?.gameDate ?? ''}`;
  const reportTodo = useCallback((views: string[]) => setTodo({ at: todoAt, views }), [todoAt, setTodo]);

  // Effectif sous contrat (hors essais) : salaires, contrats, finances. Les joueurs prêtés ailleurs et ceux de la
  // réserve ou des jeunes (`team`) n'entrent pas dans les compos ni l'analyse : `players` est l'équipe première
  // présente au club.
  const contracted = useMemo(() => (snapshot ? withAbilities(withExtended(squadSnapshot(snapshot.data))).players.map(normalizePlayer) : []), [snapshot]);
  const players = useMemo(() => {
    const out = snapshot ? loanedOutIds(snapshot.data) : new Set<string>();
    const present = contracted.filter((p) => !p.team && !out.has(p.id));
    // Un blessé rétabli d'ici le prochain match compte pour les compos de ce match.
    return snapshot ? forNextMatch(present, nextMatchInDays(snapshot.data)) : present;
  }, [snapshot, contracted]);
  // Réserve et jeunes présents au club : appelés par les compos quand l'équipe première ne couvre pas un poste.
  const reserve = useMemo(() => {
    const out = snapshot ? loanedOutIds(snapshot.data) : new Set<string>();
    return contracted.filter((p) => p.team && !out.has(p.id));
  }, [snapshot, contracted]);
  const history = useMemo<SquadAt[]>(
    () =>
      (all ?? []).map((h) => ({
        gameDate: h.gameDate,
        players: withAbilities(firstTeamSnapshot(squadSnapshot(h.data as FmSnapshot))).players.map(normalizePlayer),
      })),
    [all],
  );
  const lineup = useMemo(() => gameLineup(snapshot?.data), [snapshot?.data]);
  // Schéma joué : le nom de la tactique s'il désigne un schéma connu, sinon les onze postes lus dans le onze du jeu.
  const gameFormation = useMemo(() => {
    const named = gameFormationOf(snapshot?.data.tactic);
    return (named && knownFormation(named)) || (lineup ? formationOfPositions(lineup.map((s) => s.pos)) : null) || named;
  }, [snapshot?.data.tactic, lineup]);
  // Contenu de chaque écran ; un onglet en affiche une ou plusieurs parties (voir PARTS).
  const part = (v: string) => {
    if (!snapshot) return null;
    switch (v) {
      case 'home':
        return (
          <FmHome
            snap={snapshot.data}
            players={players}
            folder={folder}
            history={history}
            entries={all as { gameDate: string; data: FmSnapshot }[] | undefined}
            go={go}
            gameFormation={gameFormation}
            lineup={lineup}
            gameTactic={typeof snapshot.data.tactic?.name === 'string' ? snapshot.data.tactic.name : null}
            onTodo={reportTodo}
          />
        );
      case 'squad':
        return <SquadViews players={players} folder={folder} gameDate={snapshot.gameDate} />;
      case 'analysis':
        return <FmAnalysis players={players} gameDate={snapshot.gameDate} />;
      case 'stats':
        return <FmStats snap={snapshot.data} players={players} history={all as { gameDate: string; data: FmSnapshot }[] | undefined} />;
      case 'compare':
        return <FmCompare saveId={saveId} snap={snapshot.data} players={players} folder={folder} history={history} />;
      case 'playtime':
        return <FmPlaytime players={players} history={all as { gameDate: string; data: FmSnapshot }[] | undefined} />;
      case 'dressing':
        return <FmDressing players={players} />;
      case 'loans':
        return <FmLoans snap={snapshot.data} />;
      case 'numbers':
        return <FmShirts players={players} folder={folder} gameFormation={gameFormation} gameTactic={typeof snapshot.data.tactic?.name === 'string' ? snapshot.data.tactic.name : null} />;
      case 'tactic':
        return (
          <FmTactic
            part="lineup"
            snap={snapshot.data}
            go={go}
            players={players}
            folder={folder}
            gameFormation={gameFormation}
            lineup={lineup}
            lineupStatus={(snapshot.data as { collecte?: { compo?: string } }).collecte?.compo ?? null}
          />
        );
      case 'instructions':
        return (
          <FmTactic
            part="instructions"
            snap={snapshot.data}
            go={go}
            players={players}
            folder={folder}
            gameFormation={gameFormation}
            lineup={lineup}
            lineupStatus={(snapshot.data as { collecte?: { compo?: string } }).collecte?.compo ?? null}
          />
        );
      case 'opponent':
        return <FmOpponent snap={snapshot.data} />;
      case 'diagnosis':
        return (
          <FmDiagnosis
            snap={snapshot.data}
            players={players}
            folder={folder}
            gameFormation={gameFormation}
            lineup={lineup}
            gameTactic={typeof snapshot.data.tactic?.name === 'string' ? snapshot.data.tactic.name : null}
            history={all as { gameDate: string; data: FmSnapshot }[] | undefined}
          />
        );
      case 'results':
        return <FmResults players={players} history={all as { gameDate: string; data: FmSnapshot }[] | undefined} />;
      case 'calendar':
        return <FmCalendar snap={snapshot.data} players={players} />;
      case 'roles':
        return <FmRoles players={players} folder={folder} />;
      case 'style':
        return <FmStyle players={players} folder={folder} />;
      case 'effectiveness':
        return <FmEffectiveness snap={snapshot.data} history={history} go={go} />;
      case 'project':
        return <FmProject snap={snapshot.data} players={players} folder={folder} history={history} />;
      case 'training':
        return <FmTraining snap={snapshot.data} players={players} folder={folder} history={history} />;
      case 'staff':
        return <FmStaff />;
      case 'mercato':
        return <FmMercato saveId={saveId} snap={snapshot.data} players={players} folder={folder} gameDate={snapshot.gameDate} history={history} />;
      case 'targets':
        return <FmTargets saveId={saveId} snap={snapshot.data} players={players} folder={folder} go={go} />;
      case 'depth':
        return (
          <FmDepth
            players={players}
            folder={folder}
            gameFormation={gameFormation}
            gameTactic={typeof snapshot.data.tactic?.name === 'string' ? snapshot.data.tactic.name : null}
            lineup={lineup}
            gameDate={snapshot.gameDate}
            history={history}
          />
        );
      case 'finances':
        return <FmFinances snap={snapshot.data} players={contracted} />;
      case 'wages':
        return <FmWages players={contracted} gameDate={snapshot.gameDate} />;
      case 'contracts':
        return <FmContracts players={contracted} gameDate={snapshot.gameDate} />;
      case 'progression':
        return <FmProgression history={history} />;
      default:
        return null;
    }
  };
  const sync = useCareerStore((s) => s.sync);
  const dateFmt = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: 'long' });
  const stampFmt = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: 'short', timeStyle: 'short' });
  const freeSince = sync.free ? (settings?.fmFreeSince ?? sync.free) : null;

  // Lecture à la demande (bouton « Lire la partie maintenant », ou import confirmé d'un autre club).
  const importSnap = useMutation({
    mutationFn: async (opts: { force?: boolean; folder?: string } = {}) => {
      const from = opts.folder ?? folder;
      const text = await invoke<string>('fm_read_snapshot', { folder: from });
      if (from !== settings?.fmFolder) await fmData.setFolder(saveId, from);
      return fmData.importSnapshot(saveId, JSON.parse(text), opts);
    },
    onSuccess: () => {
      useCareerStore.getState().setSync({ other: null });
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ['saves'] });
    },
    onError: (e) => useCareerStore.getState().setSync({ other: e instanceof FmOtherSaveError ? e : null }),
  });
  const other = sync.other;
  const position = (snapshot?.data as { custom?: { equipe?: { classementTexte?: unknown } } } | undefined)?.custom?.equipe?.classementTexte;

  if (!saveId) return null;
  return (
    <div className="fm min-h-screen">
      {/* En-tête de la carrière : club, date de jeu, état de la lecture du plugin, lecture à la demande. */}
      <header className="sticky top-0 z-40 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-canard/10 bg-white px-6 py-3 xl:px-10">
        {snapshot ? (
          <>
            <span className="font-extrabold">{snapshot.club}</span>
            <span className="text-sm text-brun">
              {typeof position === 'string' && position ? `${position} · ` : ''}
              {dateFmt.format(new Date(snapshot.gameDate))}
            </span>
          </>
        ) : (
          <span className="font-extrabold">{save?.name}</span>
        )}
        {freeSince && (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-creme px-2 py-0.5 text-sm font-bold">
            <span className="inline-block h-2 w-2 rounded-full bg-ambre" aria-hidden />
            {t('fm.saveFile.free', { date: dateFmt.format(new Date(freeSince)) })}
          </span>
        )}
        <div className="ml-auto flex items-center gap-3">
          {snapshot && (
            <span className="flex items-center gap-1.5 text-xs text-brun" title={t('fm.autoImport')}>
              <span className={`h-2 w-2 rounded-full ${importSnap.isError && !other ? 'bg-corail' : 'bg-eau'}`} aria-hidden />
              {t('fm.sync', { time: stampFmt.format(new Date(snapshot.importedAt)) })}
            </span>
          )}
          <button type="button" className="btn-secondary px-3 py-1 text-sm" disabled={importSnap.isPending || !folder} onClick={() => importSnap.mutate({})}>
            {t('layout.readNow')}
          </button>
        </div>
      </header>

      <div className="px-6 py-5 xl:px-10">
        {other && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-white px-4 py-3 text-sm ring-1 ring-corail/40" role="alert">
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-ambre" aria-hidden />
            <span className="text-canard">{t('fm.saveFile.other', { club: other.club, expected: other.expected })}</span>
            <button type="button" className="btn-secondary px-3 py-1 text-xs" disabled={importSnap.isPending} onClick={() => importSnap.mutate({ force: true })}>
              {t('fm.saveFile.importAnyway', { club: other.club })}
            </button>
          </div>
        )}
        {importSnap.isError && !other && (
          <p className="mb-4 text-sm text-corail">{t('fm.importError', { reason: String(importSnap.error?.message ?? importSnap.error) })}</p>
        )}

        {view === 'settings' ? (
          <SettingsPage
            saveId={saveId}
            folder={folder}
            settings={settings}
            club={settings?.fmClub ?? snapshot?.club ?? null}
            importing={importSnap.isPending}
            onImport={(f) => importSnap.mutate({ folder: f })}
          />
        ) : (
          <>
            {!isLoading && !snapshot && (
              <div className="card flex flex-col items-center gap-3 py-10 text-center">
                <p className="max-w-md text-brun">{t('fm.empty')}</p>
                <Link to="/reglages" className="btn-primary">
                  {t('layout.openSettings')}
                </Link>
              </div>
            )}
            {snapshot && players.length > 0 && scope && (
              <FmSaveScopeContext.Provider value={scope}>
                <ReserveContext.Provider value={reserve}>
                  <PlayerSheetContext.Provider value={setSheet}>
                    {view === 'home' ? (
                      <>
                        <header className="mb-4">
                          <h1 className="text-3xl font-semibold">{t('layout.today.title')}</h1>
                          <p className="mt-1 text-brun">{t('layout.today.intro')}</p>
                        </header>
                        {part('home')}
                        <TodayCards saveId={saveId} />
                      </>
                    ) : (
                      <>
                        <ViewHeader view={view} part={PARTS[view].includes(current) ? current : view} />
                        <PageParts page={view} current={current} go={go} render={part} />
                      </>
                    )}
                    {sheet && <FmPlayerSheet id={sheet} players={players} snap={snapshot.data} history={history} folder={folder} gameDate={snapshot.gameDate} onClose={() => setSheet(null)} />}
                  </PlayerSheetContext.Provider>
                </ReserveContext.Provider>
              </FmSaveScopeContext.Provider>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** « Plugin et réglages » : dossier du plugin, sauvegarde liée, lecture du CA/PA, historique, plugin et mémoire. */
function SettingsPage({
  saveId,
  folder,
  settings,
  club,
  importing,
  onImport,
}: {
  saveId: string;
  folder: string;
  settings: Awaited<ReturnType<typeof fmData.settings>> | undefined;
  club: string | null;
  importing: boolean;
  onImport: (folder: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const key = ['fm', saveId] as const;
  const [input, setInput] = useState(folder);
  useEffect(() => setInput(folder), [folder]);
  const stampFmt = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: 'short', timeStyle: 'short' });
  const setSync = useCareerStore((s) => s.setSync);
  // Rappel stable : le plugin signale son état à chaque changement, pas à chaque rendu.
  const onHealth = useCallback((ok: boolean) => {
    if (useCareerStore.getState().sync.bridgeOk !== ok) setSync({ bridgeOk: ok });
  }, [setSync]);

  // Sauvegardes .fm du joueur (dossier games, à côté de celui du plugin), pour lier la partie à l'une d'elles.
  const { data: saveFiles } = useQuery({
    queryKey: ['fm', 'save-files', folder],
    queryFn: () => invoke<FmSaveFile[]>('fm_list_saves', { folder }),
    enabled: !!folder,
    refetchInterval: 60_000,
  });
  const linked = settings?.fmSaveFile ?? '';
  const linkedFile = saveFiles?.find((f) => f.name === linked);
  const link = useMutation({
    mutationFn: (name: string) => fmData.linkSave(saveId, name || null),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...key, 'settings'] }),
  });

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-3xl font-semibold">{t('layout.nav.settings')}</h1>
        <p className="mt-1 max-w-3xl text-brun">
          {t('layout.settingsIntro')}{' '}
          <Link to="/parties" className="font-bold text-orange-fonce hover:underline">
            {t('layout.manageCareers')}
          </Link>
        </p>
      </header>
      <div className="card space-y-3 p-4">
        <form
          className="flex flex-wrap items-end gap-x-5 gap-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            onImport(input);
          }}
        >
          <label className="block min-w-[18rem] flex-1 text-sm font-bold text-canard">
            {t('fm.folder')}
            <input className="input mt-1 w-full font-normal" required value={input} onChange={(e) => setInput(e.target.value)} />
            <span className="mt-1 block text-xs font-normal text-brun">{t('fm.folderHelp')}</span>
          </label>
          <label className="block text-sm font-bold text-canard">
            {t('fm.saveFile.label')}
            <select
              className="input mt-1 block max-w-[16rem] py-1.5 font-normal"
              value={linked}
              disabled={link.isPending}
              onChange={(e) => link.mutate(e.target.value)}
              title={t('fm.saveFile.help')}
            >
              <option value="">{t('fm.saveFile.none')}</option>
              {linked && !linkedFile && <option value={linked}>{t('fm.saveFile.missing', { name: linked })}</option>}
              {saveFiles?.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.name.replace(/\.fm$/i, '')}
                </option>
              ))}
            </select>
            {linkedFile?.modifiedMs != null && (
              <span className="mt-1 block text-xs font-normal text-brun">{t('fm.saveFile.saved', { date: stampFmt.format(new Date(linkedFile.modifiedMs)) })}</span>
            )}
          </label>
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-sm text-canard" title={t('fm.abilities.help')}>
              <input
                type="checkbox"
                checked={!!settings?.fmReadAbilities}
                onChange={async (e) => {
                  await fmData.updateSettings(saveId, { fmReadAbilities: e.target.checked });
                  qc.invalidateQueries({ queryKey: [...key, 'settings'] });
                }}
              />
              {t('fm.abilities.toggle')}
            </label>
            <div className="flex items-center gap-3">
              <button className="btn-primary px-4 py-1.5 text-sm" disabled={importing || !input}>
                {t('fm.import')}
              </button>
              <span className="text-xs text-brun">{t('fm.autoImport')}</span>
            </div>
          </div>
        </form>
        <FmHistoryImport saveId={saveId} folder={folder} club={club} />
        <FmBridge dataFolder={folder} onHealth={onHealth} />
        <FmMemory />
      </div>
    </div>
  );
}

/** Parties d'un écran regroupé : une à la fois, choisie par des sous-onglets ; au-delà de cinq, dans « Plus ». */
function PageParts({ page, current, go, render }: { page: ClubPage; current: string; go: (v: string) => void; render: (v: string) => ReactNode }) {
  const { t } = useTranslation();
  const parts = PARTS[page];
  const active = parts.includes(current) ? current : parts[0]!;
  const shown = parts.slice(0, VISIBLE_PARTS);
  const more = parts.slice(VISIBLE_PARTS);
  const [open, setOpen] = useState(false);
  const label = (v: string) => t(`fm.subtabs.${v}`, { defaultValue: t(`fm.views.${v}`) });
  const tab = (v: string) =>
    `-mb-px rounded-t-lg border-b-2 px-3 py-1.5 text-sm font-bold ${v === active ? 'border-orange text-canard' : 'border-transparent text-canard/60 hover:text-canard'}`;
  return (
    <>
      {parts.length > 1 && (
        <div className="sticky top-[3.25rem] z-30 -mx-1 mb-5 flex flex-wrap gap-1 border-b border-canard/10 bg-creme px-1 pt-2" role="tablist" aria-label={t('fm.onThisPage')}>
          {shown.map((v) => (
            <button key={v} type="button" role="tab" aria-selected={v === active} onClick={() => go(v)} className={tab(v)}>
              {label(v)}
            </button>
          ))}
          {more.length > 0 && (
            <div className="relative">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpen(!open)}
                className={tab(more.includes(active) ? active : '')}
              >
                {more.includes(active) ? label(active) : t('layout.more')} ▾
              </button>
              {open && (
                <div className="absolute left-0 top-full z-40 mt-1 min-w-[12rem] rounded-lg bg-white py-1 shadow-lg ring-1 ring-canard/10" role="menu">
                  {more.map((v) => (
                    <button
                      key={v}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setOpen(false);
                        go(v);
                      }}
                      className={`block w-full px-3 py-1.5 text-left text-sm font-bold hover:bg-creme ${v === active ? 'text-orange-fonce' : 'text-canard'}`}
                    >
                      {label(v)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <section key={active} role={parts.length > 1 ? 'tabpanel' : undefined}>
        {render(active)}
      </section>
    </>
  );
}

/** En-tête commun aux écrans du club : groupe, nom de l'écran et la question à laquelle il répond. */
function ViewHeader({ view, part }: { view: string; part: string }) {
  const { t } = useTranslation();
  return (
    <header className="mb-2">
      <p className="text-xs font-bold uppercase tracking-wide text-canard/50">{t('layout.groups.club')}</p>
      <h1 className="text-3xl font-semibold">{pageLabel(t, view)}</h1>
      <p className="mt-1 max-w-3xl text-sm text-brun">{t(`fm.intro.${part}`)}</p>
    </header>
  );
}

/** Effectif : vue terrain (par poste) ou tableau détaillé ; le choix est gardé d'une visite à l'autre. */
function SquadViews({ players, folder, gameDate }: { players: FmPlayer[]; folder: string; gameDate: string }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'pitch' | 'table'>(() => {
    try {
      return localStorage.getItem('fmi.squadView') === 'table' ? 'table' : 'pitch';
    } catch {
      return 'pitch';
    }
  });
  const choose = (m: 'pitch' | 'table') => {
    setMode(m);
    try {
      localStorage.setItem('fmi.squadView', m);
    } catch {
      /* stockage indisponible : le choix vaut pour cette visite */
    }
  };
  return (
    <div className="space-y-3">
      <div className="flex gap-1" role="tablist" aria-label={t('fm.squadPitch.label')}>
        {(['pitch', 'table'] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={mode === k}
            onClick={() => choose(k)}
            className={`chip ${mode === k ? 'chip-on' : ''}`}
          >
            {t(`fm.squadPitch.${k}`)}
          </button>
        ))}
      </div>
      {mode === 'pitch' ? <FmSquadPitch players={players} /> : <SquadTable players={players} folder={folder} gameDate={gameDate} />}
    </div>
  );
}

type SortKey = 'name' | 'age' | 'level' | 'condition' | 'contractEnd' | 'wage' | 'apps' | 'goals' | 'avgRating';

function SquadTable({ players, folder, gameDate }: { players: FmPlayer[]; folder: string; gameDate: string }) {
  const { t, i18n } = useTranslation();
  // Compatibilité de chaque profil avec le projet de jeu (style visé dans « Mon projet »).
  const { engine } = useTacticEngine(folder, players);
  const [coach] = useCoach();
  const compat = useMemo(() => {
    const list = players.filter((p) => Object.keys(p.attributes).length);
    return compatMap(engine, buildProject(engine, list, coach), list);
  }, [engine, players, coach]);
  const [line, setLine] = useState<Line | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({
    key: 'level',
    desc: true,
  });
  const money = new Intl.NumberFormat(i18n.resolvedLanguage, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  });
  const date = new Intl.DateTimeFormat(i18n.resolvedLanguage, {
    dateStyle: 'medium',
  });
  const nf1 = new Intl.NumberFormat(i18n.resolvedLanguage, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const nf2 = new Intl.NumberFormat(i18n.resolvedLanguage, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // « À surveiller » : blessé ou suspendu, fin de contrat dans six mois ou moins, indésirable, moral bas.
  const [watch, setWatch] = useState(false);
  const watched = (p: FmPlayer) =>
    !!p.injury || !!p.suspension || isUnwanted(p.squadStatus) || (p.contractEnd != null && monthsBetween(gameDate, p.contractEnd) <= 6) || (moraleLevel(p.morale) ?? 3) <= 1;

  const rows = useMemo(() => {
    const byLine = line ? players.filter((p) => p.line === line) : players;
    const list = watch ? byLine.filter(watched) : byLine;
    const val = (p: FmPlayer) => p[sort.key];
    return [...list].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      if (x == null) return 1;
      if (y == null) return -1;
      const c = typeof x === 'string' ? x.localeCompare(String(y)) : x - (y as number);
      return sort.desc ? -c : c;
    });
  }, [players, line, sort, watch, gameDate]);

  const head = (key: SortKey, label: string) => (
    <th className="px-3 py-2 text-left">
      <button
        type="button"
        className="font-bold hover:text-canard"
        onClick={() =>
          setSort((s) => ({
            key,
            desc: s.key === key ? !s.desc : key !== 'name',
          }))
        }
      >
        {label}
        {sort.key === key ? (sort.desc ? ' ▾' : ' ▴') : ''}
      </button>
    </th>
  );

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {[null, ...LINES].map((l) => (
            <button
              key={l ?? 'all'}
              type="button"
              onClick={() => setLine(l)}
              className={`chip ${line === l ? 'chip-on' : ''}`}
            >
              {t(`fm.line.${l ?? 'all'}`)} · {l ? players.filter((p) => p.line === l).length : players.length}
            </button>
          ))}
          <button type="button" aria-pressed={watch} onClick={() => setWatch((w) => !w)} className={`chip ${watch ? 'chip-on' : ''}`}>
            {t('fm.squadTable.watch')} · {players.filter(watched).length}
          </button>
        </div>
      </div>
      <div className="card mt-4 overflow-x-auto p-0">
        <table className="data-table">
          <thead className="border-b border-canard/10 text-canard/70">
            <tr>
              {head('name', t('fm.col.name'))}
              <th className="px-3 py-2 text-left font-bold">{t('fm.col.positions')}</th>
              {head('age', t('fm.col.age'))}
              {head('level', t('fm.col.level'))}
              {head('condition', t('fm.col.condition'))}
              {head('apps', t('fm.col.apps'))}
              {head('goals', t('fm.col.goals'))}
              {head('avgRating', t('fm.col.avgRating'))}
              {head('contractEnd', t('fm.col.contract'))}
              {head('wage', t('fm.col.wage'))}
              <th className="px-3 py-2 text-left font-bold">{t('fm.col.status')}</th>
              <th className="px-3 py-2 text-left font-bold" title={t('fm.compat.help')}>
                {t('fm.col.compat')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-b border-canard/5 odd:bg-creme/40">
                <td className="px-3 py-2 font-bold">
                  <PlayerLink player={p} />
                  {p.injury && <span className="ml-2 rounded-md bg-corail/15 px-1.5 py-0.5 text-xs text-canard">{p.injury}</span>}
                  {p.suspension && (
                    <span className="ml-2 rounded-md bg-corail/15 px-1.5 py-0.5 text-xs text-canard">
                      {p.suspension === 'Suspendu' ? t('fm.home.kind.suspended') : `${t('fm.home.kind.suspended')} : ${p.suspension}`}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span className="flex flex-wrap gap-1">
                    {p.positionsLabel.split(', ').map((pos) => (
                      <span key={pos} className="pill">
                        {pos}
                      </span>
                    ))}
                  </span>
                </td>
                <td className="px-3 py-2">{p.age ?? '–'}</td>
                <td className="px-3 py-2 font-bold">
                  {p.level != null ? nf1.format(p.level) : '–'}
                  {p.stars?.current != null && (
                    <span className="ml-2 text-xs font-normal text-brun" title={t('fm.col.starsHelp')}>
                      ★ {p.stars.current}
                      {p.stars.potential != null ? ` / ${p.stars.potential}` : ''}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">{p.condition != null ? `${Math.round(p.condition)} %` : '–'}</td>
                <td className="px-3 py-2 tabular-nums">{p.apps ?? '–'}</td>
                <td className="px-3 py-2 tabular-nums">{p.goals ?? '–'}</td>
                <td className="px-3 py-2 tabular-nums">{p.avgRating != null && p.avgRating > 0 ? nf2.format(p.avgRating) : '–'}</td>
                <td className="px-3 py-2">{p.contractEnd ? date.format(new Date(p.contractEnd)) : '–'}</td>
                <td className="px-3 py-2">{p.wage != null ? money.format(p.wage) : '–'}</td>
                <td className="px-3 py-2 text-brun">{p.squadStatus ?? '–'}</td>
                <td className="px-3 py-2">
                  <CompatTag c={compat.get(p.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}


/**
 * Reprise d'une carrière déjà suivie : le plugin garde un instantané par jour de jeu (`archivix-AAAA-MM-JJ.json`).
 * On les regroupe par club et le joueur choisit lequel importer dans cette partie (du plus ancien au plus récent).
 * Les jours déjà présents ne sont pas réimportés ; un fichier sans aucun nom de joueur (lecture ratée) est ignoré.
 */
function FmHistoryImport({ saveId, folder, club }: { saveId: string; folder: string; club: string | null }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const { data: files } = useQuery({
    queryKey: ['fm', 'history-files', folder],
    queryFn: () => invoke<FmHistoryFile[]>('fm_history_list', { folder }),
    enabled: !!folder,
  });
  const { data: known } = useQuery({
    queryKey: ['fm', saveId, 'history'],
    queryFn: () => fmData.history(saveId),
  });
  const groups = useMemo(() => {
    const have = new Set((known ?? []).map((h) => h.gameDate.slice(0, 10)));
    const by = new Map<string, FmHistoryFile[]>();
    for (const f of files ?? []) if (f.club) by.set(f.club, [...(by.get(f.club) ?? []), f]);
    return [...by.entries()]
      .map(([name, list]) => ({ name, list, missing: list.filter((f) => !have.has(f.gameDate)) }))
      .sort((a, b) => (a.name === club ? -1 : b.name === club ? 1 : b.list.at(-1)!.gameDate.localeCompare(a.list.at(-1)!.gameDate)));
  }, [files, known, club]);
  const run = useMutation({
    mutationFn: async (list: FmHistoryFile[]) => {
      let imported = 0;
      setProgress({ done: 0, total: list.length });
      for (const [i, f] of list.entries()) {
        const raw = JSON.parse(await invoke<string>('fm_history_read', { folder, gameDate: f.gameDate })) as { players?: { name?: string }[] };
        if (raw.players?.some((p) => p.name)) {
          await fmData.importSnapshot(saveId, raw, { force: true });
          imported++;
        }
        setProgress({ done: i + 1, total: list.length });
      }
      return imported;
    },
    onSettled: () => {
      setProgress(null);
      qc.invalidateQueries({ queryKey: ['fm', saveId] });
      qc.invalidateQueries({ queryKey: ['saves'] });
    },
  });
  if (!groups.length) return null;
  const fmt = new Intl.DateTimeFormat(i18n.resolvedLanguage, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const day = (d: string) => fmt.format(new Date(`${d}T00:00:00Z`));
  return (
    <div className="border-t border-canard/10 pt-3">
      <h3 className="text-sm font-bold text-canard">{t('fm.history.title')}</h3>
      <p className="mt-0.5 text-xs text-brun">{t('fm.history.help')}</p>
      <ul className="mt-2 space-y-1.5">
        {groups.map((g) => (
          <li key={g.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-canard">
            <span className="font-bold">{g.name}</span>
            <span className="text-brun">
              {t('fm.history.range', { count: g.list.length, from: day(g.list[0]!.gameDate), to: day(g.list.at(-1)!.gameDate) })}
            </span>
            {g.missing.length ? (
              <button type="button" className="btn-secondary px-3 py-1 text-xs" disabled={run.isPending} onClick={() => run.mutate(g.missing)}>
                {t('fm.history.import', { count: g.missing.length })}
              </button>
            ) : (
              <span className="text-xs text-eau-fonce">{t('fm.history.done')}</span>
            )}
          </li>
        ))}
      </ul>
      {progress && <p className="mt-2 text-xs text-brun">{t('fm.history.progress', progress)}</p>}
      {run.isSuccess && !progress && <p className="mt-2 text-xs text-eau-fonce">{t('fm.history.result', { count: run.data })}</p>}
      {run.isError && <p className="mt-2 text-xs text-corail">{t('fm.importError', { reason: String(run.error?.message ?? run.error) })}</p>}
    </div>
  );
}
