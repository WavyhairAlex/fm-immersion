import { gameFormationOf, gameLineup, normalizePlayer, squadSnapshot, withExtended, type FmPlayer, type FmSnapshot, type Line, type SquadAt } from '@simloom/module-fm';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { FmDressing } from './FmDressing';
import { FmEffectiveness } from './FmEffectiveness';
import { FmFinances } from './FmFinances';
import { FmHome } from './FmHome';
import { FmLoans } from './FmLoans';
import { FmOpponent } from './FmOpponent';
import { FmProgression } from './FmProgression';
import { FmProject } from './FmProject';
import { FmRoles } from './FmRoles';
import { FmStats } from './FmStats';
import { FmStyle } from './FmStyle';
import { FmTactic } from './FmTactic';
import { FmTargets } from './FmTargets';
import { FmTraining } from './FmTraining';
import { FmWages } from './FmWages';

const LINES: Line[] = ['GB', 'DEF', 'MIL', 'ATT'];

/**
 * Les écrans de la page, rangés en 5 sections qui répondent chacune à une question :
 * qui ai-je (Effectif), qui joue le prochain match (Tactique), où va l'équipe (Mon projet, à suivre
 * dans l'ordre : style visé, feuille de route, entraînement, recrutement), et le club.
 */
const SECTIONS = [
  { id: 'home', views: ['home'] },
  { id: 'squad', views: ['squad', 'analysis', 'stats', 'compare', 'dressing', 'loans'] },
  { id: 'tactic', views: ['tactic', 'opponent', 'depth', 'calendar', 'roles', 'effectiveness'] },
  { id: 'project', views: ['style', 'project', 'training', 'mercato', 'targets'] },
  { id: 'club', views: ['finances', 'wages', 'contracts', 'progression'] },
] as const;
/** Sections dont les écrans s'enchaînent comme des étapes (numérotées, avec « étape suivante »). */
const STEPPED = new Set<string>(['project']);
type View = (typeof SECTIONS)[number]['views'][number];
const VIEW_KEY = 'simloom.fm.view';
const readView = (): View => {
  try {
    const v = localStorage.getItem(VIEW_KEY) as View | null;
    return v && SECTIONS.some((s) => (s.views as readonly string[]).includes(v)) ? v : 'home';
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

  const { data: allSaves } = useQuery({ queryKey: ['saves'], queryFn: savesData.list });
  const save = allSaves?.find((s) => s.id === saveId);
  // Les réglages d'écran d'avant le lien partie ↔ sauvegarde reviennent à la plus ancienne partie FM.
  const scope = useMemo<FmSaveScope | null>(() => {
    if (!allSaves) return null;
    const oldest = allSaves.filter((s) => s.gameId === 'fm').sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    return { saveId, inheritsLegacy: oldest?.id === saveId };
  }, [allSaves, saveId]);
  const { data: snapshot, isLoading } = useQuery({ queryKey: [...key, 'latest'], queryFn: () => fmData.latest(saveId) });
  const { data: all } = useQuery({ queryKey: [...key, 'all'], queryFn: () => fmData.all(saveId) });
  const { data: settings } = useQuery({ queryKey: [...key, 'settings'], queryFn: () => fmData.settings(saveId) });
  const { data: defaultFolder } = useQuery({
    queryKey: ['fm', 'default-folder'],
    queryFn: () => invoke<string | null>('fm_default_folder'),
  });

  const [view, setView] = useState<View>(readView);
  const go = (v: string) => {
    setView(v as View);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* stockage indisponible : l'écran n'est pas retenu */
    }
  };
  const section = SECTIONS.find((s) => (s.views as readonly string[]).includes(view)) ?? SECTIONS[0];
  const [folder, setFolder] = useState('');
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

  // Import automatique : le plugin réécrit son instantané toutes les 5 minutes ; on le relit chaque minute et
  // on l'enregistre dès qu'il a changé, pour que tout l'écran suive la partie sans bouton à presser.
  const lastText = useRef<string | null>(null);
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
        if (stop || text === lastText.current) return;
        lastText.current = text;
        await fmData.importSnapshot(saveId, JSON.parse(text));
        setOther(null);
        qc.invalidateQueries({ queryKey: key });
        qc.invalidateQueries({ queryKey: ['saves'] });
      } catch (e) {
        // Autre sauvegarde chargée : on le signale ; sinon fichier absent ou en cours d'écriture, nouvel essai dans une minute.
        if (e instanceof FmOtherSaveError) setOther(e);
      }
    };
    void tick();
    const id = setInterval(() => void tick(), 60_000);
    return () => {
      stop = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder, saveId]);

  const players = useMemo(() => (snapshot ? withExtended(squadSnapshot(snapshot.data)).players.map(normalizePlayer) : []), [snapshot]);
  const history = useMemo<SquadAt[]>(
    () => (all ?? []).map((h) => ({ gameDate: h.gameDate, players: squadSnapshot(h.data as FmSnapshot).players.map(normalizePlayer) })),
    [all],
  );
  const gameFormation = gameFormationOf(snapshot?.data.tactic);
  const lineup = useMemo(() => gameLineup(snapshot?.data), [snapshot?.data]);
  const dateFmt = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: 'long' });
  const stampFmt = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: 'short', timeStyle: 'short' });

  return (
    <div className="w-full px-6 py-4 xl:px-10">
      {/* En-tête compact : partie et contexte à gauche, import et plugin à droite. */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
          <Link to="/" className="text-sm font-bold text-canard/70 hover:text-canard" title={t('fm.back')}>
            ←
          </Link>
          <h1 className="text-2xl font-semibold">{save?.name ?? '…'}</h1>
          {snapshot && (
            <span className="text-sm text-brun">
              {t('fm.context', { club: snapshot.club, date: dateFmt.format(new Date(snapshot.gameDate)), count: snapshot.playerCount })}
            </span>
          )}
          {freeSince && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-0.5 text-sm font-bold text-canard ring-1 ring-canard/15">
              <span className="inline-block h-2 w-2 rounded-full bg-ambre" aria-hidden />
              {t('fm.saveFile.free', { date: dateFmt.format(new Date(freeSince)) })}
            </span>
          )}
        </div>
        <form
          className="flex flex-wrap items-center gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            importSnap.mutate({});
          }}
        >
          <details className="relative text-sm" open={!snapshot}>
            <summary className="cursor-pointer font-bold text-canard/70">{t('fm.folder')}</summary>
            <div className={snapshot ? 'absolute right-0 z-20 mt-2 w-[28rem] rounded-xl bg-white p-3 shadow-lg ring-1 ring-canard/10' : 'mt-2'}>
              <input className="input w-full" required value={folder} onChange={(e) => setFolder(e.target.value)} aria-label={t('fm.folder')} />
              <p className="mt-1 text-xs text-canard/60">{t('fm.folderHelp')}</p>
            </div>
          </details>
          <label className="flex items-center gap-2 text-sm">
            <span className="font-bold text-canard/70">{t('fm.saveFile.label')}</span>
            <select
              className="input max-w-[16rem] py-1 text-sm"
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
          </label>
          {linkedFile?.modifiedMs != null && (
            <span className="text-xs text-brun">{t('fm.saveFile.saved', { date: stampFmt.format(new Date(linkedFile.modifiedMs)) })}</span>
          )}
          <span className="text-xs text-brun">{t('fm.autoImport')}</span>
          <button className="btn-primary px-4 py-1.5 text-sm" disabled={importSnap.isPending || !folder}>
            {t('fm.import')}
          </button>
        </form>
      </div>
      {other && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-white px-4 py-3 text-sm ring-1 ring-corail/40" role="alert">
          <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-ambre" aria-hidden />
          <span className="text-canard">{t('fm.saveFile.other', { club: other.club, expected: other.expected })}</span>
          <button type="button" className="btn-secondary px-3 py-1 text-xs" disabled={importSnap.isPending} onClick={() => importSnap.mutate({ force: true })}>
            {t('fm.saveFile.importAnyway', { club: other.club })}
          </button>
        </div>
      )}
      {importSnap.isError && !other && <p className="mt-2 text-sm text-corail">{t('fm.importError', { reason: String(importSnap.error?.message ?? importSnap.error) })}</p>}

      <FmBridge dataFolder={folder} />
      <FmMemory />

      {!isLoading && !snapshot && (
        <div className="card mt-6 flex flex-col items-center gap-3 py-10 text-center">
          <img src="/brand/football-sm.webp" alt="" className="h-28 w-auto rounded-2xl" />
          <p className="max-w-md text-brun">{t('fm.empty')}</p>
        </div>
      )}

      {snapshot && players.length > 0 && scope && (
        <FmSaveScopeContext.Provider value={scope}>
        <div className="mt-4 lg:grid lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-6">
          {/* Navigation : colonne à gauche sur grand écran, onglets au-dessus sinon. */}
          <nav className="hidden lg:block" aria-label={t('fm.nav')}>
            <div className="sticky top-4 space-y-3">
              {SECTIONS.map((s) => (
                <div key={s.id}>
                  {s.views.length > 1 && <p className="px-2 text-xs font-bold uppercase tracking-wide text-canard/50">{t(`fm.sections.${s.id}`)}</p>}
                  {s.views.map((v) => (
                    <button
                      key={v}
                      type="button"
                      aria-current={v === view ? 'page' : undefined}
                      onClick={() => go(v)}
                      className={`block w-full rounded-lg px-2 py-1 text-left text-sm font-bold ${v === view ? 'bg-canard text-white' : 'text-canard hover:bg-white'}`}
                    >
                      {STEPPED.has(s.id) && <span className="mr-1.5 tabular-nums opacity-60">{s.views.indexOf(v as never) + 1}.</span>}
                      {t(`fm.views.${v}`)}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </nav>
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
                className={`rounded-full px-4 py-1.5 font-bold ${s === section ? 'bg-canard text-white' : 'bg-white text-canard ring-1 ring-canard/15'}`}
              >
                {t(`fm.sections.${s.id}`)}
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
                  {t(`fm.views.${v}`)}
                </button>
              ))}
            </div>
          )}
          </div>
          <div className="mt-4 lg:mt-0">
            <ViewHeader section={section.id} view={view} />
            {view === 'home' && <FmHome snap={snapshot.data} players={players} folder={folder} go={go} />}
            {view === 'squad' && <SquadTable players={players} />}
            {view === 'analysis' && <FmAnalysis players={players} gameDate={snapshot.gameDate} />}
            {view === 'stats' && <FmStats snap={snapshot.data} players={players} />}
            {view === 'compare' && <FmCompare saveId={saveId} snap={snapshot.data} players={players} folder={folder} history={history} />}
            {view === 'dressing' && <FmDressing players={players} />}
            {view === 'loans' && <FmLoans snap={snapshot.data} />}
            {view === 'tactic' && <FmTactic snap={snapshot.data} go={go} players={players} folder={folder} gameFormation={gameFormation} lineup={lineup} lineupStatus={(snapshot.data as { collecte?: { compo?: string } }).collecte?.compo ?? null} />}
            {view === 'opponent' && <FmOpponent snap={snapshot.data} />}
            {view === 'calendar' && <FmCalendar snap={snapshot.data} players={players} />}
            {view === 'roles' && <FmRoles players={players} folder={folder} />}
            {view === 'style' && <FmStyle players={players} folder={folder} />}
            {view === 'effectiveness' && <FmEffectiveness snap={snapshot.data} history={history} go={go} />}
            {view === 'project' && <FmProject snap={snapshot.data} players={players} folder={folder} history={history} />}
            {view === 'training' && <FmTraining snap={snapshot.data} players={players} folder={folder} />}
            {view === 'mercato' && <FmMercato players={players} folder={folder} gameDate={snapshot.gameDate} history={history} />}
            {view === 'targets' && <FmTargets saveId={saveId} snap={snapshot.data} players={players} folder={folder} go={go} />}
            {view === 'depth' && <FmDepth players={players} folder={folder} gameFormation={gameFormation} lineup={lineup} gameDate={snapshot.gameDate} history={history} />}
            {view === 'finances' && <FmFinances snap={snapshot.data} players={players} />}
            {view === 'wages' && <FmWages players={players} gameDate={snapshot.gameDate} />}
            {view === 'contracts' && <FmContracts players={players} gameDate={snapshot.gameDate} />}
            {view === 'progression' && <FmProgression history={history} />}
            {STEPPED.has(section.id) && <NextStep views={section.views} view={view} go={go} />}
          </div>
          </div>
        </div>
        </FmSaveScopeContext.Provider>
      )}
    </div>
  );
}

