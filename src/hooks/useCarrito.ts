import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, mensajeDeError } from '../lib/supabase';
import {
  aCuatroDecimales, aMonto, bcvDesdeBs, binanceDesdeBs, bsDeBcv, deMonto,
  descuentoPara, porCantidad, precioConTramo, sumar,
} from '../lib/dinero';
import type { Tasas } from '../lib/dinero';
import type { ClienteDeVenta, LineaCarrito, LineaCobro, MetodoPago, ModeloEnUbicacion, TipoVenta, Tramo } from '../lib/tipos';

/**
 * Carrito del mostrador. Vive solo en memoria: la venta se vuelve real
 * cuando la funcion `registrar_venta` la escribe en una sola transaccion.
 * Aqui no se calcula ningun costo ni margen; la vendedora no los ve.
 *
 * EL DESCUENTO POR CANTIDAD SE APLICA SOLO
 * 6 piezas 5 %, 12 piezas 10 %, 20 piezas 15 % (o lo que el dueno ponga en
 * Tramos). La vendedora no cambia de pantalla ni se acuerda de nada: junta
 * piezas y la rebaja aparece.
 *
 * Y DURANTE SEMANAS NO APARECIO. El mostrador no le pedia a la base el
 * precio minimo de cada pieza; sin el, el carrito creia que el minimo era la
 * etiqueta, y el tramo "nunca por debajo del minimo" se quedaba en cero. De
 * paso, cada pieza decia "no admite rebaja". Ahora las dos cifras llegan, y
 * el tramo usa la que le toca: el piso de MARGEN, no el del regateo.
 *
 * CON TRAMO MANDA EL TRAMO
 * El regateo es para cerrar una venta chica. Desde el primer tramo, lo que
 * ella haya escrito a mano deja de contar y se cobra el tramo; si quita
 * piezas y baja de ahi, su precio vuelve. Asi lo decidio el dueno, y asi lo
 * hace `registrar_venta`.
 *
 * Lo que se calcula aqui es solo para que ella VEA lo mismo que va a
 * cobrar. Quien decide el precio es la base, con la misma cuenta, en el
 * mismo orden y con el mismo redondeo (`precioConTramo`, `bsDeBcv`).
 */
