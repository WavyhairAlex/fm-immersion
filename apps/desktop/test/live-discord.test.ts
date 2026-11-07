import type { FmLive } from "@fm-immersion/module-fm";
import type { TFunction } from "i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { cmd: string; args: Record<string, unknown> }[] = [];
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args: Record<string, unknown>) => {
    calls.push({ cmd, args });
    return cmd === "discord_post" ? "42" : undefined;
  }),
}));

const { liveStep } = await import("../src/lib/live-discord");
const t = ((k: string, o?: Record<string, unknown>) =>
  o ? `${k} ${JSON.stringify(o)}` : k) as unknown as TFunction;

const at = "2026-11-07T07:20:00.000Z";
const now = Date.parse(at);
const base: FmLive = {
  schema: "archivix-live/1",
  gameDate: "2027-04-21",
  updatedAt: at,
  home: "Inter Bratislava",
  away: "Malženice",
  homeScore: 0,
  awayScore: 0,
  minute: "1 min.",
  final: false,
  scorers: "",
};

describe("direct Discord", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("poste le tableau, le modifie, annonce le but et la fin", async () => {
    let s = await liveStep(t, base, "Malženice", null, now);
    expect(calls.map((c) => c.cmd)).toEqual(["discord_post"]);
    expect(s?.messageId).toBe("42");
    calls.length = 0;
    s = await liveStep(
      t,
      { ...base, awayScore: 1, minute: "11 min.", scorers: "M. Fábry 11'" },
      "Malženice",
      s,
      now,
    );
    expect(calls.map((c) => c.cmd)).toEqual(["discord_edit", "discord_send"]);
    expect(
      String((calls[1]!.args.payload as { content: string }).content),
    ).toContain("live.goal ");
    expect(
      String((calls[1]!.args.payload as { content: string }).content),
    ).toContain("M. Fábry");
    calls.length = 0;
    s = await liveStep(
      t,
      { ...s!.last, minute: "FDM", final: true },
      "Malženice",
      s,
      now,
    );
    expect(calls.map((c) => c.cmd)).toEqual(["discord_edit", "discord_send"]);
    expect(s?.done).toBe(true);
    calls.length = 0;
    await liveStep(t, { ...s!.last }, "Malženice", s, now);
    expect(calls).toEqual([]);
  });

  it("ignore un relevé ancien ou un match déjà fini", async () => {
    expect(await liveStep(t, base, null, null, now + 10 * 60_000)).toBeNull();
    const s = await liveStep(t, { ...base, final: true }, null, null, now);
    expect(s?.done).toBe(true);
    expect(calls).toEqual([]);
  });
});
