import { abilityNeeded, gameInstructionLabel, keyAttrs, styleComplexity, tactAbility, type FmPlayer, type Phase } from '@simloom/module-fm';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { readScoped, scopedKey, useFmSaveScope, writeScoped } from '../lib/save-store';
import { useTacticChoice } from './FmTactic';
import { Empty, Fit, Kpi, Panel, Tag, useNames } from './FmUi';

const STYLE_KEY = 'simloom.fm.styleView';

/** Style de jeu : styles classés selon l'effectif, profil du groupe, consignes et meilleurs joueurs par rôle typique. */
export function FmStyle({ players, folder }: { players: FmPlayer[]; folder: string }) {
  const { t, i18n } = useTranslation();
  const names = useNames();
  // Même classement et même style par défaut que l'onglet Composition.
  const { engine, avail: list, ranked, style: chosen } = useTacticChoice(players, folder, null);
  const sig = useMemo(() => engine.squadSignals(list), [engine, list]);
  const scope = useFmSaveScope();
  const [sel, setSel] = useState<string | null>(() => {
    // Ancienne valeur commune : un id brut, pas du JSON.
    try {
      if (localStorage.getItem(scopedKey(STYLE_KEY, scope.saveId)) == null && scope.inheritsLegacy) return localStorage.getItem(STYLE_KEY);
    } catch {
      return null;
    }
    return readScoped<string | null>(STYLE_KEY, { ...scope, inheritsLegacy: false }, null);
  });
  if (!list.length || !ranked.length) return <Empty>{t('fm.tac.noAttributes')}</Empty>;
  const choose = (id: string) => {
    setSel(id);
    writeScoped(STYLE_KEY, scope, id);
  };
  const cur = ranked.find((r) => r.style.id === sel)?.style ?? chosen ?? ranked[0]!.style;
  const fits = ranked.map((r) => r.fit ?? 0);
  const lo = Math.min(...fits);
  const hi = Math.max(...fits);
  const sigMax = Math.max(...Object.values(sig).map((v) => v ?? 0));
  const nf1 = new Intl.NumberFormat(i18n.resolvedLanguage, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const cx = styleComplexity(cur);
  const ability = tactAbility(list);
  const need = abilityNeeded(cur);
  const gap = ability != null ? ability - need : null;
  const verdict = gap == null ? null : gap >= 0 ? 'ok' : gap > -2.5 ? 'slow' : 'hard';
  const pros = Array.isArray(cur.pros) ? (cur.pros as string[]) : [];
  const cons = Array.isArray(cur.cons) ? (cur.cons as string[]) : [];

  const roleBlock = (code: string, ph: Phase) => {
    const r = engine.roles.get(code);
    if (!r) return null;
    const top = list
      .filter((p) => engine.rolePositions(r).some((pos) => p.positions.includes(pos)))
      // Note au meilleur poste naturel du joueur pour ce rôle (étoiles lues dans le jeu comprises).
      .map((p) => ({ p, f: Math.max(...engine.rolePositions(r, ph).filter((pos) => p.positions.includes(pos)).map((pos) => engine.roleFit(p, code, ph, pos) ?? 0), 0) || null }))
      .filter((x): x is { p: FmPlayer; f: number } => x.f != null)
      .sort((a, b) => b.f - a.f)
      .slice(0, 3);
    return (
      <div key={`${code}-${ph}`} className="rounded-xl bg-creme/50 px-3 py-2">
        <div className="flex items-baseline justify-between gap-2">
          <b>{names.role(r)}</b>
          <Tag tone={ph === 'ip' ? 'good' : 'info'}>{t(`fm.tac.phase.${ph}`)}</Tag>
        </div>
        <p className="text-xs text-brun">{keyAttrs(engine, code, ph, 4).map((k) => t(`fm.attr.${k}`, { defaultValue: k })).join(', ')}</p>
        <div className="mt-1 text-sm">
          {top.length ? (
            top.map((x) => (
              <div key={x.p.id} className="flex justify-between py-0.5">
                <span>{x.p.name}</span>
                <Fit value={x.f} />
              </div>
            ))
          ) : (
            <span className="text-xs text-brun">{t('fm.style.nobody')}</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t('fm.style.which')}>
          <p className="help">{t('fm.style.whichHelp')}</p>
          {ranked.map(({ style, fit }) => (
            <button
              key={style.id}
              type="button"
              onClick={() => choose(style.id)}
              className={`flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left ${style.id === cur.id ? 'bg-eau/20' : 'hover:bg-canard/5'}`}
            >
              <span className="w-1/2 min-w-0">
                <b>{names.style(style)}</b> {style.mentality && <span className="text-xs text-brun">{style.mentality}</span>}
              </span>
              <span className="flex-1">
                <span className="block h-2 rounded-full bg-eau-fonce" style={{ width: `${hi > lo ? Math.round(15 + (85 * ((fit ?? 0) - lo)) / (hi - lo)) : 100}%` }} />
              </span>
              <Fit value={fit} />
            </button>
          ))}
        </Panel>

        <Panel title={t('fm.style.profile')}>
          {Object.entries(sig)
            .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
            .map(([k, v]) => (
              <div key={k} className="flex items-center gap-3 py-1 text-sm">
                <span className="w-28">{t(`fm.signal.${k}`)}</span>
                <span className="flex-1">
                  <span className={`block h-2 rounded-full ${(cur.weights[k] ?? 0) > 0 ? 'bg-eau-fonce' : 'bg-canard/15'}`} style={{ width: `${v && sigMax ? Math.round((100 * v) / sigMax) : 0}%` }} />
                </span>
                <span className="w-10 text-right tabular-nums">{v == null ? '–' : nf1.format(v)}</span>
              </div>
            ))}
          <p className="mt-2 text-xs text-brun">{t('fm.style.profileHelp')}</p>
        </Panel>
      </div>

      <Panel title={names.style(cur)}>
        {cur.summary && <p className="-mt-2 mb-3">{cur.summary}</p>}
        <div className="grid gap-4 md:grid-cols-3">
          <div className="text-sm">
            {pros.length > 0 && (
              <>
                <p className="text-xs font-bold uppercase text-canard/60">{t('fm.style.pros')}</p>
                {pros.map((x) => (
                  <p key={x}>+ {x}</p>
                ))}
              </>
            )}
            {cons.length > 0 && (
              <>
                <p className="mt-2 text-xs font-bold uppercase text-canard/60">{t('fm.style.cons')}</p>
                {cons.map((x) => (
                  <p key={x}>− {x}</p>
                ))}
              </>
            )}
            {cur.mentality && <p className="mt-2">{t('fm.style.mentality', { value: cur.mentality })}</p>}
            <p className="mt-1">
              {t('fm.style.needs', {
                list: Object.entries(cur.weights)
                  .filter(([, w]) => w > 0)
                  .map(([k]) => t(`fm.signal.${k}`))
                  .join(', '),
              })}
            </p>
          </div>
          <div className="text-sm">
            <p className="text-xs font-bold uppercase text-canard/60">{t('fm.style.ip')}</p>
            {cur.inPossession.map((x) => (
              <p key={x}>
                {gameInstructionLabel(x) ?? x}
                {!gameInstructionLabel(x) && <span className="ml-1 text-xs text-brun">({t('fm.style.notInGame')})</span>}
              </p>
            ))}
          </div>
          <div className="text-sm">
            <p className="text-xs font-bold uppercase text-canard/60">{t('fm.style.oop')}</p>
            {cur.outOfPossession.map((x) => (
              <p key={x}>
                {gameInstructionLabel(x) ?? x}
                {!gameInstructionLabel(x) && <span className="ml-1 text-xs text-brun">({t('fm.style.notInGame')})</span>}
              </p>
            ))}
          </div>
        </div>
        <h3 className="mb-2 mt-5 font-semibold">{t('fm.style.roles')}</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {cur.signatureRoles.ip.map((c) => roleBlock(c, 'ip'))}
          {cur.signatureRoles.oop.map((c) => roleBlock(c, 'oop'))}
        </div>
        <p className="mt-2 text-xs text-brun">{t('fm.style.rolesHelp')}</p>
      </Panel>

      <Panel title={t('fm.style.effTitle')}>
        <p className="help">{t('fm.style.effHelp')}</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Kpi label={t('fm.style.complexity')} value={'●'.repeat(cx) + '○'.repeat(5 - cx)} sub={t(`fm.style.cx.${cx}`)} />
          <Kpi label={t('fm.style.ability')} value={ability == null ? '–' : nf1.format(ability)} sub={t('fm.style.abilitySub', { value: nf1.format(need) })} />
          <Kpi
            label={t('fm.style.verdict')}
            value={verdict ? <Tag tone={verdict === 'ok' ? 'good' : verdict === 'slow' ? 'warn' : 'bad'}>{t(`fm.style.v.${verdict}`)}</Tag> : '–'}
            sub={verdict && verdict !== 'ok' ? t('fm.style.simplify') : undefined}
          />
        </div>
      </Panel>
    </div>
  );
}
