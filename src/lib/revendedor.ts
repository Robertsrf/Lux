import { supabase, mensajeDeError } from './supabase';
import type { PaletaRevendedor } from './tipos';
import { USUARIOS_RESERVADOS, urlRevendedor, urlTienda, usuarioValido } from './dominio';
import { direcciones } from './direccion';
import { achicarLogo } from './fotos';

/*
  EL REVENDEDOR NO TIENE SESIÓN DE SUPABASE

  Para la base es alguien sin sesión, como una clienta del catálogo, con la
  llave de su propio cajón: entra con su código (`rv_entrar`), recibe un
  testigo, y cada función `rv_*` lo recibe como primer parámetro y le
  devuelve solo lo suyo. El porqué está en la cabecera de
  esquema-revendedores.sql: darle una sesión de Supabase le habría abierto
  todo lo que hoy se abre a quien tiene sesión, que es el personal de la
  tienda.

  El testigo vive en este navegador. No es un secreto del sitio: es de él,
  como su código.
*/

const CLAVE = 'lux.revendedor.sesion';

export interface SesionRevendedor {
  sesion: string;
  nombre: string;
  usuario: string;
}

export function leerSesionRv(): SesionRevendedor | null {
  try {
    const texto = window.localStorage.getItem(CLAVE);
    if (!texto) return null;
    const s = JSON.parse(texto) as Partial<SesionRevendedor>;
    return s.sesion && s.usuario ? { sesion: s.sesion, nombre: s.nombre ?? '', usuario: s.usuario } : null;
  } catch {
    return null;
  }
}

function guardarSesionRv(s: SesionRevendedor) {
  try { window.localStorage.setItem(CLAVE, JSON.stringify(s)); } catch { /* sin almacenamiento: vuelve a entrar */ }
}

export function borrarSesionRv() {
  try { window.localStorage.removeItem(CLAVE); } catch { /* nada que borrar */ }
}

/** El error de "tu sesión se cerró": la pantalla lo manda a entrar otra vez. */
export class SesionRvCerrada extends Error {}

/** Entrar con el código. Devuelve el error ya dicho para él, o null. */
export async function entrarRevendedor(codigo: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('rv_entrar', { p_codigo: codigo });
  if (error) return mensajeDeError(error);
  guardarSesionRv(data as SesionRevendedor);
  return null;
}

export async function salirRevendedor() {
  const s = leerSesionRv();
  borrarSesionRv();
  if (s) await supabase.rpc('rv_salir', { p_sesion: s.sesion });
}

/**
 * Una función de su panel, con su testigo delante. Si la base dice que la
 * sesión se cerró (código 28000: venció, se pausó o le dieron otro código),
 * se borra aquí y se lanza `SesionRvCerrada`.
 */
export async function rpcRv<T>(funcion: string, argumentos: Record<string, unknown> = {}): Promise<T> {
  const s = leerSesionRv();
  if (!s) throw new SesionRvCerrada('Entra con tu código.');
  const { data, error } = await supabase.rpc(funcion, { p_sesion: s.sesion, ...argumentos });
  if (error) {
    if (error.code === '28000') {
      borrarSesionRv();
      throw new SesionRvCerrada(error.message);
    }
    throw new Error(mensajeDeError(error));
  }
  return data as T;
}

/**
 * Su logo, desde su panel (#73). Sin sesión de Supabase no puede escribir
 * en el almacén: lo sube la función de servidor `logo-revendedor`, que
 * comprueba su testigo. Devuelve la ruta guardada.
 */
export async function subirMiLogo(archivo: File): Promise<string> {
  const s = leerSesionRv();
  if (!s) throw new SesionRvCerrada('Entra con tu código.');
  const logo = await achicarLogo(archivo);
  const cuerpo = new FormData();
  cuerpo.append('sesion', s.sesion);
  cuerpo.append('archivo', new File([logo], 'logo.webp', { type: 'image/webp' }));
  const { data, error } = await supabase.functions.invoke('logo-revendedor', { body: cuerpo });
  if (error) {
    const respuesta = (error as { context?: Response }).context;
    if (respuesta?.status === 401) { borrarSesionRv(); throw new SesionRvCerrada('Tu sesión se cerró. Entra otra vez con tu código.'); }
    // Sin la función publicada (o sin red), lo de siempre: mandárselo a Lux.
    if (!respuesta || typeof respuesta.json !== 'function' || respuesta.status === 404) throw new Error('Todavía no se puede subir desde aquí: mándale tu logo a Lux por WhatsApp.');
    let dicho: string | null = null;
    try { dicho = ((await respuesta.json()) as { error?: string }).error ?? null; } catch { /* sin cuerpo */ }
    throw new Error(dicho ?? 'No se pudo subir el logo. Prueba otra vez.');
  }
  return (data as { ruta: string }).ruta;
}

