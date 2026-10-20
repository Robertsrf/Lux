import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Ayuda, Campo, Cargando, Vacio } from '../../componentes/Piezas';
import { MiniaturaTocable } from '../../componentes/MiniaturaTocable';
import { VisorFoto, useVisorFoto } from '../../componentes/VisorFoto';
import { formatearEntero, formatearFecha, formatearFechaHora } from '../../lib/dinero';
import { nombreConVariante } from '../../lib/familias';
import { useUbicaciones } from '../../hooks/useCatalogos';
import type { LineaPorLlegar, LoteAdmin, LoteLiberado } from '../../lib/tipos';

type Lote = Pick<LoteAdmin, 'id' | 'codigo' | 'fecha_llegada' | 'en_camino' | 'liberado_en' | 'liberado_por' | 'piezas_esperadas' | 'piezas_recibidas'>;

/** Una pieza que ya se vende, de la búsqueda de reposición. */
interface PiezaEnVenta {
  id: number;
  sku: string;
  nombre: string;
  variante: string | null;
  existencia_total: number;
  foto_thumb_path: string | null;
}

/** Lo que se está anotando de una reposición. */
interface Reposicion {
  pieza: Pick<PiezaEnVenta, 'id' | 'sku' | 'nombre' | 'variante'>;
  ubicacionId: number | null;
  cantidad: string;
}

/** "Falta 1", "Faltan 3". */
const faltan = (n: number) => (n === 1 ? 'Falta 1' : `Faltan ${formatearEntero(n)}`);

/** Un entero que se escribe aquí: "12". Lo demás no se entiende y no se guarda. */
const entero = (texto: string): number | null => (/^\d{1,6}$/.test(texto.trim()) ? Number(texto.trim()) : null);

const COLUMNAS_LINEA = 'id, lote_id, lote_codigo, en_camino, modelo_id, sku, nombre, variante, categoria, familia, foto_path, foto_thumb_path, activo, es_nueva, ubicacion_id, ubicacion, cantidad, recibida, hay';

/**
 * LO QUE VIENE EN UN LOTE, Y LIBERARLO.
 *
 * Pedido del dueño (20/10/2026): adelantar la carga de un lote que todavía
 * no llega, sin que nada salga a la venta, y cuando llegue revisar que vino
 * todo y liberarlo.
 *
 * Mientras el lote está en camino, lo que se carga va a `por_llegar`, no a
 * la existencia (esquema-lote-en-camino.sql). Por eso no se vende, no se
 * cuenta y no sale en la vitrina: no hay que acordarse de esconderlo en
 * cada pantalla. Las clientas ven lo nuevo como "Próximamente" en el
 * catálogo en línea, sin poder pedirlo.
 *
 * Revisar es contar, como el conteo de la tienda: cada línea con lo que se
 * esperaba y un contador con lo que llegó. Liberar pone a la venta lo
 * contado, en una sola transacción, y deja escrito lo esperado y lo que
 * llegó. Si alguien cargó algo mientras se revisaba, la base no libera a
 * medias: pide recargar.
 */
