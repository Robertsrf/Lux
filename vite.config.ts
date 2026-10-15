import { defineConfig, loadEnv } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/*
  POLITICA DE SEGURIDAD DE CONTENIDO

  GitHub Pages no deja poner cabeceras HTTP, asi que va como <meta>, que
  cubre casi todo (no `frame-ancestors`). Dice de donde puede cargar cosas
  la pagina: de si misma y del proyecto de Supabase (datos, fotos y la
  funcion de las vendedoras). Nada mas.

  Lo que cierra: si algun dia un texto de la base se colara como HTML, o
  una dependencia intentara cargar codigo de otro sitio, el navegador lo
  bloquea. Ya paso una vez sin que nadie lo viera: la compresion de fotos
  descargaba su trabajador de cdn.jsdelivr.net en cada subida (ver
  lib/fotos.ts, que ahora lo sirve desde aqui).

  Solo al construir: en desarrollo Vite mete un script en linea para
  recargar en caliente, y esta politica lo bloquearia.

  'unsafe-inline' en estilos: React escribe `style={...}` en los elementos,
  y eso cuenta como estilo en linea. No ejecuta nada.
*/
function politicaDeSeguridad(urlSupabase: string): Plugin {
  let origen = '';
  try { origen = new URL(urlSupabase).origin; } catch { /* sin .env: el sitio no habla con nadie */ }
  const tiempoReal = origen.replace(/^https:/, 'wss:');
  const politica = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${origen}`.trim(),
    "font-src 'self' data:",
    `connect-src 'self' ${origen} ${tiempoReal}`.trim(),
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');

  // Justo despues del <meta charset>: el charset tiene que ir en los primeros
  // 1024 bytes, y la politica antes de cualquier script, que solo cubre lo
  // que viene despues de ella.
  const etiquetas =
    `\n    <meta http-equiv="Content-Security-Policy" content="${politica}" />`
    // Al abrir un enlace de fuera (WhatsApp), que no viaje la ruta completa
    // de la pantalla: solo el dominio.
    + '\n    <meta name="referrer" content="strict-origin-when-cross-origin" />';

  return {
    name: 'lux-politica-de-seguridad',
    apply: 'build',
    transformIndexHtml(html) {
      if (!/<meta charset[^>]*>/i.test(html)) throw new Error('index.html no tiene <meta charset>: la politica no sabe donde ir.');
      return html.replace(/(<meta charset[^>]*>)/i, `$1${etiquetas}`);
    },
  };
}

// base relativa: funciona igual en GitHub Pages de usuario y de proyecto.
// El routing es con HashRouter, asi que no hace falta reescritura de rutas.
export default defineConfig(({ mode }) => {
  // loadEnv lee el .env y, por encima, las variables VITE_ del entorno: las
  // que pasa el despliegue de GitHub (.github/workflows/desplegar.yml).
  const env = loadEnv(mode, '.', 'VITE_');
  return {
    base: './',
    plugins: [react(), politicaDeSeguridad(env.VITE_SUPABASE_URL ?? '')],
    build: {
      target: 'es2020',
      rollupOptions: {
        output: {
          /*
            Solo Supabase va en un trozo con nombre propio. Los graficos y la
            compresion de fotos YA viajan aparte solos: Reportes se carga
            cuando se abre, y la compresion cuando se sube una foto.

            Antes estaban aqui tambien, y eso era el problema: al nombrar
            `recharts`, Rollup metio en ese trozo todo lo que recharts usa,
            React incluido. La entrada necesitaba React, asi que precargaba
            los 392 KB de graficos en TODAS las pantallas, el catalogo que
            abre una clienta por WhatsApp incluido. Se vio en la auditoria
            del 14/10/2026 mirando los <link rel="modulepreload"> del build.
          */
          manualChunks: {
            supabase: ['@supabase/supabase-js'],
          },
        },
      },
    },
  };
});
