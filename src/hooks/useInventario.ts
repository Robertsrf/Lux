import { useCallback, useEffect, useState } from 'react';
import { supabase, mensajeDeError } from '../lib/supabase';
import type { Existencia, ModeloAdmin } from '../lib/tipos';

export const POR_PAGINA = 50;

export interface FiltrosInventario {
  texto: string;
  categoria: string;
  grupoId: string;
  loteId: string;
  ubicacionId: string;
}

export const FILTROS_VACIOS: FiltrosInventario = {
  texto: '',
  categoria: '',
  grupoId: '',
  loteId: '',
  ubicacionId: '',
};

// Se seleccionan solo las columnas que la tabla muestra. Nunca select('*').
const COLUMNAS = [
  'id', 'sku', 'nombre', 'categoria', 'variantes_nota',
  'foto_thumb_path', 'foto_path', 'grupo', 'grupo_precio_id',
  'precio_usd', 'precio_bs', 'precio_usd_real', 'precio_override_usd', 'existencia_total',
  'costo_unitario_usd', 'flete_unitario_usd', 'costo_puesto_usd',
  'peso_unitario_g', 'lote_id', 'lote_codigo', 'margen_usd', 'margen_pct',
  'descripcion', 'activo',
].join(', ');

/**
 * Inventario del admin, paginado desde el inicio: el catalogo va camino a
 * 4.000 piezas y no se puede traer entero.
 */
export function useInventario(filtros: FiltrosInventario, pagina: number) {
  const [modelos, setModelos] = useState<ModeloAdmin[]>([]);
  const [existencias, setExistencias] = useState<Map<number, Existencia[]>>(new Map());
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    setCargando(true);
    setError(null);

    try {
      // El filtro por ubicacion vive en `existencias`, no en la vista:
      // primero se resuelve que modelos estan en esa ubicacion.
      let idsEnUbicacion: number[] | null = null;
      if (filtros.ubicacionId) {
        const { data, error: err } = await supabase
          .from('existencias')
          .select('modelo_id')
          .eq('ubicacion_id', Number(filtros.ubicacionId))
          .gt('cantidad', 0);
        if (err) throw err;
        idsEnUbicacion = (data ?? []).map((f) => (f as { modelo_id: number }).modelo_id);
        if (idsEnUbicacion.length === 0) {
          setModelos([]); setExistencias(new Map()); setTotal(0); setCargando(false);
          return;
        }
      }

      let consulta = supabase
        .from('v_catalogo_admin')
        .select(COLUMNAS, { count: 'exact' })
        .order('sku', { ascending: true })
        .range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA - 1);

      if (filtros.categoria) consulta = consulta.eq('categoria', filtros.categoria);
      if (filtros.grupoId) consulta = consulta.eq('grupo_precio_id', Number(filtros.grupoId));
      if (filtros.loteId) consulta = consulta.eq('lote_id', Number(filtros.loteId));
      if (idsEnUbicacion) consulta = consulta.in('id', idsEnUbicacion);
      if (filtros.texto.trim()) {
        const t = filtros.texto.trim().replace(/[%,]/g, ' ');
        consulta = consulta.or(`nombre.ilike.%${t}%,sku.ilike.%${t}%`);
      }

      const { data, error: err, count } = await consulta;
      if (err) throw err;

      const filas = (data as unknown as ModeloAdmin[] | null) ?? [];
      setModelos(filas);
      setTotal(count ?? filas.length);

      // Existencias por ubicacion, solo de la pagina visible.
      const mapa = new Map<number, Existencia[]>();
      if (filas.length > 0) {
        const { data: ex, error: errEx } = await supabase
          .from('existencias')
          .select('modelo_id, ubicacion_id, cantidad')
          .in('modelo_id', filas.map((m) => m.id));
        if (errEx) throw errEx;
        for (const fila of (ex as Existencia[] | null) ?? []) {
          const lista = mapa.get(fila.modelo_id) ?? [];
          lista.push(fila);
          mapa.set(fila.modelo_id, lista);
        }
      }
      setExistencias(mapa);
    } catch (e) {
      setError(mensajeDeError(e));
      setModelos([]);
      setExistencias(new Map());
      setTotal(0);
    } finally {
      setCargando(false);
    }
  }, [filtros.texto, filtros.categoria, filtros.grupoId, filtros.loteId, filtros.ubicacionId, pagina]);

  useEffect(() => { void recargar(); }, [recargar]);

  return { modelos, existencias, total, cargando, error, recargar };
}
