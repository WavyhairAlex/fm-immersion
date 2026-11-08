import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { clampCrop, cropRect, defaultCrop, drawCrop, GAME_VISIBLE_WIDTH, loadImage, MAX_ZOOM, renderCoachPhoto, type CoachPhotoCrop } from '../lib/coach-photo';

/** Taille de l'aperçu à l'écran (le rendu final est en 256 px). */
const VIEW = 288;

export interface CoachPhotoResult {
  photo: string;
  source: string;
  crop: CoachPhotoCrop;
}

/**
 * Recadrage de la photo du coach : on glisse l'image pour la placer, on règle le zoom, la hauteur et la position
 * gauche-droite. Les bandes sombres montrent ce que FM27 coupe sur le profil du manager.
 */
export function CoachPhotoEditor({
  source,
  initialCrop,
  saving,
  onSave,
  onCancel,
  onPickOther,
}: {
  source: string;
  initialCrop?: CoachPhotoCrop;
  saving?: boolean;
  onSave: (r: CoachPhotoResult) => void;
  onCancel: () => void;
  onPickOther: () => void;
}) {
  const { t } = useTranslation();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState(false);
  const [crop, setCrop] = useState<CoachPhotoCrop | null>(null);
  const drag = useRef<{ x: number; y: number; crop: CoachPhotoCrop } | null>(null);

  useEffect(() => {
    let live = true;
    setImg(null);
    setError(false);
    loadImage(source)
      .then((el) => {
        if (!live) return;
        setImg(el);
        setCrop(clampCrop(el.naturalWidth, el.naturalHeight, initialCrop ?? defaultCrop(el.naturalWidth, el.naturalHeight)));
      })
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, [source]); // le cadrage de départ ne vaut qu'à l'ouverture

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (ctx && img && crop) drawCrop(ctx, img, crop, VIEW * 2);
  }, [img, crop]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const w = img?.naturalWidth ?? 1;
  const h = img?.naturalHeight ?? 1;
  const set = (c: CoachPhotoCrop) => setCrop(clampCrop(w, h, c));
  const rect = crop ? cropRect(w, h, crop) : null;
  // Curseurs de position : 0 = bord haut (ou gauche), 1 = bord bas (ou droit), dans la marge que laisse le zoom.
  const room = rect ? { x: w - rect.side, y: h - rect.side } : { x: 0, y: 0 };
  const pos = rect ? { x: room.x ? rect.sx / room.x : 0.5, y: room.y ? rect.sy / room.y : 0.5 } : { x: 0.5, y: 0.5 };
  const setPos = (axis: 'x' | 'y', v: number) => {
    if (!crop || !rect) return;
    const start = v * room[axis];
    set({ ...crop, [axis]: (start + rect.side / 2) / (axis === 'x' ? w : h) });
  };

  const onDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!crop) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, crop };
  };
  const onMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d || !rect) return;
    // Un pixel d'aperçu vaut side / VIEW pixels de l'image ; l'image suit le doigt (sens inverse du carré).
    const k = rect.side / VIEW;
    set({ ...d.crop, x: d.crop.x - ((e.clientX - d.x) * k) / w, y: d.crop.y - ((e.clientY - d.y) * k) / h });
  };
  const onUp = () => {
    drag.current = null;
  };

  const band = ((1 - GAME_VISIBLE_WIDTH) / 2) * 100;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="coach-photo-title" onClick={onCancel}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 text-canard shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 id="coach-photo-title" className="font-display text-xl font-semibold">
          {t('layout.career.cropTitle')}
        </h2>
        <p className="mt-1 text-sm text-brun">{t('layout.career.cropIntro')}</p>

        {error ? (
          <p className="mt-4 text-sm font-bold text-corail">{t('layout.career.photoError')}</p>
        ) : (
          <div className="mt-4 flex items-start gap-4">
            <div className="relative shrink-0 select-none overflow-hidden rounded-lg bg-creme" style={{ width: VIEW, height: VIEW }}>
              <canvas
                ref={canvas}
                width={VIEW * 2}
                height={VIEW * 2}
                className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
                aria-label={t('layout.career.cropDrag')}
              />
              {/* Bords que le cadre du profil FM27 ne montre pas. */}
              <div className="pointer-events-none absolute inset-y-0 left-0 bg-black/45" style={{ width: `${band}%` }} />
              <div className="pointer-events-none absolute inset-y-0 right-0 bg-black/45" style={{ width: `${band}%` }} />
            </div>
          </div>
        )}
        {!error && <p className="mt-1 text-xs text-brun">{t('layout.career.cropBands')}</p>}

        {crop && (
          <div className="mt-4 space-y-3 text-sm font-bold">
            <Slider label={t('layout.career.cropZoom')} min={1} max={MAX_ZOOM} value={crop.zoom} onChange={(v) => set({ ...crop, zoom: v })} />
            <Slider label={t('layout.career.cropHeight')} min={0} max={1} value={pos.y} disabled={!room.y} onChange={(v) => setPos('y', v)} />
            <Slider label={t('layout.career.cropSide')} min={0} max={1} value={pos.x} disabled={!room.x} onChange={(v) => setPos('x', v)} />
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button type="button" className="btn-primary" disabled={!img || !crop || saving} onClick={() => img && crop && onSave({ photo: renderCoachPhoto(img, crop), source, crop })}>
            {t('layout.career.cropSave')}
          </button>
          <button type="button" className="btn-secondary" onClick={onPickOther}>
            {t('layout.career.cropOther')}
          </button>
          <button type="button" className="ml-auto text-sm font-bold text-brun hover:text-canard" onClick={onCancel}>
            {t('layout.career.cropCancel')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Slider({ label, min, max, value, disabled, onChange }: { label: string; min: number; max: number; value: number; disabled?: boolean; onChange: (v: number) => void }) {
  return (
    <label className={`flex items-center gap-3 ${disabled ? 'opacity-50' : ''}`}>
      <span className="w-28 shrink-0">{label}</span>
      <input type="range" className="flex-1 accent-orange-fonce" min={min} max={max} step={0.005} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}
