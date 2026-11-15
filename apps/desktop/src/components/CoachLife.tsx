import { ageAt, BADGES, CURRENCIES, DEFAULT_TAX, GAME_QUALIFICATION, gameCoach, type FmSnapshot, type GameCoach, lifeEvents, lifeFinances, qualificationCode, sceneState, schoolStage, trophyCabinet, type CareerSpell, type CoachLife as Life, type Scene, type SceneState } from '@fm-immersion/module-fm';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { Link } from 'react-router-dom';
import { coachPhotoSource } from '../lib/coach-photo';
import { lifeResults, useSaveLife } from '../lib/coach-world';
import { fmData } from '../lib/data';
import { trophyName } from '../lib/farewell-text';

const num = (v: string) => {
  const n = Number(v.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** Vitrine des trophées : un trophée par compétition gagnée, avec le nombre de titres et les saisons. */
export function TrophyCabinet({ spells }: { spells: CareerSpell[] }) {
  const { t } = useTranslation();
  const cabinet = trophyCabinet(spells);
  if (!cabinet.length) return <p className="mt-2 text-brun">{t('careerPage.noTrophy')}</p>;
  return (
    <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
      {cabinet.map((c) => (
        <li key={c.competition ?? ''} className="flex flex-col items-center rounded-2xl bg-gradient-to-b from-orange-clair to-white p-3 text-center ring-1 ring-orange/30">
          <Cup big={c.competition === null} />
          {c.wins.length > 1 && <span className="mt-1 rounded-full bg-canard px-2 py-0.5 text-xs font-extrabold text-white">×{c.wins.length}</span>}
          <span className="mt-1 text-sm font-bold leading-tight">{trophyName(t, { season: '', competition: c.competition })}</span>
          <span className="mt-0.5 text-xs text-brun">{c.wins.map((w) => `${w.season} · ${w.club}`).join(' — ')}</span>
        </li>
      ))}
    </ul>
  );
}

function Cup({ big }: { big: boolean }) {
  // Coupe dessinée (pas de visuel du jeu) : grande pour le championnat, plus petite pour une coupe.
  const s = big ? 52 : 42;
  return (
    <svg width={s} height={s} viewBox="0 0 48 48" aria-hidden>
      <path d="M14 6h20v10a10 10 0 0 1-20 0z" fill="#FFB547" stroke="#8F5400" strokeWidth="1.5" />
      <path d="M14 9H8a6 6 0 0 0 6 8M34 9h6a6 6 0 0 1-6 8" fill="none" stroke="#8F5400" strokeWidth="1.5" />
      <rect x="21" y="26" width="6" height="8" fill="#FFB547" stroke="#8F5400" strokeWidth="1.5" />
      <rect x="14" y="34" width="20" height="6" rx="1.5" fill="#0F1B2D" />
    </svg>
  );
}

/** « Hors terrain » : finances perso, foyer et journal de vie du coach, saisis par le joueur. */
export function CoachLifeSection({
  saveId,
  life: saved,
  spells,
  gameDate,
  history,
}: {
  saveId: string;
  life: Life | undefined;
  spells: CareerSpell[];
  gameDate: string | null;
  history: { gameDate: string; data: FmSnapshot }[];
}) {
  const { t } = useTranslation();
  // Salaire et diplôme lus dans FM27 par le plugin (lecture seule) ; la devise du jeu sert tant que le joueur n'en choisit pas.
  const game = useMemo(() => gameCoach(history), [history]);
  const life = useMemo<Life>(() => ({ ...(saved ?? {}), currency: saved?.currency ?? game.currency ?? undefined }), [saved, game.currency]);
  const held = game.qualification != null ? (GAME_QUALIFICATION[game.qualification] ?? 0) : 0;
  const results = useMemo(() => lifeResults(history), [history]);
  const st = useMemo(() => sceneState(spells, life, gameDate, { held, results }), [spells, life, gameDate, held, results]);
  return (
    <section className="mt-10">
      <h2 className="text-2xl font-semibold">{t('coachLife.title')}</h2>
      <p className="help mt-1">{t('coachLife.intro')}</p>
      <MyLifeLink st={st} />
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Finances saveId={saveId} life={life} spells={spells} st={st} game={game} />
        <Household saveId={saveId} life={life} gameDate={gameDate} st={st} />
      </div>
      <Badges saveId={saveId} st={st} gameDate={gameDate} life={life} game={game} />
      <Journal life={life} spells={spells} gameDate={gameDate} st={st} />
    </section>
  );
}

const fromIcon: Record<Scene['from'], string> = { agent: '🏠', partner: '❤️', dealer: '🚗', friend: '📱', assistant: '📋', representative: '💼', chairman: '🏛️', journalist: '📰' };

/** Lien vers « Ma vie » : les messages, dilemmes et proches ont leur écran (anciennement le téléphone ici). */
function MyLifeLink({ st }: { st: SceneState }) {
  const { t } = useTranslation();
  const n = st.pending.length;
  return (
    <Link to="/vie" className="card mt-4 flex items-center gap-4 bg-canard text-white hover:ring-2 hover:ring-orange">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange font-extrabold text-canard">{n || '✓'}</span>
      <span className="flex-1">
        <span className="block font-bold">{n ? t('myLife.careerLinkCount', { count: n }) : t('myLife.careerLink')}</span>
        <span className="block text-sm text-white/70">{t('myLife.intro')}</span>
      </span>
      <span className="btn-primary">{t('myLife.careerLinkOpen')}</span>
    </Link>
  );
}

function Badges({ saveId, st, gameDate, life, game }: { saveId: string; st: SceneState; gameDate: string | null; life: Life | undefined; game: GameCoach }) {
  const { t, i18n } = useTranslation();
  const save = useSaveLife(saveId);
  const money = new Intl.NumberFormat(i18n.resolvedLanguage, { style: 'currency', currency: life?.currency ?? 'EUR', maximumFractionDigits: 0 });
  const dateFmt = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: 'medium' });
  const next = st.nextBadge;
  return (
    <div className="card mt-6">
      <h3 className="text-xl font-semibold">{t('coachLife.badges.title')}</h3>
      <p className="mt-1 text-sm text-brun">{t('coachLife.badges.help')}</p>
      {game.qualification != null && (
        <p className="mt-2 text-sm">
          <span className="font-bold">{t('coachLife.badges.inGame')}</span>{' '}
          {GAME_QUALIFICATION[game.qualification] != null
            ? GAME_QUALIFICATION[game.qualification]! > 0
              ? t(`coachLife.badges.level.${BADGES[GAME_QUALIFICATION[game.qualification]! - 1]!.level}`)
              : t('coachLife.badges.none')
            : t('coachLife.badges.unknownCode', { code: game.qualification })}
        </p>
      )}
      {!!st.badges.length && (
        <ul className="mt-3 space-y-3 text-sm">
          {st.badges.map((b) => (
            <li key={b.level}>
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-bold">{t(`coachLife.badges.level.${b.level}`)}</span>
                <span className="text-brun">
                  {b.done ? t('coachLife.badges.done', { date: dateFmt.format(new Date(b.end)) }) : t('coachLife.badges.until', { date: dateFmt.format(new Date(b.end)) })}
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-canard/10">
                <div className={`h-full ${b.done ? 'bg-eau-soutenu' : 'bg-orange'}`} style={{ width: `${Math.round(b.progress * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {next ? (
        <button
          type="button"
          className="btn-primary mt-4 px-4 py-2 text-sm"
          disabled={!gameDate || save.isPending}
          onClick={() => gameDate && save.mutate((cur) => ({ badges: [...(cur.badges ?? []), { level: next.level, start: gameDate }] }))}
        >
          {t('coachLife.badges.start', { level: t(`coachLife.badges.level.${next.level}`), cost: money.format(next.cost), months: next.months })}
        </button>
      ) : (
        st.badges.length > 0 && st.badges.every((b) => b.done) && <p className="mt-3 text-sm font-bold text-eau-fonce">{t('coachLife.badges.all')}</p>
      )}
      <WriteBadge st={st} game={game} />
      <p className="mt-3 text-xs text-brun">{t('coachLife.badges.note')}</p>
    </div>
  );
}

/**
 * Inscrit dans FM27 le dernier diplôme obtenu dans l'appli, sur clic du joueur : un octet du coach, seulement si le
 * jeu montre encore le diplôme lu par le plugin et vers un code vérifié (contrôlé aussi côté Rust).
 */
function WriteBadge({ st, game }: { st: SceneState; game: GameCoach }) {
  const { t } = useTranslation();
  const [done, setDone] = useState<number | null>(null);
  const write = useMutation({
    mutationFn: (v: { expected: number; code: number }) => invoke<{ before: number; after: number }>('fm_memory_set_qualification', v),
    onSuccess: (r) => setDone(r.after),
  });
  const best = [...st.badges].reverse().find((b) => b.done);
  const code = best ? qualificationCode(best.level) : null;
  const held = game.qualification != null ? GAME_QUALIFICATION[game.qualification] : undefined;
  const rank = best ? BADGES.findIndex((b) => b.level === best.level) + 1 : 0;
  if (!best || game.qualification == null || held == null || rank <= held || done === code) {
    return done != null ? <p className="mt-3 text-sm font-bold text-eau-fonce">{t('coachLife.badges.written')}</p> : null;
  }
  const level = t(`coachLife.badges.level.${best.level}`);
  return (
    <div className="mt-4 rounded-xl bg-orange-clair/60 p-3 text-sm">
      <p>{t('coachLife.badges.writeHelp', { level })}</p>
      <button type="button" className="btn-primary mt-2 px-4 py-2 text-sm" disabled={write.isPending} onClick={() => write.mutate({ expected: game.qualification!, code: code! })}>
        {t('coachLife.badges.write', { level })}
      </button>
      {write.isError && <p className="mt-2 font-bold text-corail">{t('coachLife.badges.writeError', { error: String(write.error) })}</p>}
    </div>
  );
}

function Finances({ saveId, life, spells, st, game }: { saveId: string; life: Life | undefined; spells: CareerSpell[]; st: SceneState; game: GameCoach }) {
  const { t, i18n } = useTranslation();
  const save = useSaveLife(saveId);
  const currency = life?.currency ?? 'EUR';
  const money = new Intl.NumberFormat(i18n.resolvedLanguage, { style: 'currency', currency, maximumFractionDigits: 0 });
  const f = lifeFinances(spells, life, st.spending.total, game.wages);
  const set = save.mutate;
  const setWage = (club: string, v: string) => {
    const n = num(v);
    set((cur) => {
      const wages = { ...(cur.wages ?? {}) };
      if (n) wages[club] = n;
      else delete wages[club];
      return { wages };
    });
  };
  return (
    <div className="card">
      <h3 className="text-xl font-semibold">{t('coachLife.money.title')}</h3>
      <p className="mt-1 text-sm text-brun">{t('coachLife.money.help')}</p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t('coachLife.money.gross')} value={money.format(f.gross)} />
        <Stat label={t('coachLife.money.net', { rate: f.taxRate })} value={money.format(f.net)} />
        <Stat label={t('coachLife.money.savings')} value={money.format(f.savings)} warn={f.savings < 0} />
        <Stat label={t('coachLife.money.monthly')} value={f.monthlyNet != null ? money.format(f.monthlyNet) : '–'} />
      </div>
      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-bold uppercase tracking-wide text-canard/60">
            <th className="py-1">{t('coachLife.money.club')}</th>
            <th className="py-1">{t('coachLife.money.weekly')}</th>
            <th className="py-1 text-right">{t('coachLife.money.earned')}</th>
          </tr>
        </thead>
        <tbody>
          {f.spells.map((s) => (
            <tr key={s.club} className="border-t border-canard/10">
              <td className="py-1.5 font-bold">{s.club}</td>
              <td className="py-1.5">
                <input
                  key={`${s.club}-${life?.wages?.[s.club] ?? ''}`}
                  className="input w-28 py-1 text-sm"
                  inputMode="decimal"
                  defaultValue={life?.wages?.[s.club] ?? ''}
                  placeholder={game.wages[s.club] != null ? String(game.wages[s.club]) : t('coachLife.money.wagePlaceholder')}
                  aria-label={t('coachLife.money.weeklyOf', { club: s.club })}
                  onBlur={(e) => e.target.value !== String(life?.wages?.[s.club] ?? '') && setWage(s.club, e.target.value)}
                />
                {life?.wages?.[s.club] == null && game.wages[s.club] != null && (
                  <span className="ml-2 rounded-full bg-eau/20 px-2 py-0.5 text-[10px] font-bold">{t('coachLife.money.fromGame')}</span>
                )}
              </td>
              <td className="py-1.5 text-right tabular-nums">{s.gross != null ? money.format(s.gross) : '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          {t('coachLife.money.currency')}
          <select className="input w-auto py-1 text-sm" value={currency} onChange={(e) => set({ currency: e.target.value })}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          {t('coachLife.money.tax')}
          <input
            key={`tax-${life?.taxRate ?? ''}`}
            className="input w-20 py-1 text-sm"
            inputMode="numeric"
            defaultValue={life?.taxRate ?? DEFAULT_TAX}
            onBlur={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n) && n >= 0 && n <= 90 && n !== (life?.taxRate ?? DEFAULT_TAX)) set({ taxRate: n });
            }}
          />
          %
        </label>
        <label className="flex items-center gap-2">
          {t('coachLife.money.costs')}
          <input
            key={`costs-${life?.monthlyCosts ?? ''}`}
            className="input w-28 py-1 text-sm"
            inputMode="decimal"
            defaultValue={life?.monthlyCosts ?? ''}
            placeholder="0"
            onBlur={(e) => (num(e.target.value) ?? 0) !== (life?.monthlyCosts ?? 0) && set({ monthlyCosts: num(e.target.value) })}
          />
        </label>
      </div>
      {st.spending.total > 0 && (
        <p className="mt-3 text-xs text-brun">
          {t('coachLife.money.choices', {
            housing: money.format(st.spending.housing),
            car: money.format(st.spending.car),
            oneOff: money.format(st.spending.oneOff),
            badges: money.format(st.spending.badges),
          })}
        </p>
      )}
      {f.missing > 0 && <p className="mt-3 text-xs text-brun">{t('coachLife.money.missing', { count: f.missing })}</p>}
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`rounded-xl p-3 ring-1 ${warn ? 'bg-corail/10 ring-corail/30' : 'bg-white ring-canard/5'}`}>
      <p className="font-display text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-[11px] font-bold uppercase tracking-wide text-canard/60">{label}</p>
    </div>
  );
}

function Household({ saveId, life, gameDate, st }: { saveId: string; life: Life | undefined; gameDate: string | null; st: SceneState }) {
  const { t } = useTranslation();
  const save = useSaveLife(saveId);
  const file = useRef<HTMLInputElement>(null);
  const [photoError, setPhotoError] = useState(false);
  const [partner, setPartner] = useState(life?.partner?.name ?? '');
  const [since, setSince] = useState(life?.partner?.since ?? '');
  const [child, setChild] = useState({ name: '', born: '' });
  useEffect(() => {
    setPartner(life?.partner?.name ?? '');
    setSince(life?.partner?.since ?? '');
  }, [life?.partner?.name, life?.partner?.since]);
  const set = save.mutate;
  const children = life?.children ?? [];
  const savePartner = () => {
    const name = partner.trim();
    if (name === (life?.partner?.name ?? '') && since === (life?.partner?.since ?? '')) return;
    set({ partner: name ? { name, since: since || null } : null });
  };
  const validBorn = (v: string) => /^\d{4}(-\d{2}-\d{2})?$/.test(v);
  return (
    <div className="card">
      <h3 className="text-xl font-semibold">{t('coachLife.home.title')}</h3>
      <p className="mt-1 text-sm text-brun">{t('coachLife.home.help')}</p>
      <div className="mt-4 flex flex-wrap items-start gap-4">
        <button
          type="button"
          className="flex h-28 w-40 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-creme text-center text-xs font-bold text-brun ring-1 ring-canard/10 hover:ring-orange"
          onClick={() => file.current?.click()}
          title={t('coachLife.home.photoPick')}
        >
          {life?.familyPhoto ? <img src={life.familyPhoto} alt={t('coachLife.home.photoAlt')} className="h-full w-full object-cover" /> : t('coachLife.home.photoPick')}
        </button>
        <input
          ref={file}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              setPhotoError(false);
              set({ familyPhoto: await coachPhotoSource(f) });
            } catch {
              setPhotoError(true);
            }
          }}
        />
        <div className="min-w-0 flex-1 space-y-2 text-sm">
          <label className="block">
            <span className="font-bold">{t('coachLife.home.partner')}</span>
            <input className="input mt-1 py-1 text-sm" value={partner} onChange={(e) => setPartner(e.target.value)} onBlur={savePartner} placeholder={t('coachLife.home.partnerPlaceholder')} />
          </label>
          <label className="block">
            <span className="font-bold">{t('coachLife.home.since')}</span>
            <input className="input mt-1 py-1 text-sm" type="date" value={since} onChange={(e) => setSince(e.target.value)} onBlur={savePartner} />
          </label>
          {life?.familyPhoto && (
            <button type="button" className="text-xs font-bold text-corail hover:underline" onClick={() => set({ familyPhoto: null })}>
              {t('coachLife.home.photoRemove')}
            </button>
          )}
          {photoError && <p className="text-xs text-corail">{t('coachLife.home.photoError')}</p>}
        </div>
      </div>
      <p className="mt-4 text-sm">
        <span aria-hidden>🏠</span> {st.housing ? t(`coachLife.home.housing.${st.housing}`) : t('coachLife.home.noHousing')}
        <span className="mx-2 text-brun">·</span>
        <span aria-hidden>🚗</span> {st.car ? t(`coachLife.home.car.${st.car}`) : t('coachLife.home.noCar')}
      </p>
      <h4 className="mt-5 text-sm font-extrabold uppercase tracking-wider text-canard/60">{t('coachLife.home.children')}</h4>
      {children.length ? (
        <ul className="mt-2 space-y-1.5 text-sm">
          {children.map((c, i) => {
            const age = gameDate ? ageAt(c.born, gameDate) : null;
            const unborn = !!gameDate && (/^\d{4}$/.test(c.born) ? `${c.born}-01-01` : c.born) > gameDate.slice(0, 10);
            return (
              <li key={`${c.name}-${i}`} className="flex flex-wrap items-center gap-2">
                <span className="font-bold">{c.name}</span>
                <span className="text-brun">
                  {unborn ? t('coachLife.home.unborn') : age != null ? `${t('coachLife.home.age', { count: age })} · ${t(`coachLife.stage.${schoolStage(age)}`)}` : c.born}
                </span>
                <button type="button" className="ml-auto text-xs font-bold text-corail hover:underline" onClick={() => set((cur) => ({ children: (cur.children ?? []).filter((_, j) => j !== i) }))}>
                  {t('coachLife.home.remove')}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-brun">{t('coachLife.home.noChild')}</p>
      )}
      <form
        className="mt-3 flex flex-wrap items-end gap-2 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          if (!child.name.trim() || !validBorn(child.born)) return;
          const added = { name: child.name.trim(), born: child.born };
          set((cur) => ({ children: [...(cur.children ?? []), added] }));
          setChild({ name: '', born: '' });
        }}
      >
        <input className="input w-40 py-1 text-sm" value={child.name} onChange={(e) => setChild({ ...child, name: e.target.value })} placeholder={t('coachLife.home.childName')} aria-label={t('coachLife.home.childName')} />
        <input className="input w-40 py-1 text-sm" type="date" value={child.born} onChange={(e) => setChild({ ...child, born: e.target.value })} aria-label={t('coachLife.home.childBorn')} />
        <button type="submit" className="btn-secondary px-3 py-1 text-xs" disabled={!child.name.trim() || !validBorn(child.born)}>
          {t('coachLife.home.addChild')}
        </button>
      </form>
    </div>
  );
}

function Journal({ life, spells, gameDate, st }: { life: Life | undefined; spells: CareerSpell[]; gameDate: string | null; st: SceneState }) {
  const { t, i18n } = useTranslation();
  const dateFmt = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: 'medium' });
  const icon = { arrival: '✍️', exit: '🚪', trophy: '🏆', partner: '💍', birth: '👶' } as const;
  const items = [
    ...lifeEvents(spells, life, gameDate).map((e) => ({
      date: e.date,
      icon: icon[e.kind],
      text:
        e.kind === 'arrival'
          ? t('coachLife.journal.arrival', { club: e.club })
          : e.kind === 'exit'
            ? t(e.reason === 'sacked' ? 'coachLife.journal.sacked' : 'coachLife.journal.left', { club: e.club })
            : e.kind === 'trophy'
              ? t('coachLife.journal.trophy', { trophy: trophyName(t, e), club: e.club, season: e.season })
              : e.kind === 'partner'
                ? t('coachLife.journal.partner', { name: e.name })
                : t('coachLife.journal.birth', { name: e.name }),
    })),
    // Les choix du téléphone, juste après le moment qui les a amenés.
    ...st.answered.map(({ scene: sc, choice }) => ({
      date: sc.date,
      icon: fromIcon[sc.from],
      text: t(`coachLife.scene.${sc.kind}.done.${choice.key}`, { club: sc.club, name: sc.name ?? '', season: sc.season }),
    })),
  ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  if (!items.length) return null;
  return (
    <div className="card mt-6">
      <h3 className="text-xl font-semibold">{t('coachLife.journal.title')}</h3>
      <ol className="mt-3 space-y-2 text-sm">
        {items.map((e, i) => (
          <li key={i} className="flex gap-3">
            <span className="w-5 shrink-0 text-center" aria-hidden>
              {e.icon}
            </span>
            <span className="w-28 shrink-0 text-xs font-bold leading-5 text-brun">{dateFmt.format(new Date(e.date))}</span>
            <span>{e.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
