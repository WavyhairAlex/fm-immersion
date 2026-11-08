import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useUi } from '../lib/ui-store';
import { shownGameDate, useCareer, useCareerStore } from '../lib/career';
import { CLUB_PAGES, pageOf, type ClubPage } from '../lib/club-nav';
import { coachPhotoSource, type CoachPhotoCrop } from '../lib/coach-photo';
import { fmData } from '../lib/data';
import { CoachPhotoEditor, type CoachPhotoResult } from './CoachPhotoEditor';

/** Icônes au trait (24×24), dessinées ici : aucun visuel du jeu. */
const ICONS: Record<string, ReactNode> = {
  today: <path d="M3 11l9-8 9 8M5 10v10h14V10" />,
  tactic: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M12 3v18M3 12h4M17 12h4" />
    </>
  ),
  squad: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2 20c1-4 4-6 7-6s6 2 7 6M16 4.5a3.5 3.5 0 010 7M22 20c-.5-2.5-2-4.5-4-5.5" />
    </>
  ),
  results: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  mercato: <path d="M4 7h13l-3-3M20 17H7l3 3" />,
  gazette: <path d="M4 4h13v16H6a2 2 0 01-2-2zM17 8h3v10a2 2 0 01-2 2M7 8h7M7 12h7M7 16h4" />,
  discord: <path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z" />,
  challenges: <path d="M7 4h10v5a5 5 0 01-10 0zM4 5h3M17 5h3M12 14v4M8 21h8" />,
  faces: (
    <>
      <circle cx="12" cy="9" r="4.5" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </>
  ),
  settings: <path d="M9 2v5M15 2v5M6 7h12v4a6 6 0 01-12 0zM12 17v5" />,
  world: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
    </>
  ),
};

function Icon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0 fill-none stroke-current opacity-80" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICONS[name]}
    </svg>
  );
}

function Item({ to, icon, label, active, end, badge }: { to: string; icon: string; label: string; active?: boolean; end?: boolean; badge?: ReactNode }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `nav-link ${(active ?? isActive) ? 'active' : ''}`}>
      <Icon name={icon} />
      <span className="flex-1">{label}</span>
      {badge}
    </NavLink>
  );
}

const Count = ({ n, label }: { n: number; label: string }) =>
  n > 0 ? (
    <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-orange-fonce px-1.5 text-xs font-extrabold tabular-nums text-white" aria-label={label} title={label}>
      {n}
    </span>
  ) : null;

const Soft = ({ children }: { children: ReactNode }) => (
  <span className="rounded bg-white/10 px-1.5 py-0.5 text-[0.6875rem] font-bold uppercase tracking-wide text-white/70">{children}</span>
);

/**
 * Barre latérale unique : la carrière suivie en haut (photo du coach, club, date, lecture du plugin), puis un lien
 * par écran, en trois groupes : le club, la carrière racontée, le jeu.
 */
export function Sidebar() {
  const { t, i18n } = useTranslation();
  const otherLang = i18n.resolvedLanguage === 'fr' ? 'en' : 'fr';
  const { pathname } = useLocation();
  const { saveId } = useCareer();
  const todo = useCareerStore((s) => s.todo);
  const bridgeOk = useCareerStore((s) => s.sync.bridgeOk);
  // Pastilles du briefing : valables pour la carrière suivie (remises à jour à chaque nouvelle date par l'accueil).
  const todoViews = saveId && todo.at.startsWith(`${saveId}|`) ? todo.views : [];
  const count = (p: ClubPage) => todoViews.filter((v) => pageOf(v) === p).length;
  const clubOpen = pathname.startsWith('/club/') ? pageOf(pathname.slice('/club/'.length)) : null;

  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col overflow-y-auto bg-canard px-3 py-5 text-white">
      <Link to="/" className="px-3" aria-label="FM Immersion">
        <span className="font-display text-2xl font-semibold">
          FM <span className="text-orange">Immersion</span>
        </span>
      </Link>

      <CareerCard />

      <SearchButton />

      <nav className="mt-2 flex flex-col gap-0.5" aria-label={t('nav.modes')}>
        <Item to="/" end icon="today" label={t('layout.nav.today')} badge={<Count n={todoViews.length} label={t('fm.brief.tabBadge', { count: todoViews.length })} />} />
        <p className="nav-group">{t('layout.groups.club')}</p>
        {CLUB_PAGES.map((p) => (
          <Item key={p} to={`/club/${p}`} icon={p} label={t(`layout.nav.${p}`)} active={clubOpen === p} badge={<Count n={count(p)} label={t('fm.brief.tabBadge', { count: count(p) })} />} />
        ))}
        <p className="nav-group">{t('layout.groups.story')}</p>
        <Item to="/gazette" icon="gazette" label={t('layout.nav.story')} active={pathname === '/gazette' || pathname === '/discord'} />
        <Item to="/defis" icon="challenges" label={t('modes.challenges.title')} />
        <p className="nav-group">{t('layout.groups.game')}</p>
        <Item to="/visages" icon="faces" label={t('layout.nav.faces')} />
        <Item to="/reglages" icon="settings" label={t('layout.nav.settings')} badge={bridgeOk === false ? <span className="h-2 w-2 rounded-full bg-ambre" aria-label={t('layout.bridgeAction')} /> : null} />
        <Item to="/monde" icon="world" label={t('modes.world.title')} badge={<Soft>{t('modes.soon')}</Soft>} />
      </nav>

      <div className="mt-auto flex items-center justify-between px-3 pt-6 text-xs font-bold text-white/60">
        <button type="button" className="hover:text-white" onClick={() => i18n.changeLanguage(otherLang)}>
          {t('nav.language')}
        </button>
        <span>{t('nav.version', { version: __APP_VERSION__ })}</span>
      </div>
    </aside>
  );
}

