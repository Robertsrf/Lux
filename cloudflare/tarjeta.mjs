/*
  LA TARJETA DEL SUBDOMINIO DE UN REVENDEDOR

  Lo que WhatsApp, Instagram y la pestaña enseñan de jadujoyas.luxbyemory.com.
  index.html trae la de Lux para todo el sitio; en el subdominio de un
  revendedor manda SU nombre y SU logo, con "Joyas Lux by Emory" en
  pequeño (decisión del dueño: "que lo principal sea su marca"). Sin
  revendedor, una tarjeta neutra que no nombra a Lux.

  Pura: la usa cloudflare/worker.js y la prueba scripts/pruebas/tarjeta.test.mjs.
*/

const BUCKET = 'fotos';

/** El logo en el bucket público. Una ruta con ".." o que empiece por "/" no sale del bucket: no hay logo. */
export function urlLogo(supabaseUrl, logoPath) {
  if (!logoPath || logoPath.startsWith('/') || logoPath.split('/').includes('..')) return null;
  const ruta = logoPath.split('/').map(encodeURIComponent).join('/');
  return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${BUCKET}/${ruta}`;
}

/** @param {{catalogo_nombre: string, logo_path: string | null} | null} perfil */
export function tarjetaDe(perfil, supabaseUrl) {
  if (!perfil || !perfil.catalogo_nombre) {
    return { titulo: 'Catálogo de joyas', descripcion: 'Este catálogo no está disponible.', imagen: null };
  }
  return {
    titulo: perfil.catalogo_nombre,
    descripcion: `Catálogo de ${perfil.catalogo_nombre}. Joyas Lux by Emory.`,
    imagen: urlLogo(supabaseUrl, perfil.logo_path),
  };
}

/** Solo se cambia el HTML de las páginas del revendedor: su catálogo y el pedido de su clienta. */
export function reescribeAqui(lugar, pathname) {
  if (lugar.tipo !== 'revendedor' && lugar.tipo !== 'ninguno') return false;
  return pathname === '/' || /^\/apartado\/[^/]+$/.test(pathname);
}
