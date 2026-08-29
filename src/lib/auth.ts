import { supabase } from './supabase';
import type { Perfil } from './tipos';

/**
 * Supabase Auth trabaja con correo + contrasena. Aqui se arma un correo
 * sintetico a partir del nombre de usuario que la gente escribe en la tienda.
 */
export const DOMINIO_SINTETICO = 'lux.local';

export const USUARIOS_CONOCIDOS = ['admin', 'socio', 'vendedora'] as const;

export function correoDesdeUsuario(usuario: string): string {
  return `${usuario.trim().toLowerCase()}@${DOMINIO_SINTETICO}`;
}

/**
 * Contrasena derivada del PIN de la vendedora.
 *
 * SE HONESTO CON ESTO: un PIN de 4 digitos son 10.000 combinaciones y este
 * sitio es estatico, asi que cualquiera puede leer esta funcion en el bundle y
 * probarlas todas contra Supabase. No es un secreto fuerte y no pretende serlo.
 *
 * Lo que lo hace aceptable:
 *  - Los administradores NO usan PIN: usan contrasena larga real. Los costos,
 *    los lotes y los margenes viven detras de esa puerta, no de esta.
 *  - El alcance maximo de la vendedora es leer `v_catalogo_venta` y registrar
 *    ventas. No puede leer costos ni borrar nada: lo impide RLS, no el PIN.
 *  - Hay que activar el rate limiting de Auth en Supabase.
 *  - Hay que rotar el PIN cuando cambie el personal.
 *
 * No agregues validaciones en el navegador para "compensar" esto. No compensan.
 *
 * OJO: si cambias esta receta, cambia tambien scripts/derivar-pin.mjs, que es
 * lo que usa el admin para saber que contrasena ponerle al usuario en Supabase.
 */
export function contrasenaDesdePin(pin: string): string {
  return `lux.${pin.trim()}.emory`;
}

export const LARGO_PIN = 4;

/**
 * Entrar con un solo codigo, sin escribir usuario.
 *
 * Cada persona tiene su codigo y el sistema deduce quien es probandolo
 * contra los usuarios en orden. Un codigo de cuatro digitos es el de
 * mostrador, asi que se prueba primero por ahi; cualquier otra cosa se
 * prueba primero como administrador. Son dos intentos en el peor caso.
 *
 * AVISO IMPORTANTE: quitar el campo de usuario no cambia la seguridad,
 * pero el LARGO del codigo si. El administrador ve costos, margenes y
 * puede borrar inventario, y este sitio es estatico: su codigo tiene que
 * seguir siendo largo y no solo digitos. Un codigo numerico de seis
 * cifras son un millon de combinaciones, y eso se prueba entero.
 */
const CANDIDATOS: { usuario: string; derivar: (codigo: string) => string }[] = [
  { usuario: 'admin',     derivar: (c) => c },
  { usuario: 'socio',     derivar: (c) => c },
  { usuario: 'vendedora', derivar: contrasenaDesdePin },
];

export async function entrarConCodigo(codigo: string) {
  const limpio = codigo.trim();
  if (!limpio) {
    return { error: { message: 'Escribe tu codigo.' } as { message: string } };
  }

  // Un PIN de cuatro digitos es del mostrador: se prueba de primero.
  const esPin = /^d{4}$/.test(limpio);
  const orden = esPin
    ? [...CANDIDATOS].sort((a) => (a.usuario === 'vendedora' ? -1 : 1))
    : CANDIDATOS;

  let ultimo: { message: string } | null = null;
  for (const c of orden) {
    const { error } = await supabase.auth.signInWithPassword({
      email: correoDesdeUsuario(c.usuario),
      password: c.derivar(limpio),
    });
    if (!error) return { error: null };
    ultimo = error;
  }
  return { error: ultimo };
}

export async function cerrarSesion() {
  return supabase.auth.signOut();
}

/** Lee el perfil del usuario en sesion. `perfiles` deja ver la fila propia. */
export async function cargarPerfil(userId: string): Promise<Perfil | null> {
  const { data, error } = await supabase
    .from('perfiles')
    .select('id, nombre, rol, activo')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return (data as Perfil | null) ?? null;
}
