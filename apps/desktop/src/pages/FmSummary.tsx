import { summarize, type FmPlayer, type FmSnapshot } from '@simloom/module-fm';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

type Tone = 'ok' | 'warn' | 'bad' | undefined;
const TONE: Record<NonNullable<Tone>, string> = {
  ok: 'bg-eau',
  warn: 'bg-ambre',
  bad: 'bg-corail',
};

/** L'essentiel en quelques secondes : 5 chiffres (le prochain match est dans l'avant-match), puis le détail par thème. */
export function FmSummary({ snap, players }: { snap: FmSnapshot; players: FmPlayer[] }) {
  const { t, i18n } = useTranslation();
  const s = useMemo(() => summarize(snap, players), [snap, players]);
  const lang = i18n.resolvedLanguage;
  const n1 = new Intl.NumberFormat(lang, {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  });
  const eur = new Intl.NumberFormat(lang, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  });
  const one = (x: number | null) => (x == null ? '–' : n1.format(x));
  const money = (x: number | null) => (x == null ? '–' : eur.format(x));
  const pct = (x: number | null) => (x == null ? '–' : `${Math.round(x)} %`);

  const main: [string, string, Tone][] = [
    [t('fm.sum.players'), String(s.players), undefined],
    [t('fm.sum.avgAge'), one(s.avgAge), undefined],
    [t('fm.sum.wages'), money(s.wages), undefined],
    [t('fm.sum.wageRoom'), money(s.wageRoom), s.wageRoom == null ? undefined : s.wageRoom < 0 ? 'bad' : 'ok'],
    [t('fm.sum.transfer'), money(s.transferBudget), s.transferBudget === 0 ? 'warn' : undefined],
  ];
  const groups: [string, [string, string, Tone?][]][] = [
    [
      t('fm.sum.g.squad'),
      [
        [t('fm.sum.under21'), String(s.under21)],
        [t('fm.sum.over30'), String(s.over30)],
      ],
    ],
    [
      t('fm.sum.g.form'),
      [
        [t('fm.sum.condition'), pct(s.condition), s.condition != null && s.condition < 85 ? 'warn' : undefined],
        [t('fm.sum.sharpness'), pct(s.sharpness)],
        [t('fm.sum.injured'), String(s.injured), s.injured ? 'bad' : 'ok'],
      ],
    ],
    [
      t('fm.sum.g.season'),
      [
        [t('fm.sum.goals'), s.goals == null ? '–' : String(s.goals)],
        [
          t('fm.sum.rating'),
          s.rating == null
            ? '–'
            : new Intl.NumberFormat(lang, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }).format(s.rating),
        ],
        [t('fm.sum.topScorer'), s.topScorer ? `${s.topScorer.name} (${s.topScorer.goals})` : '–'],
      ],
    ],
    [
      t('fm.sum.g.contracts'),
      [
        [t('fm.sum.expiring'), String(s.expiring), s.expiring ? 'warn' : 'ok'],
        [t('fm.sum.avgWage'), money(s.avgWage)],
        [t('fm.sum.topEarner'), s.topEarner ? `${s.topEarner.name} (${money(s.topEarner.wage)})` : '–'],
      ],
    ],
    [
      t('fm.sum.g.profile'),
      [
        [t('fm.sum.technical'), one(s.profile.technical)],
        [t('fm.sum.mental'), one(s.profile.mental)],
        [t('fm.sum.physical'), one(s.profile.physical)],
      ],
    ],
  ];

  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {main.map(([label, value, tone]) => (
          <div key={label} className="card border-l-4 border-eau-fonce !p-4">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-canard/60">
              {tone && <span className={`h-2 w-2 rounded-full ${TONE[tone]}`} aria-hidden />}
              {label}
            </p>
            <p className="mt-1 font-display text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <details className="card p-4">
        <summary className="cursor-pointer font-bold">{t('fm.sum.all')}</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {groups.map(([title, rows]) => (
            <div key={title}>
              <p className="text-xs font-bold uppercase tracking-wide text-canard/60">{title}</p>
              <ul className="mt-1 space-y-1 text-sm">
                {rows.map(([label, value, tone]) => (
                  <li key={label} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-brun">
                      {tone && <span className={`h-2 w-2 rounded-full ${TONE[tone]}`} aria-hidden />}
                      {label}
                    </span>
                    <b className="text-right">{value}</b>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}