/** Carte de la carrière suivie : photo du coach (cliquable pour la changer), club, date de jeu, choix de la carrière. */
function CareerCard() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { saveId, save, fmSaves, setSaveId } = useCareer();
  const { data: snapshot } = useQuery({ queryKey: ['fm', saveId, 'latest'], queryFn: () => fmData.latest(saveId), enabled: !!saveId });
  const { data: settings } = useQuery({ queryKey: ['fm', saveId, 'settings'], queryFn: () => fmData.settings(saveId), enabled: !!saveId });
  const free = useCareerStore((s) => s.sync.free);
  const now = useCareerStore((s) => s.sync.now);
  const gameDate = shownGameDate(snapshot, now);
  const [picking, setPicking] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  // Recadrage ouvert : image de départ et cadrage (repris de la photo actuelle, ou nouveau pour une autre image).
  const [editing, setEditing] = useState<{ source: string; crop?: CoachPhotoCrop } | null>(null);
  const [readError, setReadError] = useState(false);
  const photo = useMutation({
    mutationFn: (r: CoachPhotoResult | null) =>
      fmData.updateSettings(saveId, { coachPhoto: r?.photo, coachPhotoSource: r?.source, coachPhotoCrop: r?.crop }),
    onSuccess: () => {
      setEditing(null);
      qc.invalidateQueries({ queryKey: ['fm', saveId, 'settings'] });
    },
  });
  const pick = () => file.current?.click();
  // Avec une photo : on rouvre son recadrage (l'image d'origine si on l'a, sinon la photo elle-même).
  const editPhoto = () =>
    settings?.coachPhoto ? setEditing({ source: settings.coachPhotoSource ?? settings.coachPhoto, crop: settings.coachPhotoSource ? settings.coachPhotoCrop : undefined }) : pick();
  const dateFmt = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: 'medium' });

  if (!saveId)
    return (
      <Link to="/parties" className="mx-1 mt-5 block rounded-xl bg-white/[0.07] p-3 text-sm font-bold text-white/80 hover:bg-white/10">
        {t('layout.career.create')}
      </Link>
    );

  const initials = (save?.name ?? '?')
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="mx-1 mt-5 rounded-xl bg-white/[0.07] p-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="group relative h-12 w-12 shrink-0 rounded-full"
          onClick={editPhoto}
          title={t('layout.career.photo')}
          aria-label={t('layout.career.photo')}
        >
          <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-white/10 ring-2 ring-orange/70">
            {settings?.coachPhoto ? <img src={settings.coachPhoto} alt="" className="h-full w-full object-cover" /> : <span className="text-sm font-extrabold">{initials}</span>}
          </span>
          {/* Appareil photo : montre que le rond se clique pour choisir la photo du coach. */}
          <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-orange-fonce ring-2 ring-canard group-hover:brightness-110" aria-hidden>
            <svg viewBox="0 0 24 24" className="h-3 w-3 fill-none stroke-white" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
          </span>
        </button>
        <input
          ref={file}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            setReadError(false);
            coachPhotoSource(f).then(
              (source) => setEditing({ source }),
              () => setReadError(true),
            );
          }}
        />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 break-words text-sm font-extrabold leading-snug" title={save?.name}>{save?.name}</p>
          <p className="truncate text-xs text-white/70">{free ? t('layout.career.free') : (snapshot?.club ?? t('layout.career.noData'))}</p>
          {snapshot && gameDate && <p className="truncate text-xs text-white/70">{dateFmt.format(new Date(gameDate))}</p>}
        </div>
      </div>
      {(photo.isError || readError) && <p className="mt-2 text-xs font-bold text-white">{t('layout.career.photoError')}</p>}
      <div className="mt-2 flex items-center gap-3 text-xs font-bold text-white/60">
        {fmSaves.length > 1 && (
          <button type="button" className="hover:text-white" aria-expanded={picking} onClick={() => setPicking(!picking)}>
            {t('layout.career.switch')} ▾
          </button>
        )}
        <button type="button" className="text-orange hover:text-white" onClick={editPhoto}>
          {t(settings?.coachPhoto ? 'layout.career.adjustPhoto' : 'layout.career.addPhoto')}
        </button>
        {settings?.coachPhoto && (
          <button type="button" className="hover:text-white" onClick={() => photo.mutate(null)}>
            {t('layout.career.removePhoto')}
          </button>
        )}
        <Link to="/parties" className="ml-auto hover:text-white">
          {t('layout.career.manage')}
        </Link>
      </div>
      {editing && (
        <CoachPhotoEditor
          source={editing.source}
          initialCrop={editing.crop}
          saving={photo.isPending}
          onSave={(r) => photo.mutate(r)}
          onCancel={() => setEditing(null)}
          onPickOther={pick}
        />
      )}
      {picking && (
        <ul className="mt-2 space-y-0.5 border-t border-white/10 pt-2">
          {fmSaves.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className={`w-full truncate rounded px-2 py-1 text-left text-sm font-bold ${s.id === saveId ? 'bg-white/10 text-white' : 'text-white/75 hover:bg-white/5 hover:text-white'}`}
                onClick={() => {
                  setSaveId(s.id);
                  setPicking(false);
                }}
              >
                {s.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Ouvre la recherche rapide (aussi au clavier : Ctrl+K). */
function SearchButton() {
  const { t } = useTranslation();
  const setOpen = useUi((s) => s.setSearchOpen);
  return (
    <button type="button" onClick={() => setOpen(true)} className="mx-1 mt-3 flex items-center justify-between rounded-lg bg-white/[0.07] px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white">
      <span>{t('search.button')}</span>
      <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-sans text-xs">Ctrl K</kbd>
    </button>
  );
}
