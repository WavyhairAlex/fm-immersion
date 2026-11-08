import { describe, expect, it } from 'vitest';
import { clampCrop, cropRect, defaultCrop } from '../src/lib/coach-photo';

describe('recadrage de la photo du coach', () => {
  it('prend le haut d’un portrait plutôt que son centre', () => {
    const c = defaultCrop(600, 900);
    const r = cropRect(600, 900, c);
    expect(r.side).toBe(600);
    expect(r.sy).toBeCloseTo(90); // 10 % de la hauteur au plus
  });

  it('garde le carré dans l’image, quel que soit le centre demandé', () => {
    const r = cropRect(800, 600, { zoom: 2, x: 0, y: 1 });
    expect(r.side).toBe(300);
    expect(r.sx).toBe(0);
    expect(r.sy).toBe(300);
    expect(clampCrop(800, 600, { zoom: 9, x: 0.5, y: 0.5 }).zoom).toBe(4);
  });
});
