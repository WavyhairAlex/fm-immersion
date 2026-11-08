/**
 * Taille du gros plan du manager dans FM27 (ManagerCloseupShot.ManagerCloseupTextureSize, lu en jeu) : la photo du
 * coach est enregistrée à cette taille pour être nette dans le jeu.
 */
export const COACH_PHOTO_SIZE = 256;
/** Image d'origine gardée pour pouvoir recadrer plus tard : plus grand côté réduit à cette taille, en JPEG. */
const SOURCE_MAX = 768;

/**
 * Part de la largeur du carré que FM27 montre sur le profil du manager : le cadre est un peu plus haut que large,
 * l'image le remplit en hauteur et ses bords gauche et droit sont coupés (mesuré sur une capture du jeu, 215 sur 250).
 */
export const GAME_VISIBLE_WIDTH = 0.86;

/** Recadrage : zoom (1 = le plus grand carré qui tient dans l'image) et centre du carré, en fraction de l'image. */
export interface CoachPhotoCrop {
  zoom: number;
  x: number;
  y: number;
}

export const MAX_ZOOM = 4;

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => (el.naturalWidth && el.naturalHeight ? resolve(el) : reject(new Error('unreadable')));
    el.onerror = () => reject(new Error('unreadable'));
    el.src = src;
  });
}

/**
 * Lit l'image choisie par le joueur et en garde une copie réduite (JPEG, 768 px au plus), point de départ du
 * recadrage. Tout reste sur le PC : l'image est lue dans la fenêtre, rien n'est envoyé.
 */
export async function coachPhotoSource(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('not-an-image');
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, SOURCE_MAX / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#ffffff'; // JPEG : la transparence devient du blanc
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.9);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Cadrage de départ : tout le carré possible, le haut d'un portrait plutôt que son centre (le visage). */
export function defaultCrop(w: number, h: number): CoachPhotoCrop {
  const side = Math.min(w, h);
  const y = h > w ? (Math.min((h - side) / 2, h * 0.1) + side / 2) / h : 0.5;
  return { zoom: 1, x: 0.5, y };
}

/** Carré source (en pixels de l'image) d'un recadrage, toujours entièrement dans l'image. */
export function cropRect(w: number, h: number, crop: CoachPhotoCrop) {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, crop.zoom));
  const side = Math.min(w, h) / zoom;
  const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max);
  const sx = clamp(crop.x * w - side / 2, w - side);
  const sy = clamp(crop.y * h - side / 2, h - side);
  return { sx, sy, side, zoom };
}

/** Recadrage ramené dans les limites (le carré ne sort jamais de l'image). */
export function clampCrop(w: number, h: number, crop: CoachPhotoCrop): CoachPhotoCrop {
  const { sx, sy, side, zoom } = cropRect(w, h, crop);
  return { zoom, x: (sx + side / 2) / w, y: (sy + side / 2) / h };
}

/** Dessine le recadrage dans un canevas carré de `size` px. */
export function drawCrop(ctx: CanvasRenderingContext2D, img: HTMLImageElement, crop: CoachPhotoCrop, size: number) {
  const { sx, sy, side } = cropRect(img.naturalWidth, img.naturalHeight, crop);
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
}

/** Photo finale : PNG carré de 256 px, la taille du gros plan dans FM27. */
export function renderCoachPhoto(img: HTMLImageElement, crop: CoachPhotoCrop): string {
  const canvas = document.createElement('canvas');
  canvas.width = COACH_PHOTO_SIZE;
  canvas.height = COACH_PHOTO_SIZE;
  drawCrop(canvas.getContext('2d')!, img, crop, COACH_PHOTO_SIZE);
  return canvas.toDataURL('image/png');
}
