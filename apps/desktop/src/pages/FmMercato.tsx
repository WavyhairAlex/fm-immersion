import { MERCATO_ORDER, POS_LABEL, mercatoAdvice, type FmPlayer, type MercatoAdvice, type MercatoReason, type MercatoVerdict, type SquadAt } from '@simloom/module-fm';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useTacticEngine } from './FmTactic';
import { CompatTag, Empty, Kpi, Level, Panel, Pos, Tag, useCoach, useFormat, useNames, type Tone } from './FmUi';

const TONE: Record<MercatoVerdict, Tone> = { sell: 'bad', release: 'bad', loan: 'warn', extend: 'warn', develop: 'good', replace: 'warn', backup: 'info', core: 'good' };
/** Groupes affichés en détail : ce qui demande une décision au mercato. */
const ACTION: MercatoVerdict[] = ['sell', 'release', 'loan', 'extend', 'replace'];

/** Étoiles du staff « 1,5 ★ → 4 ★ » (niveau actuel → potentiel). */
function Stars({ p }: { p: FmPlayer }) {
  const { i18n } = useTranslation();
  const s = p.stars;
  if (!s || (s.current == null && s.potential == null)) return <span className="text-canard/40">–</span>;
  const n = (x: number | null) => (x == null ? '?' : x.toLocaleString(i18n.resolvedLanguage, { maximumFractionDigits: 1 }));
  return (
    <span className="whitespace-nowrap tabular-nums">
      {n(s.current)} ★ <span className="text-brun">→</span> <b>{n(s.potential)} ★</b>
    </span>
  );
}

/**
 * Départs et jeunes : qui faire partir (vente, fin de contrat, prêt), qui prolonger, et quels jeunes valent le coup.
 * Calculé sur l'effectif importé ; aucune lecture supplémentaire dans le jeu.
 */
export function FmMercato({ players, folder, gameDate, history }: { players: FmPlayer[]; folder: string; gameDate: string; history: SquadAt[] }) {
  const { t } = useTranslation();
  const f = useFormat();
  const names = useNames();
  const { engine } = useTacticEngine(folder, players);
  const [coach] = useCoach();
  const r = useMemo(() => mercatoAdvice(engine, players, gameDate, coach, history), [engine, players, gameDate, coach, history]);
  if (!r) return <Empty>{t('fm.tac.noAttributes')}</Empty>;
  const style = engine.ref.styles.find((s) => s.id === r.projectStyle);

  const reason = (x: MercatoReason) => {
    switch (x.id) {
      case 'surplus':
        return t('fm.merc.why.surplus', { pos: POS_LABEL[x.pos], rank: x.rank, need: x.need });
      case 'starterNow':
      case 'starterProject':
      case 'backupAt':
      case 'misfit':
        return t(`fm.merc.why.${x.id}`, { pos: POS_LABEL[x.pos] });
      case 'contract':
        return x.months <= 0 ? t('fm.contracts.expired') : t('fm.merc.why.contract', { count: x.months });
      case 'unwanted':
        return t('fm.merc.why.unwanted', { status: x.status });
      case 'potential':
        return t('fm.merc.why.potential', { stars: x.stars });
      case 'overtakes':
        return t('fm.merc.why.overtakes', { count: x.years, starter: x.starter });
      case 'decline':
        return t('fm.merc.why.decline', { age: x.age });
      default:
        return t(`fm.merc.why.${x.id}`);
    }
  };

  const line = (a: MercatoAdvice, showVerdict = false) => (
    <div key={a.player.id} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 border-b border-canard/5 py-2 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <b>{a.player.name}</b> <Pos player={a.player} />
          <span className="text-xs text-brun">{t('fm.contracts.age', { count: a.player.age ?? 0 })}</span>
          {a.player.team && <Tag>{a.player.team}</Tag>}
          <CompatTag c={a.compat} />
          {showVerdict && <Tag tone={TONE[a.verdict]}>{t(`fm.merc.verdict.${a.verdict}`)}</Tag>}
        </div>
        <p className="mt-0.5 text-xs text-brun">{a.reasons.map(reason).join(' · ')}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-brun">
        <Stars p={a.player} />
        <span className="flex items-center gap-1">
          <Level value={a.player.level} />→<Level value={a.proj[1]} />
        </span>
        <span className="tabular-nums">{f.money(a.player.value)}</span>
      </div>
    </div>
  );

  const n = (v: MercatoVerdict) => r.byVerdict[v].length;
  const prospects = r.youth.filter((a) => a.prospect);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label={t('fm.merc.kpi.leave')} value={n('sell') + n('release')} tone={n('sell') + n('release') ? 'bad' : undefined} sub={t('fm.merc.kpi.leaveSub', { sell: n('sell'), release: n('release') })} />
        <Kpi label={t('fm.merc.kpi.income')} value={f.money(r.income)} sub={t('fm.merc.kpi.incomeSub', { wages: f.money(r.wagesFreed) })} />
        <Kpi label={t('fm.merc.kpi.prospects')} value={prospects.length} sub={t('fm.merc.kpi.prospectsSub', { loan: n('loan') })} />
        <Kpi label={t('fm.merc.kpi.extend')} value={n('extend')} sub={t('fm.merc.kpi.extendSub')} />
        <Kpi label={t('fm.merc.kpi.off')} value={r.advice.filter((a) => a.compat?.compat === 'no').length} sub={t('fm.merc.kpi.offSub')} />
      </div>
      <p className="help">{t('fm.merc.help', { form: r.nowForm ?? '–', style: names.style(style), projectForm: r.projectForm ?? '–' })}</p>

      <Panel title={t('fm.merc.youth', { count: r.youth.length })}>
        {r.youth.length ? r.youth.map((a) => line(a, true)) : <Empty>{t('fm.merc.noYouth')}</Empty>}
        <p className="mt-2 text-xs text-brun">{t('fm.merc.youthHelp')}</p>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        {ACTION.filter((v) => n(v)).map((v) => (
          <Panel key={v} title={t(`fm.merc.group.${v}`, { count: n(v) })}>
            <p className="help">{t(`fm.merc.groupHelp.${v}`)}</p>
            {r.byVerdict[v].map((a) => line(a))}
          </Panel>
        ))}
      </div>

      <Panel title={t('fm.merc.stay')}>
        {MERCATO_ORDER.filter((v) => !ACTION.includes(v) && n(v)).map((v) => (
          <div key={v} className="mb-2 last:mb-0">
            <p className="mb-1 text-sm">
              <Tag tone={TONE[v]}>{t(`fm.merc.verdict.${v}`)}</Tag> <span className="text-brun">{t(`fm.merc.groupHelp.${v}`)}</span>
            </p>
            <p className="text-sm">{r.byVerdict[v].map((a) => a.player.name).join(', ')}</p>
          </div>
        ))}
      </Panel>
    </div>
  );
}
