import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Campo, Cargando, ResumenErrores, Vacio, Filtros } from '../../componentes/Piezas';
import { Wordmark } from '../../componentes/Marca';
import { aMonto, aplicarDescuento, deMonto, descuentoPara, formatearBcv, formatearBs, formatearEntero, formatearDescuento, porCantidad, precioEnBs, sumar } from '../../lib/dinero';
import { fuenteFoto, urlPublicaFoto } from '../../lib/fotos';
import { agruparPorFamilia, conFoto, etiquetasDe, nombreConVariante, rangoDe } from '../../lib/familias';
import type { Familia } from '../../lib/familias';
import { useTasa } from '../../hooks/useTasa';
import { VisorFoto, useVisorFoto } from '../../componentes/VisorFoto';
import type { FotoAmpliada } from '../../componentes/VisorFoto';
import { ElegirVariante } from '../../componentes/ElegirVariante';
import { TUS_DATOS_VACIOS, TusDatos, datosParaReservar, queFalta } from '../../componentes/TusDatos';
import type { EstadoTusDatos } from '../../componentes/TusDatos';
import { useTextos } from '../../hooks/useTextos';
import { registrarVisita } from '../../lib/visitas';
import type { Cotizacion, ModeloPublico, Tramo } from '../../lib/tipos';

const COLUMNAS = 'id, sku, nombre, categoria, variantes_nota, foto_path, foto_thumb_path, precio_usd, precio_bs, disponible, ubicaciones_codigo, familia, variante';

/**
 * Cuántas filas trae cada vez. Antes eran 400 de una y nada más: la pieza
 * 401 no salía nunca, sin aviso. Ahora se traen de a poco y la página dice
 * cuántas hay y cuántas faltan por ver.
 */
const POR_TANDA = 120;

type Orden = 'nombre' | 'menor' | 'mayor';

/** La misma selección, siempre escrita igual: para saber si una cotización es de esta. */
const claveDe = (items: { modelo_id: number; cantidad: number }[]) =>
  items.map((i) => `${i.modelo_id}x${i.cantidad}`).sort().join(',');

/**
 * Catalogo publico. Se abre sin sesion, desde un enlace de WhatsApp.
 *
 * Lo que se ve aqui sale de v_disponible_publico, que no expone ninguna
 * columna de costo y descuenta lo que ya esta reservado por otra persona.
 *
 * COMO SE ARMA EL PEDIDO (rehecho el 14/10/2026)
 * Tocar una pieza abre su detalle: la foto grande, sus medidas y su precio.
 * Cada tarjeta lleva su boton "Agregar", que se vuelve un contador cuando la
 * pieza ya esta en el pedido. Antes un toque la metia al pedido sin
 * preguntar y dos toques abrian el detalle deshaciendo el primero: un gesto
 * que una clienta no adivina, y una tarjeta que era un boton con botones
 * dentro, que los lectores de pantalla no saben leer.
 *
 * EL TOTAL ES EL DEL PEDIDO
 * El precio grande de cada pieza es el de DETAL. Con varias piezas manda el
 * tramo de mayoreo, y cada pieza nunca baja de su piso: esa cuenta la hace
 * la base (`cotizar_pedido`, la misma regla que `crear_reserva`). Antes el
 * carrito multiplicaba el subtotal por el descuento sin piso, y cuando el
 * piso mandaba, la barra decia un total y el pedido congelaba otro, mas alto.
 */
