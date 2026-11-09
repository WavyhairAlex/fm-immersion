import { crestLetters, inkOn, mergeLook, snapshotClubLooks, type ClubLook } from '@fm-immersion/module-fm';
import { invoke } from '@tauri-apps/api/core';

/**
 * Habillage des clubs (gazette, direct) : couleurs et identifiant lus par le plugin (`club-look.ts` du module FM),
 * logo trouvé dans le pack de logos du joueur (dossier `graphics` de FM27, lu par Rust), écusson aux couleurs du
 * club à défaut. La table nom → couleurs est gardée sur ce PC (commodité : elle se reconstruit avec les instantanés)
 * pour que le direct retrouve l'adversaire du jour sans relire tout l'historique.
 */
const KEY = 'fmi.clubLooks';
const MAX = 400;

let table: Map<string, ClubLook> | null = null;

function load(): Map<string, ClubLook> {
  if (table) return table;
  table = new Map();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as ClubLook[];
    for (const l of Array.isArray(raw) ? raw : []) if (l && typeof l.name === 'string') table.set(l.name, { name: l.name, id: l.id ?? null, colors: Array.isArray(l.colors) ? l.colors : [], abbr: l.abbr ?? null });
  } catch {
    /* stockage indisponible ou illisible : table vide */
  }
  return table;
}

function save(map: Map<string, ClubLook>) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...map.values()].slice(-MAX)));
  } catch {
    /* stockage indisponible */
  }
}

/** Retient les clubs vus dans ces instantanés (du plus ancien au plus récent). */
export function rememberClubLooks(snaps: { club?: unknown; custom?: unknown }[]) {
  const map = load();
  const before = JSON.stringify([...map.values()]);
  for (const s of snaps) for (const l of snapshotClubLooks(s)) mergeLook(map, l);
  if (JSON.stringify([...map.values()]) !== before) save(map);
}

/** Couleurs et identifiant connus d'un club, par son nom affiché par le jeu. */
export const clubLook = (name: string | null | undefined): ClubLook | null => (name ? (load().get(name) ?? null) : null);

const logoCache = new Map<string, Promise<HTMLImageElement | null>>();

/** Logo du club (pack de logos du joueur) décodé pour un canvas, ou null. */
export function loadClubLogo(id: string | null | undefined): Promise<HTMLImageElement | null> {
  if (!id) return Promise.resolve(null);
  let p = logoCache.get(id);
  if (!p) {
    p = (async () => {
      try {
        const folder = await invoke<string | null>('fm_default_folder');
        if (!folder) return null;
        const bytes = await invoke<ArrayBuffer>('fm_club_logo', { folder, id });
        if (!bytes || bytes.byteLength === 0) return null;
        const img = new Image();
        img.src = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/png' }));
        await img.decode();
        return img;
      } catch {
        return null;
      }
    })();
    logoCache.set(id, p);
  }
  return p;
}

/** Ce qu'il faut pour dessiner un club : son nom, ses couleurs (éventuellement aucune) et son logo. */
export interface ClubArt {
  name: string;
  look: ClubLook | null;
  logo: HTMLImageElement | null;
}

export async function clubArt(name: string | null | undefined): Promise<ClubArt | null> {
  if (!name) return null;
  const look = clubLook(name);
  return { name, look, logo: await loadClubLogo(look?.id) };
}

/** URL affichable du logo (écran de la gazette), ou null. */
export async function clubLogoUrl(name: string | null | undefined): Promise<string | null> {
  const art = await clubArt(name);
  return art?.logo?.src ?? null;
}

/**
 * Logo du club dans un carré de `size` centré sur (cx, cy) ; sans logo, écusson rond à ses couleurs (couleur
 * principale, liseré de la deuxième, sigle lisible), ou aux couleurs de FM Immersion si le jeu ne les a pas données.
 */
export function drawCrest(ctx: CanvasRenderingContext2D, art: ClubArt, cx: number, cy: number, size: number, opts: { ring?: string; font?: string } = {}) {
  const img = art.logo;
  if (img) {
    const w = img.naturalWidth || img.width || 1;
    const h = img.naturalHeight || img.height || 1;
    const k = size / Math.max(w, h);
    ctx.drawImage(img, cx - (w * k) / 2, cy - (h * k) / 2, w * k, h * k);
    return;
  }
  const [c1 = '#0F1B2D', c2 = '#FFB547'] = art.look?.colors ?? [];
  const r = size / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = c1;
  ctx.fill();
  ctx.lineWidth = Math.max(2, size / 14);
  ctx.strokeStyle = c2 !== c1 ? c2 : (opts.ring ?? inkOn(c1));
  ctx.beginPath();
  ctx.arc(cx, cy, r - ctx.lineWidth / 2, 0, Math.PI * 2);
  ctx.stroke();
  const letters = crestLetters(art.name, art.look?.abbr);
  ctx.fillStyle = inkOn(c1);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let fs = Math.round(size * (letters.length > 2 ? 0.34 : 0.42));
  const family = opts.font ?? '"Fraunces Variable", Georgia, serif';
  ctx.font = `900 ${fs}px ${family}`;
  while (fs > 8 && ctx.measureText(letters).width > size * 0.74) ctx.font = `900 ${--fs}px ${family}`;
  ctx.fillText(letters, cx, cy + fs * 0.04);
  ctx.restore();
}
