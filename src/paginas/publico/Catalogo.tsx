import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Campo, Cargando, ResumenErrores, Vacio, Filtros } from '../../componentes/Piezas';
import { Wordmark } from '../../componentes/Marca';
import { aMonto, aplicarDescuento, deMonto, descuentoPara, formatearBcv, formatearBs, formatearPorcentaje, porCantidad, precioEnBs, sumar } from '../../lib/dinero';
import { fuenteFoto, urlPublicaFoto } from '../../lib/fotos';
import { agruparPorFamilia, conFoto, etiquetasDe, nombreConVariante, rangoDe } from '../../lib/familias';
import type { Familia } from '../../lib/familias';
import { useTasa } from '../../hooks/useTasa';
import { VisorFoto, useDobleToque, useVisorFoto } from '../../componentes/VisorFoto';
import type { FotoAmpliada } from '../../componentes/VisorFoto';
import { ElegirVariante } from '../../componentes/ElegirVariante';
import { TUS_DATOS_VACIOS, TusDatos, datosParaReservar, queFalta } from '../../componentes/TusDatos';
import type { EstadoTusDatos } from '../../componentes/TusDatos';
import { useTextos } from '../../hooks/useTextos';
import type { ModeloPublico, Tramo } from '../../lib/tipos';

const COLUMNAS = 'id, sku, nombre, categoria, variantes_nota, foto_path, foto_thumb_path, precio_usd, precio_bs, disponible, ubicaciones_codigo, familia, variante';

/**
 * Catalogo publico. Se abre sin sesion, desde un enlace de WhatsApp.
 *
 * Lo que se ve aqui sale de v_disponible_publico, que no expone ninguna
 * columna de costo y descuenta lo que ya esta reservado por otra persona.
 *
 * El precio grande de cada pieza es el de DETAL. El armador cotiza al
 * mayor por tramo, y esa cifra la calcula la base al reservar.
 */
