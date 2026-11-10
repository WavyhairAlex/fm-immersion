import {
  buildCertificate,
  CHALLENGES,
  evaluateChallenge,
  GH_BONUSES,
  GH_UNREADABLE_BONUSES,
  gloryHunterState,
  shortDigest,
  verifyCertificate,
  type ChallengeDef,
  type ChallengeId,
  type ChallengeResult,
  type ChallengeStatus,
  type FmSnapshot,
  type GhBonus,
} from '@fm-immersion/module-fm';
import type { FmChallengeCertRow, FmChallengeRow } from '@fm-immersion/module-fm/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { factsFor } from '../lib/challenges';
import { issueText, saveCertificate, sendCertificate, stepText } from '../lib/challenge-share';
import { useCareer } from '../lib/career';
import { challengesData, fmData } from '../lib/data';
import { useHistory } from '../lib/fm-cache';
import { getWebhook, isWebhook } from '../lib/discord';

const COACH_KEY = 'fmi.challenges.coach';
const read = (k: string) => {
  try {
    return localStorage.getItem(k) ?? '';
  } catch {
    return '';
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* stockage indisponible : la valeur sera redemandée */
  }
};

const STATUS_CLASS: Record<ChallengeStatus, string> = {
  success: 'bg-eau-fonce text-white',
  failed: 'bg-corail text-white',
  unproven: 'bg-ambre text-canard',
  running: 'bg-orange-clair text-canard',
  unavailable: 'bg-canard/10 text-canard',
};

function StatusPill({ status }: { status: ChallengeStatus }) {
  const { t } = useTranslation();
  return <span className={`pill ${STATUS_CLASS[status]}`}>{t(`challenges.status.${status}`)}</span>;
}

/** Mode Défis : défis célèbres de FM vérifiés à partir des instantanés, certificats partagés et classement. */
export function Challenges() {
  const { t } = useTranslation();
  // Carrière suivie, choisie dans la barre latérale.
  const { saveId, fmSaves } = useCareer();
  const [coach, setCoach] = useState(read(COACH_KEY));

  const { data: history = [] } = useHistory(saveId);
  const { data: settings } = useQuery({ queryKey: ['fm', saveId, 'settings'], queryFn: () => fmData.settings(saveId), enabled: !!saveId });
  const { data: enrolled = [] } = useQuery({ queryKey: ['challenges', saveId], queryFn: () => challengesData.list(saveId), enabled: !!saveId });
  const active = enrolled.filter((c) => !c.abandoned);

  return (
    <div className="w-full px-6 py-6 xl:px-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">{t('modes.challenges.title')}</h1>
      </div>
      <p className="mt-2 max-w-3xl text-brun">{t('challenges.intro')}</p>

      {!fmSaves.length && (
        <div className="card mt-6 max-w-3xl">
          <p className="text-brun">{t('challenges.noSave')}</p>
          <Link to="/parties" className="btn-primary mt-4">
            {t('layout.career.create')}
          </Link>
        </div>
      )}

      {!!saveId && (
        <>
          <label className="mt-6 block max-w-sm">
            <span className="text-sm font-bold">{t('challenges.coach')}</span>
            <input
              className="input mt-1"
              value={coach}
              maxLength={40}
              placeholder={t('challenges.coachPlaceholder')}
              onChange={(e) => {
                setCoach(e.target.value);
                write(COACH_KEY, e.target.value.trim());
              }}
            />
          </label>

          <h2 className="mt-8 text-xl font-semibold">{t('challenges.mine')}</h2>
          {!active.length && <p className="mt-2 text-brun">{t('challenges.none')}</p>}
          <div className="mt-3 grid gap-4 xl:grid-cols-2">
            {active.map((c) => (
              <Enrolled key={c.id} row={c} history={history} coach={coach.trim()} />
            ))}
          </div>

          <h2 className="mt-8 text-xl font-semibold">{t('challenges.catalog')}</h2>
          <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[...CHALLENGES]
              .map((d) => ({ d, b: blockedOf(d, active.some((c) => c.challengeId === d.id), !!settings?.fmFreeSince && !history.length, history.at(-1)?.gameDate ?? null) }))
              .sort((a, b) => (BLOCK_RANK[a.b ?? 'ok'] ?? 0) - (BLOCK_RANK[b.b ?? 'ok'] ?? 0))
              .map(({ d }) => d)
              .map((d) => (
              <CatalogCard
                key={d.id}
                def={d}
                saveId={saveId}
                taken={active.some((c) => c.challengeId === d.id)}
                unemployedSince={settings?.fmFreeSince ?? null}
                freshCareer={!history.length}
                latest={history.at(-1)?.gameDate ?? null}
                club={history.at(-1)?.data.club ?? null}
              />
            ))}
          </div>
        </>
      )}

      <Leaderboard />
      <p className="mt-8 max-w-3xl text-xs text-brun">{t('challenges.limit')}</p>
    </div>
  );
}

