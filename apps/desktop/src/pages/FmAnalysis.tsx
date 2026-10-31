import { analyseSquad, POS_LABEL, type FmPlayer, type PosCode, type Todo } from '@simloom/module-fm';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

const DOT: Record<Todo['level'], string> = { urgent: 'bg-corail', warning: 'bg-ambre', info: 'bg-eau' };
/** Barres de la pyramide des âges : du plus clair (jeunes) au plus foncé. */
const AGE_SHADE = ['bg-eau/40', 'bg-eau', 'bg-eau-fonce', 'bg-canard'];
/** Postes présents dans presque tous les schémas. */
const CORE: PosCode[] = ['GB', 'DD', 'DC', 'DG', 'MC', 'BT'];

/** Diagnostic de l'effectif : chiffres clés, priorités, lignes, profondeur, âges. */
export function FmAnalysis({ players, gameDate }: { players: FmPlayer[]; gameDate: string }) {
  const { t, i18n } = useTranslation();
  const a = useMemo(() => analyseSquad(players, gameDate), [players, gameDate]);
  const nf = new Intl.NumberFormat(i18n.resolvedLanguage, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const f = (x: number | null) => (x == null ? '–' : nf.format(x));
  const list = (names: string[] = []) => names.slice(0, 4).join(', ') + (names.length > 4 ? '…' : '');
  const total = a.ages.reduce((s, b) => s + b.squad, 0) || 1;

  return (
    <div className="mt-6 space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        <Kpi label={t('fm.an.xi')} value={f(a.xiLevel)} sub={t('fm.an.xiSub')} />
        <Kpi
          label={t('fm.an.bench')}
          value={f(a.benchLevel)}
          sub={t('fm.an.gap', { gap: a.xiLevel != null && a.benchLevel != null ? f(a.xiLevel - a.benchLevel) : '–' })}
        />
        <Kpi label={t('fm.an.xiAge')} value={f(a.xiAge)} sub={t('fm.an.squadAge', { age: f(a.squadAge) })} />
        <Kpi
          label={t('fm.an.lines')}
          value={a.strongest ? t(`fm.line.${a.strongest}`) : '–'}
          sub={a.weakest ? t('fm.an.weakest', { line: t(`fm.line.${a.weakest}`) }) : ''}
        />
      </div>

      <section className="card">
        <h2 className="text-xl font-semibold">{t('fm.an.todo')}</h2>
        {a.todo.length === 0 && <p className="mt-2 text-sm text-brun">{t('fm.alert.none')}</p>}
        <ol className="mt-3 space-y-3">
          {a.todo.map((todo, i) => (
            <li key={i} className="flex gap-3">
              <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${DOT[todo.level]}`} aria-hidden />
              <span>
                <b>{t(`fm.todo.${todo.kind}`, { pos: todo.pos ? POS_LABEL[todo.pos] : '', count: todo.names?.length ?? 0 })}</b>
                {todo.names && todo.names.length > 0 && <span className="block text-sm text-brun">{list(todo.names)}</span>}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="text-xl font-semibold">{t('fm.an.byLine')}</h2>
          <div className="mt-4 space-y-3">
            {a.lines.map((l) => (
              <div key={l.line}>
                <div className="flex justify-between text-sm">
                  <b>{t(`fm.line.${l.line}`)}</b>
                  <span className="text-brun">
                    {t('fm.an.lineDetail', { starters: f(l.starters), bench: f(l.bench), age: f(l.age) })}
                  </span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-creme">
                  <div className="h-2 rounded-full bg-eau-fonce" style={{ width: `${((l.starters ?? 0) / 20) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <h2 className="text-xl font-semibold">{t('fm.an.ages')}</h2>
          <div className="mt-4 flex h-8 overflow-hidden rounded-full">
            {a.ages.map((b, i) =>
              b.squad ? (
                <div
                  key={b.key}
                  className={`flex items-center justify-center text-xs font-bold ${AGE_SHADE[i]} ${i >= 2 ? 'text-white' : 'text-canard'}`}
                  style={{ width: `${(b.squad / total) * 100}%` }}
                >
                  {b.squad}
                </div>
              ) : null,
            )}
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-1 text-sm">
            {a.ages.map((b, i) => (
              <li key={b.key} className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${AGE_SHADE[i]}`} aria-hidden />
                {t(`fm.an.age.${b.key}`)} · {t('fm.an.ageXi', { count: b.squad, xi: b.xi })}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card">
        <h2 className="text-xl font-semibold">{t('fm.an.depth')}</h2>
        <p className="mt-1 text-sm text-brun">{t('fm.an.depthHelp')}</p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {a.depth.map((d) => {
            const n = d.players.length;
            // Pistons et ailiers dépendent du schéma : un vide n'y est pas une alerte.
            const core = CORE.includes(d.pos);
            const tone =
              n === 0 ? (core ? 'ring-corail bg-corail/10' : 'ring-canard/10 bg-creme/60') : n === 1 && core ? 'ring-ambre bg-ambre/15' : 'ring-eau bg-eau/10';
            return (
              <div key={d.pos} className={`rounded-2xl p-3 ring-1 ${tone}`} title={d.players.map((p) => p.name).join(', ')}>
                <p className="text-xs font-bold">{POS_LABEL[d.pos]}</p>
                <p className="font-display text-2xl font-semibold">{n}</p>
                <p className="truncate text-xs text-brun">{d.players[0]?.name ?? '–'}</p>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="card p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-canard/60">{label}</p>
      <p className="mt-1 font-display text-3xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-brun">{sub}</p>
    </div>
  );
}
