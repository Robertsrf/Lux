import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Campo, Cargando, ResumenErrores, Vacio } from '../../componentes/Piezas';
import {
  binanceDesdeBs, formatearBcv, formatearBinance, formatearBs, formatearPorcentaje, formatearTasa,
  porcentajeRebajado, rebajaMaximaPct,
} from '../../lib/dinero';
import { fuenteFoto, urlPublicaFoto } from '../../lib/fotos';
import { agruparPorFamilia, conFoto, etiquetasDe, nombreConVariante, rangoDe } from '../../lib/familias';
import type { Familia } from '../../lib/familias';
import { useUbicaciones } from '../../hooks/useCatalogos';
import { useTasa } from '../../hooks/useTasa';
import { useTextos } from '../../hooks/useTextos';
import { useCarrito } from '../../hooks/useCarrito';
import { VisorFoto, useDobleToque, useVisorFoto } from '../../componentes/VisorFoto';
import type { FotoAmpliada } from '../../componentes/VisorFoto';
import { ElegirVariante } from '../../componentes/ElegirVariante';
import { Recordatorio } from '../../componentes/Recordatorio';
import { BuscadorCliente } from '../../componentes/BuscadorCliente';
import { METODOS_EN_DOLARES, METODOS_PAGO } from '../../lib/tipos';
import type { ClienteDeVenta, MetaVendedora, MetodoPago, ModeloEnUbicacion } from '../../lib/tipos';

/*
  Las columnas que pide el mostrador.

  foto_path va a proposito: sin ella el mostrador solo tenia el thumb de
  300 px y las piezas se veian borrosas.

  Y los dos pisos van a proposito: durante semanas NO iban. Sin
  precio_minimo, el carrito creia que el minimo de cada pieza era su
  etiqueta; el descuento por cantidad "nunca por debajo del minimo" se
  quedaba en cero, y cada pieza decia "no admite rebaja". El dueño lo vio
  como "no calcula el descuento de los tramos", y era eso.
*/
const COLUMNAS = [
  'ubicacion_id', 'modelo_id', 'sku', 'nombre', 'categoria', 'variantes_nota',
  'foto_path', 'foto_thumb_path', 'grupo', 'precio_usd', 'precio_bs', 'cantidad',
  'precio_minimo_usd', 'precio_minimo_bs', 'familia', 'variante', 'piso_tramo_usd', 'piso_tramo_bs',
].join(', ');

const claveDe = (m: { modelo_id: number; ubicacion_id: number }) => `${m.modelo_id}-${m.ubicacion_id}`;

/**
 * Cuadricula de venta. Disenada para TOCAR, no para leer: foto grande,
 * un toque agrega una pieza, y el total y el boton de cobrar viven abajo,
 * al alcance del pulgar.
 *
 * Un producto con variantes (una cadena de 45 y otra de 60 cm) es UNA
 * tarjeta: tocarla abre la hoja para elegir cual se lleva.
 *
 * Cada tarjeta dice sus precios en bolivares y en dolares BCV, del mismo
 * tamano, y debajo en dolares Binance: si la clienta ofrece pagar en
 * efectivo o por Binance, la cifra ya esta ahi. Y dice hasta donde puede
 * bajar para cerrar la venta.
 *
 * Aqui no se muestra ni se consulta una sola cifra de costo: el minimo es
 * un precio, no un costo.
 */
