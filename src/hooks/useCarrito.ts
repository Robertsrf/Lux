import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, mensajeDeError } from '../lib/supabase';
import {
  aCuatroDecimales, aMonto, bcvDesdeBs, binanceDesdeBs, bsDeBcv, deMonto,
  descuentosDeCarrito, leerBs, porCantidad, precioConTramo, sumar,
} from '../lib/dinero';
import type { Tasas } from '../lib/dinero';
import { codigosQueAplican } from '../lib/ofertas';
import type { CodigoOferta } from '../lib/ofertas';
import type { VerOferta } from '../lib/ofertasApi';
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
/** Quien se lo lleva, como lo piden las funciones de la base. */
function quienEs(cliente?: ClienteDeVenta | null) {
  return {
    p_cliente_nombre: cliente?.nombre ?? null,
    p_cliente_telefono: cliente?.telefono ?? null,
    p_cliente_id: cliente?.id ?? null,
    p_cliente_cedula: cliente?.cedula ?? null,
    p_cliente_apellido: cliente?.apellido ?? null,
  };
}

/** Sin nada fuera del catalogo. */
const SIN_EXTRA = { texto: '', nota: '' };

/*
  LOS CODIGOS DE OFERTA (esquema-landing-y-ofertas.sql)
  Una clienta llega con un codigo LUX-XXXXXX. La pantalla "Codigo" lo
  revisa (`ver_oferta`) y "Pasar al cobro" lo mete aqui junto con sus
  piezas. El carrito ensena el precio de oferta en las unidades que el
  codigo cubre; el resto de la linea va como siempre. Quien decide es la
  base (`registrar_venta` y `apartar_en_tienda` reciben `p_codigos`).
*/
const COLUMNAS_UBICACION = [
  'ubicacion_id', 'modelo_id', 'sku', 'nombre', 'categoria', 'variantes_nota',
  'foto_path', 'foto_thumb_path', 'grupo', 'precio_usd', 'precio_bs', 'cantidad',
  'precio_minimo_usd', 'precio_minimo_bs', 'familia', 'variante', 'piso_tramo_usd', 'piso_tramo_bs',
  'apartadas', 'armado',
].join(', ');

/** Lo que dice `ver_oferta`, en la forma que entiende la logica de ofertas. */
function comoCodigo(o: VerOferta): CodigoOferta {
  return { codigo: o.codigo, origen: o.origen ?? 'casa', pct: o.pct ?? 0, vence_en: o.vence_en ?? '', piezas: o.piezas };
}

/** Lo que cada linea cubre un codigo, para enseñarlo y para mandarlo. */
export type LineaCobroConCodigo = LineaCobro & {
  /** Unidades de esta linea que cubre un codigo. */
  cubiertas: number;
  /** El precio de cada unidad cubierta. */
  precio_oferta_bs: number;
  precio_oferta_usd: number;
  codigo: string | null;
};

/** Una linea del carrito, a partir de una fila de la vista del mostrador. */
function lineaDe(m: ModeloEnUbicacion, cantidad: number): LineaCarrito {
  const lista = m.precio_usd ?? 0;
  return {
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
    cantidad,
    disponible: m.cantidad,
    armado: m.armado ?? null,
  };
}

