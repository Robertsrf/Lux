import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Ayuda, Cargando, Campo, Vacio, Filtros } from '../../componentes/Piezas';
import {
  aMonto, binanceDesdeBs, deMonto, formatearBcv, formatearBinance, formatearBs, formatearMonto,
  formatearPorcentaje, porCantidad, rebajaMaximaPct, sumar,
} from '../../lib/dinero';
import { agruparPorFamilia, conFoto, etiquetasCortas, nombreConVariante, rangoDe } from '../../lib/familias';
import type { Familia } from '../../lib/familias';
import { useTextos } from '../../hooks/useTextos';
import { useCategorias, useGrupos, useUbicaciones } from '../../hooks/useCatalogos';
import { useTasa } from '../../hooks/useTasa';
import { VisorFoto, useVisorFoto } from '../../componentes/VisorFoto';
import { MoverUbicacion } from '../../componentes/MoverUbicacion';
import { MiniaturaTocable } from '../../componentes/MiniaturaTocable';
import { Icono } from '../../componentes/Iconos';
import type { FotoAmpliada } from '../../componentes/VisorFoto';
import { FILTROS_VACIOS, POR_PAGINA, useInventario } from '../../hooks/useInventario';
import type { FiltrosInventario } from '../../hooks/useInventario';
import type { ModeloAdmin } from '../../lib/tipos';

/**
 * Una cifra de las medidas de un producto: "Bs 700,00 – Bs 950,00", o una
 * sola si todas valen lo mismo. La más baja y la más alta, nunca un
 * promedio: no hay ninguna pieza que cueste eso.
 */
function rango(filas: ModeloAdmin[], valor: (m: ModeloAdmin) => number | null | undefined, formato: (n: number | null) => string): string {
  const { min, max } = rangoDe(filas, valor);
  if (min === null || max === null) return formato(null);
  return min === max ? formato(min) : `${formato(min)} – ${formato(max)}`;
}

/** "desde Bs 700,00", o la cifra sola si todas las medidas valen lo mismo. */
function desde(filas: ModeloAdmin[], valor: (m: ModeloAdmin) => number | null | undefined, formato: (n: number | null) => string): string {
  const { min, max } = rangoDe(filas, valor);
  return min !== null && max !== null && min !== max ? `desde ${formato(min)}` : formato(min);
}

/** El grupo o el lote, si todas las medidas comparten uno. */
function unico(valores: (string | null)[]): string {
  const distintos = [...new Set(valores.map((v) => v ?? '—'))];
  return distintos.length === 1 ? distintos[0]! : 'varios';
}

function tieneMinimo(m: ModeloAdmin): boolean {
  return m.precio_minimo_bs != null && m.precio_bs != null && m.precio_minimo_bs < m.precio_bs;
}

/**
 * Dije o base para armar, junto al nombre: el dije va sin lo de tienda, y
 * por eso su margen y su grupo no se leen como los de una pieza.
 */
function EtiquetaArmado({ armado }: { armado?: ModeloAdmin['armado'] }) {
  if (armado === 'dije') return <span className="etiqueta-variante">dije</span>;
  if (armado === 'base') return <span className="etiqueta-variante">para armar</span>;
  return null;
}

/**
 * Lo de los lotes que no han llegado, dicho junto a la existencia. Una
 * pieza nueva de un lote en camino no tiene existencia (lo suyo va aparte
 * hasta liberarlo): sale "Próximamente" y cuántas vienen, no un 0 en
 * alerta. Una que ya se vende y repone dice cuántas más vienen.
 */
function notaPorLlegar(vs: ModeloAdmin[]) {
  const vienen = vs.reduce((n, m) => n + (m.por_llegar ?? 0), 0);
  const lotes = [...new Set(vs.flatMap((m) => (m.por_llegar_lotes ?? '').split(' · ')).filter(Boolean))].join(' · ');
  if (vs.length > 0 && vs.every((m) => m.proximamente)) {
    return (
      <div className="celda-nota">
        <span className="etiqueta etiqueta--proxima">Próximamente</span>
        {' '}{vienen > 0 ? `llegan ${vienen}` : 'sin cantidad'}{lotes ? ` · ${lotes}` : ''}
      </div>
    );
  }
  return vienen > 0 ? <div className="celda-nota">+{vienen} en camino{lotes ? ` · ${lotes}` : ''}</div> : null;
}

