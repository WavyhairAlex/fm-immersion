import {
  buildCertificate,
  CHALLENGES,
  evaluateChallenge,
  shortDigest,
  verifyCertificate,
  type ChallengeDef,
  type ChallengeId,
  type ChallengeResult,
  type ChallengeStatus,
  type FmSnapshot,
} from '@fm-immersion/module-fm';
import type { FmChallengeCertRow, FmChallengeRow } from '@fm-immersion/module-fm/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { factsFor } from '../lib/challenges';
import { issueText, saveCertificate, sendCertificate, stepText } from '../lib/challenge-share';
import { challengesData, fmData, savesData } from '../lib/data';
import { getWebhook, isWebhook } from '../lib/discord';

const SAVE_KEY = 'fmi.challenges.save';
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
  const { data: saves = [] } = useQuery({ queryKey: ['saves'], queryFn: savesData.list });
  const fmSaves = saves.filter((s) => s.gameId === 'fm');
  const [saveId, setSaveId] = useState(read(SAVE_KEY));
  useEffect(() => {
    if ((!saveId || !fmSaves.some((s) => s.id === saveId)) && fmSaves[0]) setSaveId(fmSaves[0].id);
  }, [fmSaves, saveId]);
  useEffect(() => {
    if (saveId) write(SAVE_KEY, saveId);
  }, [saveId]);
  const [coach, setCoach] = useState(read(COACH_KEY));

  const { data: history = [] } = useQuery({ queryKey: ['fm', 'all', saveId], queryFn: () => fmData.all(saveId), enabled: !!saveId });
  const { data: settings } = useQuery({ queryKey: ['fm', 'settings', saveId], queryFn: () => fmData.settings(saveId), enabled: !!saveId });
  const { data: enrolled = [] } = useQuery({ queryKey: ['challenges', saveId], queryFn: () => challengesData.list(saveId), enabled: !!saveId });
  const active = enrolled.filter((c) => !c.abandoned);

  return (
    <div className="w-full px-6 py-6 xl:px-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">{t('modes.challenges.title')}</h1>
        {fmSaves.length > 1 && (
          <select className="input w-auto" value={saveId} onChange={(e) => setSaveId(e.target.value)} aria-label={t('challenges.save')}>
            {fmSaves.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <p className="mt-2 max-w-3xl text-brun">{t('challenges.intro')}</p>

      {!fmSaves.length && (
        <div className="card mt-6 max-w-3xl">
          <p className="text-brun">{t('challenges.noSave')}</p>
          <Link to="/coach" className="btn-primary mt-4">
            {t('modes.coach.title')}
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
            {CHALLENGES.map((d) => (
              <CatalogCard
                key={d.id}
                def={d}
                saveId={saveId}
                taken={active.some((c) => c.challengeId === d.id)}
                unemployedSince={settings?.fmFreeSince ?? null}
                freshCareer={!history.length}
                latest={history.at(-1)?.gameDate ?? null}
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
  return (
    <article className="card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">{t(`challenges.def.${row.challengeId}.name`)}</h3>
        <StatusPill status={result.status} />
      </div>
      <p className="mt-1 text-xs text-brun">
        {t('challenges.since', { date: row.startDate })}
        {row.params.nationality ? ` · ${row.params.nationality}` : ''}
      </p>
      <Steps result={result} />
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

function CatalogCard(p: { def: ChallengeDef; saveId: string; taken: boolean; unemployedSince: string | null; freshCareer: boolean; latest: string | null }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [nationality, setNationality] = useState('');
  const { def } = p;
  // Départ sans club : nouvelle carrière (aucun instantané d'un club) avec un manager sans club selon le plugin.
  const unemployed = !!p.unemployedSince && p.freshCareer;
  const blocked = !def.available ? 'soon' : p.taken ? 'taken' : def.unemployedStart && !unemployed ? 'needUnemployed' : !def.unemployedStart && !p.latest ? 'needSnapshot' : null;
  const enroll = useMutation({
    mutationFn: () =>
      challengesData.enroll(p.saveId, {
        challengeId: def.id,
        startDate: (def.unemployedStart ? p.unemployedSince : p.latest) ?? p.latest ?? '',
        unemployedStart: unemployed,
        params: def.param === 'nationality' ? { nationality: nationality.trim() } : {},
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['challenges', p.saveId] }),
  });
  return (
    <article className="card flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">{t(`challenges.def.${def.id}.name`)}</h3>
        {!def.available && <span className="pill bg-canard/10">{t('modes.soon')}</span>}
      </div>
      <p className="text-sm">{t(`challenges.def.${def.id}.rules`)}</p>
      <p className="text-xs text-brun">
        <span className="font-bold">{t('challenges.checked')} </span>
        {t(`challenges.def.${def.id}.checked`)}
      </p>
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
            disabled={enroll.isPending || (def.param === 'nationality' && !nationality.trim())}
            onClick={() => enroll.mutate()}
          >
            {t('challenges.enroll')}
          </button>
        )}
      </div>
    </article>
  );
}

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
