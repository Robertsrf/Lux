/*
  LA REGLA DE DIRECCIONES

  Lux vive en su dominio (luxbyemory.com) y cada revendedor en el suyo
  (jadujoyas.luxbyemory.com). El personal entra por entrar.luxbyemory.com.
  Es una sola aplicación: según la dirección donde se abre, cada ruta se
  abre ahí o lleva a la dirección que le toca. Esta librería es esa regla,
  y la única: ninguna pantalla arma una dirección por su cuenta.

  Es pura (no lee `window` ni la configuración): las funciones reciben el
  dominio base y el origen. Las lee `lib/direccion.ts`, y así se prueban
  sin navegador (`scripts/pruebas/dominio.test.mjs`).

  Sin dominio base (en desarrollo, o en una vista previa) todo vive en una
  sola dirección, como antes del dominio: el catálogo del revendedor en
  /r/<usuario>.
*/

/** Dónde está abierta la aplicación. `ninguno`: un subdominio que no puede ser de nadie. */
export type Lugar =
  | { tipo: 'tienda' }
  | { tipo: 'entrar' }
  | { tipo: 'revendedor'; usuario: string }
  | { tipo: 'unica' }
  | { tipo: 'ninguno' };

/** Lo que hace falta para armar una dirección: el dominio base y el origen de ahora. */
export type Direcciones = { base: string | null; origen: string };

/** Una ruta se abre aquí, o se va a otra (una ruta interna `/...` o una dirección `https://...`). */
export type Destino = { abrir: true } | { ir: string };

/** El subdominio del personal. */
const ENTRAR = 'entrar';

/*
  Nombres que ningún revendedor puede usar: serían una dirección de la
  tienda o de un servicio. La base manda (`usuario_rv_valido`, en
  esquema-dominio.sql) y esta copia solo avisa antes de guardar; una prueba
  (scripts/pruebas/reservados.test.mjs) vigila que las dos digan lo mismo.
*/
export const USUARIOS_RESERVADOS: readonly string[] = [
  'www', 'entrar', 'admin', 'api', 'app', 'mail', 'correo', 'smtp', 'ftp', 'tienda',
  'lux', 'luxbyemory', 'emory', 'rv', 'r', 'catalogo', 'vitrina', 'publico', 'guia',
  'reserva', 'apartado', 'venta', 'pagos', 'soporte', 'ayuda', 'blog', 'static',
  'assets', 'cdn', 'dev', 'test', 'staging',
];

/**
 * El usuario de un revendedor es el nombre de su subdominio: de 3 a 30
 * minúsculas, cifras o guiones, sin empezar ni terminar en guion, sin el
 * `xn--` de los nombres internacionales y fuera de los reservados.
 */
export function usuarioValido(usuario: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(usuario)
    && !usuario.startsWith('xn--')
    && !USUARIOS_RESERVADOS.includes(usuario);
}

/** Su usuario a partir de su nombre: "María González" -> "maria-gonzalez". Nunca uno reservado. */
export function usuarioDesdeNombre(nombre: string): string {
  const usuario = nombre
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
    .replace(/-+$/, '');
  return USUARIOS_RESERVADOS.includes(usuario) ? `${usuario}-joyas`.slice(0, 30) : usuario;
}

const limpiarHost = (host: string) => host.trim().toLowerCase().replace(/\.$/, '');

export function dondeEstoy(hostname: string, base: string | null): Lugar {
  if (!base) return { tipo: 'unica' };
  const host = limpiarHost(hostname);
  const raiz = limpiarHost(base);
  if (host === raiz || host === `www.${raiz}`) return { tipo: 'tienda' };
  if (!host.endsWith(`.${raiz}`)) return { tipo: 'unica' };
  const sub = host.slice(0, -(raiz.length + 1));
  if (sub === ENTRAR) return { tipo: 'entrar' };
  if (sub.includes('.') || !usuarioValido(sub)) return { tipo: 'ninguno' };
  return { tipo: 'revendedor', usuario: sub };
}

