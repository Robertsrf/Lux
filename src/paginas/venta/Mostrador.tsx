import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Campo, Cargando, ResumenErrores, Vacio } from '../../componentes/Piezas';
import { formatearBs, formatearUsd } from '../../lib/dinero';
import { fuenteFoto, urlPublicaFoto } from '../../lib/fotos';
import { useUbicaciones } from '../../hooks/useCatalogos';
import { useTasa } from '../../hooks/useTasa';
import { useCarrito } from '../../hooks/useCarrito';
import { VisorFoto, useDobleToque, useVisorFoto } from '../../componentes/VisorFoto';
import { Recordatorio } from '../../componentes/Recordatorio';
import { METODOS_PAGO } from '../../lib/tipos';
import type { MetodoPago, ModeloEnUbicacion } from '../../lib/tipos';

const COLUMNAS = 'ubicacion_id, modelo_id, sku, nombre, categoria, variantes_nota, foto_thumb_path, grupo, precio_usd, precio_bs, cantidad';

/**
 * Cuadricula de venta. Disenada para TOCAR, no para leer: foto grande,
 * un toque agrega una pieza, y el total y el boton de cobrar viven abajo,
 * al alcance del pulgar.
 *
 * Aqui no se muestra ni se consulta una sola cifra de costo.
 */
