import { supabase, mensajeDeError } from './supabase';
import type { PaletaRevendedor } from './tipos';

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

/* ------------------------------------------------------------------ enlaces */

/** La dirección donde corre la aplicación, sin el index.html de GitHub Pages. */
function base(): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname.replace(/index\.html$/, '')}`;
}

export const enlaceCatalogoRv = (usuario: string) => `${base()}#/r/${usuario}`;
export const enlacePanelRv = () => `${base()}#/rv`;
export const enlaceApartado = (token: string) => `${base()}#/apartado/${token}`;
/** El enlace del pedido de la tienda: ahí la clienta ve lo que pagó y reporta lo que falta. */
export const enlaceReserva = (token: string) => `${base()}#/reserva/${token}`;

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

/** Su usuario a partir de su nombre: "María González" -> "maria-gonzalez". */
export function usuarioDesdeNombre(nombre: string): string {
  return nombre
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
}

/** "Quedan 3 días", "Vence hoy", para un apartado. Días enteros, hacia abajo. */
export function diasParaVencer(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return 'Venció';
  const dias = Math.floor(ms / 86_400_000);
  if (dias === 0) return 'Vence hoy';
  return dias === 1 ? 'Queda 1 día' : `Quedan ${dias} días`;
}
