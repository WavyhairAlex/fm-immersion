import {
  POS_LABEL,
  POS_ORDER,
  baseTarget,
  rankTargets,
  type DbPlayer,
  type FmPlayer,
  type PosCode,
  type Project,
  type Target,
  type TargetVerdict,
} from "@fm-immersion/module-fm";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { PosBadge } from './FmFoot';
import { fmData } from "../lib/data";
import { Fit, Level, More, Tag, useNames, type Tone } from "./FmUi";

type Engine = Parameters<typeof rankTargets>[0];

const VERDICT_TONE: Record<TargetVerdict, Tone> = {
  starter: "good",
  backup: "info",
  none: "warn",
};

/** Critères envoyés à `fm_memory_search` (voir `src-tauri/src/fm_memory.rs`). */
type Filter = {
  positions: PosCode[];
  maxAge: string;
  minCa: string;
  minPa: string;
  maxWageWeekly: string;
  nation: string;
  division: string;
  minDivisionReputation: string;
  freeOnly: boolean;
  transferListedOnly: boolean;
  excludeInjured: boolean;
  usefulOnly: boolean;
};

const EMPTY: Filter = {
  positions: [],
  maxAge: "",
  minCa: "",
  minPa: "",
  maxWageWeekly: "",
  nation: "",
  division: "",
  minDivisionReputation: "",
  freeOnly: false,
  transferListedOnly: false,
  excludeInjured: true,
  usefulOnly: true,
};

const num = (v: string) =>
  v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined;

/**
 * Recherche de recrues dans toute la base de FM27, lue directement en mémoire (lecture seule, à la demande).
 * Les résultats passent par le même verdict que les cibles (titulaire, doublure, rien) ; un clic les ajoute aux cibles.
 */