export function Mostrador() {
  const { ubicaciones } = useUbicaciones();
  const { tasa } = useTasa();
  const carrito = useCarrito();
  const visor = useVisorFoto();
  const esDobleToque = useDobleToque();

  const [ubicacionId, setUbicacionId] = useState<number | null>(null);
  const [texto, setTexto] = useState('');
  const [modelos, setModelos] = useState<ModeloEnUbicacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paso, setPaso] = useState<'venta' | 'cobro'>('venta');
  const [metodo, setMetodo] = useState<MetodoPago | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const tituloCobro = useRef<HTMLHeadingElement>(null);

  // El mostrador arranca en la primera vitrina, no en la bodega.
  useEffect(() => {
    if (ubicacionId === null && ubicaciones.length > 0) {
      const preferida = ubicaciones.find((u) => u.tipo !== 'bodega') ?? ubicaciones[0]!;
      setUbicacionId(preferida.id);
    }
  }, [ubicaciones, ubicacionId]);

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

    if (texto.trim()) {
      const t = texto.trim().replace(/[%,]/g, ' ');
      consulta = consulta.or(`nombre.ilike.%${t}%,sku.ilike.%${t}%`);
    }

    const { data, error: err } = await consulta;
    if (err) setError(mensajeDeError(err));
    setModelos((data as unknown as ModeloEnUbicacion[] | null) ?? []);
    setCargando(false);
  }, [ubicacionId, texto]);

  useEffect(() => {
    const t = setTimeout(() => void cargar(), texto ? 300 : 0);
    return () => clearTimeout(t);
  }, [cargar, texto]);

  useEffect(() => {
    if (paso === 'cobro') tituloCobro.current?.focus();
  }, [paso]);

  const enCarrito = useMemo(() => {
    const m = new Map<number, number>();
    for (const l of carrito.lineas) m.set(l.modelo_id, l.cantidad);
    return m;
  }, [carrito.lineas]);

  /**
   * Un toque agrega la pieza, sin esperar ni un milisegundo: el mostrador
   * tiene que ser instantaneo. Si llega un segundo toque enseguida, se
   * entiende que queria ver la foto, y se deshace lo que agrego el primero.
   */
  function alTocar(m: ModeloEnUbicacion) {
    if (esDobleToque(m.modelo_id)) {
      const puestas = enCarrito.get(m.modelo_id) ?? 0;
      if (puestas > 0) carrito.cambiarCantidad(m.modelo_id, m.ubicacion_id, puestas - 1);
      verFoto(m);
      return;
    }
    carrito.agregar(m);
  }

  function verFoto(m: ModeloEnUbicacion) {
    visor.abrir({ nombre: m.nombre, sku: m.sku, nota: m.variantes_nota, path: m.foto_path, thumbPath: m.foto_thumb_path });
  }

  async function confirmar() {
    if (!metodo) return;
    const r = await carrito.cobrar(metodo);
    if (r.ok) {
      setExito(`Venta registrada. Numero ${r.ventaId}.`);
      setMetodo(null);
      setPaso('venta');
      await cargar();
    }
  }

  /* ----------------------------------------------------------- cobro */

  if (paso === 'cobro') {
    return (
      <div className="pagina pagina--angosta mostrador">
        <div className="encabezado-pagina">
          <div>
            <h1 tabIndex={-1} ref={tituloCobro}>Cobrar</h1>
            <p>{carrito.totales.piezas} pieza{carrito.totales.piezas === 1 ? '' : 's'}</p>
          </div>
        </div>

        {carrito.error ? (
          <ResumenErrores titulo="No se registro la venta">{carrito.error}</ResumenErrores>
        ) : null}

        <div className="lineas-cobro">
          {carrito.lineas.map((l) => {
            const foto = urlPublicaFoto(l.foto_thumb_path);
            const clave = `${l.modelo_id}-${l.ubicacion_id}`;
            const rebajado = l.precio_bs < l.precio_lista_bs;
            return (
              <div className="linea-cobro" key={clave}>
                {foto
                  ? <img className="linea-cobro__foto" src={foto} alt="" />
                  : <span className="linea-cobro__foto" />}
                <div>
                  <div className="linea-cobro__nombre">{l.nombre}</div>
                  {editando === clave ? (
                    <div className="rebaja">
                      <input
                        type="number"
                        inputMode="decimal"
                        step="1"
                        min={l.precio_minimo_bs}
                        max={l.precio_lista_bs}
                        defaultValue={l.precio_bs}
                        aria-label={`Precio de ${l.nombre} en bolivares`}
                        autoFocus
                        onBlur={(e) => {
                          carrito.cambiarPrecio(l.modelo_id, l.ubicacion_id, Number(e.target.value), tasa?.tasa_bcv ?? 0);
                          setEditando(null);
                        }}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                      />
                      <span className="rebaja__piso">
                        Puedes bajar hasta {formatearBs(l.precio_minimo_bs)}
                      </span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="linea-cobro__precio linea-cobro__precio--editable"
                      onClick={() => setEditando(clave)}
                      disabled={!tasa || l.precio_minimo_bs >= l.precio_lista_bs}
                    >
                      {formatearBs(l.precio_bs)} c/u
                      {rebajado ? <s>{formatearBs(l.precio_lista_bs)}</s> : null}
                      {l.precio_minimo_bs < l.precio_lista_bs ? <span className="rebaja__pista">tocar para rebajar</span> : null}
                    </button>
                  )}
                </div>
                <div className="contador">
                  <button
                    type="button"
                    aria-label={`Quitar una unidad de ${l.nombre}`}
                    onClick={() => carrito.cambiarCantidad(l.modelo_id, l.ubicacion_id, l.cantidad - 1)}
                  >
                    &minus;
                  </button>
                  <span className="contador__valor">{l.cantidad}</span>
                  <button
                    type="button"
                    aria-label={`Agregar una unidad de ${l.nombre}`}
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
            <div className="total-cobro__cifra">{formatearBs(carrito.totales.totalBs)}</div>
            {tasa ? (
              <div className="total-cobro__referencia">
                Equivale a {formatearUsd(carrito.totales.totalBs / tasa.tasa_bcv)} al cambio BCV
              </div>
            ) : null}
          </div>
        </div>

        <Recordatorio momento="cerrar" titulo="Cierra con una pregunta" />

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

        <div className="acciones">
          <button
            type="button"
            className="boton boton--confirmar"
            disabled={!metodo || carrito.cobrando || carrito.lineas.length === 0}
            onClick={() => void confirmar()}
          >
            {carrito.cobrando ? 'Registrando' : 'Registrar venta'}
          </button>
          <button type="button" className="boton boton--secundario" onClick={() => setPaso('venta')}>
            Seguir agregando
          </button>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------- cuadricula */

  const ubicacion = ubicaciones.find((u) => u.id === ubicacionId);

  return (
    <div className="pagina mostrador">
      <div className="encabezado-pagina">
        <div>
          <h1>Mostrador</h1>
          <p>Toca una pieza para agregarla a la venta.</p>
        </div>
      </div>

      {exito ? <Aviso tono="exito">{exito}</Aviso> : null}
      {error ? <Aviso tono="error" titulo="No se pudo cargar el catalogo">{error}</Aviso> : null}
      {!tasa ? (
        <Aviso tono="alerta" titulo="Sin tasa vigente">
          No se puede cobrar hasta que un administrador fije la tasa del dia.
        </Aviso>
      ) : null}

      <div className="selector-ubicacion" role="group" aria-label="Ubicacion">
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

      <Campo etiqueta="Buscar" htmlFor="buscar-venta">
        <input
          id="buscar-venta"
          type="search"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Nombre o SKU"
          autoComplete="off"
        />
      </Campo>

      {cargando ? (
        <Cargando texto="Buscando piezas" />
      ) : modelos.length === 0 ? (
        <Vacio titulo={texto ? 'Ninguna pieza coincide' : `Aun no hay piezas en ${ubicacion?.nombre ?? 'esta ubicacion'}`}>
          <p>{texto ? 'Prueba con otro nombre o borra la busqueda.' : 'Un administrador tiene que cargarlas primero.'}</p>
        </Vacio>
      ) : (
        <div className="rejilla-venta">
          {modelos.map((m) => {
            const foto = fuenteFoto(m.foto_path, m.foto_thumb_path, '(max-width: 640px) 45vw, 200px');
            const puestas = enCarrito.get(m.modelo_id) ?? 0;
            const agotado = puestas >= m.cantidad;
            return (
              <button
                key={m.modelo_id}
                type="button"
                className="tarjeta-modelo"
                disabled={agotado || !tasa}
                onClick={() => alTocar(m)}
                aria-label={`Agregar ${m.nombre}, ${formatearBs(m.precio_bs)}`}
              >
                <span
                  role="button"
                  tabIndex={0}
                  className="lupa"
                  aria-label={`Ver la foto de ${m.nombre}`}
                  onClick={(e) => { e.stopPropagation(); verFoto(m); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); verFoto(m); } }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden="true">
                    <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5M11 8v6M8 11h6" />
                  </svg>
                </span>
                {foto
                  ? <img className="tarjeta-modelo__foto" {...foto} alt="" loading="lazy" />
                  : <span className="tarjeta-modelo__foto" />}
                <span className="tarjeta-modelo__cuerpo">
                  <span className="tarjeta-modelo__nombre">{m.nombre}</span>
                  <span className="tarjeta-modelo__precio">{formatearBs(m.precio_bs)}</span>
                  <span className="tarjeta-modelo__pie">
                    <span className={m.cantidad <= 2 ? 'tarjeta-modelo__existencia tarjeta-modelo__existencia--baja' : 'tarjeta-modelo__existencia'}>
                      Quedan {m.cantidad}
                    </span>
                    {puestas > 0 ? <span className="tarjeta-modelo__contador">{puestas}</span> : null}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      <VisorFoto foto={visor.foto} alCerrar={visor.cerrar} />

      {carrito.totales.piezas > 0 ? (
        <div className="barra-carrito">
          <div className="barra-carrito__resumen">
            <div className="barra-carrito__piezas">
              {carrito.totales.piezas} pieza{carrito.totales.piezas === 1 ? '' : 's'}
            </div>
            <div className="barra-carrito__total">{formatearBs(carrito.totales.totalBs)}</div>
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