export function Catalogo() {
  const navegar = useNavigate();
  const { tasa } = useTasa();
  const textos = useTextos();

  const [modelos, setModelos] = useState<ModeloPublico[]>([]);
  const [tramos, setTramos] = useState<Tramo[]>([]);
  const [seleccion, setSeleccion] = useState<Map<number, number>>(new Map());
  const [texto, setTexto] = useState('');
  const [categorias, setCategorias] = useState<string[]>([]);
  const [categoria, setCategoria] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [parametros, setParametros] = useSearchParams();
  const paso: 'catalogo' | 'pedido' = parametros.get('paso') === 'pedido' ? 'pedido' : 'catalogo';
  const setPaso = (p: 'catalogo' | 'pedido') => {
    // Sin replace: cada cambio deja su huella en el historial.
    setParametros(p === 'pedido' ? { paso: 'pedido' } : {});
  };
  // Los datos de la clienta viven aqui y no en el formulario: si vuelve a
  // "Seguir viendo" y regresa, lo que ya confirmo sigue confirmado.
  const [datos, setDatos] = useState<EstadoTusDatos>(TUS_DATOS_VACIOS);
  const [entrega, setEntrega] = useState<'tienda' | 'envio'>('tienda');
  const [empresa, setEmpresa] = useState<'domesa' | 'mrw'>('domesa');
  const [agencia, setAgencia] = useState('');
  const [direccion, setDireccion] = useState('');
  const [reservando, setReservando] = useState(false);
  const [familiaAbierta, setFamiliaAbierta] = useState<number | null>(null);
  const visor = useVisorFoto();
  const esDobleToque = useDobleToque();

  const cargar = useCallback(async () => {
    setCargando(true);
    let consulta = supabase
      .from('v_disponible_publico')
      .select(COLUMNAS)
      .order('categoria', { ascending: true })
      .order('nombre', { ascending: true })
      .limit(400);

    if (categoria) consulta = consulta.eq('categoria', categoria);

    if (texto.trim()) {
      const t = texto.trim().replace(/[%,()]/g, ' ');
      consulta = consulta.or(`nombre.ilike.%${t}%,categoria.ilike.%${t}%,variante.ilike.%${t}%`);
    }

    const [cat, tr] = await Promise.all([
      consulta,
      // La columna es descuento_pct. Aqui decia precio_por_pieza_usd, que no
      // existe: PostgREST devolvia 400, tramos quedaba vacio y descuentoPara()
      // no encontraba ningun tramo. Resultado: ninguna clienta al mayor
      // recibia su descuento, ni el 5 % a las 6 piezas ni el 15 % a las 20.
      supabase.from('tramos_mayoreo').select('id, min_piezas, descuento_pct, activo').order('min_piezas'),
    ]);

    // Se miran las dos. Antes solo se miraba la del catalogo, asi que la de
    // tramos podia fallar durante semanas sin que nadie lo supiera: la
    // pagina se veia perfecta, solo que sin descuentos al mayor.
    if (cat.error) setError(mensajeDeError(cat.error));
    else if (tr.error) setError(mensajeDeError(tr.error));
    setModelos((cat.data as unknown as ModeloPublico[] | null) ?? []);
    setTramos((tr.data as Tramo[] | null) ?? []);
    setCargando(false);
  }, [texto, categoria]);

  useEffect(() => {
    const t = setTimeout(() => void cargar(), texto ? 300 : 0);
    return () => clearTimeout(t);
  }, [cargar, texto]);

  // Las categorias se piden una sola vez y sin filtrar: si salieran de lo
  // que ya esta en pantalla, elegir una haria desaparecer a las demas.
  //
  // Antes esto se traia hasta mil filas de una columna para quedarse con
  // once. Ahora las cuenta la base, que es donde estan los datos: la
  // clienta baja once filas en vez de ochenta y ocho, y el dia que el
  // catalogo tenga mil piezas seguira bajando once.
  useEffect(() => {
    void (async () => {
      const { data } = await supabase.rpc('categorias_publicas');
      setCategorias(((data as { categoria: string }[] | null) ?? []).map((x) => x.categoria));
    })();
  }, []);

  const porId = useMemo(() => new Map(modelos.map((m) => [m.id, m])), [modelos]);

  const resumen = useMemo(() => {
    let piezas = 0;
    const partes = [];
    for (const [id, n] of seleccion) {
      piezas += n;
      const m = porId.get(id);
      if (m?.precio_usd != null) partes.push(porCantidad(aMonto(m.precio_usd), n));
    }
    // El descuento sale del tramo que alcance esa cantidad. Sin tramos
    // cargados no hay rebaja: se paga el detal, que es lo honesto.
    const subtotal = deMonto(sumar(partes));
    const descuento = descuentoPara(tramos, piezas);
    // El tramo que viene: "3 mas y baja 5 %". Desde una pieza se puede
    // pedir, y esto es lo que invita a llevar mas.
    const siguiente = tramos
      .filter((t) => t.activo && t.min_piezas > piezas)
      .sort((x, y) => x.min_piezas - y.min_piezas)[0] ?? null;
    return {
      piezas, subtotal, descuento, totalUsd: aplicarDescuento(subtotal, descuento),
      siguiente: siguiente ? { faltan: siguiente.min_piezas - piezas, pct: siguiente.descuento_pct } : null,
    };
  }, [seleccion, tramos, porId]);

  // Un producto con variantes es UNA tarjeta, no dos: la cadena de 45 cm y
  // la de 60 cm son la misma pieza con dos opciones.
  const familias = useMemo(() => agruparPorFamilia(modelos), [modelos]);

  // Lo que ensena el detalle, en el mismo orden que la cuadricula, para
  // pasar de una pieza a la siguiente sin salir.
  const fichas = useMemo<FotoAmpliada[]>(() => familias.map((f) => {
    const portada = conFoto(f.variantes);
    return {
      clave: f.clave,
      nombre: f.cabeza.nombre,
      categoria: f.cabeza.categoria,
      materiales: textos.materiales_largo ?? null,
      variantes: f.variantes.map((v) => ({
        id: v.id,
        etiqueta: v.variante,
        path: v.foto_path ?? portada?.foto_path ?? null,
        thumbPath: v.foto_thumb_path ?? portada?.foto_thumb_path ?? null,
        bs: v.precio_bs,
        bcv: v.precio_usd,
        quedan: v.disponible,
        nota: v.variantes_nota,
      })),
    };
  }), [familias, textos.materiales_largo]);

  const cerrarHoja = useCallback(() => setFamiliaAbierta(null), []);

  function agregar(m: ModeloPublico) {
    setSeleccion((prev) => {
      const copia = new Map(prev);
      const ahora = copia.get(m.id) ?? 0;
      if (ahora >= m.disponible) return prev;
      copia.set(m.id, ahora + 1);
      return copia;
    });
  }

  function agregarPorId(id: number) {
    const m = porId.get(id);
    if (m) agregar(m);
  }

  function verFoto(f: Familia<ModeloPublico>) {
    const ficha = fichas.find((x) => x.clave === f.clave);
    if (ficha) visor.abrir(ficha, fichas);
  }

  /**
   * Un toque suma la pieza; dos seguidos abren el detalle y deshacen el
   * primero. Si el producto tiene variantes, el toque abre la hoja para
   * elegir cual.
   */
  function alTocar(f: Familia<ModeloPublico>) {
    if (f.variantes.length > 1) {
      setFamiliaAbierta(f.clave);
      return;
    }
    const m = f.cabeza;
    if (esDobleToque(m.id)) {
      const puestas = seleccion.get(m.id) ?? 0;
      if (puestas > 0) cambiar(m.id, puestas - 1);
      verFoto(f);
      return;
    }
    agregar(m);
  }

  function cambiar(modeloId: number, cantidad: number) {
    setSeleccion((prev) => {
      const copia = new Map(prev);
      const max = porId.get(modeloId)?.disponible ?? 0;
      const n = Math.max(0, Math.min(cantidad, max));
      if (n === 0) copia.delete(modeloId); else copia.set(modeloId, n);
      return copia;
    });
  }

  async function reservar() {
    const quien = datosParaReservar(datos);
    if (!quien) return;
    setReservando(true);
    setError(null);
    const items = [...seleccion.entries()].map(([modelo_id, cantidad]) => ({ modelo_id, cantidad }));

    const { data, error: err } = await supabase.rpc('crear_reserva', {
      p_items: items,
      // Si confirmo que es clienta, nombre, apellido o telefono van vacios
      // y la base los pone desde su ficha: aqui nunca estuvieron completos.
      p_cliente_nombre: quien.nombre,
      p_cliente_apellido: quien.apellido,
      p_cliente_cedula: quien.cedula,
      p_cliente_telefono: quien.telefono,
      p_entrega: entrega,
      p_envio_empresa: entrega === 'envio' ? empresa : null,
      p_envio_agencia: entrega === 'envio' ? agencia : null,
      p_envio_direccion: entrega === 'envio' ? direccion : null,
    });

    if (err) { setError(mensajeDeError(err)); setReservando(false); return; }
    navegar(`/reserva/${data as string}`);
  }

  /* ------------------------------------------------------------ pedido */

  // Volver atras despues de apartar deja la seleccion vacia: en vez de un
  // formulario de pedido sin piezas, se regresa al catalogo.
  if (paso === 'pedido' && seleccion.size === 0) {
    return <Navigate to="/publico" replace />;
  }

  if (paso === 'pedido') {
    const elegidos = [...seleccion.entries()].map(([id, cantidad]) => ({ m: porId.get(id), cantidad }));

    return (
      <div className="pagina pagina--angosta mostrador">
        <div className="encabezado-pagina">
          <div>
            <h1>Tu pedido</h1>
            <p>
              {resumen.piezas} pieza{resumen.piezas === 1 ? '' : 's'}
              {resumen.descuento ? `, con ${formatearPorcentaje(resumen.descuento)} de descuento por cantidad` : ''}.
            </p>
          </div>
        </div>

        {error ? <ResumenErrores titulo="No se pudo apartar">{error}</ResumenErrores> : null}

        <div className="lineas-cobro">
          {elegidos.map(({ m, cantidad }) => m ? (
            <div className="linea-cobro" key={m.id}>
              {urlPublicaFoto(m.foto_thumb_path)
                ? <img className="linea-cobro__foto" src={urlPublicaFoto(m.foto_thumb_path)!} alt="" />
                : <span className="linea-cobro__foto" />}
              <div>
                <div className="linea-cobro__nombre">{nombreConVariante(m.nombre, m.variante)}</div>
                <div className="linea-cobro__precio">Quedan {m.disponible}</div>
              </div>
              <div className="contador">
                <button type="button" aria-label={`Quitar una de ${m.nombre}`} onClick={() => cambiar(m.id, cantidad - 1)}>&minus;</button>
                <span className="contador__valor">{cantidad}</span>
                <button type="button" aria-label={`Agregar una de ${m.nombre}`} disabled={cantidad >= m.disponible} onClick={() => cambiar(m.id, cantidad + 1)}>+</button>
              </div>
            </div>
          ) : null)}
        </div>

        <div className="total-cobro">
          <div>
            <span className="util secundario">Tu total</span>
            <div className="campo__pista">
              {resumen.piezas} piezas valen {formatearBs(precioEnBs(resumen.subtotal, tasa))}
              {resumen.descuento ? `, menos ${formatearPorcentaje(resumen.descuento)} de descuento` : ''}
            </div>
          </div>
          <div>
            <div className="total-cobro__cifra">{formatearBs(precioEnBs(resumen.totalUsd, tasa))}</div>
            <div className="total-cobro__cifra">{formatearBcv(resumen.totalUsd)}</div>
          </div>
        </div>

        <h2 className="seccion-titulo">Tus datos</h2>
        <TusDatos valor={datos} alCambiar={setDatos} />

        <h2 className="seccion-titulo">Como lo recibes</h2>
        <div className="panel">
          <div className="metodos-pago">
            <button type="button" aria-pressed={entrega === 'tienda'} onClick={() => setEntrega('tienda')}>
              Retiro en tienda
            </button>
            <button type="button" aria-pressed={entrega === 'envio'} onClick={() => setEntrega('envio')}>
              Envio a mi ciudad
            </button>
          </div>

          {entrega === 'envio' ? (
            <>
              <p className="campo__pista" style={{ marginTop: 'var(--e-3)' }}>
                El envio se paga al retirarlo en la agencia, no ahora.
              </p>
              <div className="metodos-pago" style={{ marginTop: 'var(--e-4)' }}>
                <button type="button" aria-pressed={empresa === 'domesa'} onClick={() => setEmpresa('domesa')}>Domesa</button>
                <button type="button" aria-pressed={empresa === 'mrw'} onClick={() => setEmpresa('mrw')}>MRW</button>
              </div>
              <div className="fila" style={{ marginTop: 'var(--e-4)' }}>
                <Campo etiqueta="Agencia" htmlFor="r-agencia" pista="La sucursal donde lo vas a retirar.">
                  <input id="r-agencia" value={agencia} onChange={(e) => setAgencia(e.target.value)} required />
                </Campo>
                <Campo etiqueta="Dirección de la agencia" htmlFor="r-dir">
                  <input id="r-dir" value={direccion} onChange={(e) => setDireccion(e.target.value)} required />
                </Campo>
              </div>
            </>
          ) : (
            <p className="campo__pista" style={{ marginTop: 'var(--e-3)' }}>
              Te esperamos en la tienda con tu cédula.
            </p>
          )}
        </div>

        <p className="campo__pista">
          Al apartar, las piezas quedan tuyas mientras pagas. El pago lo cargas
          en la pantalla siguiente.
        </p>

        <div className="acciones">
          <button
            type="button"
            className="boton boton--confirmar"
            disabled={reservando || resumen.piezas === 0 || !datosParaReservar(datos)}
            onClick={() => void reservar()}
          >
            {reservando ? 'Apartando' : 'Apartar mis piezas'}
          </button>
          <button type="button" className="boton boton--secundario" onClick={() => setPaso('catalogo')}>
            Seguir viendo
          </button>
        </div>
        {/* Un boton apagado sin explicacion es una trampa. */}
        {!datosParaReservar(datos) ? <p className="campo__pista">{queFalta(datos)}</p> : null}
      </div>
    );
  }

  /* ---------------------------------------------------------- catalogo */

  return (
    <>
      <header className="barra barra--publica">
        <div className="barra__interior">
          <Wordmark alto={40} />
          <span className="sesion__quien">Desde Sabana de Mendoza para toda Venezuela</span>
        </div>
      </header>

      <div className="pagina mostrador">
        <div className="encabezado-pagina">
          <div>
            <h1>Catálogo</h1>
            <p>Toca las piezas que te gusten y arma tu pedido: desde una pieza.</p>
          </div>
        </div>

        {textos.materiales_largo ? (
          <p className="sello-materiales">{textos.materiales_largo}</p>
        ) : null}

        {error ? <Aviso tono="error" titulo="No se pudo cargar el catálogo">{error}</Aviso> : null}

        {/*
          Plegado en el telefono. Doce categorias ocupaban 208 px y dejaban
          la primera pieza a 743 px de una pantalla de 844: la clienta abria
          el enlace del catalogo y no veia ni una joya. En una tienda, lo
          primero que se enseña es la mercancia, no el buscador.

          El numero en el titulo dice cuantos filtros hay puestos, para que
          plegar no esconda que la lista esta recortada.
        */}
        <Filtros activos={[texto, categoria].filter(Boolean).length}>
          <Campo etiqueta="Buscar" htmlFor="buscar-publico">
            <input
              id="buscar-publico" type="search" value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Cadena, anillo, choker..." autoComplete="off"
            />
          </Campo>

          {categorias.length > 1 ? (
            <div className="filtros-categoria" role="group" aria-label="Filtrar por categoría">
              <button type="button" aria-pressed={categoria === null} onClick={() => setCategoria(null)}>
                Todo
              </button>
              {categorias.map((c) => (
                <button key={c} type="button" aria-pressed={categoria === c} onClick={() => setCategoria(c)}>
                  {c}
                </button>
              ))}
            </div>
        ) : null}
        </Filtros>

        {cargando ? (
          <Cargando texto="Trayendo el catálogo" />
        ) : modelos.length === 0 ? (
          <Vacio titulo={texto ? 'Ninguna pieza coincide' : 'Por ahora no hay piezas disponibles'}>
            <p>{texto ? 'Prueba con otra palabra.' : 'Vuelve pronto: estamos surtiendo la vitrina.'}</p>
          </Vacio>
        ) : (
          <div className="rejilla-venta">
            {familias.map((f) => {
              const m = f.cabeza;
              const unica = f.variantes.length === 1;
              const portada = conFoto(f.variantes) ?? m;
              const foto = fuenteFoto(portada.foto_path, portada.foto_thumb_path, '(max-width: 640px) 45vw, 200px');
              const puestas = f.variantes.reduce((n, v) => n + (seleccion.get(v.id) ?? 0), 0);
              const quedan = f.variantes.reduce((n, v) => n + v.disponible, 0);
              const agotado = f.variantes.every((v) => (seleccion.get(v.id) ?? 0) >= v.disponible);
              const bs = rangoDe(f.variantes, (v) => v.precio_bs);
              const bcv = rangoDe(f.variantes, (v) => v.precio_usd);
              const etiquetas = etiquetasDe(f);
              // Las claves de todas las variantes, sin repetir: "V1 · BG".
              const claves = [...new Set(f.variantes.flatMap((v) => (v.ubicaciones_codigo ?? '').split(' · ')).filter(Boolean))].join(' · ');
              return (
                <button
                  key={f.clave}
                  type="button"
                  className="tarjeta-modelo"
                  disabled={agotado}
                  onClick={() => alTocar(f)}
                  aria-haspopup={unica ? undefined : 'dialog'}
                  aria-label={unica
                    ? `Agregar ${nombreConVariante(m.nombre, m.variante)} al pedido`
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
                    ? <img className="tarjeta-modelo__foto" {...foto} alt={m.nombre} loading="lazy" />
                    : <span className="tarjeta-modelo__foto" />}
                  <span className="tarjeta-modelo__cuerpo">
                    <span className="tarjeta-modelo__nombre">{m.nombre}</span>
                    {etiquetas ? <span className="tarjeta-modelo__variantes">{etiquetas}</span> : null}
                    {textos.materiales_corto ? (
                      <span className="tarjeta-modelo__material">{textos.materiales_corto}</span>
                    ) : null}
                    {unica && m.variantes_nota ? <span className="celda-nota">{m.variantes_nota}</span> : null}
                    {/* Los dos precios del mismo tamaño: la clienta piensa en
                        bolívares o en dólares, y ninguno es la letra chica.
                        Con variantes de distinto precio, el mas bajo y "desde". */}
                    {bs.min !== bs.max ? <span className="tarjeta-modelo__desde">desde</span> : null}
                    <span className="tarjeta-modelo__precio">{formatearBs(bs.min)}</span>
                    <span className="tarjeta-modelo__precio">{formatearBcv(bcv.min)}</span>
                    <span className="tarjeta-modelo__pie">
                      <span className="tarjeta-modelo__datos">
                        <span className={quedan <= 2 ? 'tarjeta-modelo__existencia tarjeta-modelo__existencia--baja' : 'tarjeta-modelo__existencia'}>
                          Quedan {quedan}
                        </span>
                        {/* La clave de la tienda, nunca el nombre completo.
                            Para la clienta son dos letras sin significado;
                            para la vendedora, el estante al que ir. */}
                        {claves ? <span className="tarjeta-modelo__clave">{claves}</span> : null}
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
            texto: 'Agregar al pedido',
            alTocar: agregarPorId,
            deshabilitada: (id) => {
              const m = porId.get(id);
              return !m || (seleccion.get(id) ?? 0) >= m.disponible;
            },
            llevas: (id) => seleccion.get(id) ?? 0,
          }}
        />

        {(() => {
          const abierta = familiaAbierta === null ? null : familias.find((x) => x.clave === familiaAbierta);
          if (!abierta) return null;
          return (
            <ElegirVariante
              titulo={abierta.cabeza.nombre}
              subtitulo="Elige la que quieres."
              opciones={abierta.variantes.map((v) => {
                const puestas = seleccion.get(v.id) ?? 0;
                return {
                  id: v.id,
                  etiqueta: v.variante ?? v.sku,
                  detalle: v.disponible === 1 ? 'Queda 1' : `Quedan ${v.disponible}`,
                  precios: (
                    <>
                      <span className="opcion-variante__precio">{formatearBs(v.precio_bs)}</span>
                      <span className="opcion-variante__precio">{formatearBcv(v.precio_usd)}</span>
                    </>
                  ),
                  deshabilitada: puestas >= v.disponible,
                  llevas: puestas,
                };
              })}
              alElegir={(id) => { agregarPorId(id); setFamiliaAbierta(null); }}
              alCerrar={cerrarHoja}
            />
          );
        })()}

        {resumen.piezas > 0 ? (
          <div className="barra-carrito">
            <div className="barra-carrito__resumen">
              <div className="barra-carrito__piezas">
                {resumen.piezas} pieza{resumen.piezas === 1 ? '' : 's'}
                {resumen.descuento ? (
                  <span className="barra-carrito__tramo"> · {formatearPorcentaje(resumen.descuento)} menos</span>
                ) : resumen.siguiente ? (
                  <span className="barra-carrito__falta"> · {resumen.siguiente.faltan} más y baja {formatearPorcentaje(resumen.siguiente.pct)}</span>
                ) : null}
              </div>
              <div className="barra-carrito__total">
                {formatearBs(precioEnBs(resumen.totalUsd, tasa))}
              </div>
            </div>
            <button type="button" className="boton boton--secundario" onClick={() => setSeleccion(new Map())}>
              Vaciar
            </button>
            <button type="button" className="boton" onClick={() => setPaso('pedido')}>
              Ver pedido
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
