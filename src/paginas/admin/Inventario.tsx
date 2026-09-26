import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Ayuda, Cargando, Campo, Vacio, Filtros } from '../../componentes/Piezas';
import {
  aMonto, binanceDesdeBs, deMonto, formatearBcv, formatearBinance, formatearBs, formatearMonto,
  formatearPorcentaje, porCantidad, rebajaMaximaPct, sumar,
} from '../../lib/dinero';
import { urlPublicaFoto } from '../../lib/fotos';
import { useTextos } from '../../hooks/useTextos';
import { useCategorias, useGrupos, useUbicaciones } from '../../hooks/useCatalogos';
import { useTasa } from '../../hooks/useTasa';
import { VisorFoto, useVisorFoto } from '../../componentes/VisorFoto';
import { MoverUbicacion } from '../../componentes/MoverUbicacion';
import { Icono } from '../../componentes/Iconos';
import type { FotoAmpliada } from '../../componentes/VisorFoto';
import { FILTROS_VACIOS, POR_PAGINA, useInventario } from '../../hooks/useInventario';
import type { FiltrosInventario } from '../../hooks/useInventario';
import type { ModeloAdmin } from '../../lib/tipos';


/**
 * Vista de inventario del administrador: densa, tabular, para comparar cifras.
 * Muestra costo puesto, precio, margen en $ y en %.
 * La vendedora no llega aqui: la vista v_catalogo_admin filtra con es_admin().
 */