/** Protocolo y puerto del origen de ahora: en desarrollo, http y :5173. */
function protocoloYPuerto(origen: string): { protocolo: string; puerto: string } {
  try {
    const u = new URL(origen);
    return { protocolo: u.protocol, puerto: u.port ? `:${u.port}` : '' };
  } catch {
    return { protocolo: 'https:', puerto: '' };
  }
}

function enHost(d: Direcciones, sub: string | null, ruta: string): string {
  if (!d.base) return `${d.origen}${ruta}`;
  const { protocolo, puerto } = protocoloYPuerto(d.origen);
  return `${protocolo}//${sub ? `${sub}.` : ''}${d.base}${puerto}${ruta}`;
}

export const urlTienda = (d: Direcciones, ruta: string) => enHost(d, null, ruta);
export const urlEntrar = (d: Direcciones, ruta: string) => enHost(d, d.base ? ENTRAR : null, ruta);

/** Sin dominio base, el catálogo del revendedor es /r/<usuario> y su pedido /apartado/<token>. */
export function urlRevendedor(d: Direcciones, usuario: string, ruta: string): string {
  if (d.base) return enHost(d, usuario, ruta);
  return `${d.origen}${ruta === '/' ? `/r/${usuario}` : ruta}`;
}

/** Un enlace de antes del dominio (`#/publico?x=1`) como ruta (`/publico?x=1`). */
export function rutaDeHashViejo(hash: string): string | null {
  return hash.startsWith('#/') ? hash.slice(1) : null;
}

/** Lo del personal: vive en entrar. Todo lo demás es de la tienda (la landing, los pedidos, la guía, /rv, la vitrina). */
const RUTAS_PERSONAL = /^\/(entrar|venta|admin|clientes|tasas|catalogo|verificacion)(\/|\?|$)/;

/** Lo de una ruta antes de la búsqueda: "/publico?ver=todas" -> ["/publico", "?ver=todas"]. */
function partir(ruta: string): [string, string] {
  const i = ruta.indexOf('?');
  return i < 0 ? [ruta, ''] : [ruta.slice(0, i), ruta.slice(i)];
}

export function destinoDeRuta(lugar: Lugar, ruta: string, d: Direcciones): Destino {
  const [camino, busqueda] = partir(ruta);
  switch (lugar.tipo) {
    case 'unica':
      return { abrir: true };
    case 'revendedor':
    case 'ninguno':
      return camino === '/' || /^\/apartado\/[^/]+$/.test(camino) ? { abrir: true } : { ir: '/' };
    case 'entrar':
      if (camino === '/' || RUTAS_PERSONAL.test(camino)) return { abrir: true };
      return { ir: camino === '/publico' ? urlTienda(d, `/${busqueda}`) : urlTienda(d, ruta) };
    case 'tienda': {
      if (camino === '/publico') return { ir: `/${busqueda}` };
      const rv = /^\/r\/([^/]+)\/?$/.exec(camino);
      if (rv?.[1]) return { ir: urlRevendedor(d, rv[1].toLowerCase(), '/') };
      if (RUTAS_PERSONAL.test(camino)) return { ir: urlEntrar(d, ruta) };
      return { abrir: true };
    }
  }
}

/**
 * A dónde saltar con el pedido de un revendedor, o null si se queda: el
 * pedido vive en el subdominio de SU revendedor, nunca bajo el nombre de otro.
 */
export function destinoDeApartado(lugar: Lugar, usuarioDelPedido: string | null, token: string, d: Direcciones): string | null {
  if (!d.base || !usuarioDelPedido || !usuarioValido(usuarioDelPedido)) return null;
  if (lugar.tipo === 'unica') return null;
  if (lugar.tipo === 'revendedor' && lugar.usuario === usuarioDelPedido) return null;
  return urlRevendedor(d, usuarioDelPedido, `/apartado/${token}`);
}