/** En-tête commun à tous les écrans : section, nom de l'écran et la question à laquelle il répond. */
function ViewHeader({ section, view }: { section: string; view: string }) {
  const { t } = useTranslation();
  return (
    <header className="mb-4">
      {section !== view && <p className="text-xs font-bold uppercase tracking-wide text-canard/50">{t(`fm.sections.${section}`)}</p>}
      <h2 className="text-2xl font-semibold">{t(`fm.views.${view}`)}</h2>
      <p className="mt-0.5 max-w-3xl text-sm text-brun">{t(`fm.intro.${view}`)}</p>
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
        {t('fm.nextStep', { view: t(`fm.views.${next}`) })} →
      </button>
    </div>
  );
}

type SortKey = 'name' | 'age' | 'level' | 'condition' | 'contractEnd' | 'wage';

function SquadTable({ players }: { players: FmPlayer[] }) {
  const { t, i18n } = useTranslation();
  const [line, setLine] = useState<Line | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'level', desc: true });
  const money = new Intl.NumberFormat(i18n.resolvedLanguage, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const date = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: 'medium' });

  const rows = useMemo(() => {
    const list = line ? players.filter((p) => p.line === line) : players;
    const val = (p: FmPlayer) => p[sort.key];
    return [...list].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      if (x == null) return 1;
      if (y == null) return -1;
      const c = typeof x === 'string' ? x.localeCompare(String(y)) : x - (y as number);
      return sort.desc ? -c : c;
    });
  }, [players, line, sort]);

  const head = (key: SortKey, label: string) => (
    <th className="px-3 py-2 text-left">
      <button
        type="button"
        className="font-bold hover:text-canard"
        onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== 'name' }))}
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
              className={`rounded-full px-3 py-1 text-sm font-bold ${line === l ? 'bg-canard text-white' : 'bg-white text-canard ring-1 ring-canard/15'}`}
            >
              {t(`fm.line.${l ?? 'all'}`)} · {l ? players.filter((p) => p.line === l).length : players.length}
            </button>
          ))}
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
              {head('contractEnd', t('fm.col.contract'))}
              {head('wage', t('fm.col.wage'))}
              <th className="px-3 py-2 text-left font-bold">{t('fm.col.status')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-b border-canard/5 odd:bg-creme/40">
                <td className="px-3 py-2 font-bold">
                  {p.name}
                  {p.injury && <span className="ml-2 rounded-full bg-corail/15 px-2 py-0.5 text-xs text-canard">{p.injury}</span>}
                  {p.suspension && <span className="ml-2 rounded-full bg-corail/15 px-2 py-0.5 text-xs text-canard">{p.suspension === 'Suspendu' ? t('fm.home.kind.suspended') : `${t('fm.home.kind.suspended')} : ${p.suspension}`}</span>}
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
                  {p.level?.toFixed(1) ?? '–'}
                  {p.stars?.current != null && (
                    <span className="ml-2 text-xs font-normal text-brun" title={t('fm.col.starsHelp')}>
                      ★ {p.stars.current}
                      {p.stars.potential != null ? ` / ${p.stars.potential}` : ''}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">{p.condition != null ? `${Math.round(p.condition)} %` : '–'}</td>
                <td className="px-3 py-2">{p.contractEnd ? date.format(new Date(p.contractEnd)) : '–'}</td>
                <td className="px-3 py-2">{p.wage != null ? money.format(p.wage) : '–'}</td>
                <td className="px-3 py-2 text-brun">{p.squadStatus ?? '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
