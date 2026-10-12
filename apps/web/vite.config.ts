import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // En local, le front appelle /api/* sur la même origine : pas de souci de cookies ni de CORS.
    proxy: { '/api': 'http://localhost:3001' },
  },
});
