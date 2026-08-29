import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Cargando, Campo, Vacio } from '../../componentes/Piezas';
import { aMonto, deMonto, formatearBs, formatearGramos, formatearPorcentaje, formatearUsd, porCantidad, sumar } from '../../lib/dinero';
import { urlPublicaFoto } from '../../lib/fotos';
import { useGrupos, useUbicaciones } from '../../hooks/useCatalogos';
import { useTasa } from '../../hooks/useTasa';
import { FILTROS_VACIOS, POR_PAGINA, useInventario } from '../../hooks/useInventario';
import type { FiltrosInventario } from '../../hooks/useInventario';

const CATEGORIAS = ['anillo', 'pulsera', 'cadena', 'choker', 'arete', 'tobillera', 'set'];

/**
 * Vista de inventario del administrador: densa, tabular, para comparar cifras.
 * Muestra costo puesto, precio, margen en $ y en %.
 * La vendedora no llega aqui: la vista v_catalogo_admin filtra con es_admin().
 */
export function Inventario() {
  const [filtros, setFiltros] = useState<FiltrosInventario>(FILTROS_VACIOS);
  const [pagina, setPagina] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lotes, setLotes] = useState<{ id: number; codigo: string }[]>([]);

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

  function cambiarFiltro<K extends keyof FiltrosInventario>(campo: K, valor: string) {
    setFiltros((f) => ({ ...f, [campo]: valor }));
    setPagina(0);
  }

  async function desactivar(id: number, nombre: string) {
    if (!window.confirm(`Retirar "${nombre}" del catalogo? Sus ventas pasadas se conservan.`)) return;
    const { error: err } = await supabase.rpc('admin_desactivar_modelo', { p_id: id });
    if (err) setError(mensajeDeError(err));
    else await recargar();
  }

  const totales = useMemo(() => {
    const piezas = modelos.reduce((n, m) => n + (m.existencia_total ?? 0), 0);
    const costo = sumar(modelos.map((m) => porCantidad(aMonto(m.costo_puesto_usd), m.existencia_total ?? 0)));
    const venta = sumar(modelos.map((m) => porCantidad(aMonto(m.precio_usd ?? 0), m.existencia_total ?? 0)));
    return { piezas, costoUsd: deMonto(costo), ventaUsd: deMonto(venta), margenUsd: deMonto(venta - costo) };
  }, [modelos]);

  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <div className="pagina">
      <div className="encabezado-pagina">
        <div>
          <h1>Inventario</h1>
          <p>{total} modelos activos · los precios en Bs salen de la tasa vigente, no estan guardados.</p>
        </div>
        <Link className="boton" to="/admin/modelos/nuevo">Cargar modelo</Link>
      </div>

      {error ? <Aviso tono="error">{error}</Aviso> : null}
      {errorCarga ? <Aviso tono="error" titulo="No se pudo leer el inventario">{errorCarga}</Aviso> : null}
      {!tasa ? (
        <Aviso tono="alerta" titulo="Sin tasa vigente">
          Fija la tasa en la pantalla de Tasas para ver los precios en bolivares.
        </Aviso>
      ) : null}

      <div className="tarjeta" style={{ marginBottom: 'var(--e-5)' }}>
        <div className="fila">
          <Campo etiqueta="Buscar" htmlFor="f-texto">
            <input id="f-texto" value={filtros.texto} onChange={(e) => cambiarFiltro('texto', e.target.value)} placeholder="Nombre o SKU" />
          </Campo>
          <Campo etiqueta="Categoria" htmlFor="f-cat">
            <select id="f-cat" value={filtros.categoria} onChange={(e) => cambiarFiltro('categoria', e.target.value)}>
              <option value="">Todas</option>
              {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Grupo" htmlFor="f-grupo">
            <select id="f-grupo" value={filtros.grupoId} onChange={(e) => cambiarFiltro('grupoId', e.target.value)}>
              <option value="">Todos</option>
              {grupos.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Ubicacion" htmlFor="f-ubi">
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
      </div>

      {cargando ? <Cargando /> : modelos.length === 0 ? (
        <Vacio titulo="No hay modelos con esos filtros">
          <p>Quita algun filtro, o carga el primer modelo del inventario.</p>
        </Vacio>
      ) : (
        <>
          <div className="tabla-envoltura">
            <table className="tabla">
              <thead>
                <tr>
                  <th></th>
                  <th>SKU</th>
                  <th>Modelo</th>
                  <th>Grupo</th>
                  <th>Lote</th>
                  <th className="num">Peso</th>
                  <th className="num">Costo puesto</th>
                  <th className="num">Precio $</th>
                  <th className="num">Precio Bs</th>
                  <th className="num">Margen $</th>
                  <th className="num">Margen %</th>
                  <th className="num">Existencia</th>
                  <th></th>
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
                      <td>{foto ? <img className="miniatura" src={foto} alt="" loading="lazy" /> : <span className="miniatura" />}</td>
                      <td className="celda-sku">{m.sku}</td>
                      <td>
                        <div className="celda-nombre">{m.nombre}</div>
                        {m.variantes_nota ? <div className="celda-nota">{m.variantes_nota}</div> : null}
                      </td>
                      <td className="util">{m.grupo ?? '—'}</td>
                      <td className="util">{m.lote_codigo ?? '—'}</td>
                      <td className="num">{formatearGramos(m.peso_unitario_g)}</td>
                      <td className="num">{formatearUsd(m.costo_puesto_usd, 4)}</td>
                      <td className="num">{formatearUsd(m.precio_usd)}</td>
                      <td className="num precio">{formatearBs(m.precio_bs)}</td>
                      <td className={m.margen_usd !== null && m.margen_usd < 0 ? 'num negativo' : 'num positivo'}>
                        {formatearUsd(m.margen_usd)}
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
                      <td>
                        <div className="grupo-botones grupo-botones--firme">
                          <Link className="boton boton--secundario boton--pequeno" to={`/admin/modelos/${m.id}`}>Editar</Link>
                          <button type="button" className="boton boton--peligro boton--pequeno" onClick={() => void desactivar(m.id, m.nombre)}>
                            Retirar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={6}>{totales.piezas} piezas en esta pagina</td>
                  <td className="num">{formatearUsd(totales.costoUsd)}</td>
                  <td className="num" colSpan={2}>{formatearUsd(totales.ventaUsd)}</td>
                  <td className="num" colSpan={2}>{formatearUsd(totales.margenUsd)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="paginacion">
            <button type="button" className="boton boton--secundario" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>
              Anterior
            </button>
            <span className="paginacion__cuenta">Pagina {pagina + 1} de {paginas}</span>
            <button type="button" className="boton boton--secundario" disabled={pagina + 1 >= paginas} onClick={() => setPagina((p) => p + 1)}>
              Siguiente
            </button>
          </div>
        </>
      )}
    </div>
  );
}
