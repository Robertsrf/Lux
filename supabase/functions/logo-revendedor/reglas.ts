// Las reglas del logo que sube un revendedor, puras: las usa la función de
// servidor (index.ts, en Deno) y las prueba scripts/pruebas/logo-rv.test.mjs.

export type TipoLogo = 'webp' | 'png' | 'jpeg';

/** El navegador lo achica a WebP de 400 px y unos 60 KB; esto es la red. */
export const LOGO_MAX_BYTES = 300_000;

export const CONTENT_TYPE: Record<TipoLogo, string> = {
  webp: 'image/webp',
  png: 'image/png',
  jpeg: 'image/jpeg',
};

const EXTENSION: Record<TipoLogo, string> = { webp: 'webp', png: 'png', jpeg: 'jpg' };

const empieza = (b: Uint8Array, firma: number[], desde = 0) =>
  b.length >= desde + firma.length && firma.every((x, i) => b[desde + i] === x);

/**
 * El tipo por sus primeros bytes, no por lo que dice el navegador. Solo
 * WebP, PNG y JPEG: ni SVG (puede llevar código), ni GIF, ni nada más.
 */
export function tipoDeImagen(b: Uint8Array): TipoLogo | null {
  // RIFF....WEBP
  if (empieza(b, [0x52, 0x49, 0x46, 0x46]) && empieza(b, [0x57, 0x45, 0x42, 0x50], 8)) return 'webp';
  if (empieza(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (empieza(b, [0xff, 0xd8, 0xff])) return 'jpeg';
  return null;
}

/**
 * Dónde se guarda: `revendedores/<usuario>/<milisegundos>.<ext>`, la forma
 * que exige `rv_poner_logo`. El usuario viene de la base, pero se mira igual.
 */
export function rutaDeLogo(usuario: string, ahora: number, tipo: TipoLogo): string {
  if (!/^[a-z0-9][a-z0-9-]{2,29}$/.test(usuario)) throw new Error('Usuario raro para un logo.');
  return `revendedores/${usuario}/${Math.trunc(ahora)}.${EXTENSION[tipo]}`;
}