function Enrolled({ row, history, coach }: { row: FmChallengeRow; history: { gameDate: string; data: FmSnapshot }[]; coach: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const result = useMemo(() => evaluateChallenge(row.challengeId as ChallengeId, factsFor(row, history), row.params), [row, history]);
  const certificate = () =>
    buildCertificate({
      challenge: row.challengeId as ChallengeId,
      params: row.params,
      coach: coach || t('challenges.anonymous'),
      appVersion: __APP_VERSION__,
      createdAt: new Date().toISOString(),
      facts: factsFor(row, history),
    });
  const share = useMutation({
    mutationFn: async () => {
      const c = await certificate();
      await sendCertificate(t, c, result);
      await challengesData.importCertificate(c);
      return c;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['challenges', 'certs'] }),
  });
  const exportFile = useMutation({
    mutationFn: async () => {
      const c = await certificate();
      return saveCertificate(c);
    },
  });
  const abandon = useMutation({
    mutationFn: () => challengesData.abandon(row.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['challenges', row.saveId] }),
  });
  const webhookOk = isWebhook(getWebhook());
  const next = result.steps.find((s) => !s.done);
  return (
    <article className="card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">{t(`challenges.def.${row.challengeId}.name`)}</h3>
        <StatusPill status={result.status} />
      </div>
      <p className="mt-1 text-xs text-brun">
        {t('challenges.since', { date: row.startDate })}
        {row.params.nationality ? ` · ${row.params.nationality}` : ''}
        {row.params.club ? ` · ${row.params.club}` : ''}
        {row.params.until ? ` · ${t('challenges.untilShort', { date: row.params.until })}` : ''}
      </p>
      {next && result.status === 'running' && (
        <div className="mt-3 rounded-xl border-l-4 border-orange bg-orange-clair/60 p-3">
          <p className="text-xs font-bold uppercase text-brun">{t('challenges.next')}</p>
          <p className="font-bold">{stepText(t, next)}</p>
          <p className="mt-1 text-xs">
            <span className="font-bold">{t('challenges.nextWhen')} </span>
            {t(`challenges.def.${row.challengeId}.checked`)}
          </p>
        </div>
      )}
      <Steps result={result} />
      {row.challengeId === 'glory-hunter' && result.status === 'running' && <Jokers row={row} history={history} />}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn-primary text-sm" disabled={share.isPending || !webhookOk} onClick={() => share.mutate()}>
          {t('challenges.shareDiscord')}
        </button>
        <button type="button" className="btn-secondary text-sm" disabled={exportFile.isPending} onClick={() => exportFile.mutate()}>
          {t('challenges.export')}
        </button>
        <button
          type="button"
          className="btn text-sm text-corail hover:underline"
          onClick={() => {
            if (window.confirm(t('challenges.abandonConfirm'))) abandon.mutate();
          }}
        >
          {t('challenges.abandon')}
        </button>
      </div>
      {!webhookOk && (
        <p className="mt-2 text-xs text-brun">
          {t('challenges.noWebhook')}{' '}
          <Link to="/discord" className="font-bold text-orange-fonce hover:underline">
            {t('modes.discord.title')}
          </Link>
        </p>
      )}
      {exportFile.isSuccess && <p className="mt-2 break-all text-sm text-eau-fonce">{t('challenges.saved', { path: exportFile.data })}</p>}
      {exportFile.isError && <p className="mt-2 text-sm text-corail">{String(exportFile.error)}</p>}
      {share.isSuccess && <p className="mt-2 text-sm text-eau-fonce">{t('challenges.shared', { digest: shortDigest(share.data.digest) })}</p>}
      {share.isError && <p className="mt-2 text-sm text-corail">{String(share.error)}</p>}
    </article>
  );
}