export function Inventario() {
  const textos = useTextos();
  const [objetivo, setObjetivo] = useState<number | null>(null);
  const [reasignando, setReasignando] = useState(false);
  const [reasignado, setReasignado] = useState<string | null>(null);
  const categorias = useCategorias();
  const [filtros, setFiltros] = useState<FiltrosInventario>(FILTROS_VACIOS);
  const [pagina, setPagina] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // La pieza que se esta moviendo de ubicacion, si hay una.
  const [moviendo, setMoviendo] = useState<ModeloAdmin | null>(null);
  const [movido, setMovido] = useState<string | null>(null);
  const [lotes, setLotes] = useState<{ id: number; codigo: string }[]>([]);
  const visor = useVisorFoto();

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from('v_lotes_admin').select('id, codigo').order('fecha_llegada', { ascending: false });
      setLotes((data as { id: number; codigo: string }[] | null) ?? []);
    })();
  }, []);

  const { grupos } = useGrupos();
  const { ubicaciones } = useUbicaciones();
  const { tasa } = useTasa();
  const { modelos, existencias, total, cargando, error: errorCarga, recargar } = useInventario(filtros, pagina);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from('configuracion').select('valor')
        .eq('clave', 'margen_objetivo_pct').maybeSingle();
      setObjetivo(data ? Number((data as { valor: number }).valor) : null);
    })();
  }, []);

  /**
   * Vuelve a poner cada pieza en el grupo que le toca segun su costo.
   *
   * El grupo se elige al cargar la pieza, y ahi es facil que quede mal: se
   * escoge antes de teclear el costo final, o a mano guiandose por el SKU.
   * Nada avisaba despues, asi que las piezas se quedaban baratas -o
   * infladas- sin que nadie lo notara.
   */
  async function reasignar() {
    setReasignando(true);
    setReasignado(null);
    const { data, error: err } = await supabase.rpc('admin_reasignar_grupos');
    if (err) { setError(mensajeDeError(err)); setReasignando(false); return; }
    const r = data as { piezas_movidas: number; sin_grupo_que_alcance: number };
    setReasignado(
      r.piezas_movidas === 0
        ? 'Todas estaban en su sitio: no hubo nada que mover.'
        : `Se movieron ${r.piezas_movidas} piezas al grupo que les toca.`
        + (r.sin_grupo_que_alcance > 0
          ? ` Ojo: ${r.sin_grupo_que_alcance} no llegan ni con el grupo más alto; hace falta crear uno por encima.`
          : ''),
    );
    setReasignando(false);
    await recargar();
  }

  // Las que se quedaron cortas de margen, para avisarlo sin que haya que
  // ir a auditar la tabla a mano.
  const bajas = objetivo === null ? [] : modelos.filter((m) => m.margen_pct !== null && m.margen_pct < objetivo - 0.5);

  function cambiarFiltro<K extends keyof FiltrosInventario>(campo: K, valor: string) {
    setFiltros((f) => ({ ...f, [campo]: valor }));
    setPagina(0);
  }

  async function desactivar(id: number, nombre: string) {
    if (!window.confirm(`Retirar "${nombre}" del catálogo? Sus ventas pasadas se conservan.`)) return;
    const { error: err } = await supabase.rpc('admin_desactivar_modelo', { p_id: id });
    if (err) setError(mensajeDeError(err));
    else await recargar();
  }

  /*
    La fila de totales. Antes restaba el costo en dolares BCV de una venta en
    dolares BINANCE: dos monedas en una misma resta, y el margen que salia no
    era de nada. Ahora cada total esta en la misma moneda que la columna que
    suma, y solo entran las piezas que tienen precio: una sin precio pondria
    su costo sin su venta y hundiria el margen.
  */
  const totales = useMemo(() => {
    const piezas = modelos.reduce((n, m) => n + (m.existencia_total ?? 0), 0);
    const conPrecio = modelos.filter((m) => m.precio_usd !== null);
    const por = (f: (m: ModeloAdmin) => number | null) =>
      sumar(conPrecio.map((m) => porCantidad(aMonto(f(m) ?? 0), m.existencia_total ?? 0)));
    const costoBcv = por((m) => m.costo_total_usd);
    const ventaBcv = por((m) => m.precio_usd);
    const ventaBs = por((m) => m.precio_bs);
    const gananciaBinance = por((m) => m.ganancia_real_usd);
    const gananciaBcv = ventaBcv - costoBcv;
    return {
      piezas,
      costoBcv: deMonto(costoBcv),
      ventaBcv: deMonto(ventaBcv),
      ventaBs: deMonto(ventaBs),
      // Lo mismo que cobraria todo si se pagara en dolares: Bs entre la tasa Binance.
      ventaBinance: binanceDesdeBs(deMonto(ventaBs), tasa?.tasa_venta),
      gananciaBinance: deMonto(gananciaBinance),
      gananciaBcv: deMonto(gananciaBcv),
      margenPct: ventaBcv > 0n ? (deMonto(gananciaBcv) / deMonto(ventaBcv)) * 100 : null,
    };
  }, [modelos, tasa?.tasa_venta]);

  // El detalle pasa de pieza en pieza por la pagina que se esta viendo.
  const fichas = useMemo<FotoAmpliada[]>(() => modelos.map((m) => ({
    clave: m.id,
    nombre: m.nombre,
    categoria: m.categoria,
    materiales: textos.materiales_corto ?? null,
    variantes: [{
      id: m.id,
      etiqueta: m.variante,
      sku: m.sku,
      path: m.foto_path,
      thumbPath: m.foto_thumb_path,
      bs: m.precio_bs,
      bcv: m.precio_usd,
      binance: binanceDesdeBs(m.precio_bs, tasa?.tasa_venta),
      quedan: m.existencia_total,
      nota: m.variantes_nota,
    }],
  })), [modelos, textos.materiales_corto, tasa?.tasa_venta]);

  function verFoto(id: number) {
    const ficha = fichas.find((f) => f.clave === id);
    if (ficha) visor.abrir(ficha, fichas);
  }

  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <div className="pagina">
      <div className="encabezado-pagina">
        <div>
          <h1>Inventario</h1>
          <p>{total} productos activos · los precios en Bs salen de la tasa vigente, no estan guardados.</p>
        </div>
        <Link className="boton" to="/admin/modelos/nuevo">Agregar producto</Link>
      </div>

      {bajas.length > 0 && objetivo !== null ? (
        <Aviso tono="alerta" titulo={`${bajas.length} piezas por debajo del ${objetivo} % objetivo`}>
          <p>
            Están en un grupo más barato del que les toca por su costo, así que
            se venden dejando menos de lo que deberían. Pasa cuando el grupo se
            elige antes de teclear el costo final.
          </p>
          <p className="campo__pista">
            Las mas flojas: {bajas.slice(0, 3).map((m) => `${m.sku} (${formatearPorcentaje(m.margen_pct)})`).join(' · ')}
          </p>
          <div className="acciones acciones--sueltas" style={{ marginTop: 'var(--e-3)' }}>
            <button type="button" className="boton boton--confirmar" disabled={reasignando} onClick={() => void reasignar()}>
              {reasignando ? 'Reasignando' : 'Ponerlas en su grupo'}
            </button>
          </div>
        </Aviso>
      ) : null}

      {reasignado ? <Aviso tono="exito">{reasignado}</Aviso> : null}
      {movido ? <Aviso tono="exito">{movido}</Aviso> : null}

      <Ayuda titulo="Qué dice cada columna">
        <p>
          <strong>Costo puesto</strong> es lo que pagaste por la pieza más su
          flete, en dolares Binance. <strong>Costo total</strong> es esa
          mercancía ya convertida a BCV más lo que la pieza carga de tienda
          -alquiler, sueldo, empaque-, y contra ese número se mide el margen
          de verdad.
        </p>
        <p>
          <strong>Etiqueta</strong> es el precio en dolares BCV y
          {' '}<strong>Paga en Bs</strong> lo mismo a la tasa de hoy.
          {' '}<strong>Paga en $ Binance</strong> es lo que se cobra si la
          clienta paga en dólares, en efectivo o por Binance: los bolívares
          entre la tasa Binance.
          {' '}<strong>Ganancia real</strong> es lo que te queda en dolares
          Binance: lo que puedes cambiar y volver a invertir en mercancía.
        </p>
        <p>
          <strong>Mínimo</strong> es hasta dónde puede bajar la vendedora para
          cerrar una venta de pocas piezas: el mayor entre la rebaja máxima que
          fijaste en Costos y el precio que todavía deja el margen mínimo. Es
          la misma cifra que ella ve en cada tarjeta del mostrador.
        </p>
        <p>
          Toca dos veces una foto para verla en grande, con su categoría y sus
          materiales. Los botones de editar y retirar van anclados a la
          izquierda, así que siguen ahi aunque corras la tabla a lo ancho.
        </p>
        <p>
          Los precios en bolivares no están guardados: se calculan con la tasa
          vigente cada vez que abres la pantalla.
        </p>
      </Ayuda>

      <VisorFoto {...visor.props} />

      {moviendo ? (
        <MoverUbicacion
          piezas={[{ modelo_id: moviendo.id, nombre: moviendo.nombre, variante: moviendo.variante }]}
          alCerrar={() => setMoviendo(null)}
          alMover={(mensaje) => { setMoviendo(null); setMovido(mensaje); void recargar(); }}
        />
      ) : null}

      {error ? <Aviso tono="error">{error}</Aviso> : null}
      {errorCarga ? <Aviso tono="error" titulo="No se pudo leer el inventario">{errorCarga}</Aviso> : null}
      {!tasa ? (
        <Aviso tono="alerta" titulo="Sin tasa vigente">
          Fija la tasa en la pantalla de Tasas para ver los precios en bolivares.
        </Aviso>
      ) : null}

      <Filtros activos={[filtros.texto, filtros.categoria, filtros.grupoId, filtros.ubicacionId, filtros.loteId].filter(Boolean).length}>
        <div className="fila">
          <Campo etiqueta="Buscar" htmlFor="f-texto">
            <input id="f-texto" value={filtros.texto} onChange={(e) => cambiarFiltro('texto', e.target.value)} placeholder="Nombre o SKU" />
          </Campo>
          <Campo etiqueta="Categoría" htmlFor="f-cat">
            <select id="f-cat" value={filtros.categoria} onChange={(e) => cambiarFiltro('categoria', e.target.value)}>
              <option value="">Todas</option>
              {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Grupo" htmlFor="f-grupo">
            <select id="f-grupo" value={filtros.grupoId} onChange={(e) => cambiarFiltro('grupoId', e.target.value)}>
              <option value="">Todos</option>
              {grupos.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Ubicación" htmlFor="f-ubi">
            <select id="f-ubi" value={filtros.ubicacionId} onChange={(e) => cambiarFiltro('ubicacionId', e.target.value)}>
              <option value="">Todas</option>
              {ubicaciones.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Lote" htmlFor="f-lote">
            <select id="f-lote" value={filtros.loteId} onChange={(e) => cambiarFiltro('loteId', e.target.value)}>
              <option value="">Todos</option>
              {lotes.map((l) => <option key={l.id} value={l.id}>{l.codigo}</option>)}
            </select>
          </Campo>
        </div>
      </Filtros>

      {cargando ? <Cargando /> : modelos.length === 0 ? (
        <Vacio titulo="No hay productos con esos filtros">
          <p>Quita algun filtro, o agrega el primer producto del inventario.</p>
        </Vacio>
      ) : (
        <>
          <div className="tabla-envoltura tabla-envoltura--alta">
            <table className="tabla">
              <thead>
                <tr>
                  <th className="col-fija"><span className="visualmente-oculto">Acciones</span></th>
                  <th></th>
                  <th>SKU</th>
                  <th>Modelo</th>
                  <th>Grupo</th>
                  <th>Lote</th>
                  <th className="num">Costo puesto · $ Binance</th>
                  <th className="num">Costo total · $ BCV</th>
                  <th className="num">Etiqueta · $ BCV</th>
                  <th className="num">Paga · Bs</th>
                  <th className="num">Paga · $ Binance</th>
                  <th className="num">Mínimo · Bs</th>
                  <th className="num">Ganancia · $ Binance</th>
                  <th className="num">Ganancia · $ BCV</th>
                  <th className="num">Margen %</th>
                  <th className="num">Existencia</th>
                </tr>
              </thead>
              <tbody>
                {modelos.map((m) => {
                  const porUbicacion = existencias.get(m.id) ?? [];
                  const detalle = porUbicacion
                    .filter((e) => e.cantidad > 0)
                    .map((e) => `${ubicaciones.find((u) => u.id === e.ubicacion_id)?.nombre ?? 'Ubicacion'}: ${e.cantidad}`)
                    .join(' · ');
                  const foto = urlPublicaFoto(m.foto_thumb_path);

                  return (
                    <tr key={m.id}>
                      <td className="col-fija">
                        <div className="grupo-botones grupo-botones--firme">
                          <Link className="boton boton--secundario boton--pequeno" to={`/admin/modelos/${m.id}`}>Editar</Link>
                          {/* Mover de ubicacion sin abrir el producto entero. */}
                          <button
                            type="button"
                            className="boton boton--secundario boton--pequeno"
                            disabled={m.existencia_total <= 0}
                            onClick={() => { setMovido(null); setMoviendo(m); }}
                          >
                            <Icono nombre="mover" className="icono icono--sm" />
                            Mover
                          </button>
                          <button type="button" className="boton boton--peligro boton--pequeno" onClick={() => void desactivar(m.id, m.nombre)}>
                            Retirar
                          </button>
                        </div>
                      </td>
                      <td>
                        {foto ? (
                          <button
                            type="button"
                            className="miniatura miniatura--tocable"
                            style={{ padding: 0, backgroundImage: `url(${foto})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
                            aria-label={`Ver la foto de ${m.nombre}`}
                            onClick={() => verFoto(m.id)}
                          />
                        ) : <span className="miniatura" />}
                      </td>
                      <td className="celda-sku">{m.sku}</td>
                      <td>
                        <div className="celda-nombre">
                          {m.nombre}
                          {m.variante ? <span className="etiqueta-variante">{m.variante}</span> : null}
                        </div>
                        {m.variantes_nota ? <div className="celda-nota">{m.variantes_nota}</div> : null}
                      </td>
                      <td className="util">{m.grupo ?? '—'}</td>
                      <td className="util">{m.lote_codigo ?? '—'}</td>
                      <td className="num">{formatearMonto(m.costo_puesto_usd, 4)}</td>
                      <td className="num">
                        {formatearMonto(m.costo_total_usd, 4)}
                        <div className="celda-nota">{formatearMonto(m.costo_mercancia_bcv)} mercancía + {formatearMonto(m.costo_operativo_usd)} tienda</div>
                      </td>
                      <td className="num">{formatearMonto(m.precio_usd)}</td>
                      <td className="num precio">{formatearBs(m.precio_bs)}</td>
                      <td className="num">{formatearMonto(binanceDesdeBs(m.precio_bs, tasa?.tasa_venta))}</td>
                      <td className="num">
                        {m.precio_minimo_bs != null && m.precio_bs != null && m.precio_minimo_bs < m.precio_bs ? (
                          <>
                            {formatearBs(m.precio_minimo_bs)}
                            <div className="celda-nota">
                              {rebajaMaximaPct(m.precio_bs, m.precio_minimo_bs)} % menos · {formatearBcv(m.precio_minimo_usd ?? null)}
                            </div>
                          </>
                        ) : <span className="secundario util">precio fijo</span>}
                      </td>
                      <td className="num">{formatearMonto(m.ganancia_real_usd)}</td>
                      <td className={m.margen_usd !== null && m.margen_usd < 0 ? 'num negativo' : 'num positivo'}>
                        {formatearMonto(m.margen_usd)}
                      </td>
                      <td className={m.margen_pct !== null && m.margen_pct < 0 ? 'num negativo' : 'num'}>
                        {formatearPorcentaje(m.margen_pct)}
                      </td>
                      <td className="num">
                        {m.existencia_total <= 2 ? (
                          <span className="etiqueta etiqueta--alerta">{m.existencia_total}</span>
                        ) : m.existencia_total}
                        {detalle ? <div className="celda-nota">{detalle}</div> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  {/* Una celda por columna, en la moneda de su cabecera. */}
                  <td colSpan={7}>{totales.piezas} piezas en esta pagina</td>
                  <td className="num">{formatearMonto(totales.costoBcv)}</td>
                  <td className="num">{formatearMonto(totales.ventaBcv)}</td>
                  <td className="num">{formatearBs(totales.ventaBs)}</td>
                  <td className="num">{formatearMonto(totales.ventaBinance)}</td>
                  <td></td>
                  <td className="num">{formatearMonto(totales.gananciaBinance)}</td>
                  <td className={totales.gananciaBcv < 0 ? 'num negativo' : 'num positivo'}>{formatearMonto(totales.gananciaBcv)}</td>
                  <td className="num">{formatearPorcentaje(totales.margenPct)}</td>
                  <td className="num">{totales.piezas}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* En el telefono la lista mide 12.500 px, asi que la paginacion
              de abajo esta a un viaje de distancia. Esta de arriba es la
              misma, alcanzable sin deslizar nada. */}
          <div className="paginacion paginacion--arriba">
            <button type="button" className="boton boton--secundario boton--pequeno" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>
              Anterior
            </button>
            <span className="paginacion__cuenta">Página {pagina + 1} de {paginas}</span>
            <button type="button" className="boton boton--secundario boton--pequeno" disabled={pagina + 1 >= paginas} onClick={() => setPagina((p) => p + 1)}>
              Siguiente
            </button>
          </div>

          {/*
            LO MISMO, PERO EN EL TELEFONO.

            La tabla tiene trece columnas. En un telefono se deslizaba a lo
            ancho y solo se veian los dos botones y media SKU: no servia
            para nada. Aqui van las siete cosas por las que de verdad se
            entra al inventario desde el telefono, y las dos acciones.

            Es una lista aparte y no la misma tabla reflotada con CSS a
            proposito: en un telefono lo correcto no es enseñar lo mismo
            reacomodado, es enseñar menos.
          */}
          <ul className="fichas-inv">
            {modelos.map((m) => {
              const foto = urlPublicaFoto(m.foto_thumb_path);
              return (
                <li className="ficha-inv" key={m.id}>
                  {foto ? (
                    <button
                      type="button"
                      className="miniatura miniatura--tocable ficha-inv__foto"
                      style={{ padding: 0, backgroundImage: `url(${foto})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
                      aria-label={`Ver la foto de ${m.nombre}`}
                      onClick={() => verFoto(m.id)}
                    />
                  ) : <span className="miniatura ficha-inv__foto" />}

                  <div className="ficha-inv__cuerpo">
                    <div className="ficha-inv__sku">{m.sku} · {m.grupo ?? 'sin grupo'}</div>
                    <div className="ficha-inv__nombre">
                      {m.nombre}
                      {m.variante ? <span className="etiqueta-variante">{m.variante}</span> : null}
                    </div>
                    <div className="ficha-inv__precio">
                      {formatearBs(m.precio_bs)}
                      <span className="ficha-inv__usd">{formatearBcv(m.precio_usd)}</span>
                      {tasa ? <span className="ficha-inv__usd">{formatearBinance(binanceDesdeBs(m.precio_bs, tasa.tasa_venta))}</span> : null}
                    </div>
                    {m.precio_minimo_bs != null && m.precio_bs != null && m.precio_minimo_bs < m.precio_bs ? (
                      <div className="ficha-inv__minimo">Mínimo {formatearBs(m.precio_minimo_bs)}</div>
                    ) : null}
                    <div className="ficha-inv__datos">
                      <span className={m.margen_pct !== null && m.margen_pct < 0 ? 'negativo' : undefined}>
                        Margen {formatearPorcentaje(m.margen_pct)}
                      </span>
                      <span>
                        {m.existencia_total <= 2
                          ? <span className="etiqueta etiqueta--alerta">{m.existencia_total}</span>
                          : m.existencia_total} en tienda
                      </span>
                    </div>
                    <div className="grupo-botones">
                      <Link className="boton boton--secundario boton--pequeno" to={`/admin/modelos/${m.id}`}>Editar</Link>
                      <button
                        type="button"
                        className="boton boton--secundario boton--pequeno"
                        disabled={m.existencia_total <= 0}
                        onClick={() => { setMovido(null); setMoviendo(m); }}
                      >
                        <Icono nombre="mover" className="icono icono--sm" />
                        Mover
                      </button>
                      <button type="button" className="boton boton--peligro boton--pequeno" onClick={() => void desactivar(m.id, m.nombre)}>
                        Retirar
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="paginacion">
            <button type="button" className="boton boton--secundario" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>
              Anterior
            </button>
            <span className="paginacion__cuenta">Página {pagina + 1} de {paginas}</span>
            <button type="button" className="boton boton--secundario" disabled={pagina + 1 >= paginas} onClick={() => setPagina((p) => p + 1)}>
              Siguiente
            </button>
          </div>
        </>
      )}
    </div>
  );
}
