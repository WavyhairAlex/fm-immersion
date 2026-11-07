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
  type FmPlayer,
  type FmSnapshot,
  type Line,
  type SquadAt,
} from '@fm-immersion/module-fm';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { fmData, savesData } from '../lib/data';
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
import { FmTactic, useTacticEngine } from './FmTactic';
import { FmTargets } from './FmTargets';
import { FmTraining } from './FmTraining';
import { FmWages } from './FmWages';
import { CompatTag, PlayerLink, PlayerSheetContext, useCoach } from './FmUi';
import { FmPlayerSheet } from './FmPlayerSheet';

const LINES: Line[] = ['GB', 'DEF', 'MIL', 'ATT'];
/** Relecture des fichiers du plugin (instantané, état du manager). */
const LIVE_POLL_MS = 10_000;

/**
 * Six onglets, dans l'ordre où on s'en sert : l'accueil, le prochain match (compo, consignes, adversaire,
 * rotation), l'effectif, les performances (résultats, stats, analyse), le projet de jeu (style, feuille de
 * route, entraînement) et le mercato avec le club (départs, cibles, finances, contrats). Chaque onglet montre
 * ses parties en sous-onglets, une à la fois.
 */
const SECTIONS = [
  { id: 'home', views: ['home'] },
  { id: 'tactic', views: ['tactic'] },
  { id: 'squad', views: ['squad'] },
  { id: 'results', views: ['results'] },
  { id: 'style', views: ['style'] },
  { id: 'mercato', views: ['mercato'] },
] as const;
/**
 * Parties de chaque onglet (sous-onglets). Les anciens noms d'écran restent valides : `go('contracts')`
 * ouvre Mercato et club sur Contrats.
 */
const PARTS: Record<string, readonly string[]> = {
  tactic: ['tactic', 'instructions', 'opponent', 'calendar', 'depth', 'effectiveness'],
  squad: ['squad', 'playtime', 'dressing', 'progression', 'roles', 'compare', 'numbers', 'loans'],
  results: ['results', 'diagnosis', 'stats', 'analysis'],
  style: ['style', 'project', 'training', 'staff'],
  mercato: ['mercato', 'targets', 'finances', 'wages', 'contracts'],
};
/** Sections dont les écrans s'enchaînent comme des étapes (numérotées, avec « étape suivante »). */
const STEPPED = new Set<string>([]);
type View = (typeof SECTIONS)[number]['views'][number];
const isView = (v: string): v is View => SECTIONS.some((s) => (s.views as readonly string[]).includes(v));
/** Onglet qui contient un écran (lui-même, ou l'onglet où il a été regroupé). */
const pageOf = (v: string): View => (isView(v) ? v : ((Object.keys(PARTS).find((k) => PARTS[k]!.includes(v)) as View | undefined) ?? 'home'));
const VIEW_KEY = 'fmi.view';
/** Nom d'un onglet : son nom propre s'il regroupe plusieurs écrans, sinon celui de l'écran. */
const pageLabel = (t: (k: string, o?: Record<string, unknown>) => string, v: string) => t(`fm.pages.${v}`, { defaultValue: t(`fm.views.${v}`) });
/** Dernier écran ouvert : un onglet, ou une partie d'onglet regroupé (rouverte telle quelle). */
const readView = (): string => {
  try {
    return localStorage.getItem(VIEW_KEY) ?? 'home';
  } catch {
    return 'home';
  }
};

