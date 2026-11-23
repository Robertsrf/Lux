import { dondeEstoy, sinMarcaDeTienda, type Direcciones, type Lugar } from './dominio';

/*
  Lo único que lee la dirección de verdad: el dominio base de la
  configuración (VITE_DOMINIO_BASE, que pone el despliegue) y el host de
  ahora. La regla vive en lib/dominio.ts, que es pura; esto solo la conecta.
*/
const BASE = (import.meta.env.VITE_DOMINIO_BASE ?? '').trim().toLowerCase() || null;

export const direcciones = (): Direcciones => ({ base: BASE, origen: window.location.origin });
export const lugarActual = (): Lugar => dondeEstoy(window.location.hostname, BASE);

/** La ruta interna del catálogo de la tienda: la raíz en su dominio, /publico en una sola dirección. */
export const rutaDelCatalogo = (): string => (lugarActual().tipo === 'tienda' ? '/' : '/publico');

/** La ruta interna del catálogo de un revendedor: la raíz en su subdominio, /r/<usuario> en los demás. */
export const rutaDelCatalogoRv = (usuario: string): string =>
  (lugarActual().tipo === 'revendedor' ? '/' : `/r/${usuario}`);

const CLAVE_TIENDA = 'lux-de-la-tienda';

/** Este teléfono es de la tienda (llegó desde entrar.): sus visitas y miradas no suman. */
export function esDeLaTienda(): boolean {
  try { return window.localStorage.getItem(CLAVE_TIENDA) === '1'; } catch { return false; }
}

/** Al abrir: si la dirección trae la marca del personal, se recuerda y se quita de la barra. */
export function recordarSiEsDeLaTienda(): void {
  const { marcada, busqueda } = sinMarcaDeTienda(window.location.search);
  if (!marcada) return;
  try { window.localStorage.setItem(CLAVE_TIENDA, '1'); } catch { /* sin almacenamiento: contará, nada más */ }
  window.history.replaceState(null, '', `${window.location.pathname}${busqueda}${window.location.hash}`);
}

/** El revendedor de este subdominio, o '' (la página dirá que el catálogo no está disponible). */
export function usuarioDelSubdominio(): string {
  const lugar = lugarActual();
  return lugar.tipo === 'revendedor' ? lugar.usuario : '';
}
