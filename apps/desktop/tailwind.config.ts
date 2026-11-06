import type { Config } from 'tailwindcss';

/**
 * Palette FM Immersion (voir CLAUDE.md, « Identité »).
 * Pas d'orange dans l'interface : l'ambre est réservé aux illustrations et aux pastilles d'alerte.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canard: { DEFAULT: '#0F4B58', dark: '#072B3A' },
        eau: { DEFAULT: '#63D1B1', soutenu: '#2FA88A', fonce: '#1B7F67' },
        ambre: '#FFB347',
        corail: '#FF6B6B',
        creme: '#F7EFE3',
        brun: '#8B5E3C',
      },
      // Petit texte (aides, pastilles, en-têtes de tableaux) à 13 px au lieu de 12 : plus lisible sur un écran de PC.
      fontSize: {
        xs: ['0.8125rem', { lineHeight: '1.125rem' }],
      },
      fontFamily: {
        display: ['"Fraunces Variable"', 'Georgia', 'serif'],
        sans: ['"Nunito Variable"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
