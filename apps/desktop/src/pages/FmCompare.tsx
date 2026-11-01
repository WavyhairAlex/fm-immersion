import { ATTR_GROUPS, attrKey, attrOf, bestOf, POS_LABEL, projectLevel, shortlist, type FmPlayer, type FmSnapshot, type SquadAt } from '@simloom/module-fm';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useTacticEngine } from './FmTactic';
import { Level, Panel, Tag, useFormat } from './FmUi';

type Person = FmPlayer & { target?: boolean; club?: string | null };

const CMP_KEY = 'simloom.fm.compare';
const read = <T,>(key: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, v: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* stockage indisponible : la sélection n'est pas retenue */
  }
};

/** Joueurs du club et de la liste de cibles du jeu, quand le plugin la fournit. */
const pool = (snap: FmSnapshot, players: FmPlayer[]): Person[] =>
  [...players, ...shortlist(snap).map((t) => ({ ...t, target: true }))].filter((p) => Object.keys(p.attributes).length);

/** Comparateur : deux ou trois joueurs côte à côte, du club ou de la liste de cibles. */
export function FmCompare({ snap, players, folder, history }: { snap: FmSnapshot; players: FmPlayer[]; folder: string; history: SquadAt[] }) {
  const { t, i18n } = useTranslation();
  const en = i18n.resolvedLanguage === 'en';
  const f = useFormat();
  const { engine } = useTacticEngine(folder, players);
  const people = useMemo(() => pool(snap, players), [snap, players]);
  const [ids, setIds] = useState<string[]>(() => read(CMP_KEY, []));
  const [roleCode, setRoleCode] = useState<string | null>(() => read(`${CMP_KEY}.role`, null));

  // Deux joueurs au minimum : on complète avec les meilleurs niveaux.
  const chosen = ids.filter((id) => people.some((p) => p.id === id));
  for (const p of [...people].sort((a, b) => (b.level ?? 0) - (a.level ?? 0))) {
    if (chosen.length >= 2) break;
    if (!chosen.includes(p.id)) chosen.push(p.id);
  }
  const sel = chosen.map((id) => people.find((p) => p.id === id)!);
  const setSlot = (i: number, id: string) => {
    const next = [...chosen];
    if (id) next[i] = id;
    else next.splice(i, 1);
    const clean = [...new Set(next.filter(Boolean))].slice(0, 3);
    setIds(clean);
    write(CMP_KEY, clean);
  };

  const allGk = sel.every((p) => p.positions.includes('GB'));
  const anyGk = sel.some((p) => p.positions.includes('GB'));
  const roles = engine.ref.roles.filter((r) => r.phase !== 'oop' && (r.group === 'GK') === allGk);
  const best = sel.map((p) => engine.bestRole(p));
  const rc = roleCode && roles.some((r) => r.code === roleCode) ? roleCode : (best[0]?.role.code ?? roles[0]?.code ?? '');
  const role = engine.roles.get(rc);
  const keys = new Set(Object.keys(role?.weights ?? {}).map(attrKey));
  const roleName = (r: { fr: string; en?: string } | undefined) => (r ? (en && r.en) || r.fr : '–');
  const pct = (x: number | null) => (x == null ? '–' : `${Math.round((x / 20) * 100)} %`);
  const rating = new Intl.NumberFormat(i18n.resolvedLanguage, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sorted = [...people].sort((a, b) => a.name.localeCompare(b.name));

  const row = (label: ReactNode, cells: ReactNode[], vals: (number | null)[] = [], key?: string) => {
    const b = bestOf(vals);
    return (
      <tr key={key} className="border-t border-canard/5">
        <td className="px-3 py-1.5 text-brun">{label}</td>
        {cells.map((c, i) => (
          <td key={i} className={`px-3 py-1.5 text-right ${b != null && vals[i] === b ? 'rounded-lg bg-eau/20' : ''}`}>
            {c}
          </td>
        ))}
      </tr>
    );
  };
  const groups = ATTR_GROUPS.filter(([g]) => (g === 'goalkeeping' ? anyGk : !(allGk && g === 'technical')));
  const fits = sel.map((p) => (rc ? engine.roleFit(p, rc, 'ip') : null));
  const in2 = sel.map((p) => projectLevel(p, 2, history));

  return (
    <div className="space-y-4">
      <Panel title={t('fm.cmp.pick')}>
        <div className="flex flex-wrap gap-3">
          {[0, 1, 2].map((i) => (
            <label key={i} className="flex flex-col text-xs font-bold text-canard/70">
              {t('fm.cmp.slot', { n: i + 1 })}
              <select className="input mt-1 min-w-[12rem]" value={chosen[i] ?? ''} onChange={(e) => setSlot(i, e.target.value)}>
                <option value="">—</option>
                {sorted.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.target ? ` (${t('fm.cmp.target')})` : ''}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label className="flex flex-col text-xs font-bold text-canard/70">
            {t('fm.cmp.role')}
            <select
              className="input mt-1 min-w-[12rem]"
              value={rc}
              onChange={(e) => {
                setRoleCode(e.target.value);
                write(`${CMP_KEY}.role`, e.target.value);
              }}
            >
              {roles.map((r) => (
                <option key={r.code} value={r.code}>
                  {roleName(r)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-2 text-xs text-brun">{t('fm.cmp.help')}</p>
      </Panel>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th />
              {sel.map((p) => (
                <th key={p.id} className="px-3 py-2 text-right font-bold">
                  {p.name} {p.target && <Tag>{t('fm.cmp.target')}</Tag>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {row(t('fm.cmp.age'), sel.map((p) => p.age ?? '–'), sel.map((p) => (p.age == null ? null : -p.age)))}
            {row(
              t('fm.cmp.positions'),
              sel.map((p) => p.positions.slice(0, 3).map((c) => POS_LABEL[c]).join(', ') || '–'),
            )}
            {row(t('fm.cmp.club'), sel.map((p) => (p.target ? (p.club ?? '–') : snap.club)))}
            {row(t('fm.cmp.level'), sel.map((p) => <Level key={p.id} value={p.level} />), sel.map((p) => p.level))}
            {row(t('fm.cmp.fit', { role: roleName(role) }), fits.map(pct), fits)}
            {row(t('fm.cmp.bestRole'), best.map((b) => (b ? `${roleName(b.role)} ${pct(b.fit)}` : '–')))}
            {row(t('fm.cmp.in2'), in2.map((x, i) => <Level key={i} value={x} />), in2)}
            {row(t('fm.cmp.rating'), sel.map((p) => (p.avgRating ? rating.format(p.avgRating) : '–')), sel.map((p) => p.avgRating || null))}
            {row(t('fm.cmp.wage'), sel.map((p) => f.money(p.wage)))}
            {row(t('fm.cmp.value'), sel.map((p) => f.money(p.value)))}
            {row(t('fm.cmp.contract'), sel.map((p) => f.date(p.contractEnd)))}
            {groups.map(([g, list]) => [
              <tr key={g}>
                <th colSpan={sel.length + 1} className="bg-creme/60 px-3 py-1.5 text-left text-xs font-bold uppercase tracking-wide text-canard/70">
                  {t(`fm.attrGroup.${g}`)}
                </th>
              </tr>,
              ...list.map((k) => {
                const vals = sel.map((p) => attrOf(p, k));
                const label = t(`fm.attr.${k}`);
                return row(keys.has(k) ? <b className="text-canard">{label}</b> : label, vals.map((v, i) => <Level key={i} value={v} />), vals, k);
              }),
            ])}
          </tbody>
        </table>
      </div>
    </div>
  );
}