/** Glory Hunter : déclarer un joker pour la prochaine saison pas encore commencée. */
function Jokers({ row, history }: { row: FmChallengeRow; history: { gameDate: string; data: FmSnapshot }[] }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const state = useMemo(() => gloryHunterState(factsFor(row, history), row.params), [row, history]);
  const targeted = new Set((row.params.jokers ?? []).map((j) => j.bonus).filter(Boolean));
  const choices = GH_BONUSES.filter(
    (b) => !GH_UNREADABLE_BONUSES.includes(b) && !state.bonuses.some((x) => x.id === b) && !state.frozen.includes(b) && !targeted.has(b),
  );
  const [bonus, setBonus] = useState<GhBonus | ''>('');
  const today = history.at(-1)?.gameDate ?? row.startDate;
  const declare = useMutation({
    mutationFn: (kind: 'double' | 'preseason') =>
      challengesData.declareJoker(row.id, kind === 'double' ? { kind, bonus: bonus as GhBonus, declaredAt: today } : { kind, declaredAt: today }),
    onSuccess: () => {
      setBonus('');
      qc.invalidateQueries({ queryKey: ['challenges', row.saveId] });
    },
  });
  if (!state.doublesLeft && !state.preseasonsLeft) return null;
  return (
    <div className="mt-3 rounded-xl bg-creme p-3 text-sm">
      <p className="font-bold">{t('challenges.joker.title')}</p>
      <p className="mt-1 text-xs text-brun">{t('challenges.joker.when')}</p>
      {!!state.pending.length && <p className="mt-1 text-xs font-bold">{t('challenges.joker.pending', { count: state.pending.length })}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {state.doublesLeft > 0 && (
          <>
            <select className="input w-auto text-sm" value={bonus} onChange={(e) => setBonus(e.target.value as GhBonus | '')}>
              <option value="">{t('challenges.joker.pick')}</option>
              {choices.map((b) => (
                <option key={b} value={b}>
                  {t(`challenges.gh.bonus.${b}`)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn-secondary text-sm"
              disabled={!bonus || declare.isPending}
              onClick={() => {
                if (window.confirm(t('challenges.joker.doubleConfirm', { bonus: t(`challenges.gh.bonus.${bonus}`) }))) declare.mutate('double');
              }}
            >
              {t('challenges.joker.double', { count: state.doublesLeft })}
            </button>
          </>
        )}
        {state.preseasonsLeft > 0 && (
          <button
            type="button"
            className="btn-secondary text-sm"
            disabled={declare.isPending}
            onClick={() => {
              if (window.confirm(t('challenges.joker.preseasonConfirm'))) declare.mutate('preseason');
            }}
          >
            {t('challenges.joker.preseason')}
          </button>
        )}
      </div>
    </div>
  );
}

function Steps({ result }: { result: ChallengeResult }) {
  const { t } = useTranslation();
  return (
    <>
      <ul className="mt-3 space-y-1 text-sm">
        {result.steps.map((s) => (
          <li key={s.key} className="flex gap-2">
            <span aria-hidden>{s.done ? '✓' : '○'}</span>
            <span className={s.done ? 'font-bold' : ''}>{stepText(t, s)}</span>
          </li>
        ))}
      </ul>
      {!!result.issues.length && (
        <ul className="mt-3 space-y-1 rounded-xl bg-ambre/15 p-3 text-sm">
          {result.issues.map((i, k) => (
            <li key={k}>{issueText(t, i)}</li>
          ))}
        </ul>
      )}
    </>
  );
}

function CatalogCard(p: { def: ChallengeDef; saveId: string; taken: boolean; unemployedSince: string | null; freshCareer: boolean; latest: string | null; club: string | null }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [nationality, setNationality] = useState('');
  const [until, setUntil] = useState('');
  const { def } = p;
  // Départ sans club : nouvelle carrière (aucun instantané d'un club) avec un manager sans club selon le plugin.
  const unemployed = !!p.unemployedSince && p.freshCareer;
  const blocked = blockedOf(def, p.taken, unemployed, p.latest);
  const enroll = useMutation({
    mutationFn: () =>
      challengesData.enroll(p.saveId, {
        challengeId: def.id,
        startDate: (def.unemployedStart ? p.unemployedSince : p.latest) ?? p.latest ?? '',
        unemployedStart: unemployed,
        params:
          def.param === 'nationality'
            ? { nationality: nationality.trim() }
            : def.param === 'club'
              ? { club: p.club ?? undefined }
              : def.param === 'until'
                ? { until }
                : {},
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['challenges', p.saveId] }),
  });
  return (
    <article className="card flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-lg font-semibold">{t(`challenges.def.${def.id}.name`)}</h3>
        {!def.available ? (
          <span className="pill bg-canard/10">{t('modes.soon')}</span>
        ) : blocked === 'taken' ? (
          <span className="pill bg-canard/10">{t('challenges.fit.taken')}</span>
        ) : blocked ? (
          <span className="pill bg-ambre/30">{t('challenges.fit.no')}</span>
        ) : (
          <span className="pill bg-eau-soutenu/30">{t('challenges.fit.yes')}</span>
        )}
      </div>
      <p className="rounded-lg bg-creme px-3 py-2 text-xs">
        <span className="font-bold">{t('challenges.start.label')} </span>
        {t(def.unemployedStart ? 'challenges.start.unemployed' : 'challenges.start.current')}
        {def.param ? ` ${t(`challenges.start.param.${def.param}`)}` : ''}
      </p>
      <p className="text-sm">{t(`challenges.def.${def.id}.rules`)}</p>
      <p className="text-xs text-brun">
        <span className="font-bold">{t('challenges.checked')} </span>
        {t(`challenges.def.${def.id}.checked`)}
      </p>
      {def.param === 'until' && !blocked && (
        <label className="mt-1 block text-xs font-bold">
          {t('challenges.until')}
          <input type="date" className="input mt-1" value={until} min={p.latest ?? undefined} onChange={(e) => setUntil(e.target.value)} />
        </label>
      )}
      {def.param === 'club' && !blocked && p.club && <p className="text-xs font-bold">{t('challenges.clubParam', { club: p.club })}</p>}
      {def.param === 'nationality' && !blocked && (
        <input className="input mt-1" value={nationality} placeholder={t('challenges.nationality')} onChange={(e) => setNationality(e.target.value)} />
      )}
      <div className="mt-auto pt-2">
        {blocked ? (
          <p className="text-xs font-bold text-brun">{t(`challenges.blocked.${blocked}`)}</p>
        ) : (
          <button
            type="button"
            className="btn-primary text-sm"
            disabled={enroll.isPending || (def.param === 'nationality' && !nationality.trim()) || (def.param === 'until' && !until) || (def.param === 'club' && !p.club)}
            onClick={() => enroll.mutate()}
          >
            {t('challenges.enroll')}
          </button>
        )}
      </div>
    </article>
  );
}

type Blocked = 'soon' | 'taken' | 'needUnemployed' | 'needSnapshot' | null;
/** Pourquoi un défi n'est pas jouable dans la partie en cours (null : compatible). */
function blockedOf(def: ChallengeDef, taken: boolean, unemployed: boolean, latest: string | null): Blocked {
  if (!def.available) return 'soon';
  if (taken) return 'taken';
  if (def.unemployedStart && !unemployed) return 'needUnemployed';
  if (!def.unemployedStart && !latest) return 'needSnapshot';
  return null;
}
const BLOCK_RANK: Record<string, number> = { ok: 0, needSnapshot: 1, needUnemployed: 2, taken: 3, soon: 4 };

const RANK: Record<string, number> = { success: 0, running: 1, unproven: 2, failed: 3, unavailable: 4 };

function Leaderboard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: certs = [] } = useQuery({ queryKey: ['challenges', 'certs'], queryFn: challengesData.certificates });
  const [message, setMessage] = useState<string | null>(null);
  const importFile = useMutation({
    mutationFn: async (file: File) => {
      let raw: unknown;
      try {
        raw = JSON.parse(await file.text());
      } catch {
        return { ok: false, problems: ['format'] };
      }
      const { check } = await challengesData.importCertificate(raw);
      return check;
    },
    onSuccess: (check) => {
      setMessage(check.ok ? t('challenges.importOk') : t('challenges.importBad', { problems: check.problems.map((p) => t(`challenges.problem.${p}`)).join(', ') }));
      qc.invalidateQueries({ queryKey: ['challenges', 'certs'] });
    },
  });
  const remove = useMutation({
    mutationFn: (digest: string) => challengesData.removeCertificate(digest),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['challenges', 'certs'] }),
  });
  const sorted = [...certs].sort(
    (a, b) => Number(b.verified) - Number(a.verified) || (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9) || (b.data.facts.end ?? '').localeCompare(a.data.facts.end ?? ''),
  );
  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{t('challenges.board')}</h2>
        <label className="btn-secondary cursor-pointer text-sm">
          {t('challenges.import')}
          <input
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importFile.mutate(f);
              e.target.value = '';
            }}
          />
        </label>
      </div>
      <p className="mt-1 max-w-3xl text-sm text-brun">{t('challenges.boardIntro')}</p>
      {message && <p className="mt-2 text-sm font-bold">{message}</p>}
      {!sorted.length ? (
        <p className="card mt-3 max-w-3xl text-brun">{t('challenges.boardEmpty')}</p>
      ) : (
        <div className="card mt-3 overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="bg-canard/5 text-xs uppercase tracking-wide text-brun">
              <tr>
                <th className="px-4 py-2">{t('challenges.col.coach')}</th>
                <th className="px-4 py-2">{t('challenges.col.challenge')}</th>
                <th className="px-4 py-2">{t('challenges.col.status')}</th>
                <th className="px-4 py-2">{t('challenges.col.check')}</th>
                <th className="px-4 py-2">{t('challenges.col.clubs')}</th>
                <th className="px-4 py-2">{t('challenges.col.digest')}</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => (
                <CertRow key={c.digest} row={c} onRemove={() => remove.mutate(c.digest)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function CertRow({ row, onRemove }: { row: FmChallengeCertRow; onRemove: () => void }) {
  const { t } = useTranslation();
  // Revérifié à l'affichage : une mise à jour des règles peut changer le verdict d'un ancien certificat.
  const { data: check } = useQuery({ queryKey: ['challenges', 'verify', row.digest], queryFn: () => verifyCertificate(row.data) });
  const ok = check?.ok ?? row.verified;
  return (
    <tr className="border-t border-canard/5">
      <td className="px-4 py-2 font-bold">{row.coach}</td>
      <td className="px-4 py-2">{t(`challenges.def.${row.challengeId}.name`)}</td>
      <td className="px-4 py-2">
        <StatusPill status={row.status as ChallengeStatus} />
      </td>
      <td className={`px-4 py-2 font-bold ${ok ? 'text-eau-fonce' : 'text-corail'}`}>{ok ? t('challenges.verified') : t('challenges.altered')}</td>
      <td className="px-4 py-2">{row.data.facts.clubs.join(', ')}</td>
      <td className="px-4 py-2 font-mono text-xs">{shortDigest(row.digest)}</td>
      <td className="px-4 py-2">
        <button type="button" className="text-xs text-corail hover:underline" onClick={onRemove}>
          {t('challenges.remove')}
        </button>
      </td>
    </tr>
  );
}