export function LoteEnCamino() {
  const { id } = useParams();
  const loteId = Number(id);
  const { ubicaciones } = useUbicaciones();
  const visor = useVisorFoto();

  const [lote, setLote] = useState<Lote | null>(null);
  const [lineas, setLineas] = useState<LineaPorLlegar[]>([]);
  const [sinCantidad, setSinCantidad] = useState<{ id: number; sku: string; nombre: string; variante: string | null }[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  const [revisando, setRevisando] = useState(false);
  const [llegaron, setLlegaron] = useState<Map<number, string>>(new Map());
  const [liberando, setLiberando] = useState(false);

  const [buscando, setBuscando] = useState(false);
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState<PiezaEnVenta[]>([]);
  const [reposicion, setReposicion] = useState<Reposicion | null>(null);
  const [errorRepo, setErrorRepo] = useState<string | null>(null);
  const [guardandoRepo, setGuardandoRepo] = useState(false);

  const recargar = useCallback(async () => {
    setCargando(true);
    const [l, p, s] = await Promise.all([
      supabase.from('v_lotes_admin')
        .select('id, codigo, fecha_llegada, en_camino, liberado_en, liberado_por, piezas_esperadas, piezas_recibidas')
        .eq('id', loteId).maybeSingle(),
      supabase.from('v_por_llegar').select(COLUMNAS_LINEA)
        .eq('lote_id', loteId)
        .order('nombre', { ascending: true }).order('variante', { ascending: true, nullsFirst: true }).order('ubicacion', { ascending: true }),
      // Las nuevas que se cargaron sin decir cuántas vienen.
      supabase.from('v_catalogo_admin').select('id, sku, nombre, variante')
        .eq('lote_id', loteId).eq('proximamente', true).eq('por_llegar', 0)
        .order('nombre', { ascending: true }),
    ]);
    // Tres consultas, tres errores mirados.
    const fallo = l.error ?? p.error ?? s.error;
    setError(fallo ? mensajeDeError(fallo) : null);
    setLote((l.data as Lote | null) ?? null);
    setLineas((p.data as LineaPorLlegar[] | null) ?? []);
    setSinCantidad((s.data as { id: number; sku: string; nombre: string; variante: string | null }[] | null) ?? []);
    setCargando(false);
  }, [loteId]);

  useEffect(() => { void recargar(); }, [recargar]);

  // Lo que viene de verdad: piezas que siguen activas y con cantidad. Una
  // pieza retirada antes de que llegue el lote ya no se espera.
  const vienen = useMemo(() => lineas.filter((x) => x.activo && x.cantidad > 0), [lineas]);
  const resumen = useMemo(() => {
    const nuevas = vienen.filter((x) => x.es_nueva);
    const repo = vienen.filter((x) => !x.es_nueva);
    return {
      piezas: vienen.reduce((n, x) => n + x.cantidad, 0),
      nuevas: nuevas.reduce((n, x) => n + x.cantidad, 0),
      productosNuevos: new Set(nuevas.map((x) => x.familia)).size,
      repo: repo.reduce((n, x) => n + x.cantidad, 0),
      productosRepo: new Set(repo.map((x) => x.familia)).size,
    };
  }, [vienen]);

  // Lo contado al revisar, contra lo esperado. Lo que no se entiende no cuenta como cero: se dice.
  const revision = useMemo(() => {
    let contadas = 0;
    let faltan = 0;
    let sobran = 0;
    const malas: string[] = [];
    const diferencias: { nombre: string; esperadas: number; llegaron: number }[] = [];
    for (const x of vienen) {
      const n = entero(llegaron.get(x.id) ?? '');
      const nombre = `${nombreConVariante(x.nombre, x.variante)} · ${x.ubicacion}`;
      if (n === null) { malas.push(nombre); continue; }
      contadas += n;
      if (n < x.cantidad) faltan += x.cantidad - n;
      if (n > x.cantidad) sobran += n - x.cantidad;
      if (n !== x.cantidad) diferencias.push({ nombre, esperadas: x.cantidad, llegaron: n });
    }
    return { contadas, faltan, sobran, malas, diferencias };
  }, [vienen, llegaron]);

  // La búsqueda de reposición: piezas que ya se venden (lo próximo de otro
  // lote no se repone, viene en el suyo).
  useEffect(() => {
    const t = texto.trim().replace(/[%,()"\\:]/g, ' ').trim();
    if (!buscando || t.length < 2) { setResultados([]); return; }
    let vigente = true;
    const reloj = window.setTimeout(() => {
      void (async () => {
        const { data, error: err } = await supabase
          .from('v_catalogo_admin')
          .select('id, sku, nombre, variante, existencia_total, foto_thumb_path')
          .eq('proximamente', false)
          .or(`nombre.ilike.%${t}%,sku.ilike.%${t}%,variante.ilike.%${t}%`)
          .order('nombre', { ascending: true })
          .limit(12);
        if (!vigente) return;
        setErrorRepo(err ? mensajeDeError(err) : null);
        setResultados((data as PiezaEnVenta[] | null) ?? []);
      })();
    }, 300);
    return () => { vigente = false; window.clearTimeout(reloj); };
  }, [texto, buscando]);

  function empezarRevision() {
    setExito(null);
    setError(null);
    // Se empieza con lo esperado: lo normal es que llegue todo, y se cambia lo que no.
    setLlegaron(new Map(vienen.map((x) => [x.id, String(x.cantidad)])));
    setRevisando(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function poner(lineaId: number, n: number) {
    setLlegaron((antes) => new Map(antes).set(lineaId, String(Math.max(0, n))));
  }

  async function liberar() {
    if (!lote) return;
    if (revision.malas.length > 0) {
      setError(`Escribe cuántas llegaron, con un número entero, en: ${revision.malas.join('; ')}.`);
      return;
    }
    const noLlegan = revision.faltan > 0 ? `\n${faltan(revision.faltan)}: no entra${revision.faltan === 1 ? '' : 'n'} al inventario.` : '';
    const deMas = revision.sobran > 0 ? `\nLlegaron ${revision.sobran} de más: entran al inventario.` : '';
    if (!window.confirm(
      `Liberar el lote ${lote.codigo}: ${formatearEntero(revision.contadas)} piezas salen a la venta ya, en el mostrador, el catálogo y la vitrina.${noLlegan}${deMas}\n\nEsto no se deshace desde aquí.`,
    )) return;
    setLiberando(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('admin_liberar_lote', {
      p_lote_id: lote.id,
      p_llegaron: vienen.map((x) => ({ modelo_id: x.modelo_id, ubicacion_id: x.ubicacion_id, cantidad: entero(llegaron.get(x.id) ?? '') })),
    });
    setLiberando(false);
    if (err) { setError(mensajeDeError(err)); return; }
    const r = data as LoteLiberado;
    setRevisando(false);
    setExito(
      `Lote ${r.lote} liberado: ${formatearEntero(r.llegaron)} piezas ya están a la venta.`
      + (r.faltaron > 0 ? ` ${r.faltaron === 1 ? 'Faltó 1' : `Faltaron ${r.faltaron}`} de las ${r.esperadas} que esperabas.` : ''),
    );
    await recargar();
  }

  function elegirParaReponer(p: Pick<PiezaEnVenta, 'id' | 'sku' | 'nombre' | 'variante'>, ubicacionId?: number) {
    const ubic = ubicacionId ?? ubicaciones[0]?.id ?? null;
    const ya = lineas.find((x) => x.modelo_id === p.id && x.ubicacion_id === ubic);
    setReposicion({ pieza: p, ubicacionId: ubic, cantidad: ya ? String(ya.cantidad) : '' });
    setErrorRepo(null);
    setTexto('');
    setResultados([]);
  }

  function cambiarUbicacionRepo(ubicacionId: number) {
    setReposicion((r) => {
      if (!r) return r;
      const ya = lineas.find((x) => x.modelo_id === r.pieza.id && x.ubicacion_id === ubicacionId);
      return { ...r, ubicacionId, cantidad: ya ? String(ya.cantidad) : r.cantidad };
    });
  }

  async function anotarReposicion(cantidad: number, r: Reposicion) {
    if (r.ubicacionId === null) { setErrorRepo('Elige a qué ubicación va.'); return; }
    setGuardandoRepo(true);
    setErrorRepo(null);
    const { error: err } = await supabase.rpc('admin_guardar_por_llegar', {
      p_lote_id: loteId,
      p_modelo_id: r.pieza.id,
      p_cantidades: [{ ubicacion_id: r.ubicacionId, cantidad }],
    });
    setGuardandoRepo(false);
    if (err) { setErrorRepo(mensajeDeError(err)); return; }
    setReposicion(null);
    setBuscando(false);
    setExito(cantidad === 0
      ? `Quitado: ya no se esperan piezas de ${nombreConVariante(r.pieza.nombre, r.pieza.variante)} en este lote.`
      : `Anotado: vienen ${cantidad} de ${nombreConVariante(r.pieza.nombre, r.pieza.variante)}. Se suman al liberar el lote.`);
    await recargar();
  }

  function guardarReposicion() {
    if (!reposicion) return;
    const n = entero(reposicion.cantidad);
    if (n === null || n === 0) { setErrorRepo('Escribe cuántas vienen: un número entero, como 5.'); return; }
    void anotarReposicion(n, reposicion);
  }

  function quitarReposicion(x: LineaPorLlegar) {
    if (!window.confirm(`Ya no vienen ${nombreConVariante(x.nombre, x.variante)} para ${x.ubicacion} en este lote?`)) return;
    void anotarReposicion(0, { pieza: { id: x.modelo_id, sku: x.sku, nombre: x.nombre, variante: x.variante }, ubicacionId: x.ubicacion_id, cantidad: '0' });
  }

  function verFoto(x: LineaPorLlegar) {
    visor.abrir({
      clave: x.familia,
      nombre: x.nombre,
      categoria: x.categoria,
      variantes: [{ id: x.modelo_id, etiqueta: x.variante, sku: x.sku, path: x.foto_path, thumbPath: x.foto_thumb_path }],
    });
  }

  if (cargando) return <Cargando texto="Cargando el lote" />;
  if (!lote) {
    return (
      <div className="pagina">
        {error ? <Aviso tono="error">{error}</Aviso> : null}
        <Vacio titulo="Ese lote no existe">
          <p><Link to="/admin/lotes">Volver a Lotes</Link></p>
        </Vacio>
      </div>
    );
  }

  const liberado = !lote.en_camino && lote.liberado_en !== null;

  /** Una línea de lo que viene. */
  function fila(x: LineaPorLlegar) {
    const nombre = nombreConVariante(x.nombre, x.variante);
    const dato = `${x.sku} · va a ${x.ubicacion} · ${x.es_nueva ? 'nueva' : `reposición, hay ${x.hay}`}`;

    if (revisando) {
      const texto = llegaron.get(x.id) ?? '';
      const n = entero(texto);
      return (
        <li className={n !== null && n === x.cantidad ? 'conteo-fila conteo-fila--contada' : 'conteo-fila'} key={x.id}>
          <MiniaturaTocable className="conteo-fila__foto" thumb={x.foto_thumb_path} nombre={nombre} alVer={() => verFoto(x)} />
          <div className="conteo-fila__quien">
            <span className="conteo-fila__nombre">{nombre}</span>
            <span className="conteo-fila__dato">{dato}</span>
            <span className="conteo-fila__dato">Esperabas {x.cantidad}</span>
            {n === null ? <span className="conteo-fila__aviso">Escribe cuántas llegaron.</span>
              : n < x.cantidad ? <span className="conteo-fila__aviso">{faltan(x.cantidad - n)}</span>
                : n > x.cantidad ? <span className="conteo-fila__aviso">Llegaron {n - x.cantidad} de más</span> : null}
          </div>
          <div className="conteo-paso">
            <button type="button" aria-label={`Una menos de ${nombre}`} disabled={n === null || n === 0} onClick={() => poner(x.id, (n ?? 0) - 1)}>&minus;</button>
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              aria-label={`Piezas de ${nombre} que llegaron para ${x.ubicacion}`}
              value={texto}
              onChange={(e) => setLlegaron((antes) => new Map(antes).set(x.id, e.target.value))}
            />
            <button type="button" aria-label={`Una más de ${nombre}`} onClick={() => poner(x.id, (n ?? 0) + 1)}>+</button>
          </div>
        </li>
      );
    }

    if (liberado) {
      const llego = x.recibida ?? 0;
      return (
        <li className="conteo-fila" key={x.id}>
          <MiniaturaTocable className="conteo-fila__foto" thumb={x.foto_thumb_path} nombre={nombre} alVer={() => verFoto(x)} />
          <div className="conteo-fila__quien">
            <span className="conteo-fila__nombre">{nombre}</span>
            <span className="conteo-fila__dato">{dato.replace(/, hay \d+$/, '')}</span>
          </div>
          <div className="conteo-paso conteo-paso--revisar">
            <span className={llego < x.cantidad ? 'conteo-dif conteo-dif--falta' : 'conteo-dif'}>
              {x.recibida === null ? 'no se revisó' : `${llego} de ${x.cantidad}`}
            </span>
          </div>
        </li>
      );
    }

    return (
      <li className="conteo-fila" key={x.id}>
        <MiniaturaTocable className="conteo-fila__foto" thumb={x.foto_thumb_path} nombre={nombre} alVer={() => verFoto(x)} />
        <div className="conteo-fila__quien">
          <span className="conteo-fila__nombre">{nombre}</span>
          <span className="conteo-fila__dato">{dato}</span>
        </div>
        <div className="conteo-paso conteo-paso--revisar">
          <span className="conteo-dif">llegan {x.cantidad}</span>
          <div className="grupo-botones">
            {x.es_nueva ? (
              <Link className="boton boton--secundario boton--pequeno" to={`/admin/modelos/${x.modelo_id}?lote=${loteId}`}>Editar</Link>
            ) : (
              <>
                <button
                  type="button"
                  className="boton boton--secundario boton--pequeno"
                  onClick={() => { setBuscando(true); elegirParaReponer({ id: x.modelo_id, sku: x.sku, nombre: x.nombre, variante: x.variante }, x.ubicacion_id); }}
                >
                  Cambiar
                </button>
                <button type="button" className="boton boton--peligro boton--pequeno" onClick={() => quitarReposicion(x)}>Quitar</button>
              </>
            )}
          </div>
        </div>
      </li>
    );
  }

  return (
    <div className="pagina pagina--angosta">
      <div className="encabezado-pagina">
        <div>
          <h1>Lote {lote.codigo}</h1>
          {lote.en_camino ? (
            <p>
              <span className="etiqueta etiqueta--proxima">En camino</span>{' '}
              Llegada estimada: {formatearFecha(lote.fecha_llegada)}. Nada de esto se vende ni cuenta en el
              inventario hasta que lo liberes.
            </p>
          ) : liberado ? (
            <p>
              Llegó el {formatearFecha(lote.fecha_llegada)}. Se liberó el {formatearFechaHora(lote.liberado_en)}
              {lote.liberado_por ? `, lo liberó ${lote.liberado_por}` : ''}: de {formatearEntero(lote.piezas_esperadas)} piezas
              esperadas llegaron {formatearEntero(lote.piezas_recibidas ?? 0)}.
            </p>
          ) : (
            <p>Este lote llegó antes de que existiera "en camino": su mercancía se carga en el formulario de cada producto.</p>
          )}
        </div>
        <Link className="boton boton--secundario" to="/admin/lotes">Volver a Lotes</Link>
      </div>

      {error ? <Aviso tono="error" titulo="No se pudo">{error}</Aviso> : null}
      {exito ? <Aviso tono="exito">{exito}</Aviso> : null}

      {lote.en_camino && !revisando ? (
        <>
          <Ayuda titulo="Cómo funciona un lote en camino">
            <p>
              Lo que cargas aquí <strong>no se vende</strong>: no sale en el mostrador, ni en
              el catálogo de la vendedora, ni en la vitrina, y no cuenta en el inventario ni en
              las estadísticas. Las clientas ven lo nuevo en el catálogo en línea, abajo, como
              <strong> Próximamente</strong>, con su foto y su precio y sin poder pedirlo.
            </p>
            <p>
              <strong>Producto nuevo</strong> abre el formulario de siempre con este lote
              puesto: la cantidad que escribas es la que viene. <strong>Sumar a uno que ya
              vendes</strong> es la reposición: lo que tienes se sigue vendiendo y lo que viene se
              suma al liberar. ¿Una medida nueva de un producto que ya vendes? Agrégala en su
              ficha con cantidad 0 y súmala aquí.
            </p>
            <p>
              Cuando llegue la mercancía, <strong>Revisar y liberar</strong>: cuentas lo que vino,
              pieza por pieza, y lo que escribas es lo que entra a la venta. La fecha de llegada
              del lote pasa a ser la de ese día. El dinero del lote no cambia: ya lo pagaste.
            </p>
          </Ayuda>

          <div className="panel">
            <span className="panel__titulo">Lo que viene</span>
            <p className="lote-viene__resumen">
              {resumen.piezas === 0 ? 'Todavía nada.' : (
                <>
                  {formatearEntero(resumen.piezas)} pieza{resumen.piezas === 1 ? '' : 's'}
                  {resumen.nuevas > 0 ? `: ${formatearEntero(resumen.nuevas)} de ${resumen.productosNuevos} producto${resumen.productosNuevos === 1 ? '' : 's'} nuevo${resumen.productosNuevos === 1 ? '' : 's'}` : ''}
                  {resumen.repo > 0 ? `${resumen.nuevas > 0 ? ' y' : ':'} ${formatearEntero(resumen.repo)} de reposición de ${resumen.productosRepo} que ya vendes` : ''}.
                </>
              )}
            </p>
            <div className="acciones acciones--sueltas">
              <Link className="boton" to={`/admin/modelos/nuevo?lote=${lote.id}`}>Cargar producto nuevo</Link>
              <button type="button" className="boton boton--secundario" aria-expanded={buscando} onClick={() => { setBuscando((b) => !b); setReposicion(null); setErrorRepo(null); }}>
                Sumar a uno que ya vendes
              </button>
            </div>
          </div>

          {buscando ? (
            <div className="panel">
              <span className="panel__titulo">Reposición: más piezas de un producto que ya vendes</span>
              {reposicion ? (
                <>
                  <p className="lote-viene__elegida">
                    {nombreConVariante(reposicion.pieza.nombre, reposicion.pieza.variante)}
                    <span className="conteo-fila__dato"> · {reposicion.pieza.sku}</span>
                  </p>
                  <div className="fila">
                    <Campo etiqueta="Va a" htmlFor="repo-ubicacion">
                      <select
                        id="repo-ubicacion"
                        value={reposicion.ubicacionId ?? ''}
                        onChange={(e) => cambiarUbicacionRepo(Number(e.target.value))}
                      >
                        {ubicaciones.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                      </select>
                    </Campo>
                    <Campo etiqueta="Cuántas vienen" htmlFor="repo-cantidad" error={errorRepo}>
                      <input
                        id="repo-cantidad"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        autoComplete="off"
                        autoFocus
                        value={reposicion.cantidad}
                        onChange={(e) => { setReposicion({ ...reposicion, cantidad: e.target.value }); setErrorRepo(null); }}
                      />
                    </Campo>
                  </div>
                  <div className="acciones">
                    <button type="button" className="boton boton--confirmar" disabled={guardandoRepo} onClick={guardarReposicion}>
                      {guardandoRepo ? 'Anotando' : 'Anotar'}
                    </button>
                    <button type="button" className="boton boton--secundario" onClick={() => setReposicion(null)}>Elegir otra</button>
                  </div>
                </>
              ) : (
                <>
                  <Campo etiqueta="Búscalo por nombre o SKU" htmlFor="repo-buscar" error={errorRepo}>
                    <input id="repo-buscar" type="search" autoComplete="off" autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} />
                  </Campo>
                  {resultados.length > 0 ? (
                    <ul className="conteo-resultados">
                      {resultados.map((p) => (
                        <li key={p.id}>
                          <button type="button" onClick={() => elegirParaReponer(p)}>
                            <span className="conteo-fila__nombre">{nombreConVariante(p.nombre, p.variante)}</span>
                            <span className="conteo-fila__dato">{p.sku} · hay {p.existencia_total}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : texto.trim().length >= 2 ? <p className="campo__pista">Ninguna pieza a la venta coincide.</p> : null}
                </>
              )}
            </div>
          ) : null}

          {sinCantidad.length > 0 ? (
            <Aviso tono="alerta" titulo={sinCantidad.length === 1 ? 'Una pieza nueva sin cantidad' : `${sinCantidad.length} piezas nuevas sin cantidad`}>
              <p>
                Están cargadas en este lote, pero no dicen cuántas vienen. Ábrelas y pon la
                cantidad; si no, al liberar quedan en el inventario sin piezas.
              </p>
              <p className="campo__pista">
                {sinCantidad.slice(0, 6).map((m, i) => (
                  <span key={m.id}>
                    {i > 0 ? ' · ' : ''}
                    <Link to={`/admin/modelos/${m.id}?lote=${lote.id}`}>{nombreConVariante(m.nombre, m.variante)}</Link>
                  </span>
                ))}
                {sinCantidad.length > 6 ? ` y ${sinCantidad.length - 6} más` : ''}
              </p>
            </Aviso>
          ) : null}
        </>
      ) : null}

      {revisando ? (
        <Aviso tono="neutro" titulo="Cuenta lo que llegó">
          Cada línea empieza con lo que esperabas. Cambia las que no cuadren; lo que escribas es
          lo que sale a la venta. Nada se guarda hasta que toques Liberar lote.
        </Aviso>
      ) : null}

      {lote.en_camino || liberado ? (
        vienen.length === 0 && !liberado ? (
          <Vacio titulo="Todavía no hay nada cargado en este lote">
            <p>Carga el primer producto nuevo, o suma piezas a uno que ya vendes.</p>
          </Vacio>
        ) : (
          <ul className="conteo-lista">
            {(liberado ? lineas.filter((x) => x.recibida !== null || x.activo) : vienen).map(fila)}
          </ul>
        )
      ) : null}

      {lote.en_camino && !revisando ? (
        <div className="acciones">
          <button type="button" className="boton boton--confirmar" onClick={empezarRevision}>
            Revisar y liberar
          </button>
        </div>
      ) : null}

      {revisando ? (
        <>
          <div className="panel lote-viene__cuenta" aria-live="polite">
            <span className="panel__titulo">Antes de liberar</span>
            <p>
              Esperabas {formatearEntero(resumen.piezas)} · contaste {formatearEntero(revision.contadas)}
              {revision.faltan > 0 ? ` · ${faltan(revision.faltan).toLowerCase()}` : ''}
              {revision.sobran > 0 ? ` · ${formatearEntero(revision.sobran)} de más` : ''}
            </p>
            {revision.diferencias.length > 0 ? (
              <ul className="lote-viene__diferencias">
                {revision.diferencias.map((d) => (
                  <li key={d.nombre}>{d.nombre}: esperabas {d.esperadas}, llegaron {d.llegaron}</li>
                ))}
              </ul>
            ) : revision.malas.length === 0 ? <p className="campo__pista">Llegó todo lo que esperabas.</p> : null}
            {revision.malas.length > 0 ? (
              <p className="campo__error" role="alert">Falta escribir cuántas llegaron en {revision.malas.length === 1 ? 'una línea' : `${revision.malas.length} líneas`}.</p>
            ) : null}
          </div>
          <div className="acciones">
            <button type="button" className="boton boton--confirmar" disabled={liberando || revision.malas.length > 0} onClick={() => void liberar()}>
              {liberando ? 'Liberando' : 'Liberar lote'}
            </button>
            <button type="button" className="boton boton--secundario" disabled={liberando} onClick={() => setRevisando(false)}>
              Volver sin liberar
            </button>
          </div>
        </>
      ) : null}

      <VisorFoto {...visor.props} />
    </div>
  );
}
