/*
  EL REENVÍO DE LA DIRECCIÓN VIEJA

  Antes del dominio propio, Lux vivía en robertsrf.github.io/Lux/ y
  navegaba con "#/" (…/#/publico, …/#/r/jadujoyas). Hay imágenes
  publicadas con esas direcciones. GitHub Pages sirve ahora solo esta
  página, que lleva la ruta al dominio nuevo: luxbyemory.com/<ruta>. Allí
  la regla de direcciones (src/lib/dominio.ts) la manda a entrar. o al
  subdominio del revendedor; así este archivo no copia la regla.
*/

/** "#/publico?x=1" -> "https://luxbyemory.com/publico?x=1". Lo que no es una ruta propia, a la raíz. */
export function destinoViejo(hash, base) {
  const ruta = typeof hash === 'string' && hash.startsWith('#/') ? hash.slice(1) : '/';
  const propia = /^\/(?![/\\])[^\s\\]*$/.test(ruta) ? ruta : '/';
  return `https://${base}${propia}`;
}

if (typeof window !== 'undefined') {
  window.location.replace(destinoViejo(window.location.hash, 'luxbyemory.com'));
}
