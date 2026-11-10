import type { FmSnapshot } from "@fm-immersion/module-fm";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCareer } from "../lib/career";
import { fmData } from "../lib/data";
import { faceBytes } from "../lib/player-face";
import { Face } from "./Face";
import {
  imageToPngBytes,
  useLibrary,
  usePipelineActions,
  usePipelineProgress,
  useScenes,
  type Outcome,
  type SceneInfo,
  type SceneRole,
} from "../lib/photos";

const ROLES: SceneRole[] = ["player", "coach", "duo", "front"];

/** Image de la bibliothèque, chargée par le cœur Rust (le dossier des photos n'est pas servi à la webview). */
function LibraryImage({
  file,
  alt,
  className,
}: {
  file: string;
  alt: string;
  className?: string;
}) {
  const actions = usePipelineActions();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let current: string | null = null;
    actions.read(file).then((u) => {
      current = u;
      setUrl(u);
    });
    return () => {
      if (current) URL.revokeObjectURL(current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);
  return url ? (
    <img src={url} alt={alt} className={className} />
  ) : (
    <div className={`${className ?? ""} animate-pulse bg-creme`} />
  );
}

function Verdict({ o }: { o: Outcome }) {
  const { t } = useTranslation();
  const reasons = o.reasons
    .map((r) => t(`photos.reason.${r}`, { defaultValue: r }))
    .join(", ");
  return (
    <ul className="mt-2 flex flex-col gap-1 text-sm">
      <li>
        {o.accepted === null
          ? t("photos.scenes.verdict.unknown")
          : o.accepted
            ? t("photos.scenes.verdict.ok", {
                score: Math.round((o.score ?? 0) * 100),
              })
            : t("photos.scenes.verdict.rejected", { reasons })}
        {" · "}
        {t("photos.scenes.verdict.candidates", {
          ok: o.candidates.filter((c) => c.accepted).length,
          total: o.candidates.length,
        })}
      </li>
      <li>
        {o.logosBefore === null
          ? t("photos.scenes.logos.unknown")
          : o.logosBefore === 0
            ? t("photos.scenes.logos.none")
            : o.cleaned
              ? t("photos.scenes.logos.cleaned", {
                  before: o.logosBefore,
                  after: o.logosAfter ?? 0,
                })
              : t("photos.scenes.logos.left", {
                  count: o.logosAfter ?? o.logosBefore,
                })}
        {o.regenerate ? ` ${t("photos.scenes.logos.regenerate")}` : ""}
      </li>
      <li className="text-brun">
        {t("photos.scenes.took", { seconds: Math.round(o.seconds) })}
      </li>
      {o.warnings.map((w) => (
        <li key={w} className="text-ambre">
          {w}
        </li>
      ))}
    </ul>
  );
}

/**
 * Essai d'une scène : le joueur choisit la scène, donne le ou les visages (sa photo de coach, un portrait), le
 * maillot du club s'il veut, et lance la chaîne complète (candidats, porte qualité, logos). Les photos retenues
 * restent dans la bibliothèque du PC ; rien n'est envoyé.
 */
export function PhotoScenes({
  coachPhoto,
  disabled,
}: {
  coachPhoto: string | null;
  disabled: boolean;
}) {
  const { t, i18n } = useTranslation();
  const scenes = useScenes();
  const library = useLibrary();
  const actions = usePipelineActions();
  const [key, setKey] = useState("celebration");
  const [playerFace, setPlayerFace] = useState<File | null>(null);
  const [playerId, setPlayerId] = useState("");
  // Effectif de la carrière suivie : le portrait du joueur choisi est pris dans le facepack ou le pack Visages.
  const { saveId } = useCareer();
  const { data: latest } = useQuery({
    queryKey: ["fm", saveId, "latest"],
    queryFn: () => fmData.latest(saveId),
    enabled: !!saveId,
  });
  const squad = useMemo(
    () =>
      ((latest?.data as FmSnapshot | undefined)?.players ?? [])
        .map((p) => ({ id: String(p.id), name: String(p.name ?? "") }))
        .filter((p) => p.id && p.name)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [latest],
  );
  const picked = squad.find((p) => p.id === playerId) ?? null;
  const [kit, setKit] = useState<File | null>(null);
  const [result, setResult] = useState<Outcome | null>(null);
  const scene: SceneInfo | undefined = scenes.data?.find((s) => s.key === key);
  const byRole = useMemo(
    () =>
      ROLES.map(
        (r) => [r, (scenes.data ?? []).filter((s) => s.role === r)] as const,
      ),
    [scenes.data],
  );

  const generate = useMutation({
    mutationFn: async () => {
      if (!scene) throw new Error("scene");
      const faces: number[][] = [];
      if (scene.needsCoach) {
        if (!coachPhoto) throw new Error(t("photos.scenes.needCoach"));
        faces.push(await imageToPngBytes(coachPhoto));
      }
      if (scene.role !== "coach" && scene.key !== "une_coach") {
        if (playerFace) faces.push(await imageToPngBytes(playerFace));
        else {
          if (!picked) throw new Error(t("photos.scenes.needPlayer"));
          const bytes = await faceBytes(picked.id);
          if (!bytes)
            throw new Error(t("photos.scenes.noFace", { name: picked.name }));
          faces.push(
            await imageToPngBytes(new File([bytes as BlobPart], "visage")),
          );
        }
      }
      return actions.generate({
        scene: scene.key,
        faces,
        kit: kit && scene.role === "player" ? await imageToPngBytes(kit) : null,
      });
    },
    onSuccess: setResult,
  });
  const progress = usePipelineProgress(generate.isPending);
  const del = useMutation({
    mutationFn: actions.delete,
    onSuccess: (_, file) => result?.file === file && setResult(null),
  });
  const needsPlayer =
    !!scene && scene.role !== "coach" && scene.key !== "une_coach";
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString(i18n.language, {
      dateStyle: "short",
      timeStyle: "short",
    });

  return (
    <>
      <section className="card mt-6 max-w-3xl">
        <h2 className="text-lg font-semibold">{t("photos.scenes.title")}</h2>
        <p className="mt-1 text-sm text-brun">{t("photos.scenes.intro")}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">{t("photos.scenes.scene")}</span>
            <select
              className="input"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              disabled={generate.isPending}
            >
              {byRole.map(([role, list]) =>
                list.length ? (
                  <optgroup key={role} label={t(`photos.scenes.role.${role}`)}>
                    {list.map((s) => (
                      <option key={s.key} value={s.key}>
                        {t(`photos.scenes.name.${s.key}`)}
                      </option>
                    ))}
                  </optgroup>
                ) : null,
              )}
            </select>
            {scene?.injury && (
              <span className="text-xs text-brun">
                {t("photos.scenes.injuryNote")}
              </span>
            )}
          </label>
          <div className="flex flex-col gap-3 text-sm">
            {scene?.needsCoach && (
              <p className={coachPhoto ? "" : "text-ambre"}>
                {t(
                  coachPhoto
                    ? "photos.scenes.coachFace"
                    : "photos.scenes.needCoach",
                )}
                {coachPhoto && (
                  <img
                    src={coachPhoto}
                    alt=""
                    className="ml-2 inline-block h-10 w-10 rounded-full object-cover align-middle"
                  />
                )}
              </p>
            )}
            {needsPlayer && (
              <div className="flex flex-col gap-1">
                <label className="flex flex-col gap-1">
                  <span className="font-semibold">
                    {t("photos.scenes.player")}
                  </span>
                  <span className="flex items-center gap-2">
                    {picked && (
                      <Face id={picked.id} name={picked.name} size={40} />
                    )}
                    <select
                      className="input min-w-0 flex-1"
                      value={playerId}
                      onChange={(e) => setPlayerId(e.target.value)}
                      disabled={generate.isPending || !squad.length}
                    >
                      <option value="">
                        {t(
                          squad.length
                            ? "photos.scenes.playerPick"
                            : "photos.scenes.playerNone",
                        )}
                      </option>
                      {squad.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </span>
                </label>
                <span className="text-xs text-brun">
                  {t("photos.scenes.playerNote")}
                </span>
                <label className="mt-1 flex flex-col gap-1">
                  <span className="text-xs font-semibold">
                    {t("photos.scenes.playerFace")}
                  </span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => setPlayerFace(e.target.files?.[0] ?? null)}
                    disabled={generate.isPending}
                  />
                </label>
              </div>
            )}
            {scene?.role === "player" && (
              <label className="flex flex-col gap-1">
                <span className="font-semibold">{t("photos.scenes.kit")}</span>
                <input
                  type="file"
                  accept="image/png"
                  onChange={(e) => setKit(e.target.files?.[0] ?? null)}
                  disabled={generate.isPending}
                />
                <span className="text-xs text-brun">
                  {t("photos.scenes.kitNote")}
                </span>
              </label>
            )}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn-primary"
            onClick={() => generate.mutate()}
            disabled={disabled || generate.isPending || !scene}
          >
            {t("photos.scenes.generate")}
          </button>
          {generate.isPending && (
            <span className="text-sm text-brun" role="status">
              {t(`photos.scenes.step.${progress?.step ?? "prepare"}`, {
                index: progress?.index ?? 0,
                total: progress?.total ?? 3,
              })}
            </span>
          )}
        </div>
        {generate.error ? (
          <p className="mt-3 text-sm text-corail">
            {String(
              generate.error instanceof Error
                ? generate.error.message
                : generate.error,
            )}
          </p>
        ) : null}
        {result && (
          <div className="mt-4">
            <div className="relative">
              <LibraryImage
                file={result.file}
                alt={t(`photos.scenes.name.${result.scene}`)}
                className="w-full rounded-lg"
              />
              {!result.cleaned &&
                (result.logoBoxes ?? []).map((b, i) => (
                  <div
                    key={i}
                    className="pointer-events-none absolute rounded-sm border-2 border-corail"
                    style={{
                      left: `${(b[0] ?? 0) * 100}%`,
                      top: `${(b[1] ?? 0) * 100}%`,
                      width: `${((b[2] ?? 0) - (b[0] ?? 0)) * 100}%`,
                      height: `${((b[3] ?? 0) - (b[1] ?? 0)) * 100}%`,
                    }}
                    title={t("photos.scenes.logos.zone")}
                  />
                ))}
            </div>
            {!result.cleaned && (result.logoBoxes ?? []).length > 0 && (
              <p className="mt-1 text-xs text-brun">
                {t("photos.scenes.logos.zones")}
              </p>
            )}
            <Verdict o={result} />
          </div>
        )}
        <p className="mt-3 text-xs text-brun">{t("photos.scenes.privacy")}</p>
      </section>

      {library.data && library.data.length > 0 && (
        <section className="card mt-6 max-w-3xl">
          <h2 className="text-lg font-semibold">
            {t("photos.scenes.library")}
          </h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {library.data.map((o) => (
              <li key={o.file} className="rounded-lg bg-creme p-2">
                <button
                  type="button"
                  className="block w-full"
                  onClick={() => setResult(o)}
                  title={t("photos.scenes.show")}
                >
                  <LibraryImage
                    file={o.file}
                    alt={t(`photos.scenes.name.${o.scene}`)}
                    className="aspect-video w-full rounded object-cover"
                  />
                </button>
                <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                  <span>
                    {t(`photos.scenes.name.${o.scene}`)} ·{" "}
                    {fmtDate(o.createdAt)}
                    {o.accepted === false
                      ? ` · ${t("photos.scenes.verdict.short")}`
                      : ""}
                  </span>
                  <button
                    type="button"
                    className="text-corail hover:underline"
                    onClick={() => del.mutate(o.file)}
                    disabled={del.isPending}
                  >
                    {t("photos.scenes.delete")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
