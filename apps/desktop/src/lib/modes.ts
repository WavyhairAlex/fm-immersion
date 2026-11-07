/** Les modes de FM Immersion, dans l'ordre de la barre latérale. Chaque mode est indépendant des autres. */
export const MODES = [
  { id: 'faces', path: '/visages', status: 'available' },
  { id: 'coach', path: '/parties', status: 'available' },
  { id: 'gazette', path: '/gazette', status: 'available' },
  { id: 'discord', path: '/discord', status: 'available' },
  { id: 'challenges', path: '/defis', status: 'available' },
  { id: 'world', path: '/monde', status: 'soon' },
] as const;

export type Mode = (typeof MODES)[number];
export type ModeId = Mode['id'];
