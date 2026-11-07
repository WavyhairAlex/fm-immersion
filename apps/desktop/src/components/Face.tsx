import { useEffect, useState } from 'react';
import { faceUrl } from '../lib/player-face';

/** Initiales d'un nom (« Marek Fábry » → « MF »), pour le médaillon sans photo. */
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .filter((c, i, arr) => i === 0 || i === arr.length - 1)
    .join('');

/**
 * Médaillon rond d'une personne : sa photo (facepack ou portrait photoréaliste) quand elle existe sur ce PC,
 * sinon ses initiales. `size` en pixels.
 */
export function Face({ id, name, size = 24, className = '' }: { id: string | number | null | undefined; name: string; size?: number; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setUrl(null);
    void faceUrl(id).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [id]);
  const style = { width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.4)) };
  if (url) return <img src={url} alt="" aria-hidden className={`inline-block shrink-0 rounded-full bg-creme object-cover object-top ${className}`} style={style} />;
  return (
    <span aria-hidden className={`inline-flex shrink-0 items-center justify-center rounded-full bg-orange-clair font-extrabold leading-none text-canard ${className}`} style={style}>
      {initials(name)}
    </span>
  );
}