/* ------------------------------------------------------------------ enlaces */

/*
  Las direcciones salen de la regla de lib/dominio.ts: su catálogo en
  <usuario>.luxbyemory.com, el panel en luxbyemory.com/rv. Sin dominio
  (desarrollo), todo en la misma dirección, como antes.
*/

/** Su catálogo, el que manda a sus clientas: su subdominio. */
export const enlaceCatalogoRv = (usuario: string) => urlRevendedor(direcciones(), usuario, '/');
export const enlacePanelRv = () => urlTienda(direcciones(), '/rv');
/** La guía pública: la que se manda a quien quiere ser revendedor. */
export const enlaceGuiaRv = () => urlTienda(direcciones(), '/guia-revendedor');
/**
 * El pedido de su clienta, en el subdominio de él. Sin su usuario, en el de
 * Lux: la página salta sola al suyo cuando sabe de quién es.
 */
export const enlaceApartado = (token: string, usuario?: string | null) =>
  (usuario ? urlRevendedor(direcciones(), usuario, `/apartado/${token}`) : urlTienda(direcciones(), `/apartado/${token}`));
/** El enlace del pedido de la tienda: ahí la clienta ve lo que pagó y reporta lo que falta. */
export const enlaceReserva = (token: string) => urlTienda(direcciones(), `/reserva/${token}`);

/**
 * Un enlace de WhatsApp. Con número, a esa persona; sin número, a elegir
 * contacto. El número venezolano se escribe con el 0 ("0412 1234567") y
 * WhatsApp lo pide con el código del país y sin el 0 ("584121234567").
 */
export function enlaceWhatsApp(telefono: string | null | undefined, texto: string): string {
  let digitos = (telefono ?? '').replace(/\D/g, '');
  if (digitos.startsWith('0')) digitos = `58${digitos.slice(1)}`;
  const para = digitos.length >= 11 ? digitos : '';
  return `https://wa.me/${para}?text=${encodeURIComponent(texto)}`;
}

/* ------------------------------------------------------------------ paletas */

/**
 * Las paletas de su catálogo. La misma lista que el `check` de
 * `revendedores.paleta` en esquema-revendedores.sql: si cambia una, cambia
 * la otra. Los colores viven en estilos/revendedor.css, medidos a 4,5:1
 * en cada par de texto; aquí solo el nombre.
 */
export const PALETAS: { id: PaletaRevendedor; nombre: string }[] = [
  { id: 'lux', nombre: 'Lux' },
  { id: 'noche', nombre: 'Noche' },
  { id: 'vino', nombre: 'Vino' },
  { id: 'grafito', nombre: 'Grafito' },
  { id: 'ciruela', nombre: 'Ciruela' },
  { id: 'oliva', nombre: 'Oliva' },
];

/** La clase que viste una pantalla con su paleta. */
export function claseTema(paleta: string | null | undefined): string {
  const id = PALETAS.some((p) => p.id === paleta) ? paleta : 'lux';
  return `tema-rv tema-rv--${id}`;
}

/*
  Su usuario es el nombre de su subdominio: la regla y los nombres
  reservados viven en lib/dominio.ts (y en la base, `usuario_rv_valido`).
*/
export { usuarioValido, usuarioDesdeNombre, USUARIOS_RESERVADOS } from './dominio';

/** Por qué un usuario no sirve, en palabras de la pantalla; null si sirve. */
export function porQueNoSirveUsuario(usuario: string): string | null {
  if (USUARIOS_RESERVADOS.includes(usuario)) return 'Ese nombre lo usa la tienda: prueba con otro.';
  if (!usuarioValido(usuario)) return 'De 3 a 30 letras minúsculas, números o guiones, sin empezar ni terminar en guion.';
  return null;
}

/** "Quedan 3 días", "Vence hoy", para un apartado. Días enteros, hacia abajo. */
export function diasParaVencer(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return 'Venció';
  const dias = Math.floor(ms / 86_400_000);
  if (dias === 0) return 'Vence hoy';
  return dias === 1 ? 'Queda 1 día' : `Quedan ${dias} días`;
}
