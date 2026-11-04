import {
  activeSituations,
  competitionRules,
  liveSubs,
  matchTweaks,
  plannedSubs,
  ruleChecks,
  snapshotFixtures,
  substitutionPlan,
  spreadXY,
  summarize,
  type FmPlayer,
  type FmSnapshot,
  type GameSlot,
} from "@simloom/module-fm";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Avatar, Gauge, LINE_COLOR, Pitch } from "./FmFoot";
import { useTacticChoice } from "./FmTactic";
import { fitPct, PlayerLink, useNames } from "./FmUi";

/** Nom de famille pour le terrain (les pastilles sont petites). */
const last = (name: string) => name.trim().split(/\s+/).at(-1) ?? name;

/**
 * Haut de l'accueil, façon avant-match : le prochain match et les suivants, le onze probable sur le terrain
 * (même calcul que Tactique > Composition) et l'état de l'équipe (condition, rythme, absents).
 */
export function FmMatchCenter({
  snap,
  players,
  folder,
  gameFormation,
  lineup,
  gameTactic,
  go,
}: {
  snap: FmSnapshot;
  players: FmPlayer[];
  folder: string;
  gameFormation: string | null;
  lineup: GameSlot[] | null;
  gameTactic: string | null;
  go: (view: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const names = useNames();
  const lang = i18n.resolvedLanguage;
  const s = useMemo(() => summarize(snap, players), [snap, players]);
  const fixtures = useMemo(() => snapshotFixtures(snap), [snap]);
  const { plan, style } = useTacticChoice(
    players,
    folder,
    gameFormation,
    lineup,
    gameTactic,
  );
  const rules = competitionRules(s.nextMatch?.competition);
  const subs = useMemo(() => (plan ? substitutionPlan(plan, plannedSubs(rules)) : []), [plan, rules]);
  const benchPlayers = plan ? [...new Map(plan.subs.flatMap((l) => l.slice(0, 1)).map((p) => [p.id, p])).values()].slice(0, rules.bench ?? 9) : [];
  const checks = plan ? ruleChecks(plan, rules, benchPlayers) : [];
  // Mode « en direct » : le coach saisit la minute et le score, rien n'est lu dans le jeu pendant le match.
  const [live, setLive] = useState(false);
  const [minute, setMinute] = useState(0);
  const [diff, setDiff] = useState(0);
  const [tired, setTired] = useState(false);
  const [opponentChanged, setOpponentChanged] = useState(false);
  const [done, setDone] = useState<Set<number>>(new Set());
  const liveState = { minute, diff, tired, opponentChanged };
  const active = live ? activeSituations(liveState) : [];
  const subState = live ? liveSubs(subs, liveState, done) : subs.map(() => "later" as const);
  const toggleDone = (slot: number) =>
    setDone((d) => {
      const n = new Set(d);
      if (n.has(slot)) n.delete(slot);
      else n.add(slot);
      return n;
    });
  const chip = (on: boolean) =>
    `rounded-full px-3 py-1 text-sm font-bold ${on ? "bg-canard text-white" : "bg-white text-canard ring-1 ring-canard/15"}`;
  const tweaks = useMemo(() => matchTweaks(style?.id), [style]);
  const nm = s.nextMatch;
  const day = new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" });
  const rating = new Intl.NumberFormat(lang, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const suspended = players.filter((p) => p.suspension);
  const injured = players.filter((p) => p.injury);
  const xy = plan
    ? spreadXY(
        plan.slots.map((sl) => [sl.x, sl.y] as [number, number]),
        22,
        12,
      ).map(
        ([x, y]) =>
          [
            Math.min(86, Math.max(14, x)),
            Math.min(90, Math.max(8, y)),
          ] as const,
      )
    : [];

  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,19rem)_minmax(0,1fr)]">
      {/* Prochain match : bandeau sombre, l'information qu'on cherche en premier. */}
      <div className="flex flex-col rounded-2xl bg-canard p-5 text-white shadow-sm">
        <p className="text-xs font-bold uppercase tracking-widest text-eau">
          {t("fm.mc.next")}
        </p>
        {nm ? (
          <>
            <p className="mt-2 font-display text-3xl font-semibold leading-tight">
              {nm.opponent}
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
              {nm.competition && (
                <span className="rounded-full bg-white/10 px-2.5 py-1">
                  {nm.competition}
                </span>
              )}
              {nm.home != null && (
                <span className="rounded-full bg-white/10 px-2.5 py-1">
                  {t(nm.home ? "fm.mc.home" : "fm.mc.away")}
                </span>
              )}
            </div>
            {nm.inDays != null && (
              <p className="mt-4 flex items-baseline gap-2">
                <span className="font-display text-5xl font-semibold tabular-nums text-eau">
                  {nm.inDays === 0 ? t("fm.mc.today") : `J-${nm.inDays}`}
                </span>
                {nm.inDays > 0 && (
                  <span className="text-sm text-white/70">
                    {t("fm.sum.inDays", { count: nm.inDays })}
                  </span>
                )}
              </p>
            )}
            {nm.staffView && (
              <p className="mt-3 rounded-lg bg-white/5 p-2.5 text-sm text-white/80">
                « {nm.staffView} »
              </p>
            )}
          </>
        ) : (
          <p className="mt-2 text-white/70">{t("fm.sum.noMatch")}</p>
        )}
        {fixtures.length > 1 && (
          <div className="mt-4 border-t border-white/10 pt-3">
            <p className="text-xs font-bold uppercase tracking-wide text-white/60">
              {t("fm.mc.then")}
            </p>
            <ul className="mt-1 space-y-1 text-sm">
              {fixtures.slice(1, 5).map((f, i) => (
                <li key={i} className="flex items-center justify-between gap-2">
                  <span className="truncate">{f.opponent ?? "–"}</span>
                  <span className="shrink-0 text-xs tabular-nums text-white/60">
                    {f.home != null &&
                      `${t(f.home ? "fm.mc.homeShort" : "fm.mc.awayShort")} · `}
                    {day.format(new Date(f.date))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-auto flex flex-wrap gap-2 pt-4">
          <button
            type="button"
            className="rounded-lg bg-eau px-3 py-1.5 text-sm font-bold text-canard hover:bg-eau/90"
            onClick={() => go("tactic")}
          >
            {t("fm.mc.prepare")}
          </button>
          <button
            type="button"
            className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-bold text-white hover:bg-white/20"
            onClick={() => go("calendar")}
          >
            {t("fm.mc.calendar")}
          </button>
        </div>
      </div>

      {/* Onze probable sur le terrain. */}
      <div className="card p-4">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <p className="font-display text-lg font-semibold">{t("fm.mc.xi")}</p>
          {plan && (
            <span className="text-sm font-bold tabular-nums text-eau-fonce">
              {fitPct(plan.score)}
            </span>
          )}
        </div>
        <p className="mb-3 text-xs text-brun">
          {[plan?.form, style && names.style(style)]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <Pitch className="mx-auto w-full max-w-[17rem]">
          {plan?.slots.map((sl, i) => {
            const [x, y] = xy[i]!;
            return (
              <span
                key={i}
                className="absolute flex w-16 -translate-x-1/2 -translate-y-1/2 flex-col items-center"
                style={{ left: `${x}%`, top: `${y}%` }}
              >
                {sl.player ? (
                  <Avatar player={sl.player} size="sm" />
                ) : (
                  <span
                    className="h-7 w-7 rounded-full border-2 border-dashed border-white/70"
                    aria-hidden
                  />
                )}
                <span className="mt-0.5 max-w-full truncate rounded bg-canard/85 px-1 text-[0.65rem] font-bold leading-4 text-white">
                  {sl.player ? last(sl.player.name) : t("fm.tac.nobody")}
                </span>
              </span>
            );
          })}
        </Pitch>
        {plan && plan.subs.some((l) => l.length) && (
          <p className="mt-3 text-xs text-brun">
            <b className="text-canard">{t("fm.mc.bench")}</b>{" "}
            {[
              ...new Map(
                plan.subs.flatMap((l) => l.slice(0, 1)).map((p) => [p.id, p]),
              ).values(),
            ]
              .slice(0, 7)
              .map((p) => last(p.name))
              .join(", ")}
          </p>
        )}
      </div>

      {/* État de l'équipe. */}
      <div className="card space-y-4 p-4">
        <p className="font-display text-lg font-semibold">{t("fm.mc.state")}</p>
        <Gauge value={s.condition} label={t("fm.sum.condition")} />
        <Gauge value={s.sharpness} label={t("fm.sum.sharpness")} />
        <div className="grid grid-cols-3 gap-2 text-center">
          {(
            [
              [
                t("fm.mc.injured"),
                injured.length,
                injured.length ? "text-corail" : "",
              ],
              [
                t("fm.mc.suspended"),
                suspended.length,
                suspended.length ? "text-corail" : "",
              ],
              [
                t("fm.mc.rating"),
                s.rating == null ? "–" : rating.format(s.rating),
                "",
              ],
            ] as const
          ).map(([label, value, tone]) => (
            <div key={label} className="rounded-lg bg-canard/5 p-2">
              <p
                className={`font-display text-xl font-semibold tabular-nums ${tone}`}
              >
                {value}
              </p>
              <p className="text-xs text-brun">{label}</p>
            </div>
          ))}
        </div>
        {[...injured, ...suspended].length > 0 && (
          <ul className="space-y-1 text-sm">
            {[...injured, ...suspended].slice(0, 5).map((p) => (
              <li
                key={p.id + (p.injury ? "i" : "s")}
                className="flex items-center gap-2"
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${p.injury ? "bg-corail" : LINE_COLOR.GB.bg}`}
                  aria-hidden
                />
                <PlayerLink player={p} />
                <span className="truncate text-xs text-brun">
                  {p.injury
                    ? p.injury + (p.injuryDays ? ` (${p.injuryDays} j)` : "")
                    : p.suspension}
                </span>
              </li>
            ))}
          </ul>
        )}
        {s.topScorer && (
          <p className="text-sm text-brun">
            {t("fm.mc.topScorer")}{" "}
            <b className="text-canard">{s.topScorer.name}</b> (
            {s.topScorer.goals})
          </p>
        )}
      </div>

      {/* Feuille de match : remplacements prévus et ajustements selon le score. */}
      {plan && (
        <div className="card p-4 lg:col-span-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-display text-lg font-semibold">{t("fm.matchSheet.title")}</p>
            <button type="button" className={chip(live)} aria-pressed={live} onClick={() => setLive((v) => !v)}>
              {t(live ? "fm.matchSheet.live.on" : "fm.matchSheet.live.start")}
            </button>
          </div>
          <p className="mb-3 text-xs text-brun">{t(live ? "fm.matchSheet.live.help" : "fm.matchSheet.help")}</p>
          {live && (
            <div className="mb-3 space-y-2 rounded-lg bg-eau/10 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 font-bold text-canard">
                  {t("fm.matchSheet.live.minute")}
                  <input
                    type="range"
                    min={0}
                    max={95}
                    step={5}
                    value={minute}
                    onChange={(e) => setMinute(Number(e.target.value))}
                    className="w-40 accent-[#1B7F67]"
                  />
                  <span className="w-10 tabular-nums">{minute}'</span>
                </label>
                <div className="flex items-center gap-1">
                  <span className="font-bold text-canard">{t("fm.matchSheet.live.score")}</span>
                  <button type="button" className={chip(false)} onClick={() => setDiff((d) => d - 1)} aria-label={t("fm.matchSheet.live.conceded")}>
                    −
                  </button>
                  <span className="w-24 text-center font-bold tabular-nums">
                    {diff > 0 ? t("fm.matchSheet.live.ahead", { n: diff }) : diff < 0 ? t("fm.matchSheet.live.behind", { n: -diff }) : t("fm.matchSheet.live.level")}
                  </span>
                  <button type="button" className={chip(false)} onClick={() => setDiff((d) => d + 1)} aria-label={t("fm.matchSheet.live.scored")}>
                    +
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={chip(tired)} aria-pressed={tired} onClick={() => setTired((v) => !v)}>
                  {t("fm.matchSheet.when.tired")}
                </button>
                <button type="button" className={chip(opponentChanged)} aria-pressed={opponentChanged} onClick={() => setOpponentChanged((v) => !v)}>
                  {t("fm.matchSheet.when.opponentChange")}
                </button>
              </div>
            </div>
          )}
          <div className="mb-3 rounded-lg bg-canard/5 p-2.5 text-sm">
            <p>
              <b className="text-canard">{t("fm.matchSheet.rules", { competition: s.nextMatch?.competition ?? t("fm.matchSheet.competition") })}</b>{" "}
              {t("fm.matchSheet.subsRule", { count: rules.subs, windows: rules.windows ?? "–" })}
            </p>
            {checks.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {checks.map((c) => (
                  <li key={c.id} className={c.status === "bad" ? "font-bold text-corail" : c.status === "ok" ? "text-eau-fonce" : "text-brun"}>
                    {t(`fm.matchSheet.check.${c.id}`, { need: c.need, have: c.have ?? "?" })} · {t(`fm.matchSheet.status.${c.status}`)}
                  </li>
                ))}
              </ul>
            )}
            {rules.unverified && <p className="mt-1 text-xs text-brun">{t("fm.matchSheet.unverified")}</p>}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-bold text-canard">{t("fm.matchSheet.subs")}</p>
              {subs.length ? (
                <ul className="space-y-1.5 text-sm">
                  {subs.map((c, i) => (
                    <li
                      key={c.slot}
                      className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg ${subState[i] === "now" ? "bg-eau/15 p-1.5 ring-1 ring-eau-fonce/40" : subState[i] === "done" ? "opacity-50 line-through" : ""}`}
                    >
                      {live ? (
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-[#1B7F67]"
                          checked={subState[i] === "done"}
                          onChange={() => toggleDone(c.slot)}
                          aria-label={t("fm.matchSheet.live.done")}
                        />
                      ) : null}
                      <span className="w-10 shrink-0 font-bold tabular-nums text-eau-fonce">{c.minute}'</span>
                      <PlayerLink player={c.out} />
                      <span className="text-brun" aria-hidden>
                        →
                      </span>
                      <PlayerLink player={c.in} />
                      {subState[i] === "now" && <span className="text-xs font-bold uppercase text-eau-fonce">{t("fm.matchSheet.live.now")}</span>}
                      <span className="w-full pl-12 text-xs text-brun">{t(`fm.matchSheet.reason.${c.reason}`)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-brun">{t("fm.matchSheet.noSubs")}</p>
              )}
            </div>
            <div>
              <p className="mb-2 text-sm font-bold text-canard">{t("fm.matchSheet.tweaks")}</p>
              <dl className="space-y-1.5 text-sm">
                {tweaks.map((x) => (
                  <div
                    key={x.situation}
                    className={live ? (active.includes(x.situation) ? "rounded-lg bg-eau/15 p-1.5 ring-1 ring-eau-fonce/40" : "opacity-45") : ""}
                  >
                    <dt className="font-bold text-canard">
                      {t(`fm.matchSheet.when.${x.situation}`)}
                      {live && active.includes(x.situation) && <span className="ml-2 text-xs uppercase text-eau-fonce">{t("fm.matchSheet.live.now")}</span>}
                    </dt>
                    <dd className="text-brun">
                      {x.tweaks.length ? x.tweaks.map((k) => t(`fm.matchSheet.tweak.${k}`)).join(" + ") : t("fm.matchSheet.followStaff")}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
