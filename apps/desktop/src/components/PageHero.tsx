import type { ReactNode } from 'react';

/**
 * Stade au coucher du soleil, dessiné ici (aucun visuel du jeu) : ciel orangé, tribunes, projecteurs et pelouse,
 * fondu vers l'anthracite du bandeau à gauche pour que le texte reste lisible.
 */
export function Stadium({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 600 260" preserveAspectRatio="xMaxYMid slice" className={className} aria-hidden>
      <defs>
        <linearGradient id="fmi-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4A3340" />
          <stop offset="0.45" stopColor="#8F5400" />
          <stop offset="0.8" stopColor="#FFB547" />
          <stop offset="1" stopColor="#FFB27A" />
        </linearGradient>
        <linearGradient id="fmi-fade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#0F1B2D" />
          <stop offset="0.08" stopColor="#0F1B2D" stopOpacity="0.85" />
          <stop offset="0.3" stopColor="#0F1B2D" stopOpacity="0.35" />
          <stop offset="1" stopColor="#0F1B2D" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="fmi-sun" cx="0.7" cy="0.72" r="0.25">
          <stop offset="0" stopColor="#FFEBC7" stopOpacity="0.95" />
          <stop offset="1" stopColor="#FFEBC7" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="600" height="260" fill="url(#fmi-sky)" />
      <rect width="600" height="260" fill="url(#fmi-sun)" />
      {/* Projecteurs */}
      {[150, 560].map((x) => (
        <g key={x} fill="#1B1D21">
          <rect x={x - 2} y="40" width="4" height="150" />
          <rect x={x - 18} y="30" width="36" height="14" rx="2" />
          <g fill="#FFEBC7" opacity="0.9">
            {[-12, -4, 4, 12].map((d) => (
              <circle key={d} cx={x + d} cy="37" r="2.6" />
            ))}
          </g>
        </g>
      ))}
      {/* Tribunes */}
      <path d="M0 170 L80 120 Q300 92 520 120 L600 160 L600 205 L0 205 Z" fill="#1B1D21" />
      <path d="M40 176 L110 136 Q300 112 500 136 L570 172 Z" fill="#2B2F35" />
      <g stroke="#3A3F46" strokeWidth="1.5">
        {[150, 160, 170].map((y) => (
          <path key={y} d={`M${70 + (y - 150)} ${y} Q300 ${y - 34} ${530 - (y - 150)} ${y}`} fill="none" />
        ))}
      </g>
      {/* Pelouse */}
      <path d="M0 205 L600 205 L600 260 L0 260 Z" fill="#1F4D3A" />
      <path d="M0 205 L600 205 L600 214 L0 214 Z" fill="#2A6149" />
      <path d="M150 260 L240 210 L460 210 L560 260" fill="none" stroke="#FFFFFF" strokeOpacity="0.35" strokeWidth="2" />
      <rect width="600" height="260" fill="url(#fmi-fade)" />
    </svg>
  );
}

/**
 * Bandeau bleu nuit des écrans de la maquette (Ma carrière, Presse, Visages, Photos, Monde partagé) :
 * surtitre, titre et état à gauche, une image à droite (photo locale du joueur, sinon le stade dessiné).
 */
export function PageHero({ eyebrow, title, text, image, children }: { eyebrow: string; title: string; text?: ReactNode; image?: string | null; children?: ReactNode }) {
  return (
    <section className="relative mt-4 grid min-h-[13rem] overflow-hidden rounded-2xl bg-canard text-white md:grid-cols-2">
      <div className="relative z-10 p-6 md:p-8">
        <p className="text-xs font-bold uppercase tracking-widest text-orange">{eyebrow}</p>
        <h2 className="mt-2 font-display text-3xl font-semibold leading-tight md:text-4xl">{title}</h2>
        {text && <p className="mt-2 text-white/80">{text}</p>}
        {children && <div className="mt-4 flex flex-wrap gap-2">{children}</div>}
      </div>
      {image ? (
        <img src={image} alt="" className="hidden h-full max-h-64 w-full object-cover md:block" />
      ) : (
        <Stadium className="pointer-events-none hidden h-full w-full md:block" />
      )}
    </section>
  );
}
