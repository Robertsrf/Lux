/**
 * La página de una pieza del catálogo público (fase 10): `?pieza=<id>`.
 * Puro, sin navegador: lo prueba scripts/pruebas/pieza.test.mjs.
 */

/** El id de la ruta: un entero positivo escrito como entero, o null. */
export function piezaDeRuta(valor: string | null): number | null {
  if (valor === null || !/^[1-9][0-9]{0,14}$/.test(valor)) return null;
  const n = Number(valor);
  return Number.isSafeInteger(n) ? n : null;
}

/** La ruta de una pieza, dentro del catálogo (`/` en la tienda, `/publico` en desarrollo). */
export function rutaDePieza(rutaCatalogo: string, id: number, para: string | null): string {
  const p = new URLSearchParams({ pieza: String(id) });
  if (para) p.set('para', para);
  return `${rutaCatalogo}?${p.toString()}`;
}

/**
 * Lo que se manda al compartir una pieza. Sin precio: la tasa cambia cada
 * día y el enlace se queda; la página dice el de hoy.
 */
export function textoParaCompartir(nombre: string, url: string): string {
  return `Mira esta joya de Lux by Emory: ${nombre}\n${url}`;
}

/** WhatsApp sin número: la clienta elige a quién se la manda. */
export function enlaceCompartirPieza(nombre: string, url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(textoParaCompartir(nombre, url))}`;
}