/** La existencia de una pieza o de un producto: sin alerta de "quedan pocas" si todavía no ha llegado. */
function cifraExistencia(n: number, proximo: boolean) {
  if (proximo) return <span className="secundario">—</span>;
  return n <= 2 ? <span className="etiqueta etiqueta--alerta">{n}</span> : n;
}

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
  // Lo que se está moviendo de ubicación: una pieza, o las medidas de un producto.
  const [moviendo, setMoviendo] = useState<ModeloAdmin[] | null>(null);
  const [movido, setMovido] = useState<string | null>(null);
  // Los productos con medidas que están abiertos.
  const [abiertas, setAbiertas] = useState<Set<number>>(new Set());
  const [lotes, setLotes] = useState<{ id: number; codigo: string; en_camino: boolean }[]>([]);
  const visor = useVisorFoto();

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from('v_lotes_admin').select('id, codigo, en_camino').order('fecha_llegada', { ascending: false });
      setLotes((data as { id: number; codigo: string; en_camino: boolean }[] | null) ?? []);
    })();
  }, []);

  const { grupos } = useGrupos();
  const { ubicaciones } = useUbicaciones();
  const { tasa } = useTasa();
  const { modelos, existencias, apartadas, total, cargando, error: errorCarga, recargar } = useInventario(filtros, pagina);

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
    // `dijes_sin_escalera` llega desde esquema-dijes.sql; antes no existía.
    const r = data as { piezas_movidas: number; sin_grupo_que_alcance: number; dijes_sin_escalera?: number };
    const dijes = r.dijes_sin_escalera ?? 0;
    setReasignado(
      (r.piezas_movidas === 0
        ? 'Todas estaban en su sitio: no hubo nada que mover.'
        : `Se movieron ${r.piezas_movidas} piezas al grupo que les toca.`
        + (r.sin_grupo_que_alcance > 0
          ? ` Ojo: ${r.sin_grupo_que_alcance} no llegan ni con el grupo más alto; hace falta crear uno por encima.`
          : ''))
      + (dijes > 0
        ? ` ${dijes === 1 ? 'Un dije sigue' : `${dijes} dijes siguen`} en un grupo de las piezas: carga la escalera de los dijes en Grupos y vuelve a reacomodar.`
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
    const m = modelos.find((x) => x.id === id);
    const hay = m?.existencia_total ?? 0;
    const deUnPedido = apartadas.get(id) ?? 0;
    if (deUnPedido > 0) {
      setError(`"${nombre}" tiene ${deUnPedido} apartada${deUnPedido === 1 ? '' : 's'} por pedidos. Entrega o cancela esos pedidos en Pedidos y después retírala.`);
      return;
    }
    // Retirar no saca las piezas de la tienda: dejan de verse en el
    // mostrador y en el catálogo, pero siguen en el cierre del día.
    const aviso = hay > 0
      ? `\n\nTodavía hay ${hay} pieza${hay === 1 ? '' : 's'} en la tienda: dejarán de verse en el mostrador y en el catálogo, pero siguen contando en el cierre del día. Si ya no están, pon su existencia en cero antes de retirarla.`
      : '';
    if (!window.confirm(`Retirar "${nombre}" del catálogo? Sus ventas pasadas se conservan.${aviso}`)) return;
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

  /*
    UN PRODUCTO, UNA FILA.

    La cadena de 45 cm y la de 60 cm salían como dos productos, uno debajo
    del otro, y el dueño no sabía si tenía dos cadenas o una con dos
    medidas. Ahora el producto ocupa una fila (con sus cifras de la medida
    más baja a la más alta y la existencia sumada) y sus medidas se abren
    debajo. La página son cincuenta productos (`useInventario`), así que
    una familia nunca queda partida entre dos páginas.
  */
  const familias = useMemo(() => agruparPorFamilia(modelos), [modelos]);

  // El detalle pasa de producto en producto por la página, y dentro de
  // cada uno se elige la medida, como en el mostrador.
  const fichas = useMemo<FotoAmpliada[]>(() => familias.map((f) => ({
    clave: f.clave,
    nombre: f.cabeza.nombre,
    categoria: f.cabeza.categoria,
    materiales: textos.materiales_corto ?? null,
    variantes: f.variantes.map((m) => ({
      id: m.id,
      etiqueta: m.variante,
      sku: m.sku,
      path: m.foto_path,
      thumbPath: m.foto_thumb_path,
      bs: m.precio_bs,
      bcv: m.precio_usd,
      binance: binanceDesdeBs(m.precio_bs, tasa?.tasa_venta),
      // Lo que se puede vender, como en el mostrador: sin lo apartado. Lo
      // que no ha llegado no "queda": viene.
      quedan: m.proximamente ? null : Math.max(0, m.existencia_total - (apartadas.get(m.id) ?? 0)),
      nota: m.proximamente ? ['Próximamente: su lote no ha llegado', m.variantes_nota].filter(Boolean).join(' · ') : m.variantes_nota,
    })),
  })), [familias, apartadas, textos.materiales_corto, tasa?.tasa_venta]);

  /** Abre el producto; si se tocó la foto de una medida, en esa medida. */
  function verFoto(familia: number, varianteId?: number) {
    const lista = varianteId === undefined
      ? fichas
      : fichas.map((f) => (f.clave === familia ? { ...f, inicial: varianteId } : f));
    const ficha = lista.find((f) => f.clave === familia);
    if (ficha) visor.abrir(ficha, lista);
  }

  function alternar(familia: number) {
    setAbiertas((antes) => {
      const despues = new Set(antes);
      if (despues.has(familia)) despues.delete(familia); else despues.add(familia);
      return despues;
    });
  }

  /** "Bóveda: 3 · Vitrina 1: 2", sumando las medidas que se pidan. */
  function detalleUbicaciones(ids: number[]): string {
    const suma = new Map<number, number>();
    for (const id of ids) {
      for (const e of existencias.get(id) ?? []) {
        if (e.cantidad > 0) suma.set(e.ubicacion_id, (suma.get(e.ubicacion_id) ?? 0) + e.cantidad);
      }
    }
    return [...suma]
      .map(([u, n]) => `${ubicaciones.find((x) => x.id === u)?.nombre ?? 'Ubicación'}: ${n}`)
      .join(' · ');
  }

  function textoApartadas(n: number): string {
    return `${n} apartada${n === 1 ? '' : 's'} por pedidos`;
  }

  function botonMover(piezas: ModeloAdmin[], etiqueta = 'Mover') {
    const conPiezas = piezas.filter((m) => m.existencia_total > 0);
    return (
      <button
        type="button"
        className="boton boton--secundario boton--pequeno"
        disabled={conPiezas.length === 0}
        onClick={() => { setMovido(null); setMoviendo(conPiezas); }}
      >
        <Icono nombre="mover" className="icono icono--sm" />
        {etiqueta}
      </button>
    );
  }

  function botonRetirar(m: ModeloAdmin) {
    return (
      <button type="button" className="boton boton--peligro boton--pequeno" onClick={() => void desactivar(m.id, nombreConVariante(m.nombre, m.variante))}>
        Retirar
      </button>
    );
  }

  /**
   * Abre y cierra las medidas. Va sobre el nombre del producto y no entre
   * los botones anclados: ahí ensanchaba la columna fija a media pantalla.
   */
  function botonMedidas(f: Familia<ModeloAdmin>) {
    const abierta = abiertas.has(f.clave);
    return (
      <button
        type="button"
        className="boton-medidas"
        aria-expanded={abierta}
        aria-label={`${abierta ? 'Ocultar' : 'Ver'} las ${f.variantes.length} medidas de ${f.cabeza.nombre}`}
        onClick={() => alternar(f.clave)}
      >
        {f.variantes.length} medidas: {etiquetasCortas(f, 40) || 'sin nombre'}
      </button>
    );
  }

  /** Una pieza: suelta, o una medida debajo de su producto. */
  function filaModelo(m: ModeloAdmin, enFamilia: boolean) {
    const detalle = detalleUbicaciones([m.id]);
    const deUnPedido = apartadas.get(m.id) ?? 0;
    return (
      <tr key={m.id} className={enFamilia ? 'fila-variante' : undefined}>
        <td className="col-fija">
          <div className="grupo-botones grupo-botones--firme">
            {/* La medida no lleva Editar: el formulario es del producto
                entero y ya está en su fila. */}
            {enFamilia ? null : <Link className="boton boton--secundario boton--pequeno" to={`/admin/modelos/${m.id}`}>Editar</Link>}
            {botonMover([m])}
            {botonRetirar(m)}
          </div>
        </td>
        <td>
          <MiniaturaTocable thumb={m.foto_thumb_path} nombre={nombreConVariante(m.nombre, m.variante)} alVer={() => verFoto(m.familia, m.id)} />
        </td>
        <td className="celda-sku">{m.sku}</td>
        <td className="celda-modelo">
          {enFamilia ? (
            <div className="celda-nombre fila-variante__medida">{m.variante ?? m.nombre}</div>
          ) : (
            <>
              <div className="celda-nombre">
                {m.nombre}
                {m.variante ? <span className="etiqueta-variante">{m.variante}</span> : null}
                <EtiquetaArmado armado={m.armado} />
              </div>
              {m.variantes_nota ? <div className="celda-nota">{m.variantes_nota}</div> : null}
            </>
          )}
        </td>
        <td className="util">{m.grupo ?? '—'}</td>
        <td className="util celda-lote">{m.lote_codigo ?? '—'}</td>
        <td className="num">{formatearMonto(m.costo_puesto_usd, 4)}</td>
        <td className="num">
          {formatearMonto(m.costo_total_usd, 4)}
          <div className="celda-nota">{formatearMonto(m.costo_mercancia_bcv)} mercancía + {formatearMonto(m.costo_operativo_usd)} tienda</div>
        </td>
        <td className="num">{formatearMonto(m.precio_usd)}</td>
        <td className="num precio">{formatearBs(m.precio_bs)}</td>
        <td className="num">{formatearMonto(binanceDesdeBs(m.precio_bs, tasa?.tasa_venta))}</td>
        <td className="num">
          {tieneMinimo(m) ? (
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
          {cifraExistencia(m.existencia_total, m.proximamente)}
          {notaPorLlegar([m])}
          {detalle ? <div className="celda-nota">{detalle}</div> : null}
          {/* Las de pedidos siguen en la tienda pero no se venden:
              se dice para que la cifra cuadre con el mostrador. */}
          {deUnPedido ? <div className="celda-nota">{textoApartadas(deUnPedido)}</div> : null}
        </td>
      </tr>
    );
  }

  /** En el teléfono: una pieza suelta. */
  function fichaModelo(m: ModeloAdmin) {
    const deUnPedido = apartadas.get(m.id) ?? 0;
    return (
      <li className="ficha-inv" key={m.id}>
        <MiniaturaTocable className="miniatura ficha-inv__foto" thumb={m.foto_thumb_path} nombre={nombreConVariante(m.nombre, m.variante)} alVer={() => verFoto(m.familia, m.id)} />
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
          {tieneMinimo(m) ? <div className="ficha-inv__minimo">Mínimo {formatearBs(m.precio_minimo_bs)}</div> : null}
          <div className="ficha-inv__datos">
            <span className={m.margen_pct !== null && m.margen_pct < 0 ? 'negativo' : undefined}>
              Margen {formatearPorcentaje(m.margen_pct)}
            </span>
            {m.proximamente ? null : (
              <span>
                {cifraExistencia(m.existencia_total, false)} en tienda
                {deUnPedido ? ` · ${deUnPedido} apartada${deUnPedido === 1 ? '' : 's'}` : ''}
              </span>
            )}
          </div>
          {notaPorLlegar([m])}
          <div className="grupo-botones">
            <Link className="boton boton--secundario boton--pequeno" to={`/admin/modelos/${m.id}`}>Editar</Link>
            {botonMover([m])}
            {botonRetirar(m)}
          </div>
        </div>
      </li>
    );
  }

  /** En el teléfono: el producto, y sus medidas al abrirlo. */
  function fichaFamilia(f: Familia<ModeloAdmin>) {
    const vs = f.variantes;
    const existencia = vs.reduce((n, m) => n + m.existencia_total, 0);
    const deUnPedido = vs.reduce((n, m) => n + (apartadas.get(m.id) ?? 0), 0);
    const proximo = vs.every((m) => m.proximamente);
    // Una medida que todavía no llega no está "sin piezas": está en camino.
    const sinPiezas = vs.filter((m) => m.existencia_total <= 0 && !m.proximamente).length;
    return (
      <li className="ficha-inv ficha-inv--familia" key={`f${f.clave}`}>
        <MiniaturaTocable className="miniatura ficha-inv__foto" thumb={conFoto(vs)?.foto_thumb_path ?? null} nombre={f.cabeza.nombre} alVer={() => verFoto(f.clave)} />
        <div className="ficha-inv__cuerpo">
          <div className="ficha-inv__sku">{f.cabeza.sku} · {unico(vs.map((m) => m.grupo))}</div>
          <div className="ficha-inv__nombre">{f.cabeza.nombre}</div>
          {botonMedidas(f)}
          {/* "Desde", como la tarjeta del mostrador: el rango entero no
              cabía en el ancho de un teléfono. Cada medida dice el suyo. */}
          <div className="ficha-inv__precio">
            {desde(vs, (m) => m.precio_bs, formatearBs)}
            <span className="ficha-inv__usd">{desde(vs, (m) => m.precio_usd, formatearBcv)}</span>
          </div>
          <div className="ficha-inv__datos">
            <span>Margen {rango(vs, (m) => m.margen_pct, (n) => formatearPorcentaje(n))}</span>
            {proximo ? null : (
              <span>
                {cifraExistencia(existencia, false)} en tienda
                {deUnPedido ? ` · ${deUnPedido} apartada${deUnPedido === 1 ? '' : 's'}` : ''}
              </span>
            )}
            {sinPiezas > 0 ? <span className="celda-nota--alerta">{sinPiezas === 1 ? 'Una medida sin piezas' : `${sinPiezas} medidas sin piezas`}</span> : null}
          </div>
          {notaPorLlegar(vs)}
          <div className="grupo-botones">
            <Link className="boton boton--secundario boton--pequeno" to={`/admin/modelos/${f.cabeza.id}`}>Editar</Link>
            {botonMover(vs)}
          </div>
        </div>

        {abiertas.has(f.clave) ? (
          <ul className="ficha-inv__medidas">
            {vs.map((m) => {
              const apartadasDe = apartadas.get(m.id) ?? 0;
              return (
                <li className="ficha-medida" key={m.id}>
                  <MiniaturaTocable className="miniatura ficha-medida__foto" thumb={m.foto_thumb_path} nombre={nombreConVariante(m.nombre, m.variante)} alVer={() => verFoto(f.clave, m.id)} />
                  <div className="ficha-inv__cuerpo">
                    <div className="ficha-medida__nombre">
                      {m.variante ?? m.nombre}
                      <span className="ficha-inv__sku"> · {m.sku}</span>
                    </div>
                    <div className="ficha-medida__precio">
                      {formatearBs(m.precio_bs)}
                      <span className="ficha-inv__usd">
                        {formatearBcv(m.precio_usd)}
                        {tasa ? ` · ${formatearBinance(binanceDesdeBs(m.precio_bs, tasa.tasa_venta))}` : ''}
                      </span>
                    </div>
                    {tieneMinimo(m) ? <div className="ficha-inv__minimo">Mínimo {formatearBs(m.precio_minimo_bs)}</div> : null}
                    <div className="ficha-inv__datos">
                      <span className={m.margen_pct !== null && m.margen_pct < 0 ? 'negativo' : undefined}>
                        Margen {formatearPorcentaje(m.margen_pct)}
                      </span>
                      {m.proximamente ? null : (
                        <span>
                          {cifraExistencia(m.existencia_total, false)} en tienda
                          {apartadasDe ? ` · ${apartadasDe} apartada${apartadasDe === 1 ? '' : 's'}` : ''}
                        </span>
                      )}
                    </div>
                    {notaPorLlegar([m])}
                    <div className="grupo-botones">
                      {botonMover([m])}
                      {botonRetirar(m)}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </li>
    );
  }

  /** El producto con medidas, resumido en una fila. */
  function filaFamilia(f: Familia<ModeloAdmin>) {
    const vs = f.variantes;
    const existencia = vs.reduce((n, m) => n + m.existencia_total, 0);
    const deUnPedido = vs.reduce((n, m) => n + (apartadas.get(m.id) ?? 0), 0);
    const sinPiezas = vs.filter((m) => m.existencia_total <= 0 && !m.proximamente).length;
    const conMinimo = vs.filter(tieneMinimo);
    const detalle = detalleUbicaciones(vs.map((m) => m.id));
    const margenBajo = vs.some((m) => m.margen_pct !== null && m.margen_pct < 0);
    const gananciaBaja = vs.some((m) => m.margen_usd !== null && m.margen_usd < 0);
    return (
      <tr key={`f${f.clave}`} className="fila-familia">
        <td className="col-fija">
          <div className="grupo-botones grupo-botones--firme">
            <Link className="boton boton--secundario boton--pequeno" to={`/admin/modelos/${f.cabeza.id}`}>Editar</Link>
            {botonMover(vs)}
          </div>
        </td>
        <td>
          <MiniaturaTocable thumb={conFoto(vs)?.foto_thumb_path ?? null} nombre={f.cabeza.nombre} alVer={() => verFoto(f.clave)} />
        </td>
        <td className="celda-sku">
          {f.cabeza.sku}
          <div className="celda-nota">y {vs.length - 1} más</div>
        </td>
        <td className="celda-modelo">
          <div className="celda-nombre">{f.cabeza.nombre} <EtiquetaArmado armado={f.cabeza.armado} /></div>
          {botonMedidas(f)}
          {f.cabeza.variantes_nota ? <div className="celda-nota">{f.cabeza.variantes_nota}</div> : null}
        </td>
        <td className="util">{unico(vs.map((m) => m.grupo))}</td>
        <td className="util celda-lote">{unico(vs.map((m) => m.lote_codigo))}</td>
        <td className="num">{rango(vs, (m) => m.costo_puesto_usd, (n) => formatearMonto(n, 4))}</td>
        <td className="num">{rango(vs, (m) => m.costo_total_usd, (n) => formatearMonto(n, 4))}</td>
        <td className="num">{rango(vs, (m) => m.precio_usd, (n) => formatearMonto(n))}</td>
        <td className="num precio">{rango(vs, (m) => m.precio_bs, formatearBs)}</td>
        <td className="num">{rango(vs, (m) => binanceDesdeBs(m.precio_bs, tasa?.tasa_venta), (n) => formatearMonto(n))}</td>
        <td className="num">
          {conMinimo.length > 0
            ? rango(conMinimo, (m) => m.precio_minimo_bs, formatearBs)
            : <span className="secundario util">precio fijo</span>}
        </td>
        <td className="num">{rango(vs, (m) => m.ganancia_real_usd, (n) => formatearMonto(n))}</td>
        <td className={gananciaBaja ? 'num negativo' : 'num positivo'}>{rango(vs, (m) => m.margen_usd, (n) => formatearMonto(n))}</td>
        <td className={margenBajo ? 'num negativo' : 'num'}>{rango(vs, (m) => m.margen_pct, (n) => formatearPorcentaje(n))}</td>
        <td className="num">
          {cifraExistencia(existencia, vs.every((m) => m.proximamente))}
          {notaPorLlegar(vs)}
          {detalle ? <div className="celda-nota">{detalle}</div> : null}
          {deUnPedido ? <div className="celda-nota">{textoApartadas(deUnPedido)}</div> : null}
          {/* Cerrada, la suma escondía la medida agotada. */}
          {sinPiezas > 0 ? (
            <div className="celda-nota celda-nota--alerta">{sinPiezas === 1 ? 'Una medida sin piezas' : `${sinPiezas} medidas sin piezas`}</div>
          ) : null}
        </td>
      </tr>
    );
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
          <strong>Próximamente</strong> es una pieza de un lote que todavía no
          llega: no se vende, no suma en los totales y dice cuántas vienen. Sale
          a la venta cuando liberas su lote, en Lotes. <strong>+3 en
          camino</strong>, en una que ya vendes, son tres más que llegan en un
          lote: se suman al liberarlo.
        </p>
        <p>
          Un producto con medidas (una cadena de 45 y de 60 cm) ocupa una sola
          fila: cada cifra va de la medida más baja a la más alta y la
          existencia es la suma. Toca la línea de sus medidas, debajo del
          nombre, para ver cada una con lo suyo; <strong>Editar</strong> abre
          el producto con todas sus medidas.
        </p>
        <p>
          Toca una foto para verla en grande, con su categoría y sus
          materiales. Los botones van anclados a la izquierda, así que siguen
          ahí aunque corras la tabla a lo ancho.
        </p>
        <p>
          Los precios en bolivares no están guardados: se calculan con la tasa
          vigente cada vez que abres la pantalla.
        </p>
      </Ayuda>

      <VisorFoto {...visor.props} />

      {moviendo ? (
        <MoverUbicacion
          piezas={moviendo.map((m) => ({ modelo_id: m.id, nombre: m.nombre, variante: m.variante }))}
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
              {lotes.map((l) => <option key={l.id} value={l.id}>{l.codigo}{l.en_camino ? ' · en camino' : ''}</option>)}
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
                {familias.map((f) => (f.variantes.length === 1 ? filaModelo(f.cabeza, false) : (
                  <Fragment key={`f${f.clave}`}>
                    {filaFamilia(f)}
                    {abiertas.has(f.clave) ? f.variantes.map((m) => filaModelo(m, true)) : null}
                  </Fragment>
                )))}
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
            {familias.map((f) => (f.variantes.length === 1 ? fichaModelo(f.cabeza) : fichaFamilia(f)))}
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
