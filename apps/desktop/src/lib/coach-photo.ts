/** Taille des photos de personnes dans FM27 (packs de la communauté) : la photo du coach est recadrée à cette taille. */
export const COACH_PHOTO_SIZE = 180;

/**
 * Lit l'image choisie par le joueur et la recadre au centre en carré de 180 px (PNG, transparence gardée).
 * Tout reste sur le PC : l'image est lue dans la fenêtre, rien n'est envoyé.
 */
export async function coachPhotoFromFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('not-an-image');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('unreadable'));
      el.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    if (!side) throw new Error('unreadable');
    const canvas = document.createElement('canvas');
    canvas.width = COACH_PHOTO_SIZE;
    canvas.height = COACH_PHOTO_SIZE;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    // Portrait : on garde le haut de l'image (le visage) plutôt que le centre quand elle est plus haute que large.
    const sx = (img.naturalWidth - side) / 2;
    const sy = img.naturalHeight > img.naturalWidth ? Math.min((img.naturalHeight - side) / 2, img.naturalHeight * 0.1) : (img.naturalHeight - side) / 2;
    ctx.drawImage(img, sx, sy, side, side, 0, 0, COACH_PHOTO_SIZE, COACH_PHOTO_SIZE);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}
