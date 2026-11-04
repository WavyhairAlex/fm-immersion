import { POS_LABEL, type FmPlayer, type PosCode } from "@simloom/module-fm";
import { useContext, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Avatar, LINE_COLOR, Pitch, POS_XY } from "./FmFoot";
import { PlayerSheetContext } from "./FmUi";

/**
 * Effectif vu comme un tableau de vestiaire : chaque joueur à son poste naturel principal, du meilleur au
 * moins bon, avec son niveau. On voit d'un coup d'œil les postes bien garnis et ceux où il manque du monde.
 */
export function FmSquadPitch({ players }: { players: FmPlayer[] }) {
  const { t, i18n } = useTranslation();
  const open = useContext(PlayerSheetContext);
  const nf = new Intl.NumberFormat(i18n.resolvedLanguage, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const byPos = useMemo(() => {
    const m = new Map<PosCode, FmPlayer[]>();
    for (const p of players) {
      const pos = p.positions[0];
      if (!pos) continue;
      m.set(pos, [...(m.get(pos) ?? []), p]);
    }
    for (const list of m.values())
      list.sort((a, b) => (b.level ?? 0) - (a.level ?? 0));
    return m;
  }, [players]);
  const empty = (Object.keys(POS_XY) as PosCode[]).filter(
    (p) => !byPos.has(p) && ["GB", "DC", "MC", "BT"].includes(p),
  );

  return (
    <div className="space-y-2">
      <Pitch horizontal className="w-full">
        {(Object.keys(POS_XY) as PosCode[]).map((pos) => {
          const list = byPos.get(pos);
          if (!list) return null;
          const [x, y] = POS_XY[pos];
          const c = LINE_COLOR[list[0]!.line ?? "MIL"];
          return (
            <div
              key={pos}
              className="absolute w-32 -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${Math.min(91, Math.max(8, 100 - y))}%`,
                top: `${Math.min(84, Math.max(16, x))}%`,
              }}
            >
              <p className="mb-0.5 text-center">
                <span
                  className={`rounded px-1.5 text-[0.65rem] font-bold ${c.bg} ${c.text}`}
                >
                  {POS_LABEL[pos]} · {list.length}
                </span>
              </p>
              <ul className="space-y-0.5">
                {list.slice(0, 5).map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => open?.(p.id)}
                      className={`flex w-full items-center gap-1.5 rounded-full bg-white/90 py-0.5 pl-0.5 pr-2 text-left text-xs shadow-sm hover:bg-white ${p.injury || p.suspension ? "opacity-60" : ""}`}
                      title={[p.name, p.injury, p.suspension]
                        .filter(Boolean)
                        .join(" · ")}
                    >
                      <Avatar player={p} size="xs" />
                      <span className="min-w-0 flex-1 truncate font-bold text-canard">
                        {p.name.split(/\s+/).at(-1)}
                      </span>
                      {(p.injury || p.suspension) && (
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full bg-corail"
                          aria-hidden
                        />
                      )}
                      <span className="tabular-nums text-brun">
                        {p.level == null ? "–" : nf.format(p.level)}
                      </span>
                    </button>
                  </li>
                ))}
                {list.length > 5 && (
                  <li className="text-center text-[0.65rem] font-bold text-white">
                    +{list.length - 5}
                  </li>
                )}
              </ul>
            </div>
          );
        })}
      </Pitch>
      <p className="text-xs text-brun">
        {t("fm.squadPitch.help")}
        {empty.length > 0 && (
          <b className="text-canard">
            {" "}
            {t("fm.squadPitch.empty", {
              list: empty.map((p) => POS_LABEL[p]).join(", "),
            })}
          </b>
        )}
      </p>
    </div>
  );
}
