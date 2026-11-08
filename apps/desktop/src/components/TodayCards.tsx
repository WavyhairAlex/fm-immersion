import { CHALLENGES, evaluateChallenge, gazetteIssues, type ChallengeId } from '@fm-immersion/module-fm';
import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { factsFor } from '../lib/challenges';
import { useFacesDirs, useFacesUpdate, v2Count, pcState } from '../lib/faces';
import { challengesData } from '../lib/data';
import { useHistory } from '../lib/fm-cache';
import { storyText } from '../lib/gazette-text';

type FacesStatus = { state: 'noGame' | 'missing' | 'original' | 'photorealV1' | 'photorealCustom' | 'unknown' };
type Progress = { found: boolean; completePermille: number };

/** Bas de « Aujourd'hui » : un cadre par chose racontée ou installée (gazette, défi, visages), avec son lien. */
export function TodayCards({ saveId }: { saveId: string }) {
  return (
    <div className="mt-6 grid gap-4 md:grid-cols-3">
      <GazetteCard saveId={saveId} />
      <ChallengeCard saveId={saveId} />
      <FacesCard />
    </div>
  );
}

function Card({ label, to, action, children }: { label: string; to: string; action: string; children: React.ReactNode }) {
  return (
    <section className="card flex flex-col gap-2">
      <h3>{label}</h3>
      <div className="flex-1">{children}</div>
      <Link to={to} className="text-sm font-bold text-orange-fonce hover:underline">
        {action} →
      </Link>
    </section>
  );
}

function GazetteCard({ saveId }: { saveId: string }) {
  const { t } = useTranslation();
  const { data: history = [] } = useHistory(saveId);
  const issue = useMemo(() => gazetteIssues(history)[0] ?? null, [history]);
  return (
    <Card label={issue ? `${t('modes.gazette.title')} · ${t('gazette.issue', { number: issue.number })}` : t('modes.gazette.title')} to="/gazette" action={t('layout.today.read')}>
      {issue ? (
        <p className="font-display text-lg font-semibold leading-snug">{storyText(t, issue.club, issue.headline).title}</p>
      ) : (
        <p className="text-sm text-brun">{t('layout.today.noGazette')}</p>
      )}
    </Card>
  );
}

function ChallengeCard({ saveId }: { saveId: string }) {
  const { t } = useTranslation();
  const { data: history = [] } = useHistory(saveId);
  const { data: enrolled = [] } = useQuery({ queryKey: ['challenges', saveId], queryFn: () => challengesData.list(saveId) });
  const row = enrolled.find((c) => !c.abandoned) ?? null;
  const result = useMemo(
    () => (row && CHALLENGES.some((d) => d.id === row.challengeId) ? evaluateChallenge(row.challengeId as ChallengeId, factsFor(row, history), row.params) : null),
    [row, history],
  );
  return (
    <Card label={t('layout.today.challenge')} to="/defis" action={row ? t('layout.today.see') : t('layout.today.pickChallenge')}>
      {row && result ? (
        <div className="space-y-2">
          <p className="font-display text-lg font-semibold">{t(`challenges.def.${row.challengeId}.name`)}</p>
          <span className="pill">{t(`challenges.status.${result.status}`)}</span>
          <p className="text-sm text-brun">
            {t('layout.today.steps', { done: result.steps.filter((s) => s.done).length, total: result.steps.length })}
          </p>
        </div>
      ) : (
        <p className="text-sm text-brun">{t('layout.today.noChallenge')}</p>
      )}
    </Card>
  );
}

function FacesCard() {
  const { t, i18n } = useTranslation();
  const { gameDir, workshop } = useFacesDirs();
  const offer = useFacesUpdate(gameDir, workshop).data?.offer;
  const { data: status } = useQuery({
    queryKey: ['faces', 'status', gameDir],
    queryFn: () => invoke<FacesStatus>('faces_status', { gameDir, workshopDir: workshop || null }),
    enabled: !!gameDir,
  });
  const { data: progress } = useQuery({
    queryKey: ['faces', 'progress', workshop],
    queryFn: () => invoke<Progress>('faces_progress', { workshopDir: workshop }),
    enabled: !!workshop,
    refetchInterval: 60_000,
  });
  const pct = progress?.found ? progress.completePermille / 10 : null;
  return (
    <Card label={t('modes.faces.title')} to="/visages" action={t('layout.today.see')}>
      {status && <p className="font-bold">{t(`faces.pc.${pcState(status.state, !!offer)}`)}</p>}
      {offer && <p className="mt-1 text-sm font-bold text-orange-fonce">{t('layout.today.facesUpdate', { count: v2Count(offer.manifest) })}</p>}
      {pct != null && pct < 100 && (
        <div className="mt-2">
          <p className="text-sm text-brun">{t('layout.today.facesProgress', { pct: pct.toLocaleString(i18n.language, { maximumFractionDigits: 1 }) })}</p>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-creme ring-1 ring-canard/10">
            <div className="h-full bg-orange" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}
    </Card>
  );
}
