import { supabase } from './supabase';

/*
  LAS CUENTAS DE LAS VENDEDORAS DEL LOCAL

  Crearlas, cambiarles el PIN o pausarlas lo hace la función de servidor
  supabase/functions/vendedoras: pide la llave maestra de Supabase, que no
  puede vivir en un sitio estático. Aquí solo se la llama con la sesión del
  administrador, que ella comprueba antes de hacer nada.
*/

type Accion =
  | { accion: 'crear'; nombre: string; pin?: string | null }
  | { accion: 'pin'; id: string; pin?: string | null }
  | { accion: 'pausar' | 'activar'; id: string }
  | { accion: 'renombrar'; id: string; nombre: string };

export interface CodigoNuevo { id: string; numero: number; codigo: string }

/** Llama a la función y devuelve su respuesta, o lanza el error ya dicho. */
export async function cuentaVendedora<T = { ok: true }>(cuerpo: Accion): Promise<T> {
  const { data, error } = await supabase.functions.invoke('vendedoras', { body: cuerpo });
  if (!error) return data as T;

  // La función responde el porqué en { error }; supabase-js lo guarda en la
  // respuesta original. Sin publicar, el servidor contesta 404.
  const respuesta = (error as { context?: Response }).context;
  if (respuesta?.status === 404) {
    throw new Error('Falta publicar la función "vendedoras" en Supabase. INSTALACION.md dice cómo.');
  }
  let mensaje: string | null = null;
  try {
    const detalle = (await respuesta?.json()) as { error?: string } | undefined;
    mensaje = detalle?.error ?? null;
  } catch {
    // La respuesta no era JSON: vale el mensaje de supabase-js.
  }
  throw new Error(mensaje ?? (error.message || 'No se pudo hablar con el servidor.'));
}

/** "03 482915": el número y el PIN, separados para dictarlo. */
export function codigoLegible(codigo: string): string {
  return `${codigo.slice(0, 2)} ${codigo.slice(2)}`;
}
