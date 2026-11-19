import { dondeEstoy, type Direcciones, type Lugar } from './dominio';

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

/** El revendedor de este subdominio, o '' (la página dirá que el catálogo no está disponible). */
export function usuarioDelSubdominio(): string {
  const lugar = lugarActual();
  return lugar.tipo === 'revendedor' ? lugar.usuario : '';
}
