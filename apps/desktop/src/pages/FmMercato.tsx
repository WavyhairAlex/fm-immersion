import { CONTRACT_CALLS, MERCATO_ORDER, POS_LABEL, contractDecisions, mercatoAdvice, type ContractCall, type FmPlayer, type MercatoAdvice, type MercatoReason, type MercatoReport, type MercatoVerdict, type SquadAt } from '@simloom/module-fm';
import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useTacticEngine } from './FmTactic';
import { CompatTag, Empty, Kpi, Level, Panel, Pos, Tag, useCoach, useFormat, useNames, type Tone, More, PlayerLink } from './FmUi';

export const TONE: Record<MercatoVerdict, Tone> = { sell: 'bad', release: 'bad', loan: 'warn', extend: 'warn', develop: 'good', replace: 'warn', backup: 'info', core: 'good' };
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

/** Texte d'une raison du conseil mercato. */
export function useReason() {
  const { t } = useTranslation();
  return (x: MercatoReason) => {
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
      case 'potentialPa':
        return t('fm.merc.why.potentialPa', { pa: x.pa, ca: x.ca });
      case 'overtakes':
        return t('fm.merc.why.overtakes', { count: x.years, starter: x.starter });
      case 'decline':
        return t('fm.merc.why.decline', { age: x.age });
      default:
        return t(`fm.merc.why.${x.id}`);
    }
  };
}

/** Une ligne joueur : nom, poste, âge, compatibilité, raisons ; étoiles, niveau projeté et valeur à droite. */
function AdviceLine({ a, tag, extra }: { a: MercatoAdvice; tag?: ReactNode; extra?: ReactNode }) {
  const { t } = useTranslation();
  const f = useFormat();
  const reason = useReason();
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 border-b border-canard/5 py-2 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <PlayerLink player={a.player} /> <Pos player={a.player} />
          <span className="text-xs text-brun">{t('fm.contracts.age', { count: a.player.age ?? 0 })}</span>
          {a.player.team && <Tag>{a.player.team}</Tag>}
          <CompatTag c={a.compat} />
          {tag}
        </div>
        <p className="mt-0.5 text-xs text-brun">{a.reasons.map(reason).join(' · ')}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-brun">
        {extra}
        <Stars p={a.player} />
        <span className="flex items-center gap-1">
          <Level value={a.player.level} />→<Level value={a.proj[1]} />
        </span>
        <span className="tabular-nums">{f.money(a.player.value)}</span>
      </div>
    </div>
  );
}

const CALL_TONE: Record<ContractCall, Tone> = { extend: 'good', extendShort: 'info', sellNow: 'warn', letGo: 'bad' };

/**
 * Contrats à décider : les fins de contrat à six mois ou moins (celles que FM27 envoie en message), avec pour
 * chacun la décision à prendre dans le jeu et pourquoi. Rien n'est affiché s'il n'y en a pas.
 */
export function ContractsToDecide({ r, go }: { r: MercatoReport; go?: (view: string) => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  const list = useMemo(() => contractDecisions(r), [r]);
  if (!list.length) return null;
  const count = (c: ContractCall) => list.filter((d) => d.call === c).length;
  return (
    <Panel
      title={t('fm.decide.title', { count: list.length })}
      action={
        go && (
          <button type="button" className="text-sm font-bold text-eau-fonce hover:underline" onClick={() => go('mercato')}>
            {t('fm.views.mercato')} →
          </button>
        )
      }
    >
      <More>{t('fm.decide.help')}</More>
      <p className="mb-2 flex flex-wrap gap-1.5 text-sm">
        {CONTRACT_CALLS.filter(count).map((c) => (
          <Tag key={c} tone={CALL_TONE[c]}>
            {t(`fm.decide.call.${c}`)} · {count(c)}
          </Tag>
        ))}
      </p>
      {list.map(({ advice: a, call, years }) => (
        <AdviceLine
          key={a.player.id}
          a={a}
          tag={
            <Tag tone={CALL_TONE[call]}>
              {t(`fm.decide.call.${call}`)}
              {years ? ` · ${t('fm.decide.years', { count: years })}` : ''}
            </Tag>
          }
          extra={<span className="tabular-nums">{t('fm.decide.wage', { wage: f.money(a.player.wage) })}</span>}
        />
      ))}
      <More>{t('fm.decide.legend')}</More>
    </Panel>
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

  const n = (v: MercatoVerdict) => r.byVerdict[v].length;
  const prospects = r.youth.filter((a) => a.prospect);
  // Chaque joueur n'apparaît qu'une fois : les jeunes sont dans leur cadre (avec leur étiquette), pas aussi dans les groupes.
  const youthIds = new Set(r.youth.map((a) => a.player.id));
  const rest = (v: MercatoVerdict) => r.byVerdict[v].filter((a) => !youthIds.has(a.player.id));

  return (
    <div className="space-y-4">
      <ContractsToDecide r={r} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label={t('fm.merc.kpi.leave')} value={n('sell') + n('release')} tone={n('sell') + n('release') ? 'bad' : undefined} sub={t('fm.merc.kpi.leaveSub', { sell: n('sell'), release: n('release') })} />
        <Kpi label={t('fm.merc.kpi.income')} value={f.money(r.income)} dim={!r.income} sub={t('fm.merc.kpi.incomeSub', { wages: f.money(r.wagesFreed) })} />
        <Kpi label={t('fm.merc.kpi.prospects')} value={prospects.length} sub={t('fm.merc.kpi.prospectsSub', { loan: n('loan') })} />
        <Kpi label={t('fm.merc.kpi.extend')} value={n('extend')} sub={t('fm.merc.kpi.extendSub')} />
        <Kpi label={t('fm.merc.kpi.off')} value={r.advice.filter((a) => a.compat?.compat === 'no').length} sub={t('fm.merc.kpi.offSub')} />
      </div>
      <More>{t('fm.merc.help', { form: r.nowForm ?? '–', style: names.style(style), projectForm: r.projectForm ?? '–' })}</More>

      <Panel title={t('fm.merc.youth', { count: r.youth.length })}>
        {r.youth.length ? r.youth.map((a) => <AdviceLine key={a.player.id} a={a} tag={<Tag tone={TONE[a.verdict]}>{t(`fm.merc.verdict.${a.verdict}`)}</Tag>} />) : <Empty>{t('fm.merc.noYouth')}</Empty>}
        <More>{t('fm.merc.youthHelp')}</More>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        {ACTION.filter((v) => rest(v).length).map((v) => (
          <Panel key={v} title={t(`fm.merc.group.${v}`, { count: rest(v).length })}>
            <p className="help">{t(`fm.merc.groupHelp.${v}`)}</p>
            {rest(v).map((a) => <AdviceLine key={a.player.id} a={a} />)}
          </Panel>
        ))}
      </div>

      <Panel title={t('fm.merc.stay')}>
        <p className="help">{t('fm.merc.stayNoYouth')}</p>
        {MERCATO_ORDER.filter((v) => !ACTION.includes(v) && rest(v).length).map((v) => (
          <div key={v} className="mb-2 last:mb-0">
            <p className="mb-1 text-sm">
              <Tag tone={TONE[v]}>{t(`fm.merc.verdict.${v}`)}</Tag> <span className="text-brun">{t(`fm.merc.groupHelp.${v}`)}</span>
            </p>
            <p className="text-sm">{rest(v).map((a) => a.player.name).join(', ')}</p>
          </div>
        ))}
      </Panel>
    </div>
  );
}
