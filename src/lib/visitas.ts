import { supabase } from './supabase';

/**
 * Las visitas al catálogo en línea (esquema-visitas-catalogo.sql).
 *
 * Cada teléfono guarda un número al azar la primera vez que abre el
 * catálogo y lo manda en cada visita: la base cuenta una persona por día
 * y aparte cuántas veces lo abrió. No es un dato de nadie: ni nombre, ni
 * teléfono, ni cédula. Con sesión (alguien de la tienda) la base no cuenta.
 */

const CLAVE = 'lux-visitante';

function numeroAlAzar(): string {
  // randomUUID pide HTTPS y un navegador reciente. El teléfono de una
  // clienta puede ser viejo: se arma a mano con los mismos bytes al azar.
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function visitante(): string {
  try {
    const guardado = localStorage.getItem(CLAVE);
    if (guardado) return guardado;
    const nuevo = numeroAlAzar();
    localStorage.setItem(CLAVE, nuevo);
    return nuevo;
  } catch {
    // Navegación privada o almacenamiento bloqueado: cuenta como alguien
    // nuevo cada vez. Se pierde precisión, no el catálogo.
    return numeroAlAzar();
  }
}

/** La llama el catálogo al abrirse. Si falla, la clienta no se entera. */
export function registrarVisita(): void {
  void (async () => {
    try {
      await supabase.rpc('registrar_visita', { p_visitante: visitante() });
    } catch {
      // Sin red o sin la función todavía: el catálogo sigue igual.
    }
  })();
}
