import { COUNTRIES, crestLetters, inkOn, type CareerSpell } from '@fm-immersion/module-fm';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { CoachLifeSection, TrophyCabinet } from '../components/CoachLife';
import { PageHero } from '../components/PageHero';
import { useCareerSpells } from '../lib/coach-world';
import { useFmFolder } from '../lib/fm-sync';
import { FmHistoryImport } from './FmSave';
import { clubLook, rememberClubLooks } from '../lib/club-look';
import { Crest } from '../components/Crest';
import { fmData } from '../lib/data';
import { trophyName } from '../lib/farewell-text';
import { ordinal } from '../lib/season-une';
import { MAP_HEIGHT, MAP_PINS, MAP_SHAPES, MAP_WIDTH } from '../lib/world-map';

/** Nom d'un pays dans la langue de l'appli : nom ISO du navigateur, nations britanniques traduites ici. */
export function countryName(t: TFunction, code: string, lang?: string) {
  if (code.startsWith('GB-')) return t(`careerPage.nations.${code}`);
  try {
    return new Intl.DisplayNames([lang ?? 'fr'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** « Ma carrière » : le parcours du coach dans la partie suivie (clubs, saisons, titres) et sa carte du monde. */
export function Career() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;
  const qc = useQueryClient();
  const { saveId, save, fmSaves, history, isLoading, settings, hidden, kept, raw, fixed, career } = useCareerSpells();
  useMemo(() => rememberClubLooks(history.map((h) => h.data)), [history]);
  const folder = useFmFolder(saveId);
  const setCountry = useMutation({
    mutationFn: ({ club, code }: { club: string; code: string | null }) =>
      fmData.updateSettings(saveId, (prev) => {
        const next = { ...(prev.careerCountries ?? {}) };
        if (code) next[club] = code;
        else delete next[club];
        return { careerCountries: next };
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fm', saveId, 'settings'] }),
  });
  const setHidden = useMutation({
    mutationFn: ({ club, hide }: { club: string; hide: boolean }) =>
      fmData.updateSettings(saveId, (prev) => {
        const list = (prev.careerHidden ?? []).filter((c) => c !== club);
        return { careerHidden: hide ? [...list, club] : list.length ? list : undefined };
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fm', saveId, 'settings'] }),
  });

  const dateFmt = new Intl.DateTimeFormat(lang, { dateStyle: 'medium' });
  const tt = career.totals;

  return (
    <div className="w-full px-6 py-6 xl:px-10">
      <p className="text-xs font-bold uppercase tracking-wide text-canard/50">{t('layout.groups.story')}</p>
      <h1 className="text-3xl font-semibold">{t('careerPage.title')}</h1>
      <p className="help mt-1">{t('careerPage.intro')}</p>

      {!fmSaves.length && (
        <div className="card mt-6 max-w-3xl">
          <p className="text-brun">{t('careerPage.noSave')}</p>
          <Link to="/parties" className="btn-primary mt-4">
            {t('layout.career.create')}
          </Link>
        </div>
      )}
      {!!fmSaves.length && !isLoading && !career.spells.length && !hidden.length && (
        <div className="card mt-6 max-w-3xl">
          <p className="font-display text-xl font-semibold">{t('careerPage.emptyTitle')}</p>
          <p className="mt-2 text-brun">{t('careerPage.empty')}</p>
        </div>
      )}

      {!!career.spells.length && (
        <>
          {/* Bandeau de la maquette : la saison et le club d'aujourd'hui, la photo du coach à droite. */}
          <PageHero
            eyebrow={career.spells.at(-1)!.seasons.at(-1)?.label ?? t('careerPage.title')}
            title={career.spells.at(-1)!.current ? career.spells.at(-1)!.club : t('layout.career.free')}
            text={t('careerPage.summary', {
              coach: save?.name ?? '',
              since: dateFmt.format(new Date(career.spells[0]!.start.slice(0, 10))),
              clubs: t('careerPage.nClubs', { count: tt.clubs }),
              countries: t('careerPage.nCountries', { count: tt.countries }),
            })}
            image={settings?.coachPhoto ?? null}
          />

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
            <Tile value={String(tt.seasons + (tt.ongoingSeason ? 1 : 0))} label={t('careerPage.tile.seasons', { count: tt.seasons + (tt.ongoingSeason ? 1 : 0) })} />
            <Tile value={String(tt.played)} label={t('careerPage.tile.played', { count: tt.played })} />
            <Tile value={`${tt.wins}-${tt.draws}-${tt.losses}`} label={t('careerPage.tile.record')} />
            <Tile value={tt.winRate != null ? `${tt.winRate} %` : '–'} label={t('careerPage.tile.winRate')} />
            <Tile value={`${tt.goalsFor}-${tt.goalsAgainst}`} label={t('careerPage.tile.goals')} />
            <Tile value={tt.pointsPerGame != null ? new Intl.NumberFormat(lang, { minimumFractionDigits: 2 }).format(tt.pointsPerGame) : '–'} label={t('careerPage.tile.ppg')} />
            <Tile value={String(tt.trophies)} label={t('careerPage.tile.trophies', { count: tt.trophies })} accent={tt.trophies > 0} />
            <Tile value={tt.bestFinish != null ? ordinal(t, tt.bestFinish) : '–'} label={t('careerPage.tile.best')} />
          </div>
          <p className="help mt-2 text-xs">{tt.fromGame ? t('careerPage.fromGame') : t('careerPage.fromSnapshots')}</p>

          <div className="mt-6 grid gap-6 2xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <WorldMap spells={career.spells} />
            <div className="card">
              <h2 className="text-xl font-semibold">{t('careerPage.honours')}</h2>
              <TrophyCabinet spells={career.spells} />
              <h3 className="mt-6 text-sm font-extrabold uppercase tracking-wider text-canard/60">{t('careerPage.records')}</h3>
              <ul className="mt-2 space-y-1.5 text-sm">
                {tt.biggestWin && (
                  <li>
                    {t('careerPage.biggestWin', {
                      score: `${tt.biggestWin.goalsFor}-${tt.biggestWin.goalsAgainst}`,
                      opponent: tt.biggestWin.opponent ?? t('careerPage.unknownOpponent'),
                      club: tt.biggestWin.club,
                    })}
                  </li>
                )}
                {tt.unbeaten > 0 && <li>{t('careerPage.unbeaten', { count: tt.unbeaten })}</li>}
                <li>{t('careerPage.cleanSheets', { count: tt.cleanSheets })}</li>
                <li>{t('careerPage.days', { count: tt.days })}</li>
              </ul>
            </div>
          </div>

          <h2 className="mt-8 text-2xl font-semibold">{t('careerPage.clubs')}</h2>
          <ol className="mt-3 space-y-4">
            {[...career.spells].reverse().map((s, i) => (
              <SpellCard
                key={`${s.club}-${s.start}`}
                n={career.spells.length - i}
                spell={s}
                auto={raw.spells.find((r) => r.start === s.start)?.country ?? null}
                manual={!!fixed[s.club]}
                onCountry={(code) => setCountry.mutate({ club: s.club, code })}
                onHide={() => setHidden.mutate({ club: s.club, hide: true })}
              />
            ))}
          </ol>
          <p className="mt-4 text-xs text-brun">{t('careerPage.source')}</p>

          <CoachLifeSection saveId={saveId} life={settings?.coachLife} spells={career.spells} gameDate={kept.at(-1)?.gameDate ?? null} history={kept} />
        </>
      )}

      {!!fmSaves.length && !isLoading && (
        <div className="card mt-8 max-w-4xl">
          <h2 className="text-xl font-semibold">{t('careerPage.fixTitle')}</h2>
          <p className="mt-1 text-sm text-brun">{t('careerPage.fixHelp')}</p>
          {!!hidden.length && (
            <ul className="mt-3 space-y-1.5">
              {hidden.map((club) => (
                <li key={club} className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="font-bold">{club}</span>
                  <span className="text-brun">{t('careerPage.hiddenLabel')}</span>
                  <button type="button" className="btn-secondary px-3 py-1 text-xs" onClick={() => setHidden.mutate({ club, hide: false })}>
                    {t('careerPage.unhide')}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!!folder && (
            <div className="mt-4">
              <FmHistoryImport saveId={saveId} folder={folder} club={career.spells.at(-1)?.club ?? null} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Tile({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 ring-1 ${accent ? 'bg-orange-clair ring-orange/30' : 'bg-white ring-canard/5'}`}>
      <p className="font-display text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs font-bold uppercase tracking-wide text-canard/60">{label}</p>
    </div>
  );
}

function SpellCard({
  n,
  spell: s,
  auto,
  manual,
  onCountry,
  onHide,
}: {
  n: number;
  spell: CareerSpell;
  auto: string | null;
  manual: boolean;
  onCountry: (code: string | null) => void;
  onHide: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;
  const [editing, setEditing] = useState(false);
  const dateFmt = new Intl.DateTimeFormat(lang, { dateStyle: 'medium' });
  const r = s.total;
  const pct = r.played ? Math.round((r.wins / r.played) * 100) : null;
  const options = useMemo(
    () => COUNTRIES.map((c) => ({ code: c.code, name: countryName(t, c.code, lang) })).sort((a, b) => a.name.localeCompare(b.name, lang)),
    [t, lang],
  );
  return (
    <li className="card">
      <div className="flex flex-wrap items-center gap-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-canard text-sm font-extrabold text-white">{n}</span>
        <Crest club={s.club} />
        <div className="min-w-0 flex-1">
          <p className="font-display text-xl font-semibold">{s.club}</p>
          <p className="text-sm text-brun">
            {dateFmt.format(new Date(s.start.slice(0, 10)))} – {s.current ? t('careerPage.now') : dateFmt.format(new Date(s.end.slice(0, 10)))}
            {' · '}
            {editing ? (
              <select
                className="input inline-block w-auto py-0.5 text-sm"
                value={manual ? (s.country ?? '') : ''}
                autoFocus
                onChange={(e) => {
                  onCountry(e.target.value || null);
                  setEditing(false);
                }}
                onBlur={() => setEditing(false)}
                aria-label={t('careerPage.countryPick')}
              >
                <option value="">{auto ? t('careerPage.countryAuto', { name: countryName(t, auto, lang) }) : t('careerPage.countryNone')}</option>
                {options.map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.name}
                  </option>
                ))}
              </select>
            ) : (
              <button type="button" className="font-bold text-orange-fonce hover:underline" onClick={() => setEditing(true)} title={t('careerPage.countryPick')}>
                {s.country ? countryName(t, s.country, lang) : t('careerPage.countryUnknown')}
              </button>
            )}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`pill ${s.current ? '' : s.reason === 'sacked' ? 'bg-corail text-white' : 'bg-canard/10'}`}>
            {s.current ? t('careerPage.current') : t(`careerPage.exit.${s.reason ?? 'left'}`)}
          </span>
          {!s.current && (
            <button type="button" className="text-xs font-bold text-brun hover:text-corail hover:underline" onClick={onHide} title={t('careerPage.hideHelp')}>
              {t('careerPage.hide')}
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <Fact label={t('careerPage.tile.played', { count: r.played })} value={String(r.played)} />
        <Fact label={t('careerPage.tile.record')} value={`${r.wins}-${r.draws}-${r.losses}`} />
        <Fact label={t('careerPage.tile.winRate')} value={pct != null ? `${pct} %` : '–'} />
        <Fact label={t('careerPage.tile.goals')} value={`${r.goalsFor}-${r.goalsAgainst}`} />
        <Fact label={t('careerPage.tile.best')} value={s.bestFinish != null ? ordinal(t, s.bestFinish) : '–'} />
        {r.topScorer && <Fact label={t('careerPage.topScorer')} value={`${r.topScorer.name} (${r.topScorer.value})`} />}
      </div>

      {s.untracked.matches > 0 && (
        <p className="mt-2 text-xs text-brun">
          {s.untracked.record
            ? t('careerPage.rebuilt', { count: s.untracked.matches, witness: s.untracked.record.witness })
            : t('careerPage.untracked', { count: s.untracked.matches, goals: s.untracked.goalsFor })}
        </p>
      )}

      {!!(s.trophies.length || s.awards?.length) && (
        <p className="mt-3 flex flex-wrap gap-2">
          {s.trophies.map((tr, i) => (
            <span key={i} className="pill">
              🏆 {trophyName(t, tr)} {tr.season}
            </span>
          ))}
          {(s.awards ?? []).map((a) => (
            <span key={a.month} className="pill">
              🏅 {t('careerPage.mapAwardOne', { month: new Intl.DateTimeFormat(i18n.resolvedLanguage, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${a.month}-01T00:00:00Z`)) })}
            </span>
          ))}
        </p>
      )}

      {!!s.seasons.length && (
        <div className="mt-4 overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('careerPage.col.season')}</th>
                <th>{t('careerPage.col.position')}</th>
                <th>{t('careerPage.col.played')}</th>
                <th>{t('careerPage.col.record')}</th>
                <th>{t('careerPage.col.goals')}</th>
                <th>{t('careerPage.col.cups')}</th>
              </tr>
            </thead>
            <tbody>
              {[...s.seasons].reverse().map((x, i) => (
                <tr key={i}>
                  <td className="font-bold">
                    {x.label}
                    {!x.ended && <span className="ml-2 text-xs font-normal text-brun">{t(s.current ? 'careerPage.ongoing' : 'careerPage.leftMidSeason')}</span>}
                  </td>
                  <td>{x.position != null ? ordinal(t, x.position) : '–'}</td>
                  <td>
                    {x.played}
                    {x.untracked.matches > 0 && !x.untracked.record && <span className="ml-1 text-xs text-brun">{t('careerPage.untrackedShort', { count: x.untracked.matches })}</span>}
                  </td>
                  <td>
                    {x.wins}-{x.draws}-{x.losses}
                  </td>
                  <td>
                    {x.goalsFor}-{x.goalsAgainst}
                  </td>
                  <td>{x.cupsWon.length ? x.cupsWon.join(', ') : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </li>
  );
}

const Fact = ({ label, value }: { label: string; value: string }) => (
  <div>
    <p className="font-extrabold tabular-nums">{value}</p>
    <p className="text-xs text-brun">{label}</p>
  </div>
);

/** Position d'un passage sur la carte, décalée en cercle quand plusieurs clubs sont dans le même pays. */
function pinsOf(spells: CareerSpell[], spread: number) {
  const byCountry = new Map<string, number[]>();
  spells.forEach((s, i) => {
    if (!s.country || !MAP_PINS[s.country]) return;
    const clubs = byCountry.get(s.country) ?? [];
    // Retour dans un club déjà entraîné : même point.
    if (!clubs.some((j) => spells[j]!.club === s.club)) clubs.push(i);
    byCountry.set(s.country, clubs);
  });
  return spells.map((s, i) => {
    if (!s.country || !MAP_PINS[s.country]) return null;
    const [x, y] = MAP_PINS[s.country]!;
    const clubs = byCountry.get(s.country)!;
    const k = clubs.findIndex((j) => spells[j]!.club === s.club);
    if (clubs.length < 2) return { x, y };
    const a = (2 * Math.PI * k) / clubs.length - Math.PI / 2;
    return { x: x + Math.cos(a) * spread, y: y + Math.sin(a) * spread };
  });
}

/** Bilan d'un club sur toute la carrière (plusieurs passages possibles) : saisons, victoires officielles, titres. */
function clubStats(spells: CareerSpell[], club: string) {
  const mine = spells.filter((s) => s.club === club);
  return {
    seasons: new Set(mine.flatMap((s) => s.seasons.map((x) => x.label))).size,
    wins: mine.reduce((a, s) => a + s.total.wins, 0),
    draws: mine.reduce((a, s) => a + s.total.draws, 0),
    losses: mine.reduce((a, s) => a + s.total.losses, 0),
    trophies: mine.flatMap((s) => s.trophies),
    awards: mine.flatMap((s) => s.awards ?? []),
  };
}

/** Petite coupe dessinée (boîte de 10 × 10), ambre cerclée de brun. */
function TrophyIcon({ x, y, size }: { x: number; y: number; size: number }) {
  const sc = size / 10;
  return (
    <g transform={`translate(${x},${y}) scale(${sc})`}>
      <path d="M2.4,2.2 H0.9 V3.2 A1.8,1.8 0 0 0 2.9,5 M7.6,2.2 H9.1 V3.2 A1.8,1.8 0 0 1 7.1,5" fill="none" stroke="#8F5400" strokeWidth={0.8} />
      <path d="M2.2,1 H7.8 V3.6 A2.8,2.8 0 0 1 2.2,3.6 Z" fill="#FFB547" stroke="#8F5400" strokeWidth={0.7} />
      <rect x={4.4} y={6.4} width={1.2} height={1.6} fill="#8F5400" />
      <rect x={3} y={8} width={4} height={1.3} rx={0.3} fill="#8F5400" />
    </g>
  );
}

/** Petite médaille (boîte de 10 × 10) : prix individuel du coach (entraîneur du mois). */
function MedalIcon({ x, y, size }: { x: number; y: number; size: number }) {
  const sc = size / 10;
  return (
    <g transform={`translate(${x},${y}) scale(${sc})`}>
      <path d="M3,0.5 L5,4 L7,0.5" fill="none" stroke="#0F1B2D" strokeWidth={1.1} />
      <circle cx={5} cy={6.4} r={3} fill="#FFB547" stroke="#8F5400" strokeWidth={0.7} />
      <circle cx={5} cy={6.4} r={1.2} fill="#8F5400" />
    </g>
  );
}

type ClubCard = {
  seasons: string;
  wdl: { letter: string; count: number; color: string }[];
  trophies: string[];
  awards: string[];
};

// Étiquette d'un club sur la carte : petite carte blanche à côté du point (nom ; saisons et bilan V/N/D sans les
// amicaux ; une ligne par titre avec sa coupe), basculée à gauche du point si elle sortirait du cadre.
function ClubCallout({
  x,
  y,
  r,
  k,
  box,
  club,
  current,
  card,
}: {
  x: number;
  y: number;
  r: number;
  k: number;
  box: { x: number; y: number; w: number; h: number };
  club: string;
  current: boolean;
  card: ClubCard;
}) {
  const fsName = r * 1.15;
  const fsStat = r * 0.85;
  const line = fsStat * 1.45;
  const pad = r * 0.65;
  const bar = r * 0.32;
  const icon = fsStat * 1.05;
  // Largeur estimée (Nunito gras ≈ 0,6 em par caractère) : pas de mesure du texte dans le rendu.
  const wdlLen = card.wdl.reduce((n, p) => n + String(p.count).length + p.letter.length + 3, 0);
  const statsW = (card.seasons.length + 4 + wdlLen) * fsStat * 0.56;
  const lines = [...card.trophies.map((text) => ({ text, medal: false })), ...card.awards.map((text) => ({ text, medal: true }))];
  const trophyW = Math.max(0, ...lines.map((l) => icon * 1.4 + l.text.length * fsStat * 0.56));
  const w = bar + pad * 2 + Math.max(club.length * fsName * 0.6, statsW, trophyW);
  const h = pad * 2 + fsName + line * (1 + lines.length) - fsStat * 0.1;
  const gap = r * 1.7;
  const left = x + gap + w > box.x + box.w && x - gap - w >= box.x;
  const cx = left ? x - gap - w : x + gap;
  const cy = Math.min(Math.max(y - h / 2, box.y + 2 * k), box.y + box.h - h - 2 * k);
  const tx = cx + bar + pad;
  // Petite pointe vers le point, du côté du point.
  const tipX = left ? cx + w : cx;
  const dir = left ? 1 : -1;
  const ty = Math.min(Math.max(y, cy + r), cy + h - r);
  const statsY = cy + pad + fsName + fsStat * 1.1;
  return (
    <g pointerEvents="none">
      <g filter="url(#carte-ombre)">
        <path d={`M${tipX},${ty - r * 0.55} L${tipX + dir * r * 0.6},${ty} L${tipX},${ty + r * 0.55} Z`} fill="#FFFFFF" />
        <rect x={cx} y={cy} width={w} height={h} rx={r * 0.55} fill="#FFFFFF" />
      </g>
      <rect x={cx} y={cy} width={bar} height={h} rx={bar / 2} fill={current ? '#FFB547' : '#0F1B2D'} />
      <text x={tx} y={cy + pad + fsName * 0.8} fontSize={fsName} fontWeight={800} fill="#0F1B2D">
        {club}
      </text>
      <text x={tx} y={statsY} fontSize={fsStat} fontWeight={600} fill="#56607A">
        {card.seasons}
        {card.wdl.map((p, i) => (
          <tspan key={i} dx={i ? fsStat * 0.55 : fsStat * 0.9}>
            <tspan fontWeight={800} fill={p.color}>
              {p.count}
            </tspan>
            <tspan fill={p.color}>{`\u00a0${p.letter}`}</tspan>
          </tspan>
        ))}
      </text>
      {lines.map((l, i) => {
        const ly = statsY + line * (i + 1);
        return (
          <g key={i}>
            {l.medal ? <MedalIcon x={tx} y={ly - icon * 0.85} size={icon} /> : <TrophyIcon x={tx} y={ly - icon * 0.85} size={icon} />}
            <text x={tx + icon * 1.4} y={ly} fontSize={fsStat} fontWeight={700} fill={l.medal ? '#0F1B2D' : '#8F5400'}>
              {l.text}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** Carte du monde (dessinée sur place, rien de chargé d'Internet) : pays entraînés en orange, clubs numérotés dans l'ordre. */
function WorldMap({ spells }: { spells: CareerSpell[] }) {
  const { t, i18n } = useTranslation();
  const [whole, setWhole] = useState(false);
  const visited = new Set(spells.map((s) => (s.country?.startsWith('GB-') ? 'GB' : s.country)).filter(Boolean));
  const current = spells.find((s) => s.current)?.country ?? null;
  const currentShape = current?.startsWith('GB-') ? 'GB' : current;

  // Cadre : tous les pays entraînés avec une marge, au moins un quart de la largeur du monde ; ou le monde entier.
  const base = pinsOf(spells, 0).filter((p): p is { x: number; y: number } => !!p);
  let box = { x: 0, y: 0, w: MAP_WIDTH, h: MAP_HEIGHT };
  if (!whole && base.length) {
    const xs = base.map((p) => p.x);
    const ys = base.map((p) => p.y);
    const ratio = MAP_WIDTH / MAP_HEIGHT;
    let w = Math.max(MAP_WIDTH / 4, (Math.max(...xs) - Math.min(...xs)) * 1.5);
    let h = Math.max((Math.max(...ys) - Math.min(...ys)) * 1.5, w / ratio);
    w = Math.max(w, h * ratio);
    h = w / ratio;
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
    const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
    box = { x: Math.min(Math.max(0, cx - w / 2), MAP_WIDTH - w), y: Math.min(Math.max(0, cy - h / 2), MAP_HEIGHT - h), w, h };
  }
  const k = box.w / MAP_WIDTH;
  const pins = pinsOf(spells, 14 * k);
  const route = pins.filter((p): p is { x: number; y: number } => !!p);
  const missing = spells.filter((s) => !s.country || !MAP_PINS[s.country]);
  const r = 11 * k;
  const monthFmt = new Intl.DateTimeFormat(i18n.resolvedLanguage, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  // Un prix : « Entraîneur du mois, mai 2027 » ; plusieurs : « Entraîneur du mois ×3 ».
  const awardLines = (awards: { month: string }[]) =>
    !awards.length
      ? []
      : awards.length === 1
        ? [t('careerPage.mapAwardOne', { month: monthFmt.format(new Date(`${awards[0]!.month}-01T00:00:00Z`)) })]
        : [t('careerPage.mapAwardMany', { count: awards.length })];
  const cardOf = (club: string): ClubCard => {
    const st = clubStats(spells, club);
    return {
      seasons: t('careerPage.mapSeasons', { count: st.seasons }),
      wdl: [
        { letter: t('careerPage.mapW'), count: st.wins, color: '#1F7A4D' },
        { letter: t('careerPage.mapD'), count: st.draws, color: '#56607A' },
        { letter: t('careerPage.mapL'), count: st.losses, color: '#B42E2E' },
      ],
      trophies: st.trophies.map((tr) => `${trophyName(t, tr)} ${tr.season}`),
      awards: awardLines(st.awards),
    };
  };
  const statsLine = (club: string) => {
    const c = cardOf(club);
    return [c.seasons, c.wdl.map((p) => `${p.count} ${p.letter}`).join(' '), ...c.trophies, ...c.awards].join(' · ');
  };
  const clubs = spells.filter((s, i) => !spells.slice(i + 1).some((x) => x.club === s.club));

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">{t('careerPage.map')}</h2>
        <div className="flex gap-1">
          <button type="button" className={`chip ${!whole ? 'chip-on' : ''}`} onClick={() => setWhole(false)}>
            {t('careerPage.mapZoom')}
          </button>
          <button type="button" className={`chip ${whole ? 'chip-on' : ''}`} onClick={() => setWhole(true)}>
            {t('careerPage.mapWorld')}
          </button>
        </div>
      </div>
      <svg
        viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
        className="mt-3 w-full rounded-xl bg-[#EAF0F2]"
        role="img"
        aria-label={t('careerPage.mapLabel', { clubs: spells.map((s) => s.club).join(', ') })}
      >
        <defs>
          <filter id="carte-ombre" x="-20%" y="-30%" width="140%" height="170%">
            <feDropShadow dx={0} dy={1.5 * k} stdDeviation={2.5 * k} floodColor="#0F1B2D" floodOpacity={0.22} />
          </filter>
        </defs>
        {MAP_SHAPES.map((s, i) => (
          <path
            key={i}
            d={s.d}
            fill={s.code && s.code === currentShape ? '#FFB547' : s.code && visited.has(s.code) ? '#FFD99A' : '#D9DAD5'}
            stroke="#FFFFFF"
            strokeWidth={0.6}
            vectorEffect="non-scaling-stroke"
          >
            {s.code && visited.has(s.code) && <title>{countryName(t, s.code === 'GB' ? spells.find((x) => x.country?.startsWith('GB-'))!.country! : s.code, i18n.resolvedLanguage)}</title>}
          </path>
        ))}
        {route.length > 1 && (
          <polyline
            points={route.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke="#8F5400"
            strokeWidth={2}
            strokeDasharray="6 5"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {spells.map((s, i) => {
          const p = pins[i];
          // Un club entraîné plusieurs fois : un seul point, au numéro de son dernier passage.
          if (!p || spells.slice(i + 1).some((x) => x.club === s.club)) return null;
          return (
            <g key={i}>
              <title>{`${i + 1}. ${s.club} : ${statsLine(s.club)}`}</title>
              <circle cx={p.x} cy={p.y} r={r} fill={s.current ? '#8F5400' : '#0F1B2D'} stroke="#FFFFFF" strokeWidth={2} vectorEffect="non-scaling-stroke" />
              <text x={p.x} y={p.y} dy="0.35em" textAnchor="middle" fontSize={r * 1.15} fontWeight={800} fill="#FFFFFF">
                {i + 1}
              </text>
              <ClubCallout x={p.x} y={p.y} r={r} k={k} box={box} club={s.club} current={!!s.current} card={cardOf(s.club)} />
            </g>
          );
        })}
      </svg>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {clubs.map((s) => {
          const c = cardOf(s.club);
          const n = spells.lastIndexOf(s) + 1;
          return (
            <li key={s.club} className="flex items-start gap-3 rounded-xl px-3 py-2 ring-1 ring-brun/30">
              <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-extrabold text-white ${s.current ? 'bg-orange-fonce' : 'bg-canard'}`}>{n}</span>
              <div className="min-w-0">
                <p className="truncate font-bold">{s.club}</p>
                <p className="text-xs text-brun">
                  {c.seasons} · {c.wdl.map((p) => `${p.count} ${p.letter}`).join(' · ')}
                </p>
                {c.trophies.map((tr, i) => (
                  <p key={i} className="text-xs font-bold text-orange">
                    🏆 {tr}
                  </p>
                ))}
                {c.awards.map((a, i) => (
                  <p key={`a${i}`} className="text-xs font-bold text-orange-clair">
                    🏅 {a}
                  </p>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-brun">{t('careerPage.mapStatsNote')}</p>
      {!!missing.length && <p className="mt-2 text-xs text-brun">{t('careerPage.mapMissing', { clubs: missing.map((s) => s.club).join(', ') })}</p>}
    </div>
  );
}