export function useCarrito(tasa: Tasas | null) {
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
      // Si la escalera no llega, se dice. Callarlo seria ensenar un total
      // sin descuento mientras la base cobra otro.
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
      const lista = m.precio_usd ?? 0;
      return [...prev, {
        modelo_id: m.modelo_id,
        ubicacion_id: m.ubicacion_id,
        sku: m.sku,
        nombre: m.nombre,
        variante: m.variante ?? null,
        foto_thumb_path: m.foto_thumb_path,
        precio_lista_usd: lista,
        precio_lista_bs: m.precio_bs ?? 0,
        // Sin piso, ni regateo ni tramo: se cobra la etiqueta. Es lo mismo
        // que hace la base con un `coalesce(piso, lista)`.
        precio_minimo_usd: m.precio_minimo_usd ?? lista,
        precio_minimo_bs: m.precio_minimo_bs ?? m.precio_bs ?? 0,
        piso_tramo_usd: m.piso_tramo_usd ?? lista,
        precio_manual_usd: null,
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
   * Rebaja para cerrar el trato. Ella escribe bolivares, que es como habla
   * con la clienta; se guarda en dolares BCV, que es lo que manda la venta.
   *
   * En el minimo exacto se guarda el minimo en dolares tal cual llego de la
   * base, no la vuelta de los bolivares: dividir y redondear dejaba el
   * precio una diezmilesima por debajo del piso y la venta se rechazaba
   * justo en la cifra que la pantalla ofrecia.
   *
   * El tope es una comodidad, no una proteccion: el piso de verdad lo
   * valida `registrar_venta`.
   */
  const cambiarPrecio = useCallback((modeloId: number, ubicacionId: number, precioBs: number) => {
    const tasaBcv = tasa?.tasa_bcv ?? null;
    setLineas((prev) => prev.map((l) => {
      if (l.modelo_id !== modeloId || l.ubicacion_id !== ubicacionId) return l;
      if (!Number.isFinite(precioBs) || precioBs <= 0 || precioBs >= l.precio_lista_bs) {
        return { ...l, precio_manual_usd: null };
      }
      if (precioBs <= l.precio_minimo_bs) return { ...l, precio_manual_usd: l.precio_minimo_usd };
      const usd = bcvDesdeBs(precioBs, tasaBcv);
      return { ...l, precio_manual_usd: usd === null ? null : aCuatroDecimales(usd) };
    }));
  }, [tasa?.tasa_bcv]);

  const vaciar = useCallback(() => { setLineas([]); setError(null); }, []);

  const totales = useMemo(() => {
    const piezas = lineas.reduce((n, l) => n + l.cantidad, 0);
    const descuento = descuentoPara(tramos, piezas);
    const tasaBcv = tasa?.tasa_bcv ?? null;

    // Mismo orden de decisiones que `registrar_venta`, a proposito:
    //   1. Con tramo, el tramo, sin bajar del piso de margen.
    //   2. Sin tramo, lo que ella negocio, si negocio.
    //   3. Si no, la etiqueta.
    const calculadas: LineaCobro[] = lineas.map((l) => {
      let usd = l.precio_lista_usd;
      let motivo: LineaCobro['motivo'] = null;
      if (descuento) {
        usd = precioConTramo(l.precio_lista_usd, descuento, l.piso_tramo_usd);
        if (usd < l.precio_lista_usd) motivo = 'tramo';
      } else if (l.precio_manual_usd !== null && l.precio_manual_usd < l.precio_lista_usd) {
        usd = l.precio_manual_usd;
        motivo = 'regateo';
      }
      // A etiqueta, los bolivares de la vista tal cual; rebajada, la misma
      // cuenta de la base: round(dolares x tasa BCV, 2).
      const bs = motivo !== null && tasaBcv ? bsDeBcv(usd, tasaBcv) : l.precio_lista_bs;
      return { ...l, precio_final_usd: usd, precio_final_bs: bs, motivo };
    });

    const bs = deMonto(sumar(calculadas.map((l) => porCantidad(aMonto(l.precio_final_bs), l.cantidad))));
    const lista = deMonto(sumar(lineas.map((l) => porCantidad(aMonto(l.precio_lista_bs), l.cantidad))));
    const regateadas = calculadas.filter((l) => l.motivo === 'regateo');

    const activos = tramos.filter((t) => t.activo).sort((a, b) => a.min_piezas - b.min_piezas);
    const siguiente = activos.find((t) => t.min_piezas > piezas) ?? null;

    return {
      piezas,
      totalBs: bs,
      /** En dolares BCV: lo que dice la etiqueta. */
      totalBcv: bcvDesdeBs(bs, tasaBcv),
      /** En dolares Binance: lo que cobra si le pagan en dolares o por Binance. */
      totalBinance: binanceDesdeBs(bs, tasa?.tasa_venta ?? null),
      descuento,
      ahorroBs: lista - bs,
      /** Lo que ella rebajo a mano, en bolivares. Cero con tramo. */
      regateoBs: deMonto(sumar(regateadas.map((l) => porCantidad(aMonto(l.precio_lista_bs - l.precio_final_bs), l.cantidad)))),
      /** Desde cuantas piezas empieza el primer tramo: ahi el regateo deja de contar. */
      primerTramo: activos[0]?.min_piezas ?? null,
      siguiente: siguiente ? { faltan: siguiente.min_piezas - piezas, pct: siguiente.descuento_pct } : null,
      lineas: calculadas,
    };
  }, [lineas, tramos, tasa?.tasa_bcv, tasa?.tasa_venta]);

  /**
   * Una sola llamada: venta, lineas, descuento de existencia y la ficha de
   * la clienta, o nada. La clienta entra en la misma transaccion a
   * proposito: si la venta se cae por existencia, no queda una ficha de una
   * compra que nunca ocurrio.
   */
  const cobrar = useCallback(async (metodo: MetodoPago, tipo: TipoVenta = 'detal', cliente?: ClienteDeVenta | null) => {
    if (lineas.length === 0) return { ok: false as const, error: 'El carrito esta vacio.' };
    setCobrando(true);
    setError(null);

    const conTramo = descuentoPara(tramos, lineas.reduce((n, l) => n + l.cantidad, 0)) !== null;

    const { data, error: err } = await supabase.rpc('registrar_venta', {
      p_tipo: tipo,
      p_metodo: metodo,
      p_items: lineas.map((l) => ({
        modelo_id: l.modelo_id,
        ubicacion_id: l.ubicacion_id,
        cantidad: l.cantidad,
        // Solo se manda lo que ELLA negocio, y solo sin tramo. El descuento
        // por cantidad no se manda: lo calcula la base con su escalera, que
        // es la unica que manda. Mandarlo desde aqui seria dejar que el
        // navegador decidiera el precio.
        precio_unitario_usd: !conTramo && l.precio_manual_usd !== null && l.precio_manual_usd < l.precio_lista_usd
          ? l.precio_manual_usd
          : null,
      })),
      p_cliente_nombre: cliente?.nombre ?? null,
      p_cliente_telefono: cliente?.telefono ?? null,
      p_notas: null,
      p_cliente_id: cliente?.id ?? null,
      p_cliente_cedula: cliente?.cedula ?? null,
      p_cliente_apellido: cliente?.apellido ?? null,
    });

    setCobrando(false);
    if (err) {
      const texto = mensajeDeError(err);
      setError(texto);
      return { ok: false as const, error: texto };
    }
    setLineas([]);
    return { ok: true as const, ventaId: data as number };
  }, [lineas, tramos]);

  return { lineas, agregar, cambiarCantidad, cambiarPrecio, vaciar, totales, cobrar, cobrando, error };
}
