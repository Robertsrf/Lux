import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, mensajeDeError } from '../lib/supabase';
import { aMonto, deMonto, descuentoPara, porCantidad, sumar } from '../lib/dinero';
import type { LineaCarrito, MetodoPago, ModeloEnUbicacion, TipoVenta, Tramo } from '../lib/tipos';

/**
 * Carrito del mostrador. Vive solo en memoria: la venta se vuelve real
 * cuando la funcion `registrar_venta` la escribe en una sola transaccion.
 * Aqui no se calcula ningun costo ni margen; la vendedora no los ve.
 *
 * EL DESCUENTO POR CANTIDAD SE APLICA SOLO
 * Antes el mayoreo era una pantalla aparte con kits armados a mano. Ahora
 * es una regla: 6 piezas 5 %, 12 piezas 10 %, 20 piezas 15 %. La vendedora
 * no cambia de pantalla ni se acuerda de nada; junta piezas y la rebaja
 * aparece.
 *
 * Lo que se calcula aqui es solo para que ella VEA lo mismo que va a
 * cobrar. Quien decide el precio de verdad es `registrar_venta`, y hace
 * exactamente esto mismo: el tramo por el total de piezas, sin bajar del
 * piso de cada pieza, y sin tocar las lineas que ella ya regateo.
 */
export function useCarrito() {
  const [lineas, setLineas] = useState<LineaCarrito[]>([]);
  const [tramos, setTramos] = useState<Tramo[]>([]);
  const [cobrando, setCobrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data, error: err } = await supabase
        .from('tramos_mayoreo')
        .select('id, min_piezas, descuento_pct, activo')
        .eq('activo', true)
        .order('min_piezas');
      // Si la escalera no llega, se cobra al detal y se dice. Callarlo
      // seria cobrarle de mas a una clienta sin que nadie se entere.
      if (err) setError('No se pudo leer la escalera de descuentos: ' + mensajeDeError(err));
      else setTramos((data as Tramo[] | null) ?? []);
    })();
  }, []);

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
        precio_lista_bs: m.precio_bs ?? 0,
        precio_minimo_bs: m.precio_minimo_bs ?? m.precio_bs ?? 0,
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

  /**
   * Rebaja para cerrar el trato. La vendedora escribe bolivares, que es
   * como habla con la clienta; el precio ancla sigue siendo el de etiqueta
   * en dolares BCV, asi que se convierte de vuelta al enviar.
   *
   * Este tope es una comodidad, no una proteccion: quien mande la venta
   * por su cuenta se lo salta. El piso de verdad lo valida la base.
   */
  const cambiarPrecio = useCallback((modeloId: number, ubicacionId: number, precioBs: number, tasaBcv: number) => {
    setLineas((prev) => prev.map((l) => {
      if (l.modelo_id !== modeloId || l.ubicacion_id !== ubicacionId) return l;
      const acotado = Math.min(Math.max(precioBs, l.precio_minimo_bs), l.precio_lista_bs);
      return { ...l, precio_bs: acotado, precio_usd: tasaBcv > 0 ? acotado / tasaBcv : l.precio_usd };
    }));
  }, []);

  const vaciar = useCallback(() => { setLineas([]); setError(null); }, []);

  const totales = useMemo(() => {
    const piezas = lineas.reduce((n, l) => n + l.cantidad, 0);
    const descuento = descuentoPara(tramos, piezas);

    // Mismo orden de decisiones que `registrar_venta`, a proposito:
    //   1. Si ella escribio un precio, ese manda y el tramo no se suma.
    //   2. Si no, el tramo sobre el precio de lista.
    //   3. Nunca por debajo del piso de esa pieza.
    const conTramo = lineas.map((l) => {
      const regateada = l.precio_bs < l.precio_lista_bs;
      if (regateada || !descuento) return { ...l, precio_final_bs: l.precio_bs };
      const rebajado = l.precio_lista_bs * (1 - descuento / 100);
      return { ...l, precio_final_bs: Math.max(rebajado, l.precio_minimo_bs) };
    });

    const bs = sumar(conTramo.map((l) => porCantidad(aMonto(l.precio_final_bs), l.cantidad)));
    const lista = sumar(lineas.map((l) => porCantidad(aMonto(l.precio_lista_bs), l.cantidad)));
    // Los dolares salen de la misma proporcion de cada linea, que es exacta
    // en los dos casos: la regateada tiene factor 1 y la rebajada lleva el
    // mismo recorte que sus bolivares.
    const usd = sumar(conTramo.map((l) => porCantidad(
      aMonto(l.precio_bs > 0 ? l.precio_usd * (l.precio_final_bs / l.precio_bs) : l.precio_usd),
      l.cantidad,
    )));

    const siguiente = tramos
      .filter((t) => t.activo && t.min_piezas > piezas)
      .sort((a, b) => a.min_piezas - b.min_piezas)[0] ?? null;

    return {
      piezas,
      totalBs: deMonto(bs),
      totalUsd: deMonto(usd),
      descuento,
      ahorroBs: deMonto(lista) - deMonto(bs),
      siguiente: siguiente ? { faltan: siguiente.min_piezas - piezas, pct: siguiente.descuento_pct } : null,
      lineas: conTramo,
    };
  }, [lineas, tramos]);

  /** Una sola llamada: venta, lineas y descuento de existencia o nada. */
  const cobrar = useCallback(async (metodo: MetodoPago, tipo: TipoVenta = 'detal', cliente?: { nombre?: string; telefono?: string }) => {
    if (lineas.length === 0) return { ok: false as const, error: 'El carrito esta vacio.' };
    setCobrando(true);
    setError(null);

    const { data, error: err } = await supabase.rpc('registrar_venta', {
      p_tipo: tipo,
      p_metodo: metodo,
      p_items: lineas.map((l) => ({
        modelo_id: l.modelo_id,
        ubicacion_id: l.ubicacion_id,
        cantidad: l.cantidad,
        // Solo se manda si ELLA rebajo a mano. El descuento por cantidad no
        // se manda: lo calcula `registrar_venta` con la escalera de la base,
        // que es la unica que manda. Mandarlo desde aqui seria dejar que el
        // navegador decidiera el precio.
        precio_unitario_usd: l.precio_bs < l.precio_lista_bs ? Number(l.precio_usd.toFixed(4)) : null,
      })),
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

  return { lineas, agregar, cambiarCantidad, cambiarPrecio, vaciar, totales, cobrar, cobrando, error };
}
