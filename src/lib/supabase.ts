import { createClient } from '@supabase/supabase-js';

// La anon key es publica por diseno: el sitio es estatico y cualquiera puede
// leerla del bundle. La seguridad real vive en las politicas RLS de Supabase.
// La service_role key JAMAS entra al repo ni al navegador.
const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const hayConfiguracion = Boolean(url && anon);

export const supabase = createClient(url || 'https://sin-configurar.supabase.co', anon || 'sin-configurar', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

/** Mensaje de error legible a partir de lo que devuelve Supabase. */
export function mensajeDeError(error: unknown): string {
  if (!error) return 'Ocurrio un error sin detalle.';
  if (typeof error === 'string') return error;
  const e = error as { message?: string; details?: string; hint?: string; code?: string };
  if (e.code === '42501') {
    return 'Permiso denegado por la base de datos. Tu rol no puede hacer esta operacion.';
  }
  return e.message || e.details || e.hint || 'Ocurrio un error sin detalle.';
}
