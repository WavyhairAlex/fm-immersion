import { loans, type FmSnapshot } from '@simloom/module-fm';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Empty, Level, Panel, Pos, Tag, useFormat } from './FmUi';

const VERDICT = { idle: 'bad', shines: 'good', plays: 'info' } as const;

/** Joueurs prêtés : où ils jouent et s'ils progressent. */
export function FmLoans({ snap }: { snap: FmSnapshot }) {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const list = useMemo(() => loans(snap), [snap]);
  const rating = new Intl.NumberFormat(i18n.resolvedLanguage, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (!list.length)
    return (
      <Panel title={t('fm.loans.title', { count: 0 })}>
        <Empty>{t('fm.loans.none')}</Empty>
      </Panel>
    );
  return (
    <Panel title={t('fm.loans.title', { count: list.length })}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-canard/70">
            <tr>
              {['player', 'age', 'club', 'apps', 'goals', 'rating', 'level', 'end', 'verdict'].map((k) => (
                <th key={k} className="px-2 py-1">
                  {t(`fm.loans.col.${k}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map((l) => (
              <tr key={l.player.id} className="border-t border-canard/5">
                <td className="px-2 py-1.5 font-bold">
                  {l.player.name} <Pos player={l.player} />
                </td>
                <td className="px-2 py-1.5 tabular-nums">{l.player.age ?? '–'}</td>
                <td className="px-2 py-1.5">{l.club ?? '–'}</td>
                <td className="px-2 py-1.5 tabular-nums">{l.apps ?? '–'}</td>
                <td className="px-2 py-1.5 tabular-nums">{l.goals ?? '–'}</td>
                <td className="px-2 py-1.5 tabular-nums">{l.rating ? rating.format(l.rating) : '–'}</td>
                <td className="px-2 py-1.5">
                  <Level value={l.player.level} />
                </td>
                <td className="px-2 py-1.5">{f.date(l.end)}</td>
                <td className="px-2 py-1.5">
                  <Tag tone={VERDICT[l.verdict]}>{t(`fm.loans.verdict.${l.verdict}`)}</Tag>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-brun">{t('fm.loans.help')}</p>
    </Panel>
  );
}