export function Mostrador() {
  const { ubicaciones } = useUbicaciones();
  const { tasa } = useTasa();
  const textos = useTextos();
  const carrito = useCarrito(tasa);
  const visor = useVisorFoto();
  const esDobleToque = useDobleToque();

  const [ubicacionId, setUbicacionId] = useState<number | null>(null);
  const [tipo, setTipo] = useState('');
  const [tipos, setTipos] = useState<string[]>([]);
  const [texto, setTexto] = useState('');
  const [modelos, setModelos] = useState<ModeloEnUbicacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paso, setPaso] = useState<'venta' | 'cobro'>('venta');
  const [metodo, setMetodo] = useState<MetodoPago | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [cliente, setCliente] = useState<ClienteDeVenta | null>(null);
  const [nombreCliente, setNombreCliente] = useState<string | null>(null);
  const [sinCliente, setSinCliente] = useState(false);
  const [meta, setMeta] = useState<MetaVendedora | null>(null);
  const [familiaAbierta, setFamiliaAbierta] = useState<number | null>(null);
  const tituloCobro = useRef<HTMLHeadingElement>(null);
  const edicionCancelada = useRef(false);

  /*
    La meta de hoy, dicha donde ella trabaja y no solo en "Tu dia". Es la
    misma que ve el dueno en Costos, en piezas y nada mas. Si no se puede
    leer, el mostrador sigue igual: vender no depende de esto.
  */
  const cargarMeta = useCallback(async () => {
    const { data } = await supabase.rpc('meta_vendedora');
    setMeta(((data as MetaVendedora[] | null) ?? [])[0] ?? null);
  }, []);

  useEffect(() => { void cargarMeta(); }, [cargarMeta]);

  // El mostrador arranca en la primera vitrina, no en la bodega.
  useEffect(() => {
    if (ubicacionId === null && ubicaciones.length > 0) {
      const preferida = ubicaciones.find((u) => u.tipo !== 'bodega') ?? ubicaciones[0]!;
      setUbicacionId(preferida.id);
    }
  }, [ubicaciones, ubicacionId]);

  /*
    Los tipos que hay en ESTA ubicacion, no todos los de la tienda: ofrecer
    "tobillera" en una vitrina que no tiene ninguna es ofrecer una lista
    vacia. Pide una sola columna, sin precios ni pisos.
  */
  useEffect(() => {
    if (ubicacionId === null) return;
    let vigente = true;
    void (async () => {
      const { data } = await supabase
        .from('v_venta_ubicacion')
        .select('categoria')
        .eq('ubicacion_id', ubicacionId)
        .gt('cantidad', 0)
        .limit(2000);
      if (!vigente) return;
      const lista = [...new Set(((data as { categoria: string | null }[] | null) ?? [])
        .map((f) => (f.categoria ?? '').trim())
        .filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'es'));
      setTipos(lista);
      setTipo((t) => (t && !lista.includes(t) ? '' : t));
    })();
    return () => { vigente = false; };
  }, [ubicacionId]);

  const cargar = useCallback(async () => {
    if (ubicacionId === null) return;
    setCargando(true);
    setError(null);

    let consulta = supabase
      .from('v_venta_ubicacion')
      .select(COLUMNAS)
      .eq('ubicacion_id', ubicacionId)
      .gt('cantidad', 0)
      .order('nombre', { ascending: true })
      .limit(300);

    if (tipo) consulta = consulta.eq('categoria', tipo);

    if (texto.trim()) {
      const t = texto.trim().replace(/[%,()]/g, ' ');
      consulta = consulta.or(`nombre.ilike.%${t}%,sku.ilike.%${t}%,variante.ilike.%${t}%`);
    }

    const { data, error: err } = await consulta;
    if (err) setError(mensajeDeError(err));
    setModelos((data as unknown as ModeloEnUbicacion[] | null) ?? []);
    setCargando(false);
  }, [ubicacionId, texto, tipo]);

  useEffect(() => {
    const t = setTimeout(() => void cargar(), texto ? 300 : 0);
    return () => clearTimeout(t);
  }, [cargar, texto]);

  useEffect(() => {
    if (paso === 'cobro') tituloCobro.current?.focus();
  }, [paso]);

  const enCarrito = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of carrito.lineas) m.set(claveDe(l), l.cantidad);
    return m;
  }, [carrito.lineas]);
  const puestasDe = (m: ModeloEnUbicacion) => enCarrito.get(claveDe(m)) ?? 0;

  const familias = useMemo(() => agruparPorFamilia(modelos), [modelos]);
  const porModelo = useMemo(() => new Map(modelos.map((m) => [m.modelo_id, m])), [modelos]);

  // Lo que ensena el visor, pieza por pieza, para pasar de una a otra.
  const fichas = useMemo<FotoAmpliada[]>(() => familias.map((f) => {
    const portada = conFoto(f.variantes);
    return {
      clave: f.clave,
      nombre: f.cabeza.nombre,
      categoria: f.cabeza.categoria,
      materiales: textos.materiales_corto ?? null,
      variantes: f.variantes.map((v) => ({
        id: v.modelo_id,
        etiqueta: v.variante,
        sku: v.sku,
        // Una variante sin foto propia ensena la de la familia.
        path: v.foto_path ?? portada?.foto_path ?? null,
        thumbPath: v.foto_thumb_path ?? portada?.foto_thumb_path ?? null,
        bs: v.precio_bs,
        bcv: v.precio_usd,
        binance: binanceDesdeBs(v.precio_bs, tasa?.tasa_venta),
        quedan: v.cantidad,
        nota: v.variantes_nota,
      })),
    };
  }), [familias, textos.materiales_corto, tasa?.tasa_venta]);

  const cerrarHoja = useCallback(() => setFamiliaAbierta(null), []);

  function verFoto(f: Familia<ModeloEnUbicacion>) {
    const ficha = fichas.find((x) => x.clave === f.clave);
    if (ficha) visor.abrir(ficha, fichas);
  }

  /**
   * Un toque agrega la pieza, sin esperar ni un milisegundo: el mostrador
   * tiene que ser instantaneo. Si llega un segundo toque enseguida, se
   * entiende que queria ver la foto, y se deshace lo que agrego el primero.
   *
   * Si el producto tiene variantes, el toque abre la hoja para elegir.
   */
  function alTocar(f: Familia<ModeloEnUbicacion>) {
    if (f.variantes.length > 1) {
      setFamiliaAbierta(f.clave);
      return;
    }
    const m = f.cabeza;
    if (esDobleToque(m.modelo_id)) {
      const puestas = puestasDe(m);
      if (puestas > 0) carrito.cambiarCantidad(m.modelo_id, m.ubicacion_id, puestas - 1);
      verFoto(f);
      return;
    }
    carrito.agregar(m);
  }

  function agregarPorId(id: number) {
    const m = porModelo.get(id);
    if (m) carrito.agregar(m);
  }

  async function confirmar() {
    if (!metodo) return;
    const r = await carrito.cobrar(metodo, 'detal', cliente);
    if (r.ok) {
      setExito(cliente && nombreCliente
        ? `Venta registrada a nombre de ${nombreCliente}. Numero ${r.ventaId}.`
        : `Venta registrada. Numero ${r.ventaId}.`);
      setMetodo(null);
      setCliente(null);
      setNombreCliente(null);
      setSinCliente(false);
      setPaso('venta');
      await Promise.all([cargar(), cargarMeta()]);
    }
  }

  function aplicarPrecio(modeloId: number, ubicacionIdLinea: number, valor: string) {
    if (!edicionCancelada.current) carrito.cambiarPrecio(modeloId, ubicacionIdLinea, Number(valor));
    edicionCancelada.current = false;
    setEditando(null);
  }

  /* ----------------------------------------------------------- cobro */

  if (paso === 'cobro') {
    const t = carrito.totales;
    const conTramo = t.descuento !== null;
    const enDolares = metodo !== null && METODOS_EN_DOLARES.includes(metodo);
    // Precios que ella escribio y que el tramo deja sin efecto. Se dice, no
    // se calla: si no, la clienta oye un precio y paga otro.
    const rebajasIgnoradas = conTramo && carrito.lineas.some((l) => l.precio_manual_usd !== null);

    return (
      <div className="pagina pagina--angosta mostrador">
        <div className="encabezado-pagina">
          <div>
            <h1 tabIndex={-1} ref={tituloCobro}>Cobrar</h1>
            <p>
              {t.piezas} pieza{t.piezas === 1 ? '' : 's'}
              {/* Dicho aqui para que ella pueda decirselo a la clienta con
                  la cifra delante, no de memoria. */}
              {conTramo
                ? ` · ${formatearPorcentaje(t.descuento)} de descuento por cantidad, ahorra ${formatearBs(t.ahorroBs)}`
                : t.regateoBs > 0
                  ? ` · rebajaste ${formatearBs(t.regateoBs)} para cerrar la venta`
                  : t.siguiente
                    ? ` · con ${t.siguiente.faltan} más baja ${formatearPorcentaje(t.siguiente.pct)}`
                    : ''}
            </p>
          </div>
        </div>

        {carrito.error ? (
          <ResumenErrores titulo="No se registro la venta">{carrito.error}</ResumenErrores>
        ) : null}

        {rebajasIgnoradas ? (
          <Aviso tono="alerta" titulo="Manda el descuento por cantidad">
            Con {t.piezas} piezas se cobra el {formatearPorcentaje(t.descuento)} en todas. Lo que rebajaste
            a mano no se suma encima; vuelve si la venta baja de {t.primerTramo} piezas.
          </Aviso>
        ) : null}

        <div className="lineas-cobro">
          {/* Las lineas salen de `totales`, no de `lineas` crudas: ahi ya
              viene aplicado el tramo o la rebaja. Si no, cada renglon diria
              el precio de lista y el total de abajo seria otro. */}
          {t.lineas.map((l) => {
            const foto = urlPublicaFoto(l.foto_thumb_path);
            const clave = claveDe(l);
            const nombre = nombreConVariante(l.nombre, l.variante);
            const admite = l.precio_minimo_bs < l.precio_lista_bs;
            const rebajada = l.precio_final_bs < l.precio_lista_bs;
            return (
              <div className="linea-cobro" key={clave}>
                {foto
                  ? <img className="linea-cobro__foto" src={foto} alt="" />
                  : <span className="linea-cobro__foto" />}
                <div>
                  <div className="linea-cobro__nombre">{nombre}</div>
                  {editando === clave && !conTramo ? (
                    <div className="rebaja">
                      <label className="rebaja__etiqueta" htmlFor={`rebaja-${clave}`}>
                        Lo que cobras por esta pieza, en bolívares
                      </label>
                      <input
                        id={`rebaja-${clave}`}
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min={l.precio_minimo_bs}
                        max={l.precio_lista_bs}
                        defaultValue={l.precio_final_bs}
                        autoFocus
                        aria-describedby={`piso-${clave}`}
                        onBlur={(e) => aplicarPrecio(l.modelo_id, l.ubicacion_id, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') e.currentTarget.blur();
                          if (e.key === 'Escape') { edicionCancelada.current = true; e.currentTarget.blur(); }
                        }}
                      />
                      <span className="rebaja__piso" id={`piso-${clave}`}>
                        Mínimo {formatearBs(l.precio_minimo_bs)}, {rebajaMaximaPct(l.precio_lista_bs, l.precio_minimo_bs)} % menos
                        que la etiqueta. Para volver a la etiqueta, escribe {formatearBs(l.precio_lista_bs)}.
                      </span>
                    </div>
                  ) : conTramo ? (
                    <div className="linea-cobro__precio linea-cobro__precio--fijo">
                      <span>{formatearBs(l.precio_final_bs)} c/u</span>
                      {rebajada ? <s>{formatearBs(l.precio_lista_bs)}</s> : null}
                      <span className="rebaja__pista">
                        {rebajada ? 'descuento por cantidad' : 'ya está en su mínimo'}
                      </span>
                    </div>
                  ) : admite ? (
                    <button
                      type="button"
                      className="linea-cobro__precio linea-cobro__precio--editable"
                      onClick={() => setEditando(clave)}
                      disabled={!tasa}
                      aria-label={`Cambiar lo que cobras por ${nombre}. Ahora ${formatearBs(l.precio_final_bs)}`}
                    >
                      <span>{formatearBs(l.precio_final_bs)} c/u</span>
                      {rebajada ? <s>{formatearBs(l.precio_lista_bs)}</s> : null}
                      {/* Cuanto puede rebajar ESTA pieza. Puede ser menos que
                          el maximo de la tienda: en las de margen fino, el
                          minimo lo pone el margen. */}
                      <span className="rebaja__pista">
                        {rebajada
                          ? `rebajaste ${porcentajeRebajado(l.precio_lista_bs, l.precio_final_bs)} % · cambiar`
                          : `puedes rebajar hasta ${rebajaMaximaPct(l.precio_lista_bs, l.precio_minimo_bs)} %`}
                      </span>
                    </button>
                  ) : (
                    <div className="linea-cobro__precio linea-cobro__precio--fijo">
                      <span>{formatearBs(l.precio_final_bs)} c/u</span>
                      <span className="rebaja__pista">precio fijo: no admite rebaja</span>
                    </div>
                  )}
                </div>
                <div className="contador">
                  <button
                    type="button"
                    aria-label={`Quitar una unidad de ${nombre}`}
                    onClick={() => carrito.cambiarCantidad(l.modelo_id, l.ubicacion_id, l.cantidad - 1)}
                  >
                    &minus;
                  </button>
                  <span className="contador__valor">{l.cantidad}</span>
                  <button
                    type="button"
                    aria-label={`Agregar una unidad de ${nombre}`}
                    disabled={l.cantidad >= l.disponible}
                    onClick={() => carrito.cambiarCantidad(l.modelo_id, l.ubicacion_id, l.cantidad + 1)}
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="total-cobro">
          <span className="util secundario">Total a cobrar</span>
          <div>
            <div className="total-cobro__cifra">{formatearBs(t.totalBs)}</div>
            {/* Del mismo tamaño que los bolívares: si la clienta pregunta
                "¿y en dólares?", la respuesta ya está a la vista. */}
            {tasa ? <div className="total-cobro__cifra">{formatearBcv(t.totalBcv)}</div> : null}
          </div>
          {/* Lo que cobra si le pagan en dolares, en efectivo o por Binance.
              Es la misma cifra que la base guarda como total en dolares de
              la venta: bolivares entre la tasa Binance. */}
          {tasa ? (
            <div className={enDolares ? 'total-cobro__dolares total-cobro__dolares--activo' : 'total-cobro__dolares'}>
              <span className="util">En dólares o Binance</span>
              <span className="total-cobro__binance">{formatearBinance(t.totalBinance)}</span>
            </div>
          ) : null}
        </div>

        <Recordatorio momento="cerrar" titulo="Cierra con una pregunta" />

        {/* Quien se lo lleva. Va antes del metodo de pago porque es lo que
            se pregunta mientras se envuelve, no mientras se cobra. De aqui
            salen la garantia y los meses de lavado y abrillantado: una
            venta sin nombre no se los puede dar a nadie. */}
        <h2>Quién se lo lleva</h2>
        <div className="panel">
          <BuscadorCliente
            valor={cliente}
            etiqueta={nombreCliente}
            alElegir={(c, nombre) => { setCliente(c); setNombreCliente(nombre); setSinCliente(false); }}
            sinCliente={sinCliente}
            alSaltar={setSinCliente}
          />
        </div>

        <h2>Como paga</h2>
        <div className="metodos-pago" style={{ marginTop: 'var(--e-3)' }}>
          {METODOS_PAGO.map((m) => (
            <button
              key={m.valor}
              type="button"
              aria-pressed={metodo === m.valor}
              onClick={() => setMetodo(m.valor)}
            >
              {m.texto}
            </button>
          ))}
        </div>

        {enDolares && tasa ? (
          <p className="cobro-dolares">
            Cobra <strong>{formatearBinance(t.totalBinance)}</strong>: el total en bolívares a la
            tasa Binance de hoy, {formatearTasa(tasa.tasa_venta)} Bs por dólar.
          </p>
        ) : null}

        <div className="acciones">
          <button
            type="button"
            className="boton boton--confirmar"
            // Espera a que ella diga quien se lo lleva o que decida a
            // proposito que va sin nombre. No es un requisito del sistema:
            // es que saltarlo sin querer deja sin garantia a una clienta.
            disabled={!metodo || (!cliente && !sinCliente) || carrito.cobrando || carrito.lineas.length === 0}
            onClick={() => void confirmar()}
          >
            {carrito.cobrando ? 'Registrando' : 'Registrar venta'}
          </button>
          <button type="button" className="boton boton--secundario" onClick={() => setPaso('venta')}>
            Seguir agregando
          </button>
        </div>

        {/* Un boton apagado sin explicacion es una trampa: dice que no se
            puede y no dice que falta. */}
        {!metodo || (!cliente && !sinCliente) ? (
          <p className="campo__pista">
            {!cliente && !sinCliente
              ? 'Falta decir quién se lo lleva. Si no quiere dar sus datos, toca "Cobrar sin registrarla".'
              : 'Falta elegir cómo paga.'}
          </p>
        ) : null}
      </div>
    );
  }

  /* -------------------------------------------------------- cuadricula */

  const ubicacion = ubicaciones.find((u) => u.id === ubicacionId);
  const abierta = familiaAbierta === null ? null : familias.find((f) => f.clave === familiaAbierta) ?? null;
  const filtrando = Boolean(texto.trim() || tipo);

  return (
    <div className="pagina mostrador">
      <div className="encabezado-pagina">
        <div>
          <h1>Mostrador</h1>
          {meta?.meta_hoy ? (
            <p className={meta.vendidas_hoy >= meta.meta_hoy ? 'meta-mostrador meta-mostrador--cumplida' : 'meta-mostrador'}>
              {meta.vendidas_hoy >= meta.meta_hoy
                ? `Meta de hoy cumplida: van ${meta.vendidas_hoy} de ${meta.meta_hoy} piezas.`
                : `Hoy van ${meta.vendidas_hoy} de ${meta.meta_hoy} piezas. Faltan ${meta.meta_hoy - meta.vendidas_hoy}.`}
            </p>
          ) : (
            <p>Toca una pieza para agregarla a la venta.</p>
          )}
        </div>
      </div>

      {exito ? <Aviso tono="exito">{exito}</Aviso> : null}
      {error ? <Aviso tono="error" titulo="No se pudo cargar el catálogo">{error}</Aviso> : null}
      {!tasa ? (
        <Aviso tono="alerta" titulo="Sin tasa vigente">
          No se puede cobrar sin la tasa del día. <Link to="/tasas">Fíjala en Tasas</Link> y vuelve.
        </Aviso>
      ) : null}

      <div className="selector-ubicacion" role="group" aria-label="Ubicación">
        {ubicaciones.map((u) => (
          <button
            key={u.id}
            type="button"
            aria-pressed={u.id === ubicacionId}
            onClick={() => setUbicacionId(u.id)}
          >
            {u.nombre}
          </button>
        ))}
      </div>

      {/* En el telefono, ubicacion y tipo lado a lado en dos listas: dos
          controles en el alto de uno. En escritorio la ubicacion va en
          fichas (arriba) y aqui quedan el tipo y el buscador. */}
      <div className="filtros-mostrador">
        <div className="selector-ubicacion__movil">
          <Campo etiqueta="Ubicación" htmlFor="u-movil">
            <select
              id="u-movil"
              value={ubicacionId ?? ''}
              onChange={(e) => setUbicacionId(Number(e.target.value))}
            >
              {ubicaciones.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </Campo>
        </div>

        <Campo etiqueta="Tipo" htmlFor="tipo-venta">
          <select id="tipo-venta" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Todos</option>
            {tipos.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Campo>

        <div className="filtros-mostrador__buscar">
          <Campo etiqueta="Buscar" htmlFor="buscar-venta">
            <input
              id="buscar-venta"
              type="search"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Nombre, SKU o medida"
              autoComplete="off"
            />
          </Campo>
        </div>
      </div>

      {/* Los materiales van UNA vez y arriba, no en cada tarjeta: son de la
          casa entera, no de una pieza. */}
      {textos.materiales_corto ? (
        <p className="sello-materiales">{textos.materiales_corto}</p>
      ) : null}

      {cargando ? (
        <Cargando texto="Buscando piezas" />
      ) : familias.length === 0 ? (
        <Vacio titulo={filtrando ? 'Ninguna pieza coincide' : `Aún no hay piezas en ${ubicacion?.nombre ?? 'esta ubicación'}`}>
          <p>{filtrando ? 'Prueba con otro nombre, otro tipo o borra la búsqueda.' : 'Un administrador tiene que cargarlas primero.'}</p>
        </Vacio>
      ) : (
        <div className="rejilla-venta">
          {familias.map((f) => {
            const m = f.cabeza;
            const unica = f.variantes.length === 1;
            const portada = conFoto(f.variantes) ?? m;
            const foto = fuenteFoto(portada.foto_path, portada.foto_thumb_path, '(max-width: 640px) 45vw, 200px');
            const puestas = f.variantes.reduce((n, v) => n + puestasDe(v), 0);
            const quedan = f.variantes.reduce((n, v) => n + v.cantidad, 0);
            const agotado = f.variantes.every((v) => puestasDe(v) >= v.cantidad);
            const bs = rangoDe(f.variantes, (v) => v.precio_bs);
            const bcv = rangoDe(f.variantes, (v) => v.precio_usd);
            const desde = bs.min !== bs.max;
            const etiquetas = etiquetasDe(f);
            const admiteRebaja = m.precio_minimo_bs !== null && m.precio_bs !== null && m.precio_minimo_bs < m.precio_bs;
            return (
              <button
                key={f.clave}
                type="button"
                className="tarjeta-modelo"
                disabled={agotado || !tasa}
                onClick={() => alTocar(f)}
                aria-haspopup={unica ? undefined : 'dialog'}
                aria-label={unica
                  ? `Agregar ${nombreConVariante(m.nombre, m.variante)}, ${formatearBs(m.precio_bs)}`
                  : `Elegir cuál de ${m.nombre}: ${etiquetas}`}
              >
                <span
                  role="button"
                  tabIndex={0}
                  className="lupa"
                  aria-label={`Ver en detalle ${m.nombre}`}
                  onClick={(e) => { e.stopPropagation(); verFoto(f); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); verFoto(f); } }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden="true">
                    <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5M11 8v6M8 11h6" />
                  </svg>
                </span>
                {foto
                  ? <img className="tarjeta-modelo__foto" {...foto} alt="" loading="lazy" />
                  : <span className="tarjeta-modelo__foto" />}
                <span className="tarjeta-modelo__cuerpo">
                  {m.categoria ? <span className="tarjeta-modelo__categoria">{m.categoria}</span> : null}
                  <span className="tarjeta-modelo__nombre">{m.nombre}</span>
                  {etiquetas ? <span className="tarjeta-modelo__variantes">{etiquetas}</span> : null}
                  {desde ? <span className="tarjeta-modelo__desde">desde</span> : null}
                  <span className="tarjeta-modelo__precio">{formatearBs(bs.min)}</span>
                  <span className="tarjeta-modelo__precio">{formatearBcv(bcv.min)}</span>
                  {tasa ? (
                    <span className="tarjeta-modelo__binance">{formatearBinance(binanceDesdeBs(bs.min, tasa.tasa_venta))}</span>
                  ) : null}
                  {/* Hasta donde puede bajar para cerrar. Con variantes lo
                      dice cada opcion en la hoja, que es donde se elige. */}
                  {unica ? (
                    <span className="tarjeta-modelo__minimo">
                      {admiteRebaja ? `Mínimo ${formatearBs(m.precio_minimo_bs)}` : 'Precio fijo'}
                    </span>
                  ) : null}
                  <span className="tarjeta-modelo__pie">
                    <span className={quedan <= 2 ? 'tarjeta-modelo__existencia tarjeta-modelo__existencia--baja' : 'tarjeta-modelo__existencia'}>
                      Quedan {quedan}
                    </span>
                    {puestas > 0 ? <span className="tarjeta-modelo__contador">{puestas}</span> : null}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      <VisorFoto
        {...visor.props}
        accion={{
          texto: 'Agregar a la venta',
          alTocar: agregarPorId,
          deshabilitada: (id) => {
            const m = porModelo.get(id);
            return !tasa || !m || puestasDe(m) >= m.cantidad;
          },
          llevas: (id) => {
            const m = porModelo.get(id);
            return m ? puestasDe(m) : 0;
          },
        }}
      />

      {abierta ? (
        <ElegirVariante
          titulo={abierta.cabeza.nombre}
          subtitulo="Toca la que se lleva."
          opciones={abierta.variantes.map((v) => {
            const puestas = puestasDe(v);
            const admite = v.precio_minimo_bs !== null && v.precio_bs !== null && v.precio_minimo_bs < v.precio_bs;
            return {
              id: v.modelo_id,
              etiqueta: v.variante ?? v.sku,
              detalle: `Quedan ${v.cantidad} · ${admite ? `mínimo ${formatearBs(v.precio_minimo_bs)}` : 'precio fijo'}`,
              precios: (
                <>
                  <span className="opcion-variante__precio">{formatearBs(v.precio_bs)}</span>
                  <span className="opcion-variante__precio">{formatearBcv(v.precio_usd)}</span>
                  {tasa ? (
                    <span className="opcion-variante__binance">{formatearBinance(binanceDesdeBs(v.precio_bs, tasa.tasa_venta))}</span>
                  ) : null}
                </>
              ),
              deshabilitada: !tasa || puestas >= v.cantidad,
              llevas: puestas,
            };
          })}
          alElegir={(id) => { agregarPorId(id); setFamiliaAbierta(null); }}
          alCerrar={cerrarHoja}
        />
      ) : null}

      {carrito.totales.piezas > 0 ? (
        <div className="barra-carrito">
          <div className="barra-carrito__resumen">
            <div className="barra-carrito__piezas">
              {carrito.totales.piezas} pieza{carrito.totales.piezas === 1 ? '' : 's'}
              {/* Lo que ya se gano, y lo que falta para lo siguiente. Se
                  dice aqui y no en una pantalla aparte porque es justo
                  cuando sirve: con la clienta delante y el carrito armado. */}
              {carrito.totales.descuento ? (
                <span className="barra-carrito__tramo">
                  · {formatearPorcentaje(carrito.totales.descuento)} menos
                </span>
              ) : carrito.totales.siguiente ? (
                <span className="barra-carrito__falta">
                  · {carrito.totales.siguiente.faltan} más y baja {formatearPorcentaje(carrito.totales.siguiente.pct)}
                </span>
              ) : null}
            </div>
            <div className="barra-carrito__total">
              {formatearBs(carrito.totales.totalBs)}
              {carrito.totales.ahorroBs > 0 ? (
                <span className="barra-carrito__ahorro">ahorra {formatearBs(carrito.totales.ahorroBs)}</span>
              ) : null}
            </div>
          </div>
          <button type="button" className="boton boton--secundario" onClick={carrito.vaciar}>
            Vaciar
          </button>
          <button type="button" className="boton" onClick={() => { setExito(null); setPaso('cobro'); }}>
            Cobrar
          </button>
        </div>
      ) : null}
    </div>
  );
}
