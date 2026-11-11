import type { ReactNode } from 'react';

/** En-tête d'écran, comme la maquette : le groupe de la barre latérale en surtitre, le titre, puis une phrase. */
export function PageTitle({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-5">
      <p className="text-xs font-bold uppercase tracking-wide text-canard/50">{eyebrow}</p>
      <h1 className="text-3xl font-semibold">{title}</h1>
      {children && <p className="mt-1 max-w-3xl text-sm text-brun">{children}</p>}
    </header>
  );
}
