import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json';

// Configuration recommandée par Tauri : port fixe, pas d'écran effacé, cibles des webviews.
export default defineConfig({
  plugins: [react()],
  // Numéro de version affiché dans l'en-tête (le même que celui des mises à jour).
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: {
    // WebView2 (Chromium) sous Windows, WebKit sous macOS/Linux.
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