export function FmDbSearch({
  saveId,
  gameDate,
  engine,
  project,
  players,
  followed,
}: {
  saveId: string;
  gameDate: string;
  engine: Engine;
  project: Project;
  players: FmPlayer[];
  followed: Set<string>;
}) {
  const { t } = useTranslation();
  const names = useNames();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>(EMPTY);
  const set = <K extends keyof Filter>(k: K, v: Filter[K]) =>
    setFilter((f) => ({ ...f, [k]: v }));
  const togglePos = (p: PosCode) =>
    set(
      "positions",
      filter.positions.includes(p)
        ? filter.positions.filter((x) => x !== p)
        : [...filter.positions, p],
    );

  const search = useMutation({
    mutationFn: (f: Filter) =>
      invoke<DbPlayer[]>("fm_memory_search", {
        filter: {
          positions: f.positions,
          maxAge: num(f.maxAge),
          minCa: num(f.minCa),
          minPa: num(f.minPa),
          maxWageWeekly: num(f.maxWageWeekly),
          nation: f.nation.trim() || undefined,
          division: f.division.trim() || undefined,
          minDivisionReputation: num(f.minDivisionReputation),
          freeOnly: f.freeOnly,
          transferListedOnly: f.transferListedOnly,
          excludeInjured: f.excludeInjured,
          excludeOwn: true,
          limit: 200,
        },
      }),
  });
  const add = useMutation({
    mutationFn: (p: DbPlayer) => fmData.addBaseTarget(saveId, p, gameDate),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["fm", saveId, "targets"] }),
  });

  const raw = useMemo(
    () => new Map((search.data ?? []).map((p) => [`t${p.id}`, p])),
    [search.data],
  );
  const ranked = useMemo(() => {
    const targets = (search.data ?? []).flatMap(
      (p) => baseTarget(p) ?? [],
    ) as Target[];
    const rows = rankTargets(engine, targets, project, players);
    return filter.usefulOnly
      ? rows.filter((r) => r.best && r.best.verdict !== "none")
      : rows;
    // usefulOnly s'applique aux résultats déjà lus, sans relire la base.
  }, [search.data, engine, project, players, filter.usefulOnly]);

  if (!open)
    return (
      <section className="card mt-6 flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h2 className="text-lg font-semibold">{t("fm.dbSearch.title")}</h2>
          <p className="help">{t("fm.dbSearch.teaser")}</p>
        </div>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setOpen(true)}
        >
          {t("fm.dbSearch.open")}
        </button>
      </section>
    );

  const input = (
    k: "maxAge" | "minCa" | "minPa" | "maxWageWeekly" | "minDivisionReputation",
  ) => (
    <label className="block text-xs font-bold text-canard">
      {t(`fm.dbSearch.f.${k}`)}
      <input
        className="input mt-1 w-28 font-normal"
        inputMode="numeric"
        value={filter[k]}
        onChange={(e) => set(k, e.target.value)}
      />
    </label>
  );
  const text = (k: "nation" | "division") => (
    <label className="block text-xs font-bold text-canard">
      {t(`fm.dbSearch.f.${k}`)}
      <input
        className="input mt-1 w-56 font-normal"
        placeholder={t(`fm.dbSearch.f.${k}Hint`)}
        value={filter[k]}
        onChange={(e) => set(k, e.target.value)}
      />
    </label>
  );
  const check = (
    k: "freeOnly" | "transferListedOnly" | "excludeInjured" | "usefulOnly",
  ) => (
    <label className="flex items-center gap-2 text-sm text-canard">
      <input
        type="checkbox"
        checked={filter[k]}
        onChange={(e) => set(k, e.target.checked)}
      />
      {t(`fm.dbSearch.f.${k}`)}
    </label>
  );

  return (
    <section className="card mt-6 p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <h2 className="text-lg font-semibold">{t("fm.dbSearch.title")}</h2>
        <button
          type="button"
          className="text-sm font-bold text-orange-fonce hover:underline"
          onClick={() => setOpen(false)}
        >
          {t("fm.bridge.hide")}
        </button>
      </div>
      <More>{t("fm.dbSearch.help")}</More>

      <div className="mt-3">
        <p className="text-xs font-bold text-canard">
          {t("fm.dbSearch.f.positions")}
        </p>
        <div className="mt-1 flex flex-wrap gap-1">
          {POS_ORDER.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => togglePos(p)}
              className={`chip ${filter.positions.includes(p) ? 'chip-on' : ''}`}
            >
              {POS_LABEL[p]}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-4">
        {input("maxAge")}
        {input("minCa")}
        {input("minPa")}
        {input("maxWageWeekly")}
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-4">
        {text("nation")}
        {text("division")}
        {input("minDivisionReputation")}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        {check("usefulOnly")}
        {check("excludeInjured")}
        {check("transferListedOnly")}
        {check("freeOnly")}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn-primary"
          disabled={search.isPending}
          onClick={() => search.mutate(filter)}
        >
          {search.isPending ? t("fm.memory.reading") : t("fm.dbSearch.run")}
        </button>
        {search.isError && (
          <p className="text-sm text-corail">
            {t("fm.memory.error", {
              reason: String((search.error as Error)?.message ?? search.error),
            })}
          </p>
        )}
        {search.data && (
          <p className="text-sm text-brun">
            {t("fm.dbSearch.count", {
              shown: ranked.length,
              read: search.data.length,
            })}
          </p>
        )}
      </div>

      {search.data &&
        (ranked.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="data-table">
              <thead className="text-left text-canard/70">
                <tr>
                  {[
                    "player",
                    "age",
                    "club",
                    "caPa",
                    "pos",
                    "fit",
                    "gain",
                    "level",
                    "wage",
                    "contract",
                    "",
                  ].map((k) => (
                    <th key={k} className="px-2 py-1">
                      {k && t(`fm.dbSearch.col.${k}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ranked.map(({ target: p, best }) => {
                  const d = raw.get(p.id);
                  const id = p.id.replace(/^t/, "");
                  return (
                    <tr
                      key={p.id}
                      className="border-t border-canard/5 hover:bg-creme/60"
                    >
                      <td className="px-2 py-1.5 font-bold">
                        {p.name}
                        {d?.nation && (
                          <div className="text-xs font-normal text-brun">
                            {d.nation}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-1 font-normal">
                          {d?.transferListed && (
                            <Tag tone="info">{t("fm.dbSearch.listed")}</Tag>
                          )}
                          {d?.injured && (
                            <Tag tone="bad">{t("fm.dbSearch.injured")}</Tag>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 tabular-nums">
                        {p.age ?? "–"}
                      </td>
                      <td className="px-2 py-1.5">
                        {d?.club ?? (d?.loanClub ? "–" : t("fm.dbSearch.free"))}
                        {d?.division && (
                          <div className="text-xs text-brun">{d.division}</div>
                        )}
                        {d?.loanClub && (
                          <div className="text-xs text-brun">
                            {t("fm.memory.loan", {
                              club: d.loanClub,
                              end: d.loanEnd ?? "?",
                            })}
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 tabular-nums">
                        {d ? `${d.ca} / ${d.pa < 0 ? "?" : d.pa}` : "–"}
                      </td>
                      <td className="px-2 py-1.5">
                        {best ? (
                          <>
                            <PosBadge pos={best.slot.pos} />{" "}
                            {names.role(engine.roles.get(best.slot.ip))}
                          </>
                        ) : (
                          <span className="text-xs text-brun">
                            {t("fm.targets.outside")}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <Fit value={best?.fit} />
                      </td>
                      <td className="px-2 py-1.5">
                        {best ? (
                          <>
                            <Tag tone={VERDICT_TONE[best.verdict]}>
                              {t(`fm.targets.verdict.${best.verdict}`)}
                            </Tag>
                            {best.over && (
                              <div className="mt-0.5 text-xs text-brun">
                                {t(`fm.targets.over.${best.verdict}`, {
                                  name: best.over.name,
                                })}
                              </div>
                            )}
                          </>
                        ) : (
                          "–"
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <Level value={p.level} />
                      </td>
                      <td className="px-2 py-1.5 tabular-nums">
                        {d?.wageWeekly ?? "–"}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-xs">
                        {d?.contractEnd ?? "–"}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {followed.has(id) ? (
                          <Tag tone="good">{t("fm.dbSearch.followed")}</Tag>
                        ) : (
                          <button
                            type="button"
                            className="text-xs font-bold text-orange-fonce hover:underline"
                            disabled={add.isPending || !d}
                            onClick={() => d && add.mutate(d)}
                          >
                            {t("fm.dbSearch.add")}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-sm text-brun">{t("fm.dbSearch.none")}</p>
        ))}
    </section>
  );
}
