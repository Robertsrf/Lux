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
  'costo_operativo_usd', 'costo_mercancia_bcv', 'costo_total_usd', 'factor_merma',
  'lote_id', 'lote_codigo', 'margen_usd', 'margen_pct', 'ganancia_real_usd',
  'descripcion', 'activo',
  'precio_minimo_usd', 'precio_minimo_bs', 'familia', 'variante',
].join(', ');

/**
 * Inventario del admin, paginado desde el inicio: el catalogo va camino a
 * 4.000 piezas y no se puede traer entero.
 */
export function useInventario(filtros: FiltrosInventario, pagina: number) {
  const [modelos, setModelos] = useState<ModeloAdmin[]>([]);
  const [existencias, setExistencias] = useState<Map<number, Existencia[]>>(new Map());
  // Lo apartado por pedidos, por pieza. Sin esto el inventario decia "5" y
  // el mostrador "Quedan 3 · 2 apartadas": dos cifras para la misma pieza.
  const [apartadas, setApartadas] = useState<Map<number, number>>(new Map());
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

      /*
        POR PRODUCTO, NO POR FILA.

        Una cadena de 45 cm y otra de 60 cm son un producto con dos
        variantes, y se ven juntas (Inventario.tsx). Si se paginara por
        fila, la de 45 podía quedar en una página y la de 60 en la
        siguiente. Así que primero se piden las familias que entran con los
        filtros (una columna, ligera, en orden de SKU) y la página son
        cincuenta PRODUCTOS; después, las filas de esos productos.
      */
      // Fuera lo que rompe un `or` de PostgREST: una coma o un paréntesis
      // escritos en el buscador ("anillo (dorado)") daban un error 400.
      const t = filtros.texto.trim().replace(/[%,()"\\:]/g, ' ');
      const familias: number[] = [];
      const vistas = new Set<number>();
      for (let desde = 0; desde < 8000; desde += 1000) {
        let ligera = supabase
          .from('v_catalogo_admin')
          .select('familia')
          .order('sku', { ascending: true })
          .range(desde, desde + 999);
        if (filtros.categoria) ligera = ligera.eq('categoria', filtros.categoria);
        if (filtros.grupoId) ligera = ligera.eq('grupo_precio_id', Number(filtros.grupoId));
        if (filtros.loteId) ligera = ligera.eq('lote_id', Number(filtros.loteId));
        if (idsEnUbicacion) ligera = ligera.in('id', idsEnUbicacion);
        if (t) ligera = ligera.or(`nombre.ilike.%${t}%,sku.ilike.%${t}%,variante.ilike.%${t}%`);
        const { data: lote, error: errLote } = await ligera;
        if (errLote) throw errLote;
        for (const f of (lote as { familia: number }[] | null) ?? []) {
          if (!vistas.has(f.familia)) { vistas.add(f.familia); familias.push(f.familia); }
        }
        if ((lote?.length ?? 0) < 1000) break;
      }

      const deLaPagina = familias.slice(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA);
      if (deLaPagina.length === 0) {
        setModelos([]); setExistencias(new Map()); setApartadas(new Map()); setTotal(familias.length); setCargando(false);
        return;
      }

      // Con los mismos filtros: si buscas "60 cm", sale la cadena con esa
      // medida, no todas las suyas.
      let consulta = supabase
        .from('v_catalogo_admin')
        .select(COLUMNAS)
        .in('familia', deLaPagina)
        .order('sku', { ascending: true });
      if (filtros.categoria) consulta = consulta.eq('categoria', filtros.categoria);
      if (filtros.grupoId) consulta = consulta.eq('grupo_precio_id', Number(filtros.grupoId));
      if (filtros.loteId) consulta = consulta.eq('lote_id', Number(filtros.loteId));
      if (idsEnUbicacion) consulta = consulta.in('id', idsEnUbicacion);
      if (t) consulta = consulta.or(`nombre.ilike.%${t}%,sku.ilike.%${t}%,variante.ilike.%${t}%`);

      const { data, error: err } = await consulta;
      if (err) throw err;

      // En el orden de las familias (el del SKU de su primera fila).
      const orden = new Map(deLaPagina.map((f, i) => [f, i]));
      const filas = ((data as unknown as ModeloAdmin[] | null) ?? [])
        .sort((a, b) => (orden.get(a.familia) ?? 0) - (orden.get(b.familia) ?? 0));
      setModelos(filas);
      setTotal(familias.length);

      // Existencias por ubicacion y lo apartado, solo de la pagina visible.
      const mapa = new Map<number, Existencia[]>();
      const porPieza = new Map<number, number>();
      if (filas.length > 0) {
        const ids = filas.map((m) => m.id);
        const [ex, libre] = await Promise.all([
          supabase.from('existencias').select('modelo_id, ubicacion_id, cantidad').in('modelo_id', ids),
          // La misma regla que el mostrador (`apartadas_de`, repartida por
          // ubicacion en `v_existencia_libre`): una cifra, un sitio.
          supabase.from('v_existencia_libre').select('modelo_id, apartadas').in('modelo_id', ids).gt('apartadas', 0),
        ]);
        if (ex.error) throw ex.error;
        if (libre.error) throw libre.error;
        for (const fila of (ex.data as Existencia[] | null) ?? []) {
          const lista = mapa.get(fila.modelo_id) ?? [];
          lista.push(fila);
          mapa.set(fila.modelo_id, lista);
        }
        for (const f of (libre.data as { modelo_id: number; apartadas: number }[] | null) ?? []) {
          porPieza.set(f.modelo_id, (porPieza.get(f.modelo_id) ?? 0) + f.apartadas);
        }
      }
      setExistencias(mapa);
      setApartadas(porPieza);
    } catch (e) {
      setError(mensajeDeError(e));
      setModelos([]);
      setExistencias(new Map());
      setApartadas(new Map());
      setTotal(0);
    } finally {
      setCargando(false);
    }
  }, [filtros.texto, filtros.categoria, filtros.grupoId, filtros.loteId, filtros.ubicacionId, pagina]);

  useEffect(() => { void recargar(); }, [recargar]);

  return { modelos, existencias, apartadas, total, cargando, error, recargar };
}