export function useCarrito(tasa: Tasas | null) {
  const [lineas, setLineas] = useState<LineaCarrito[]>([]);
  const [tramos, setTramos] = useState<Tramo[]>([]);
  const [cobrando, setCobrando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /*
    Lo que se suma fuera del catalogo: el dije que se le pone a una cadena.
    Se guarda tal como ella lo escribe, en bolivares, que es como lo dice y
    como lo congela la venta. No es una pieza: no cuenta para el tramo, no
    lleva descuento y no descuenta existencia.
  */
  const [extra, setExtra] = useState(SIN_EXTRA);
  // Los codigos de oferta que la clienta trajo, y por que se cayo el ultimo.
  const [codigos, setCodigos] = useState<VerOferta[]>([]);
  const [avisoCodigo, setAvisoCodigo] = useState<string | null>(null);

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
      return [...prev, lineaDe(m, 1)];
    });
  }, []);

  /**
   * Mete un codigo y sus piezas: de cada una, las unidades que le faltan al
   * carrito para cubrirlo, en la ubicacion con mas libres. Si una pieza no
   * alcanza, el codigo se cae solo con su aviso (ver el efecto de abajo).
   */
  const agregarCodigo = useCallback((o: VerOferta) => {
    if (o.estado !== 'sirve' || o.piezas.length === 0) return;
    setError(null);
    setAvisoCodigo(null);
    void (async () => {
      const { data, error: err } = await supabase
        .from('v_venta_ubicacion')
        .select(COLUMNAS_UBICACION)
        .in('modelo_id', o.piezas.map((p) => p.modelo_id))
        .gt('cantidad', 0);
      if (err) { setError('No se pudieron traer las piezas del código: ' + mensajeDeError(err)); return; }
      const filas = (data as unknown as ModeloEnUbicacion[] | null) ?? [];
      setLineas((prev) => {
        let sig = [...prev];
        for (const p of o.piezas) {
          const ya = sig.filter((l) => l.modelo_id === p.modelo_id).reduce((n, l) => n + l.cantidad, 0);
          let falta = Math.max(0, p.cantidad - ya);
          const donde = filas.filter((f) => f.modelo_id === p.modelo_id).sort((a, b) => b.cantidad - a.cantidad);
          for (const f of donde) {
            if (falta <= 0) break;
            const i = sig.findIndex((l) => l.modelo_id === f.modelo_id && l.ubicacion_id === f.ubicacion_id);
            const puestas = i >= 0 ? sig[i]!.cantidad : 0;
            const toma = Math.min(falta, f.cantidad - puestas);
            if (toma <= 0) continue;
            if (i >= 0) sig[i] = { ...sig[i]!, cantidad: puestas + toma };
            else sig = [...sig, lineaDe(f, toma)];
            falta -= toma;
          }
        }
        return sig;
      });
      setCodigos((prev) => (prev.some((c) => c.codigo === o.codigo) ? prev : [...prev, o]));
    })();
  }, []);

  /** Quita el codigo; sus piezas se quedan en el carrito, a su precio. */
  const quitarCodigo = useCallback((codigo: string) => {
    setCodigos((prev) => prev.filter((c) => c.codigo !== codigo));
    setAvisoCodigo(null);
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

  const vaciar = useCallback(() => { setLineas([]); setExtra(SIN_EXTRA); setCodigos([]); setAvisoCodigo(null); setError(null); }, []);

  const cambiarExtra = useCallback((cambio: Partial<typeof SIN_EXTRA>) => {
    setExtra((prev) => ({ ...prev, ...cambio }));
  }, []);
  const quitarExtra = useCallback(() => setExtra(SIN_EXTRA), []);

  const totales = useMemo(() => {
    const piezas = lineas.reduce((n, l) => n + l.cantidad, 0);
    // El tramo, linea por linea, como `tramo_de_carrito`: los dijes no
    // cuentan, y solo lo reciben los que van con una base.
    const tramo = descuentosDeCarrito(tramos, lineas);
    const descuento = tramo.descuento;
    const tasaBcv = tasa?.tasa_bcv ?? null;

    // Los codigos: cuales valen con ESTE carrito, y cuantas unidades cubre cada uno.
    const delCarrito = new Map<number, number>();
    for (const l of lineas) delCarrito.set(l.modelo_id, (delCarrito.get(l.modelo_id) ?? 0) + l.cantidad);
    const aplicados = codigosQueAplican(codigos.map(comoCodigo), delCarrito);
    const porCubrir = new Map<number, number>();

    // Mismo orden de decisiones que `registrar_venta`, a proposito:
    //   1. Con tramo, el tramo, sin bajar del piso de margen.
    //   2. Sin tramo, lo que ella negocio, si negocio.
    //   3. Si no, la etiqueta.
    const calculadas: LineaCobroConCodigo[] = lineas.map((l) => {
      let usd = l.precio_lista_usd;
      let motivo: LineaCobro['motivo'] = null;
      const descuentoLinea = tramo.porModelo.get(l.modelo_id) ?? null;

      // Con codigo, en las unidades que cubre manda el mayor descuento entre
      // el tramo y la oferta (no se suman), y el precio a mano se ignora.
      const aplica = aplicados.get(l.modelo_id);
      let cubiertas = 0;
      let ofertaUsd = 0;
      let ofertaBs = 0;
      if (aplica) {
        const quedan = porCubrir.get(l.modelo_id) ?? aplica.unidades;
        cubiertas = Math.min(l.cantidad, quedan);
        porCubrir.set(l.modelo_id, quedan - cubiertas);
      }
      if (cubiertas > 0) {
        const pieza = codigos.find((c) => c.codigo === aplica!.codigo)?.piezas.find((p) => p.modelo_id === l.modelo_id);
        if (descuentoLinea && descuentoLinea > aplica!.pct) {
          ofertaUsd = precioConTramo(l.precio_lista_usd, descuentoLinea, l.piso_tramo_usd);
          ofertaBs = tasaBcv ? bsDeBcv(ofertaUsd, tasaBcv) : l.precio_lista_bs;
        } else {
          ofertaUsd = pieza?.precio_oferta_usd ?? l.precio_lista_usd;
          ofertaBs = pieza?.precio_oferta_bs ?? l.precio_lista_bs;
        }
      }

      if (descuentoLinea) {
        usd = precioConTramo(l.precio_lista_usd, descuentoLinea, l.piso_tramo_usd);
        if (usd < l.precio_lista_usd) motivo = 'tramo';
      } else if (cubiertas === 0 && l.precio_manual_usd !== null && l.precio_manual_usd < l.precio_lista_usd) {
        usd = l.precio_manual_usd;
        motivo = 'regateo';
      }
      // A etiqueta, los bolivares de la vista tal cual; rebajada, la misma
      // cuenta de la base: round(dolares x tasa BCV, 2).
      const bs = motivo !== null && tasaBcv ? bsDeBcv(usd, tasaBcv) : l.precio_lista_bs;
      return {
        ...l, precio_final_usd: usd, precio_final_bs: bs, motivo, en_tramo: descuentoLinea !== null,
        cubiertas, precio_oferta_usd: ofertaUsd, precio_oferta_bs: ofertaBs, codigo: cubiertas > 0 ? aplica!.codigo : null,
      };
    });

    // Cada linea: las unidades con oferta a su precio y las demas al suyo.
    const subtotalDe = (l: LineaCobroConCodigo) => sumar([
      porCantidad(aMonto(l.precio_oferta_bs), l.cubiertas),
      porCantidad(aMonto(l.precio_final_bs), l.cantidad - l.cubiertas),
    ]);
    const piezasBs = deMonto(sumar(calculadas.map(subtotalDe)));
    const lista = deMonto(sumar(lineas.map((l) => porCantidad(aMonto(l.precio_lista_bs), l.cantidad))));
    const regateadas = calculadas.filter((l) => l.motivo === 'regateo');

    // Lo de fuera del catalogo va encima de las piezas, tal cual: la base
    // hace la misma suma (`total_bs` = piezas + extra).
    const extraEscrito = extra.texto.trim() !== '';
    const extraBs = extraEscrito ? leerBs(extra.texto) : null;
    const bs = deMonto(sumar([aMonto(piezasBs), aMonto(extraBs ?? 0)]));

    const activos = tramos.filter((t) => t.activo).sort((a, b) => a.min_piezas - b.min_piezas);
    // Lo que falta para el siguiente tramo se cuenta sin dijes.
    const siguiente = activos.find((t) => t.min_piezas > tramo.piezas) ?? null;

    return {
      piezas,
      /** Las que cuentan para el tramo: todas menos los dijes. */
      piezasTramo: tramo.piezas,
      totalBs: bs,
      /** En dolares BCV: lo que dice la etiqueta. */
      totalBcv: bcvDesdeBs(bs, tasaBcv),
      /** En dolares Binance: lo que cobra si le pagan en dolares o por Binance. */
      totalBinance: binanceDesdeBs(bs, tasa?.tasa_venta ?? null),
      /** Solo las piezas del catalogo, en dolares BCV: lo que se puede apartar. */
      piezasBcv: bcvDesdeBs(piezasBs, tasaBcv),
      /** Lo de fuera del catalogo, en bolivares. Cero si no hay. */
      extraBs: extraBs ?? 0,
      /** Lo mismo en dolares BCV, a la tasa de hoy. */
      extraBcv: bcvDesdeBs(extraBs ?? 0, tasaBcv),
      /** Escribio algo que no es una cifra: no se cobra hasta que lo arregle. */
      extraIlegible: extraEscrito && extraBs === null,
      /** Hay monto pero no dice que es: la base no lo acepta sin eso. */
      extraSinNota: extraBs !== null && extra.nota.trim() === '',
      descuento,
      ahorroBs: lista - piezasBs,
      /** Lo que ella rebajo a mano, en bolivares. Cero con tramo. */
      regateoBs: deMonto(sumar(regateadas.map((l) => porCantidad(aMonto(l.precio_lista_bs - l.precio_final_bs), l.cantidad)))),
      /** Desde cuantas piezas empieza el primer tramo: ahi el regateo deja de contar. */
      primerTramo: activos[0]?.min_piezas ?? null,
      siguiente: siguiente ? { faltan: siguiente.min_piezas - tramo.piezas, pct: siguiente.descuento_pct } : null,
      /** Cuantas unidades cubren los codigos puestos. */
      cubiertasPorCodigo: calculadas.reduce((n, l) => n + l.cubiertas, 0),
      /** Las piezas de dije que no van con una base: el tramo no les llega. */
      dijesSinBase: descuento
        ? calculadas.filter((l) => l.armado === 'dije' && !l.en_tramo).reduce((n, l) => n + l.cantidad, 0)
        : 0,
      lineas: calculadas,
    };
  }, [lineas, tramos, extra, codigos, tasa?.tasa_bcv, tasa?.tasa_venta]);

  /*
    Un codigo vale con TODAS sus piezas, en su cantidad. Si ella quita una
    (o baja las unidades por debajo de las del codigo, o otro codigo ya
    tomo esa pieza) el codigo se cae y se lo dice: no se cobra una oferta
    a medias. Las piezas se quedan, a su precio.
  */
  useEffect(() => {
    if (codigos.length === 0) return;
    const delCarrito = new Map<number, number>();
    for (const l of lineas) delCarrito.set(l.modelo_id, (delCarrito.get(l.modelo_id) ?? 0) + l.cantidad);
    const valen = new Set([...codigosQueAplican(codigos.map(comoCodigo), delCarrito).values()].map((a) => a.codigo));
    const caidos = codigos.filter((c) => !valen.has(c.codigo));
    if (caidos.length === 0) return;
    setCodigos((prev) => prev.filter((c) => valen.has(c.codigo)));
    setAvisoCodigo(
      caidos.length === 1
        ? `El código ${caidos[0]!.codigo} ya no vale: le falta una de sus piezas. Las piezas que quedan van a su precio.`
        : `Los códigos ${caidos.map((c) => c.codigo).join(', ')} ya no valen: les falta una de sus piezas.`,
    );
  }, [lineas, codigos]);

  /**
   * Una sola llamada: venta, lineas, descuento de existencia y la ficha de
   * la clienta, o nada. La clienta entra en la misma transaccion a
   * proposito: si la venta se cae por existencia, no queda una ficha de una
   * compra que nunca ocurrio.
   */
  const cobrar = useCallback(async (
    metodo: MetodoPago,
    tipo: TipoVenta = 'detal',
    cliente?: ClienteDeVenta | null,
    // Por verificar: la venta se registra (la pieza sale) y queda en
    // Pedidos hasta que alguien compruebe el pago.
    pago?: { porVerificar?: boolean; referencia?: string | null },
  ) => {
    if (lineas.length === 0) return { ok: false as const, error: 'El carrito esta vacio.' };
    if (totales.extraIlegible || totales.extraSinNota) {
      const texto = totales.extraIlegible
        ? 'Lo que sumas fuera del catálogo no es una cifra: escribe solo el número, por ejemplo 150 o 150,50.'
        : 'Falta decir qué es lo que sumas fuera del catálogo.';
      setError(texto);
      return { ok: false as const, error: texto };
    }
    setCobrando(true);
    setError(null);

    const { data, error: err } = await supabase.rpc('registrar_venta', {
      p_tipo: tipo,
      p_metodo: metodo,
      p_items: piezasParaLaBase(),
      ...quienEs(cliente),
      p_notas: null,
      p_por_verificar: pago?.porVerificar ?? false,
      p_pago_referencia: pago?.referencia?.trim() || null,
      // Solo si hay algo fuera del catalogo. Sin esto, una venta normal
      // tambien encaja en la base de antes de esquema-fuera-de-catalogo.sql:
      // si la pagina se publica antes que el SQL, se sigue cobrando.
      ...(totales.extraBs > 0 ? { p_extra_bs: totales.extraBs, p_extra_nota: extra.nota.trim() } : {}),
      // Solo con codigo, por lo mismo: sin el #65 se sigue cobrando.
      ...(codigos.length > 0 ? { p_codigos: codigos.map((c) => c.codigo) } : {}),
    });

    setCobrando(false);
    if (err) {
      const texto = mensajeDeError(err);
      setError(texto);
      return { ok: false as const, error: texto };
    }
    setLineas([]);
    setExtra(SIN_EXTRA);
    setCodigos([]);
    return { ok: true as const, ventaId: data as number };
  }, [lineas, tramos, totales, extra.nota, codigos]);

  /**
   * Apartar: la clienta paga una parte (al menos el mínimo) y las piezas se
   * quedan en la tienda hasta que termine de pagar. Reemplaza a "Pagó una
   * parte". Todo en una llamada: el pedido, sus piezas con el precio
   * congelado y el primer pago; si el pago no llega al mínimo, no queda nada.
   */
  const apartar = useCallback(async (
    cliente: ClienteDeVenta,
    pago: { metodo: MetodoPago; monto: number; referencia?: string | null; verificado: boolean },
  ) => {
    if (lineas.length === 0) return { ok: false as const, error: 'El carrito esta vacio.' };
    // El apartado congela el precio pieza por pieza, y esto no es una pieza.
    if (totales.extraBs > 0 || totales.extraIlegible) {
      const texto = 'Lo de fuera del catálogo no se aparta. Quítalo para apartar las piezas.';
      setError(texto);
      return { ok: false as const, error: texto };
    }
    setCobrando(true);
    setError(null);

    const { data, error: err } = await supabase.rpc('apartar_en_tienda', {
      p_items: piezasParaLaBase(),
      p_pagos: [{ metodo: pago.metodo, monto: pago.monto, referencia: pago.referencia?.trim() || null }],
      ...quienEs(cliente),
      p_verificado: pago.verificado,
      ...(codigos.length > 0 ? { p_codigos: codigos.map((c) => c.codigo) } : {}),
    });

    setCobrando(false);
    if (err) {
      const texto = mensajeDeError(err);
      setError(texto);
      return { ok: false as const, error: texto };
    }
    setLineas([]);
    setCodigos([]);
    const r = data as { id: number; token: string; falta_bcv: number; vence_apartado_en: string };
    return { ok: true as const, ...r };
  }, [lineas, tramos, totales, codigos]);

  /**
   * Las piezas como las pide la base. Solo se manda lo que ELLA negoció, y
   * solo sin tramo. El descuento por cantidad no se manda: lo calcula la
   * base con su escalera, que es la única que manda. Mandarlo desde aquí
   * sería dejar que el navegador decidiera el precio.
   */
  function piezasParaLaBase() {
    // Linea por linea: un dije sin base, en una venta con tramo, esta fuera
    // del tramo y se puede regatear como en una venta chica.
    const tramo = descuentosDeCarrito(tramos, lineas);
    // Con un codigo en la linea, el precio a mano se ignora (la base tambien).
    return totales.lineas.map((l) => ({
      modelo_id: l.modelo_id,
      ubicacion_id: l.ubicacion_id,
      cantidad: l.cantidad,
      precio_unitario_usd: l.cubiertas === 0 && !tramo.porModelo.get(l.modelo_id) && l.precio_manual_usd !== null && l.precio_manual_usd < l.precio_lista_usd
        ? l.precio_manual_usd
        : null,
    }));
  }

  return {
    lineas, agregar, cambiarCantidad, cambiarPrecio, vaciar, totales, cobrar, apartar, cobrando, error,
    extra, cambiarExtra, quitarExtra,
    codigos, agregarCodigo, quitarCodigo, avisoCodigo,
  };
}
