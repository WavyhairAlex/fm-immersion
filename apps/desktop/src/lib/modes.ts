/** Les modes de FM Immersion, dans l'ordre de la barre latérale. Chaque mode est indépendant des autres. */
export const MODES = [
  { id: 'faces', path: '/visages', status: 'available' },
  { id: 'coach', path: '/coach', status: 'available' },
  { id: 'gazette', path: '/gazette', status: 'soon' },
  { id: 'discord', path: '/discord', status: 'soon' },
  { id: 'world', path: '/monde', status: 'soon' },
] as const;

export type Mode = (typeof MODES)[number];
export type ModeId = Mode['id'];
