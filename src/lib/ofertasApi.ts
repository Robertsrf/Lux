import { supabase } from './supabase';
import { visitante } from './visitas';
import type { CodigoOferta, ComboAdmin, OfertaCasaAdmin, OfertasPublicas, OrigenOferta, PiezaOferta } from './ofertas';

/**
 * Las llamadas de las ofertas (esquema-landing-y-ofertas.sql). Toda falla
 * se absorbe donde la clienta no tiene que enterarse: sin el SQL o sin red,
 * la página se ve como siempre, sin ofertas.
 */

/** Las ofertas del momento, de `ofertas_publicas()`. Null si no existe o falla. */
export async function cargarOfertasPublicas(): Promise<OfertasPublicas | null> {
  try {
    const { data, error } = await supabase.rpc('ofertas_publicas');
    if (error || !data || typeof data !== 'object') return null;
    const o = data as Partial<OfertasPublicas>;
    return {
      encendidas: o.encendidas === true,
      pareja_pct: o.pareja_pct ?? null,
      mirada_segundos: o.mirada_segundos ?? null,
      dias_validez: o.dias_validez ?? null,
      combos: o.combos ?? [],
      regalo: o.regalo ?? [],
      seleccion: o.seleccion ?? null,
      casa: o.casa ?? [],
      en_oferta: o.en_oferta ?? [],
    };
  } catch {
    return null;
  }
}

/**
 * Pide un código. La base responde con un mensaje pensado para la clienta
 * cuando no se puede (se acabaron los del día, una pieza ya no está...):
 * aquí sube tal cual como el mensaje del error.
 */
export async function emitirOferta(
  origen: OrigenOferta,
  modelos: number[],
  ref?: number,
): Promise<CodigoOferta> {
  const { data, error } = await supabase.rpc('emitir_oferta', {
    p_origen: origen,
    p_modelos: modelos,
    p_ref: ref ?? null,
    p_visitante: visitante(),
  });
  if (error || !data) {
    throw new Error(error?.message || 'No pudimos darte el código ahora. Inténtalo de nuevo en un momento.');
  }
  return data as CodigoOferta;
}

/** Una pieza de un código tal como la ve la tienda: con bolívares y dónde está. */
export interface PiezaVerOferta extends PiezaOferta {
  precio_lista_bs: number;
  precio_oferta_bs: number;
  libre: number;
  disponible: boolean;
  ubicaciones: { ubicacion_id: number; nombre: string; libre: number }[];
}

export type EstadoVerOferta =
  | 'sirve' | 'usado' | 'vencido' | 'anulado' | 'no_existe' | 'pieza_no_disponible';

export interface VerOferta {
  codigo: string;
  estado: EstadoVerOferta;
  origen: OrigenOferta | null;
  pct: number | null;
  vence_en: string | null;
  usado_en: string | null;
  venta_id: number | null;
  reserva_id: number | null;
  anulado_en: string | null;
  anulado_motivo: string | null;
  piezas: PiezaVerOferta[];
}

/** Lo que dice un código, para el mostrador (solo personal de la tienda). */
export async function verOferta(codigo: string): Promise<VerOferta> {
  const { data, error } = await supabase.rpc('ver_oferta', { p_codigo: codigo });
  if (error || !data) throw new Error(error?.message || 'No pudimos mirar ese código.');
  return data as VerOferta;
}

export interface MiradaEnviada {
  modelo_id: number;
  segundos: number;
  veces: number;
}

/**
 * Manda lo que se miró. Se llama al pasar la pestaña a segundo plano, cuando
 * el navegador puede cortar la página: por eso `fetch` con `keepalive` y no
 * una llamada del cliente, que se podría cancelar. Nunca falla hacia afuera.
 * En desarrollo no cuenta (como las visitas).
 */
export function registrarMiradas(miradas: MiradaEnviada[]): void {
  if (import.meta.env.DEV || miradas.length === 0) return;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon) return;
  try {
    void fetch(`${url}/rest/v1/rpc/registrar_miradas`, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        apikey: anon,
        Authorization: `Bearer ${anon}`,
      },
      body: JSON.stringify({
        p_visitante: visitante(),
        p_miradas: miradas.slice(0, 50),
      }),
    }).catch(() => undefined);
  } catch {
    // Sin red o sin la función todavía: la página sigue igual.
  }
}

/**
 * Todas las ofertas de la casa, para el panel (`v_ofertas_casa_admin`, #66).
 * Null si la vista no existe todavia (sin el #66) o falla: el panel se
 * queda con lo que `ofertas_publicas()` enseña.
 */
export async function cargarOfertasCasaAdmin(): Promise<OfertaCasaAdmin[] | null> {
  try {
    const { data, error } = await supabase
      .from('v_ofertas_casa_admin')
      .select('id, nombre, texto, foto, pct, desde, hasta, activa, vigente_hoy, piezas, codigos_dados, codigos_usados')
      .order('hasta', { ascending: false });
    if (error || !Array.isArray(data)) return null;
    return data as unknown as OfertaCasaAdmin[];
  } catch {
    return null;
  }
}

/** Los combos de la ultima vez que se rearmaron, con las ofertas apagadas o no (#66). Null sin el #66. */
export async function cargarCombosAdmin(): Promise<ComboAdmin[] | null> {
  try {
    const { data, error } = await supabase
      .from('v_combos_admin')
      .select('id, pct, n_piezas, se_ensena_hoy, armado_en, piezas, total_lista_usd, total_oferta_usd, codigos_dados, codigos_usados')
      .order('orden');
    if (error || !Array.isArray(data)) return null;
    return data as unknown as ComboAdmin[];
  } catch {
    return null;
  }
}