export function Catalogo() {
  const navegar = useNavigate();
  const { tasa } = useTasa();
  const textos = useTextos();

  const [modelos, setModelos] = useState<ModeloPublico[]>([]);
  const [total, setTotal] = useState(0);
  // Todas las piezas que se han visto, no solo las de la busqueda actual.
  // Sin esto, buscar otra cosa despues de agregar dejaba las piezas
  // elegidas fuera del total y escondidas en "Tu pedido", aunque se
  // mandaban igual al apartar.
  const [conocidos, setConocidos] = useState<Map<number, ModeloPublico>>(new Map());
  const [tramos, setTramos] = useState<Tramo[]>([]);
  const [seleccion, setSeleccion] = useState<Map<number, number>>(new Map());
  const [cotizacion, setCotizacion] = useState<(Cotizacion & { clave: string }) | null>(null);
  const [texto, setTexto] = useState('');
  const [categorias, setCategorias] = useState<string[]>([]);
  const [categoria, setCategoria] = useState<string | null>(null);
  const [orden, setOrden] = useState<Orden>('nombre');
  const [cargando, setCargando] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
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

  const consulta = useCallback((desde: number) => {
    let q = supabase.from('v_disponible_publico').select(COLUMNAS, { count: 'exact' });
    if (categoria) q = q.eq('categoria', categoria);
    if (texto.trim()) {
      const t = texto.trim().replace(/[%,()"\\:]/g, ' ');
      q = q.or(`nombre.ilike.%${t}%,categoria.ilike.%${t}%,variante.ilike.%${t}%`);
    }
    // Familia e id al final: las variantes de un producto quedan juntas y
    // el orden no cambia entre una tanda y la siguiente.
    q = orden === 'nombre'
      ? q.order('categoria', { ascending: true }).order('nombre', { ascending: true })
      : q.order('precio_usd', { ascending: orden === 'menor' }).order('nombre', { ascending: true });
    return q.order('familia', { ascending: true }).order('id', { ascending: true }).range(desde, desde + POR_TANDA - 1);
  }, [texto, categoria, orden]);

  const recordar = useCallback((filas: ModeloPublico[]) => {
    setConocidos((prev) => {
      const copia = new Map(prev);
      for (const f of filas) copia.set(f.id, f);
      return copia;
    });
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    const [cat, tr] = await Promise.all([
      consulta(0),
      // La columna es descuento_pct. Aqui decia precio_por_pieza_usd, que no
      // existe: PostgREST devolvia 400, tramos quedaba vacio y descuentoPara()
      // no encontraba ningun tramo. Resultado: ninguna clienta al mayor
      // recibia su descuento, ni el 5 % a las 6 piezas ni el 15 % a las 20.
      supabase.from('tramos_mayoreo').select('id, min_piezas, descuento_pct, activo').order('min_piezas'),
    ]);

    // Se miran las dos. Antes solo se miraba la del catalogo, asi que la de
    // tramos podia fallar durante semanas sin que nadie lo supiera: la
    // pagina se veia perfecta, solo que sin descuentos al mayor.
    setError(cat.error ? mensajeDeError(cat.error) : tr.error ? mensajeDeError(tr.error) : null);
    const filas = (cat.data as unknown as ModeloPublico[] | null) ?? [];
    setModelos(filas);
    setTotal(cat.count ?? filas.length);
    recordar(filas);
    setTramos((tr.data as Tramo[] | null) ?? []);
    setCargando(false);
  }, [consulta, recordar]);

  async function cargarMas() {
    setCargandoMas(true);
    const { data, error: err, count } = await consulta(modelos.length);
    setCargandoMas(false);
    if (err) { setError(mensajeDeError(err)); return; }
    const filas = (data as unknown as ModeloPublico[] | null) ?? [];
    setModelos((prev) => {
      const ya = new Set(prev.map((m) => m.id));
      return [...prev, ...filas.filter((m) => !ya.has(m.id))];
    });
    if (count !== null) setTotal(count);
    recordar(filas);
  }

  useEffect(() => {
    const t = setTimeout(() => void cargar(), texto ? 300 : 0);
    return () => clearTimeout(t);
  }, [cargar, texto]);

  // Una visita por teléfono y por día: la tienda ve la cuenta en Catálogo.
  // Va aparte de cargar(), que se repite con cada búsqueda.
  useEffect(() => { registrarVisita(); }, []);

  // Las categorias se piden una sola vez y sin filtrar: si salieran de lo
  // que ya esta en pantalla, elegir una haria desaparecer a las demas. Las
  // cuenta la base: la clienta baja once filas, no ochenta y ocho.
  useEffect(() => {
    void (async () => {
      const { data } = await supabase.rpc('categorias_publicas');
      setCategorias(((data as { categoria: string }[] | null) ?? []).map((x) => x.categoria));
    })();
  }, []);

  // El total de verdad, de la base, cada vez que cambia el pedido. Mientras
  // llega se enseña la cuenta de aquí, que coincide salvo cuando el piso de
  // una pieza manda; si la base de antes no tiene la función, se queda esa.
  useEffect(() => {
    if (seleccion.size === 0) { setCotizacion(null); return; }
    const items = [...seleccion.entries()].map(([modelo_id, cantidad]) => ({ modelo_id, cantidad }));
    const clave = claveDe(items);
    let vigente = true;
    const reloj = window.setTimeout(() => {
      void (async () => {
        const { data, error: err } = await supabase.rpc('cotizar_pedido', { p_items: items });
        if (!vigente) return;
        setCotizacion(err || !data ? null : { ...(data as Cotizacion), clave });
      })();
    }, 250);
    return () => { vigente = false; window.clearTimeout(reloj); };
  }, [seleccion]);

  const resumen = useMemo(() => {
    let piezas = 0;
    const partes = [];
    const items: { modelo_id: number; cantidad: number }[] = [];
    for (const [id, n] of seleccion) {
      piezas += n;
      items.push({ modelo_id: id, cantidad: n });
      const m = conocidos.get(id);
      if (m?.precio_usd != null) partes.push(porCantidad(aMonto(m.precio_usd), n));
    }
    const subtotal = deMonto(sumar(partes));
    const descuento = descuentoPara(tramos, piezas);
    // El tramo que viene: "3 mas y baja 5 %". Desde una pieza se puede
    // pedir, y esto es lo que invita a llevar mas.
    const siguiente = tramos
      .filter((t) => t.activo && t.min_piezas > piezas)
      .sort((x, y) => x.min_piezas - y.min_piezas)[0] ?? null;
    const deLaBase = cotizacion !== null && cotizacion.clave === claveDe(items) ? cotizacion : null;
    return {
      piezas,
      subtotal: deLaBase ? Number(deLaBase.subtotal_usd) : subtotal,
      descuento: deLaBase ? (Number(deLaBase.descuento_pct) || null) : descuento,
      totalUsd: deLaBase ? Number(deLaBase.total_usd) : aplicarDescuento(subtotal, descuento),
      /** El precio de cada pieza en este pedido, si ya respondió la base. */
      precioDe: new Map((deLaBase?.lineas ?? []).map((l) => [l.modelo_id, Number(l.precio_usd)])),
      calculando: seleccion.size > 0 && !deLaBase,
      siguiente: siguiente ? { faltan: siguiente.min_piezas - piezas, pct: siguiente.descuento_pct } : null,
    };
  }, [seleccion, tramos, conocidos, cotizacion]);

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

  function cambiar(modeloId: number, cantidad: number) {
    setSeleccion((prev) => {
      const copia = new Map(prev);
      const max = conocidos.get(modeloId)?.disponible ?? 0;
      const n = Math.max(0, Math.min(cantidad, max));
      if (n === 0) copia.delete(modeloId); else copia.set(modeloId, n);
      return copia;
    });
  }

  function agregarPorId(id: number) {
    cambiar(id, (seleccion.get(id) ?? 0) + 1);
  }

  function verFoto(f: Familia<ModeloPublico>) {
    const ficha = fichas.find((x) => x.clave === f.clave);
    if (ficha) visor.abrir(ficha, fichas);
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
    const elegidos = [...seleccion.entries()].map(([id, cantidad]) => ({ id, m: conocidos.get(id), cantidad }));
    const faltaEnvio = entrega === 'envio' && (!agencia.trim() || !direccion.trim());

    return (
      <div className="pagina pagina--angosta mostrador">
        <div className="encabezado-pagina">
          <div>
            <h1>Tu pedido</h1>
            <p>
              {resumen.piezas} pieza{resumen.piezas === 1 ? '' : 's'}
              {resumen.descuento ? `, con ${formatearDescuento(resumen.descuento)} de descuento por cantidad` : ''}.
            </p>
          </div>
        </div>

        {error ? <ResumenErrores titulo="No se pudo apartar">{error}</ResumenErrores> : null}

        <div className="lineas-cobro">
          {elegidos.map(({ id, m, cantidad }) => {
            const precio = resumen.precioDe.get(id) ?? m?.precio_usd ?? null;
            const nombre = m ? nombreConVariante(m.nombre, m.variante) : 'Pieza';
            return (
              <div className="linea-cobro" key={id}>
                {m && urlPublicaFoto(m.foto_thumb_path)
                  ? <img className="linea-cobro__foto" src={urlPublicaFoto(m.foto_thumb_path)!} alt="" />
                  : <span className="linea-cobro__foto" />}
                <div>
                  <div className="linea-cobro__nombre">{nombre}</div>
                  <div className="linea-cobro__precio">
                    {precio !== null ? `${formatearBs(precioEnBs(precio, tasa))} c/u · ` : ''}
                    {m ? `quedan ${m.disponible}` : ''}
                  </div>
                </div>
                <div className="contador">
                  <button type="button" aria-label={`Quitar una de ${nombre}`} onClick={() => cambiar(id, cantidad - 1)}>&minus;</button>
                  <span className="contador__valor" aria-live="polite">{cantidad}</span>
                  <button type="button" aria-label={`Agregar una de ${nombre}`} disabled={!m || cantidad >= m.disponible} onClick={() => cambiar(id, cantidad + 1)}>+</button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="total-cobro" aria-busy={resumen.calculando}>
          <div>
            <span className="util secundario">Tu total</span>
            <div className="campo__pista">
              {resumen.piezas === 1 ? '1 pieza vale' : `${resumen.piezas} piezas valen`} {formatearBs(precioEnBs(resumen.subtotal, tasa))}
              {resumen.descuento ? `, menos el descuento por cantidad` : ''}
            </div>
          </div>
          <div>
            <div className="total-cobro__cifra">{formatearBs(precioEnBs(resumen.totalUsd, tasa))}</div>
            <div className="total-cobro__cifra">{formatearBcv(resumen.totalUsd)}</div>
          </div>
        </div>

        <h2 className="seccion-titulo">Tus datos</h2>
        <TusDatos valor={datos} alCambiar={setDatos} />

        <h2 className="seccion-titulo">Cómo lo recibes</h2>
        <div className="panel">
          <div className="metodos-pago">
            <button type="button" aria-pressed={entrega === 'tienda'} onClick={() => setEntrega('tienda')}>
              Retiro en tienda
            </button>
            <button type="button" aria-pressed={entrega === 'envio'} onClick={() => setEntrega('envio')}>
              Envío a mi ciudad
            </button>
          </div>

          {entrega === 'envio' ? (
            <>
              <p className="campo__pista" style={{ marginTop: 'var(--e-3)' }}>
                El envío se paga al retirarlo en la agencia, no ahora.
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
          Al apartar, las piezas quedan tuyas mientras pagas. En la pantalla
          siguiente pagas completo, o solo una parte para apartarlas unos días
          y pagar lo demás por partes; ahí te decimos cuánto y hasta cuándo.
        </p>

        <div className="acciones">
          <button
            type="button"
            className="boton boton--confirmar"
            disabled={reservando || resumen.piezas === 0 || !datosParaReservar(datos) || faltaEnvio}
            onClick={() => void reservar()}
          >
            {reservando ? 'Apartando' : 'Apartar mis piezas'}
          </button>
          <button type="button" className="boton boton--secundario" onClick={() => setPaso('catalogo')}>
            Seguir viendo
          </button>
          <button type="button" className="boton boton--secundario" onClick={() => { setSeleccion(new Map()); setPaso('catalogo'); }}>
            Vaciar el pedido
          </button>
        </div>
        {/* Un boton apagado sin explicacion es una trampa. */}
        {!datosParaReservar(datos)
          ? <p className="campo__pista">{queFalta(datos)}</p>
          : faltaEnvio ? <p className="campo__pista">Falta la agencia y su dirección para el envío.</p> : null}
      </div>
    );
  }

  /* ---------------------------------------------------------- catalogo */

  const quedanPorVer = Math.max(0, total - modelos.length);

  return (
    <>
      <header className="barra barra--publica">
        <div className="barra__interior">
          <Wordmark alto={40} />
          <span className="sesion__quien">Desde Sabana de Mendoza para toda Venezuela</span>
        </div>
      </header>

      <div className={resumen.piezas > 0 ? 'pagina mostrador catalogo-publico pagina--con-barra' : 'pagina mostrador catalogo-publico'}>
        <div className="encabezado-pagina">
          <div>
            <h1>Catálogo</h1>
            <p>Toca una pieza para verla de cerca. Arma tu pedido desde una pieza.</p>
          </div>
        </div>

        {textos.materiales_largo ? (
          <p className="sello-materiales sello-materiales--catalogo">{textos.materiales_largo}</p>
        ) : null}

        {error ? <Aviso tono="error" titulo="No se pudo cargar el catálogo">{error}</Aviso> : null}

        {/*
          Plegado en el telefono. Doce categorias dejaban la primera pieza a
          743 px de una pantalla de 844: la clienta abria el enlace y no veia
          ni una joya. En una tienda, lo primero que se enseña es la
          mercancia, no el buscador. El numero en el titulo dice cuantos
          filtros hay puestos.
        */}
        <Filtros activos={[texto, categoria, orden !== 'nombre' ? orden : ''].filter(Boolean).length}>
          <div className="fila">
            <Campo etiqueta="Buscar" htmlFor="buscar-publico">
              <input
                id="buscar-publico" type="search" value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Cadena, anillo, choker..." autoComplete="off"
              />
            </Campo>
            <Campo etiqueta="Ordenar" htmlFor="orden-publico">
              <select id="orden-publico" value={orden} onChange={(e) => setOrden(e.target.value as Orden)}>
                <option value="nombre">Por tipo de pieza</option>
                <option value="menor">Precio: menor a mayor</option>
                <option value="mayor">Precio: mayor a menor</option>
              </select>
            </Campo>
          </div>

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
          <>
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
                const nombre = unica ? nombreConVariante(m.nombre, m.variante) : m.nombre;
                return (
                  <article key={f.clave} className="tarjeta-modelo">
                    <button
                      type="button"
                      className="tarjeta-modelo__principal"
                      onClick={() => verFoto(f)}
                      aria-label={`Ver de cerca ${nombre}`}
                    >
                      {foto
                        ? <img className="tarjeta-modelo__foto" {...foto} alt="" loading="lazy" />
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
                              {quedan === 1 ? 'Queda 1' : `Quedan ${quedan}`}
                            </span>
                            {/* La clave de la tienda, nunca el nombre completo.
                                Para la clienta son dos letras sin significado;
                                para la vendedora, el estante al que ir. */}
                            {claves ? <span className="tarjeta-modelo__clave">{claves}</span> : null}
                          </span>
                        </span>
                      </span>
                    </button>

                    {/* La accion, fuera del boton de ver: dos botones hermanos,
                        no uno dentro del otro. */}
                    <div className="tarjeta-modelo__accion">
                      {!unica ? (
                        <button
                          type="button"
                          className="boton boton--secundario tarjeta-modelo__agregar"
                          onClick={() => setFamiliaAbierta(f.clave)}
                          aria-haspopup="dialog"
                          aria-label={`Elegir cuál de ${m.nombre}: ${etiquetas}`}
                        >
                          {puestas > 0 ? `Llevas ${puestas} · elegir` : 'Elegir'}
                        </button>
                      ) : puestas > 0 ? (
                        <div className="contador contador--tarjeta">
                          <button type="button" aria-label={`Quitar una de ${nombre}`} onClick={() => cambiar(m.id, puestas - 1)}>&minus;</button>
                          <span className="contador__valor" aria-live="polite">{puestas}</span>
                          <button type="button" aria-label={`Agregar otra de ${nombre}`} disabled={agotado} onClick={() => cambiar(m.id, puestas + 1)}>+</button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="boton boton--secundario tarjeta-modelo__agregar"
                          onClick={() => agregarPorId(m.id)}
                          disabled={agotado}
                          aria-label={`Agregar ${nombre} al pedido`}
                        >
                          Agregar
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>

            {/* Lo que falta por ver, dicho: antes la pieza 401 no salia nunca. */}
            {quedanPorVer > 0 ? (
              <div className="catalogo__mas">
                <p className="paginacion__cuenta">
                  Viendo {formatearEntero(modelos.length)} de {formatearEntero(total)}
                </p>
                <button type="button" className="boton boton--secundario" disabled={cargandoMas} onClick={() => void cargarMas()}>
                  {cargandoMas ? 'Trayendo más' : `Ver más piezas · faltan ${formatearEntero(quedanPorVer)}`}
                </button>
              </div>
            ) : null}
          </>
        )}

        <VisorFoto
          {...visor.props}
          accion={{
            texto: 'Agregar al pedido',
            alTocar: agregarPorId,
            deshabilitada: (id) => {
              const m = conocidos.get(id);
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
                  <span className="barra-carrito__tramo"> · {formatearDescuento(resumen.descuento)} menos</span>
                ) : resumen.siguiente ? (
                  <span className="barra-carrito__falta"> · {resumen.siguiente.faltan} más y baja {formatearDescuento(resumen.siguiente.pct)}</span>
                ) : null}
              </div>
              <div className="barra-carrito__total" aria-live="polite" aria-busy={resumen.calculando}>
                {formatearBs(precioEnBs(resumen.totalUsd, tasa))}
              </div>
            </div>
            {/* En un teléfono angosto no cabe con el total: ahí vive en "Tu pedido". */}
            <button type="button" className="boton boton--secundario barra-carrito__vaciar" onClick={() => setSeleccion(new Map())}>
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
