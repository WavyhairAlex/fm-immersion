import type { ReactNode } from 'react';

/** Encart Discord tel que l'envoie FM Immersion (sous-ensemble utilisé : auteur, titre, texte, champs, pied). */
export interface Embed {
  author?: { name: string };
  title?: string;
  description?: string;
  color?: number;
  fields?: { name: string; value: string }[];
  footer?: { text: string };
}

/** Mise en forme Discord minimale : **gras**, *italique*, `code`, retours à la ligne. */
function md(text: string): ReactNode[] {
  return text.split('\n').flatMap((line, i) => [
    ...(i ? [<br key={`br${i}`} />] : []),
    ...line.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/).map((part, j) => {
      const k = `${i}-${j}`;
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={k}>{part.slice(2, -2)}</strong>;
      if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return <code key={k} className="rounded bg-black/30 px-1 font-mono text-[0.85em] whitespace-pre">{part.slice(1, -1)}</code>;
      if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <em key={k}>{part.slice(1, -1)}</em>;
      return part;
    }),
  ]);
}

/** Aperçu d'un message Discord (thème sombre de Discord), pour montrer au joueur ce que verront ses amis. */
export function DiscordEmbed({ embed, label }: { embed: Embed; label: string }) {
  const color = `#${(embed.color ?? 0xffb547).toString(16).padStart(6, '0')}`;
  return (
    <figure className="rounded-lg bg-[#313338] p-3 text-[13px] leading-snug text-[#DBDEE1]" aria-label={label}>
      <p className="font-bold text-white">FM Immersion</p>
      <div className="mt-1 max-w-md rounded border-l-4 bg-[#2B2D31] px-3 py-2" style={{ borderLeftColor: color }}>
        {embed.author && <p className="text-xs font-bold text-white">{embed.author.name}</p>}
        {embed.title && <p className="mt-1 font-bold text-white">{embed.title}</p>}
        {embed.description && <p className="mt-1">{md(embed.description)}</p>}
        {embed.fields?.map((f) => (
          <div key={f.name} className="mt-2">
            <p className="text-xs font-bold text-white">{f.name}</p>
            <p>{md(f.value)}</p>
          </div>
        ))}
        {embed.footer && <p className="mt-2 text-[11px] text-[#B5BAC1]">{embed.footer.text}</p>}
      </div>
    </figure>
  );
}
