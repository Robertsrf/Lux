import { supabase } from './supabase';
import type { Perfil } from './tipos';

/**
 * Supabase Auth trabaja con correo + contrasena. Aqui se arma un correo
 * sintetico a partir del nombre de usuario que la gente escribe en la tienda.
 */
const DOMINIO_SINTETICO = 'lux.local';

function correoDesdeUsuario(usuario: string): string {
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
 *  - Las vendedoras que crea el administrador desde su pantalla llevan PIN
 *    de SEIS digitos (un millon de combinaciones por cuenta): con varias
 *    vendedoras hay varias puertas. Los cuatro digitos quedan solo para la
 *    cuenta de antes, hasta que el dueno le de su codigo propio.
 *
 * No agregues validaciones en el navegador para "compensar" esto. No compensan.
 *
 * OJO: si cambias esta receta, cambia tambien scripts/derivar-pin.mjs (la
 * vendedora de antes) y supabase/functions/vendedoras (las del local, que
 * crea el administrador desde su pantalla). Si no coinciden, nadie entra.
 */
function contrasenaDesdePin(pin: string): string {
  return `lux.${pin.trim()}.emory`;
}

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

  // Ocho dígitos: una vendedora del local. Los dos primeros son su número
  // (su cuenta es vendedora03@lux.local) y los seis últimos, su PIN. Se
  // prueba SOLO esa cuenta: si se probaran también las de administrador,
  // cada error al teclear les sumaría un intento fallido.
  if (/^\d{8}$/.test(limpio)) {
    const { error } = await supabase.auth.signInWithPassword({
      email: correoDesdeUsuario(`vendedora${limpio.slice(0, 2)}`),
      password: contrasenaDesdePin(limpio.slice(2)),
    });
    return { error: error ?? null };
  }

  // Un PIN de cuatro digitos es del mostrador: se prueba de primero.
  //
  // OJO CON LA BARRA INVERTIDA. Aqui decia /^d{4}$/, que busca la palabra
  // literal "dddd" y jamas coincide con un PIN. El efecto no era una pantalla
  // rota sino algo peor de ver: la vendedora entraba igual, pero su codigo se
  // probaba primero como contrasena de admin y de socio. Tres viajes en vez de
  // uno, y dos cuentas de administrador acumulando intentos fallidos.
  const esPin = /^\d{4}$/.test(limpio);
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
