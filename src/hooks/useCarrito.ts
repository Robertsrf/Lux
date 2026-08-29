import { useCallback, useMemo, useState } from 'react';
import { supabase, mensajeDeError } from '../lib/supabase';
import { aMonto, deMonto, porCantidad, sumar } from '../lib/dinero';
import type { LineaCarrito, MetodoPago, ModeloEnUbicacion, TipoVenta } from '../lib/tipos';

/**
 * Carrito del mostrador. Vive solo en memoria: la venta se vuelve real
 * cuando la funcion `registrar_venta` la escribe en una sola transaccion.
 * Aqui no se calcula ningun costo ni margen; la vendedora no los ve.
 */
export function useCarrito() {
  const [lineas, setLineas] = useState<LineaCarrito[]>([]);
  const [cobrando, setCobrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const agregar = useCallback((m: ModeloEnUbicacion) => {
    setError(null);
    setLineas((prev) => {
      const i = prev.findIndex((l) => l.modelo_id === m.modelo_id && l.ubicacion_id === m.ubicacion_id);
      if (i >= 0) {
        const linea = prev[i]!;
        if (linea.cantidad >= linea.disponible) return prev;
        const copia = [...prev];
        copia[i] = { ...linea, cantidad: linea.cantidad + 1 };
        return copia;
      }
      return [...prev, {
        modelo_id: m.modelo_id,
        ubicacion_id: m.ubicacion_id,
        sku: m.sku,
        nombre: m.nombre,
        foto_thumb_path: m.foto_thumb_path,
        precio_usd: m.precio_usd ?? 0,
        precio_bs: m.precio_bs ?? 0,
        cantidad: 1,
        disponible: m.cantidad,
      }];
    });
  }, []);

  const cambiarCantidad = useCallback((modeloId: number, ubicacionId: number, cantidad: number) => {
    setLineas((prev) => prev.flatMap((l) => {
      if (l.modelo_id !== modeloId || l.ubicacion_id !== ubicacionId) return [l];
      const n = Math.max(0, Math.min(cantidad, l.disponible));
      return n === 0 ? [] : [{ ...l, cantidad: n }];
    }));
  }, []);

  const vaciar = useCallback(() => { setLineas([]); setError(null); }, []);

  const totales = useMemo(() => {
    const bs = sumar(lineas.map((l) => porCantidad(aMonto(l.precio_bs), l.cantidad)));
    const usd = sumar(lineas.map((l) => porCantidad(aMonto(l.precio_usd), l.cantidad)));
    return {
      piezas: lineas.reduce((n, l) => n + l.cantidad, 0),
      totalBs: deMonto(bs),
      totalUsd: deMonto(usd),
    };
  }, [lineas]);

  /** Una sola llamada: venta, lineas y descuento de existencia o nada. */
  const cobrar = useCallback(async (metodo: MetodoPago, tipo: TipoVenta = 'detal', cliente?: { nombre?: string; telefono?: string }) => {
    if (lineas.length === 0) return { ok: false as const, error: 'El carrito esta vacio.' };
    setCobrando(true);
    setError(null);

    const { data, error: err } = await supabase.rpc('registrar_venta', {
      p_tipo: tipo,
      p_metodo: metodo,
      p_items: lineas.map((l) => ({ modelo_id: l.modelo_id, ubicacion_id: l.ubicacion_id, cantidad: l.cantidad })),
      p_kit_id: null,
      p_cliente_nombre: cliente?.nombre ?? null,
      p_cliente_telefono: cliente?.telefono ?? null,
      p_notas: null,
    });

    setCobrando(false);
    if (err) {
      const texto = mensajeDeError(err);
      setError(texto);
      return { ok: false as const, error: texto };
    }
    setLineas([]);
    return { ok: true as const, ventaId: data as number };
  }, [lineas]);

  return { lineas, agregar, cambiarCantidad, vaciar, totales, cobrar, cobrando, error };
}
