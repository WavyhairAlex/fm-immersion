import type { Config } from 'tailwindcss';

/**
 * Palette FM Immersion : anthracite et orange (voir CLAUDE.md, « Identité visuelle »).
 * Les noms des jetons viennent de Simloom et sont gardés pour ne pas réécrire tous les écrans :
 * `canard` = anthracite (texte, fonds sombres), `orange` = couleur de marque (boutons, liens, sélection),
 * `eau` = vert des états « bon / OK », `ambre` = alerte, `corail` = erreur, `creme` = fond, `brun` = texte secondaire.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canard: { DEFAULT: '#25282D', dark: '#17191C' },
        orange: { DEFAULT: '#F26B1D', fonce: '#C2410C', clair: '#FFE4D3' },
        eau: { DEFAULT: '#7FD3A0', soutenu: '#2E9E5B', fonce: '#1E7A45' },
        ambre: '#F5B700',
        corail: '#D93C3C',
        creme: '#F2F2F0',
        brun: '#5C6067',
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
