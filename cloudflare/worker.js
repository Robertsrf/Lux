/*
  EL WORKER DE LUX (Cloudflare)

  Cloudflare sirve el sitio entero desde dist/ (wrangler.jsonc): cualquier
  ruta que no sea un archivo devuelve index.html, y la aplicación decide qué
  abrir según la dirección (src/lib/dominio.ts). Este script solo corre para
  "/" y "/apartado/*" (run_worker_first) y hace UNA cosa: en el subdominio de
  un revendedor, cambia la tarjeta de vista previa de Lux por la suya
  (cloudflare/tarjeta.mjs). En luxbyemory.com y entrar. devuelve la página tal
  cual.

  Lee rv_perfil_publico sin sesión, lo mismo que ya lee su catálogo en el
  navegador: nombre, nombre del catálogo, teléfono, paleta y logo. La llave
  anónima es pública por diseño (va dentro del sitio). Si Supabase no
  responde en 2 segundos, tarjeta neutra: la página sale igual.
*/
import { dondeEstoy } from '../src/lib/dominio.ts';
import { reescribeAqui, tarjetaDe } from './tarjeta.mjs';

/** Cuánto se guarda el perfil de un revendedor en la caché de Cloudflare. */
const CACHE_SEGUNDOS = 300;

async function perfilDe(usuario, env, ctx) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;
  const clave = new Request(`https://cache.lux/perfil/${encodeURIComponent(usuario)}`);
  const guardado = await caches.default.match(clave);
  if (guardado) return guardado.json();
  try {
    const r = await fetch(`${env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/rpc/rv_perfil_publico`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_usuario: usuario }),
      signal: AbortSignal.timeout(2000),
    });
    if (!r.ok) return null;
    const perfil = await r.json();
    const solo = perfil && typeof perfil === 'object'
      ? { catalogo_nombre: String(perfil.catalogo_nombre ?? ''), logo_path: perfil.logo_path ?? null }
      : null;
    ctx.waitUntil(caches.default.put(clave, new Response(JSON.stringify(solo), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${CACHE_SEGUNDOS}` },
    })));
    return solo;
  } catch {
    return null;
  }
}

/** Cambia el <head> de index.html. Todo como texto o atributo: nada del perfil entra como HTML. */
function reescribir(respuesta, t, url) {
  const contenido = (valor) => ({ element(e) { e.setAttribute('content', valor); } });
  const quitar = { element(e) { e.remove(); } };
  const icono = { element(e) { if (t.imagen) e.setAttribute('href', t.imagen); else e.remove(); } };
  return new HTMLRewriter()
    .on('title', { element(e) { e.setInnerContent(t.titulo); } })
    .on('meta[name="description"]', contenido(t.descripcion))
    .on('meta[property="og:site_name"]', contenido(t.titulo))
    .on('meta[property="og:title"]', contenido(t.titulo))
    .on('meta[property="og:description"]', contenido(t.descripcion))
    .on('meta[property="og:url"]', contenido(`${url.origin}${url.pathname}`))
    .on('meta[property="og:image"]', t.imagen ? contenido(t.imagen) : quitar)
    .on('meta[property="og:image:width"]', quitar)
    .on('meta[property="og:image:height"]', quitar)
    .on('meta[name="twitter:card"]', contenido('summary'))
    .on('link[rel="icon"]', icono)
    .on('link[rel="apple-touch-icon"]', icono)
    // Los datos de la tienda (JewelryStore de Lux) no van en el sitio de él.
    .on('script[type="application/ld+json"]', quitar)
    .transform(respuesta);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const respuesta = await env.ASSETS.fetch(request);
    const lugar = dondeEstoy(url.hostname, (env.DOMINIO_BASE || '').toLowerCase() || null);
    if (request.method !== 'GET' || !reescribeAqui(lugar, url.pathname)) return respuesta;
    if (!(respuesta.headers.get('content-type') || '').includes('text/html')) return respuesta;
    const perfil = lugar.tipo === 'revendedor' ? await perfilDe(lugar.usuario, env, ctx) : null;
    return reescribir(respuesta, tarjetaDe(perfil, env.SUPABASE_URL || ''), url);
  },
};