/** Partie Football Manager : import depuis le plugin, alertes, effectif. */
export function FmSave() {
  const { saveId = '' } = useParams();
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const key = ['fm', saveId] as const;

  const { data: allSaves } = useQuery({
    queryKey: ['saves'],
    queryFn: savesData.list,
  });
  const save = allSaves?.find((s) => s.id === saveId);
  // Les réglages d'écran d'avant le lien partie ↔ sauvegarde reviennent à la plus ancienne partie FM.
  const scope = useMemo<FmSaveScope | null>(() => {
    if (!allSaves) return null;
    const oldest = allSaves.filter((s) => s.gameId === 'fm').sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    return { saveId, inheritsLegacy: oldest?.id === saveId };
  }, [allSaves, saveId]);
  const { data: snapshot, isLoading } = useQuery({
    queryKey: [...key, 'latest'],
    queryFn: () => fmData.latest(saveId),
  });
  const { data: all } = useQuery({
    queryKey: [...key, 'all'],
    queryFn: () => fmData.all(saveId),
  });
  const { data: settings } = useQuery({
    queryKey: [...key, 'settings'],
    queryFn: () => fmData.settings(saveId),
  });
  const { data: defaultFolder } = useQuery({
    queryKey: ['fm', 'default-folder'],
    queryFn: () => invoke<string | null>('fm_default_folder'),
  });

  // Onglet affiché et, pour un onglet regroupé, la partie choisie (sous-onglet) ; sinon sa première partie.
  const [current, setCurrent] = useState<string>(readView);
  const view = pageOf(current);
  const go = (v: string) => {
    setCurrent(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* stockage indisponible : l'écran n'est pas retenu */
    }
    window.scrollTo({ top: 0 });
  };
  // Fiche joueur ouverte depuis n'importe quel nom cliquable.
  const [sheet, setSheet] = useState<string | null>(null);
  const section = SECTIONS.find((s) => (s.views as readonly string[]).includes(view)) ?? SECTIONS[0];
  const [folder, setFolder] = useState('');
  // Ce que le briefing laisse à faire, par écran : une pastille sur l'onglet concerné (remise à zéro à chaque nouvelle date).
  const [todo, setTodo] = useState<{ at: string; views: string[] }>({ at: '', views: [] });
  const todoAt = `${saveId}|${snapshot?.gameDate ?? ''}`;
  const reportTodo = useCallback((views: string[]) => setTodo({ at: todoAt, views }), [todoAt]);
  const todoOn = (v: string) => (todo.at === todoAt ? todo.views.filter((x) => pageOf(x) === v).length : 0);
  const badge = (v: string, dark: boolean) => {
    const n = todoOn(v);
    if (!n || v === 'home') return null;
    return (
      <span
        className={`${dark ? 'ml-auto' : 'ml-1.5'} inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-xs font-extrabold tabular-nums ${dark ? 'bg-orange-fonce text-white' : 'bg-orange-clair text-canard'}`}
        aria-label={t('fm.brief.tabBadge', { count: n })}
        title={t('fm.brief.tabBadge', { count: n })}
      >
        {n}
      </span>
    );
  };
  // Réglages repliés quand tout va bien ; ouverts d'office sans instantané ou quand le plugin demande une action.
  const [settingsToggle, setSettingsToggle] = useState<boolean | null>(null);
  const [bridgeOk, setBridgeOk] = useState<boolean | null>(null);
  useEffect(() => {
    setFolder(settings?.fmFolder ?? defaultFolder ?? '');
  }, [settings?.fmFolder, defaultFolder]);

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

  // Instantané d'une autre sauvegarde chargée dans FM27 : rien n'est importé tant que le joueur ne le confirme pas.
  const [other, setOther] = useState<FmOtherSaveError | null>(null);
  // Sans club dans FM27 (date de jeu), d'après l'état écrit par le plugin.
  const [free, setFree] = useState<string | null>(null);
  const freeSince = free ? (settings?.fmFreeSince ?? free) : null;
  const importSnap = useMutation({
    mutationFn: async (opts: { force?: boolean } = {}) => {
      const text = await invoke<string>('fm_read_snapshot', { folder });
      if (folder !== settings?.fmFolder) await fmData.setFolder(saveId, folder);
      return fmData.importSnapshot(saveId, JSON.parse(text), opts);
    },
    onSuccess: () => {
      setOther(null);
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ['saves'] });
    },
    onError: (e) => setOther(e instanceof FmOtherSaveError ? e : null),
  });

  // Import automatique : le plugin réécrit son instantané à chaque nouveau jour de jeu (et toutes les 5 minutes) ;
  // on relit le fichier toutes les 10 secondes (lecture locale, rien dans le jeu) et on l'enregistre dès qu'il a
  // changé, pour que tout l'écran suive la partie presque en direct, sans bouton à presser.
  const lastText = useRef<string | null>(null);
  const abilitiesDate = useRef<string | null>(null);
  const abilitiesTry = useRef(0);
  useEffect(() => {
    if (!folder) return;
    let stop = false;
    const tick = async () => {
      // État du manager (club entraîné ou sans club), écrit par le plugin depuis la version qui le gère.
      try {
        const st = await invoke<string | null>('fm_read_status', { folder });
        if (!stop && st) {
          const status = await fmData.noteStatus(saveId, JSON.parse(st));
          setFree(status.club ? null : status.gameDate);
          qc.invalidateQueries({ queryKey: [...key, 'settings'] });
        }
      } catch {
        /* fichier absent ou en cours d'écriture */
      }
      try {
        const text = await invoke<string>('fm_read_snapshot', { folder });
        if (!stop && text !== lastText.current) {
          lastText.current = text;
          await fmData.importSnapshot(saveId, JSON.parse(text));
          setOther(null);
          qc.invalidateQueries({ queryKey: key });
          qc.invalidateQueries({ queryKey: ['saves'] });
        }
      } catch (e) {
        // Autre sauvegarde chargée : on le signale ; sinon fichier absent ou en cours d'écriture, nouvel essai au prochain passage.
        if (e instanceof FmOtherSaveError) setOther(e);
      }
      // CA/PA réels (option du joueur) : lus une fois par date de jeu dans la mémoire de FM27, en lecture seule.
      try {
        // La lecture mémoire garde son rythme d'une tentative par minute, même si les fichiers sont relus plus souvent.
        if (Date.now() - abilitiesTry.current < 60_000) return;
        if (stop || !(await fmData.settings(saveId)).fmReadAbilities) return;
        abilitiesTry.current = Date.now();
        const latest = await fmData.latest(saveId);
        if (!latest || latest.data.abilities || latest.gameDate === abilitiesDate.current) return;
        const r = await invoke<{
          gameDate: string | null;
          players: { id: number; ca: number; pa: number }[];
        }>('fm_memory_abilities');
        // La mémoire peut être en avance sur l'instantané (écrit toutes les 5 minutes) : on attend la même date.
        if (stop || r.gameDate?.slice(0, 10) !== latest.gameDate.slice(0, 10) || !r.players.length) return;
        if (await fmData.attachAbilities(saveId, latest.gameDate, r.players)) {
          abilitiesDate.current = latest.gameDate;
          qc.invalidateQueries({ queryKey: key });
        }
      } catch {
        /* FM27 fermé ou version inconnue : nouvel essai dans une minute */
      }
    };
    void tick();
    const id = setInterval(() => void tick(), LIVE_POLL_MS);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [folder, saveId]);

  // Effectif sous contrat (hors essais) : salaires, contrats, finances. Les joueurs prêtés ailleurs n'entrent
  // pas dans les compos ni l'analyse : `players` est l'effectif présent au club.
  const contracted = useMemo(() => (snapshot ? withAbilities(withExtended(squadSnapshot(snapshot.data))).players.map(normalizePlayer) : []), [snapshot]);
  const players = useMemo(() => {
    const out = snapshot ? loanedOutIds(snapshot.data) : new Set<string>();
    const present = out.size ? contracted.filter((p) => !out.has(p.id)) : contracted;
    // Un blessé rétabli d'ici le prochain match compte pour les compos de ce match.
    return snapshot ? forNextMatch(present, nextMatchInDays(snapshot.data)) : present;
  }, [snapshot, contracted]);
  const history = useMemo<SquadAt[]>(
    () =>
      (all ?? []).map((h) => ({
        gameDate: h.gameDate,
        players: withAbilities(squadSnapshot(h.data as FmSnapshot)).players.map(normalizePlayer),
      })),
    [all],
  );
  const gameFormation = gameFormationOf(snapshot?.data.tactic);
  const lineup = useMemo(() => gameLineup(snapshot?.data), [snapshot?.data]);
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
        return <FmTraining snap={snapshot.data} players={players} folder={folder} />;
      case 'staff':
        return <FmStaff />;
      case 'mercato':
        return <FmMercato saveId={saveId} players={players} folder={folder} gameDate={snapshot.gameDate} history={history} />;
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
  const settingsOpen = settingsToggle ?? ((!isLoading && !snapshot) || bridgeOk === false);
  const dateFmt = new Intl.DateTimeFormat(i18n.resolvedLanguage, {
    dateStyle: 'long',
  });
  const stampFmt = new Intl.DateTimeFormat(i18n.resolvedLanguage, {
    dateStyle: 'short',
    timeStyle: 'short',
  });

  return (
    <div className="fm lg:flex">
      {/* Barre latérale sombre (grand écran) : la partie, sa date de jeu, l'état de l'import et le menu. */}
      <aside className="hidden w-60 shrink-0 flex-col bg-canard text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:overflow-y-auto">
        <div className="border-b border-white/10 px-4 pb-4 pt-5">
          <Link to="/coach" className="text-xs font-bold text-white/60 hover:text-white">
            ← {t('fm.back')}
          </Link>
          <p className="mt-2 font-display text-xl font-semibold leading-tight">{save?.name ?? '…'}</p>
          {snapshot && (
            <p className="mt-1 text-xs text-white/70">
              {snapshot.club} · {dateFmt.format(new Date(snapshot.gameDate))}
            </p>
          )}
          {freeSince && (
            <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-white">
              <span className="inline-block h-2 w-2 rounded-full bg-ambre" aria-hidden />
              {t('fm.saveFile.free', { date: dateFmt.format(new Date(freeSince)) })}
            </p>
          )}
        </div>
        {snapshot && players.length > 0 && (
          <nav className="flex-1 space-y-0.5 py-3" aria-label={t('fm.nav')}>
            {SECTIONS.map((s) => (
              <div key={s.id}>
                {s.views.length > 1 && <p className="px-3 pb-1 text-[0.65rem] font-extrabold uppercase tracking-widest text-white/45">{t(`fm.sections.${s.id}`)}</p>}
                {s.views.map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-current={v === view ? 'page' : undefined}
                    onClick={() => go(v)}
                    className={`flex w-full items-center border-l-[3px] px-4 py-2.5 text-left font-bold ${v === view ? 'border-eau bg-white/10 text-white' : 'border-transparent text-white/75 hover:bg-white/5 hover:text-white'}`}
                  >
                    {STEPPED.has(s.id) && <span className="mr-1.5 tabular-nums text-eau">{s.views.indexOf(v as never) + 1}.</span>}
                    {pageLabel(t, v)}
                    {badge(v, true)}
                  </button>
                ))}
              </div>
            ))}
          </nav>
        )}
        <div className="mt-auto space-y-2 border-t border-white/10 p-4">
          {snapshot && (
            <p className="flex items-center gap-1.5 text-xs text-white/60" title={t('fm.autoImport')}>
              <span className={`h-2 w-2 rounded-full ${importSnap.isError ? 'bg-corail' : 'bg-eau'}`} aria-hidden />
              {t('fm.sync', { time: stampFmt.format(new Date(snapshot.importedAt)) })}
            </p>
          )}
          <button
            type="button"
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-bold text-white hover:bg-white/20"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsToggle(!settingsOpen)}
          >
            {bridgeOk === false && <span className="h-2 w-2 rounded-full bg-ambre" aria-hidden />}
            {t('fm.settings')}
          </button>
        </div>
      </aside>
      <div className="min-w-0 flex-1 px-6 py-5 xl:px-10">
        {/* En-tête sur une ligne (petit écran) : partie, club et date de jeu à gauche ; état de l'import et réglages à droite. */}
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 lg:hidden">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
            <Link to="/coach" className="text-sm font-bold text-canard/70 hover:text-canard" title={t('fm.back')}>
              ←
            </Link>
            <h1 className="text-2xl font-semibold">{save?.name ?? '…'}</h1>
            {snapshot && (
              <span className="text-sm text-brun">
                {t('fm.context', {
                  club: snapshot.club,
                  date: dateFmt.format(new Date(snapshot.gameDate)),
                  count: snapshot.playerCount,
                })}
              </span>
            )}
            {freeSince && (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-white px-1.5 py-0.5 text-sm font-bold text-canard ring-1 ring-canard/15">
                <span className="inline-block h-2 w-2 rounded-full bg-ambre" aria-hidden />
                {t('fm.saveFile.free', {
                  date: dateFmt.format(new Date(freeSince)),
                })}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {snapshot && (
              <span className="flex items-center gap-1.5 text-xs text-brun" title={t('fm.autoImport')}>
                <span className={`h-2 w-2 rounded-full ${importSnap.isError ? 'bg-corail' : 'bg-eau'}`} aria-hidden />
                {t('fm.sync', {
                  time: stampFmt.format(new Date(snapshot.importedAt)),
                })}
              </span>
            )}
            <button type="button" className="btn-secondary flex items-center gap-1.5 px-3 py-1 text-sm" aria-expanded={settingsOpen} onClick={() => setSettingsToggle(!settingsOpen)}>
              {bridgeOk === false && <span className="h-2 w-2 rounded-full bg-ambre" aria-hidden />}
              {t('fm.settings')}
            </button>
          </div>
        </div>
        {/* Réglages de la partie : ouverts d'office tant que rien n'est importé ou que le plugin demande une action. */}
        <div className={settingsOpen ? 'card mt-3 space-y-3 p-4' : 'hidden'}>
          <form
            className="flex flex-wrap items-end gap-x-5 gap-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              importSnap.mutate({});
            }}
          >
            <label className="block min-w-[18rem] flex-1 text-sm font-bold text-canard">
              {t('fm.folder')}
              <input className="input mt-1 w-full font-normal" required value={folder} onChange={(e) => setFolder(e.target.value)} />
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
                <span className="mt-1 block text-xs font-normal text-brun">
                  {t('fm.saveFile.saved', {
                    date: stampFmt.format(new Date(linkedFile.modifiedMs)),
                  })}
                </span>
              )}
            </label>
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-sm text-canard" title={t('fm.abilities.help')}>
                <input
                  type="checkbox"
                  checked={!!settings?.fmReadAbilities}
                  onChange={async (e) => {
                    await fmData.updateSettings(saveId, {
                      fmReadAbilities: e.target.checked,
                    });
                    qc.invalidateQueries({ queryKey: [...key, 'settings'] });
                  }}
                />
                {t('fm.abilities.toggle')}
              </label>
              <div className="flex items-center gap-3">
                <button className="btn-primary px-4 py-1.5 text-sm" disabled={importSnap.isPending || !folder}>
                  {t('fm.import')}
                </button>
                <span className="text-xs text-brun">{t('fm.autoImport')}</span>
              </div>
            </div>
          </form>
          <FmHistoryImport saveId={saveId} folder={folder} club={settings?.fmClub ?? snapshot?.club ?? null} />
          <FmBridge dataFolder={folder} onHealth={setBridgeOk} />
          <FmMemory />
        </div>
        {other && (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-white px-4 py-3 text-sm ring-1 ring-corail/40" role="alert">
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-ambre" aria-hidden />
            <span className="text-canard">
              {t('fm.saveFile.other', {
                club: other.club,
                expected: other.expected,
              })}
            </span>
            <button type="button" className="btn-secondary px-3 py-1 text-xs" disabled={importSnap.isPending} onClick={() => importSnap.mutate({ force: true })}>
              {t('fm.saveFile.importAnyway', { club: other.club })}
            </button>
          </div>
        )}
        {importSnap.isError && !other && (
          <p className="mt-2 text-sm text-corail">
            {t('fm.importError', {
              reason: String(importSnap.error?.message ?? importSnap.error),
            })}
          </p>
        )}

        {!isLoading && !snapshot && (
          <div className="card mt-6 flex flex-col items-center gap-3 py-10 text-center">
            <p className="max-w-md text-brun">{t('fm.empty')}</p>
          </div>
        )}

        {snapshot && players.length > 0 && scope && (
          <FmSaveScopeContext.Provider value={scope}>
            <PlayerSheetContext.Provider value={setSheet}>
              <div className="mt-4 lg:mt-0">
                <div className="min-w-0">
                  <div className="lg:hidden">
                    <nav className="flex flex-wrap gap-2" role="tablist" aria-label={t('fm.nav')}>
                      {SECTIONS.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          role="tab"
                          aria-selected={s === section}
                          onClick={() => go(s.views[0])}
                          className={`chip ${s === section ? 'chip-on' : ''}`}
                        >
                          {t(`fm.sections.${s.id}`)}
                          {badge(s.views[0], false)}
                        </button>
                      ))}
                    </nav>
                    {section.views.length > 1 && (
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-b border-canard/10 pb-2 text-sm">
                        {section.views.map((v) => (
                          <button
                            key={v}
                            type="button"
                            aria-current={v === view ? 'page' : undefined}
                            onClick={() => go(v)}
                            className={`font-bold ${v === view ? 'text-canard underline decoration-eau-soutenu decoration-2 underline-offset-8' : 'text-canard/60 hover:text-canard'}`}
                          >
                            {STEPPED.has(section.id) && <span className="mr-1 tabular-nums opacity-60">{section.views.indexOf(v as never) + 1}.</span>}
                            {pageLabel(t, v)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="mt-4 lg:mt-0">
                    <ViewHeader section={section.id} view={view} part={(PARTS[view] ?? [view]).includes(current) ? current : view} />
                    <PageParts page={view} current={current} go={go} render={part} />
                    {STEPPED.has(section.id) && <NextStep views={section.views} view={view} go={go} />}
                  </div>
                </div>
              </div>
              {sheet && <FmPlayerSheet id={sheet} players={players} snap={snapshot.data} history={history} folder={folder} gameDate={snapshot.gameDate} onClose={() => setSheet(null)} />}
            </PlayerSheetContext.Provider>
          </FmSaveScopeContext.Provider>
        )}
      </div>
    </div>
  );
}

/** Parties d'un onglet regroupé : une à la fois, choisie par des sous-onglets (la première par défaut). */
function PageParts({ page, current, go, render }: { page: string; current: string; go: (v: string) => void; render: (v: string) => ReactNode }) {
  const { t } = useTranslation();
  const parts = PARTS[page] ?? [page];
  const active = parts.includes(current) ? current : parts[0]!;
  return (
    <>
      {parts.length > 1 && (
        <div className="sticky top-0 z-30 -mx-1 mb-5 flex flex-wrap gap-1 border-b border-canard/10 bg-creme px-1 pt-2" role="tablist" aria-label={t('fm.onThisPage')}>
          {parts.map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={v === active}
              onClick={() => go(v)}
              className={`-mb-px rounded-t-lg border-b-2 px-3 py-1.5 text-sm font-bold ${v === active ? 'border-eau-fonce text-canard' : 'border-transparent text-canard/60 hover:text-canard'}`}
            >
              {t(`fm.subtabs.${v}`, { defaultValue: t(`fm.views.${v}`) })}
            </button>
          ))}
        </div>
      )}
      <section key={active} role={parts.length > 1 ? 'tabpanel' : undefined}>
        {render(active)}
      </section>
    </>
  );
}

/** En-tête commun à tous les écrans : section, nom de l'écran et la question à laquelle il répond. */
function ViewHeader({ section, view, part }: { section: string; view: string; part: string }) {
  const { t } = useTranslation();
  return (
    <header className="mb-4">
      {section !== view && <p className="text-xs font-bold uppercase tracking-wide text-canard/50">{t(`fm.sections.${section}`)}</p>}
      <h2 className="text-2xl font-semibold">{pageLabel(t, view)}</h2>
      <p className="mt-0.5 max-w-3xl text-sm text-brun">{t(`fm.intro.${part}`)}</p>
    </header>
  );
}

/** Lien vers l'étape suivante d'une section en étapes. */
function NextStep({ views, view, go }: { views: readonly string[]; view: string; go: (v: string) => void }) {
  const { t } = useTranslation();
  const next = views[views.indexOf(view) + 1];
  if (!next) return null;
  return (
    <div className="mt-6 flex justify-end">
      <button type="button" className="btn-secondary text-sm" onClick={() => go(next)}>
        {t('fm.nextStep', { view: pageLabel(t, next) })} →
      </button>
    </div>
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

type FmHistoryFile = { gameDate: string; club: string | null; bytes: number };

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
