import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base relativa: funciona igual en GitHub Pages de usuario y de proyecto.
// El routing es con HashRouter, asi que no hace falta reescritura de rutas.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          supabase: ['@supabase/supabase-js'],
          fotos: ['browser-image-compression'],
        },
      },
    },
  },
});
