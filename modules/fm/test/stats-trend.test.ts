import { describe, expect, it } from "vitest";
import { normalizePlayer, statsTrends } from "../src";
import type { FmSnapshot } from "../src/snapshot";

const snap = (gameDate: string, rows: Record<string, number>[]) =>
  ({
    schema: "archivix/1",
    game: "FM27",
    club: "Club",
    gameDate,
    players: [],
    custom: {
      joueurs: Object.fromEntries(
        rows.map((r, i) => [
          String(i),
          Object.fromEntries(
            Object.entries(r).map(([k, v]) => [
              k === "id" ? k : `stat_${k}`,
              v,
            ]),
          ),
        ]),
      ),
    },
  }) as unknown as FmSnapshot;

const players = [
  normalizePlayer({ id: 1, name: "Milieu", positions: "M (C)" }),
  normalizePlayer({ id: 2, name: "Remplaçant", positions: "M (C)" }),
];

describe("progrès en match", () => {
  // Saison jusqu'au 01/02 : 900 min, 70 % de passes. Puis 360 min à 90 % (cumul 1260 min, 1110/1400).
  const before = snap("2027-02-01", [
    {
      id: 1,
      Minutes: 900,
      PassAttempts: 1000,
      PassCompleted: 700,
      PressuresAttempted: 100,
      PressuresCompleted: 30,
      ExpectedGoals: 1,
    },
    { id: 2, Minutes: 300, PassAttempts: 200, PassCompleted: 150 },
  ]);
  const now = snap("2027-03-01", [
    {
      id: 1,
      Minutes: 1260,
      PassAttempts: 1400,
      PassCompleted: 1060,
      PressuresAttempted: 140,
      PressuresCompleted: 42,
      ExpectedGoals: 1.4,
    },
    { id: 2, Minutes: 330, PassAttempts: 220, PassCompleted: 160 },
  ]);

  it("compare la période récente à la saison jusque-là", () => {
    const t = statsTrends(
      [
        { gameDate: "2027-02-01", data: before },
        { gameDate: "2027-03-01", data: now },
      ],
      players,
    );
    expect(t.since).toBe("2027-02-01");
    const p1 = t.players.get("1")!;
    expect(p1.minutes).toBe(360);
    expect(p1.trends.passPct).toMatchObject({
      before: 70,
      recent: 90,
      dir: "up",
    });
    expect(p1.trends.press90?.dir).toBe("flat");
    expect(p1.improved.map((x) => x.key)).toContain("passPct");
    // Trop peu joué pendant la période : pas de tendance individuelle.
    expect(t.players.has("2")).toBe(false);
    expect(t.team.find((x) => x.key === "passPct")?.dir).toBe("up");
  });

  it("attend une semaine d'écart et ignore un changement de saison", () => {
    expect(
      statsTrends(
        [
          { gameDate: "2027-02-27", data: before },
          { gameDate: "2027-03-01", data: now },
        ],
        players,
      ).since,
    ).toBeNull();
    const t = statsTrends(
      [
        { gameDate: "2027-02-01", data: now },
        { gameDate: "2027-08-20", data: before },
      ],
      players,
    );
    expect(t.players.size).toBe(0);
  });
});
