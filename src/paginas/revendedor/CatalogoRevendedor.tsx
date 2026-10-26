import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Campo, Cargando, Filtros, ResumenErrores, Vacio } from '../../componentes/Piezas';
import { Icono } from '../../componentes/Iconos';
import { formatearBcv, formatearBs, formatearDescuento, precioEnBs, totalDeLineas } from '../../lib/dinero';
import { fuenteFoto, urlPublicaFoto } from '../../lib/fotos';
import { agruparPorFamilia, conFoto, nombreConVariante, nombreDeTipo, porCategoria } from '../../lib/familias';
import type { Familia } from '../../lib/familias';
import { enlaceCatalogoRv } from '../../lib/revendedor';
import { enlaceWhatsAppA } from '../../lib/enlaces';
import { AsiPides, ComoPedir, Estante, POR_ESTANTE, TarjetaPieza, TiposConFoto, irA } from '../../componentes/VitrinaPublica';
import type { PasoPedido, PedidoTarjeta, TipoVitrina } from '../../componentes/VitrinaPublica';
import { useTasa } from '../../hooks/useTasa';
import { useTextos } from '../../hooks/useTextos';
import { useTemaRv } from '../../hooks/useTemaRv';
import { VisorFoto, useVisorFoto } from '../../componentes/VisorFoto';
import type { FotoAmpliada } from '../../componentes/VisorFoto';
import { ElegirVariante } from '../../componentes/ElegirVariante';
import { ArmarDije } from '../../componentes/ArmarDije';
import { armar, paresVigentes } from '../../lib/armados';
import type { ParArmado } from '../../lib/armados';
import { TUS_DATOS_VACIOS, TusDatos, datosParaReservar, queFalta } from '../../componentes/TusDatos';
import type { EstadoTusDatos } from '../../componentes/TusDatos';
import type { ModeloRevendedor, PerfilRevendedor } from '../../lib/tipos';
import '../../estilos/revendedor.css';

const COLUMNAS = 'id, sku, nombre, categoria, variantes_nota, foto_path, foto_thumb_path, precio_usd, precio_bs, disponible, familia, variante';
/** Cuántas piezas trae de una vez. Si llega al tope, se dice. */
const LIMITE = 400;

/**
 * El catálogo de un revendedor: /#/r/<usuario>. Lo abre su clienta desde el
 * enlace que él le manda, sin sesión.
 *
 * Es el catálogo de la tienda con tres diferencias:
 *   - su nombre y su paleta arriba, y "Joyas Lux by Emory" debajo;
 *   - SUS precios, que nunca bajan de la etiqueta de la tienda;
 *   - se aparta hasta por los días que fija la tienda, y se le paga a él.
 *
 * Todo sale de `rv_catalogo_publico`, que no tiene ni costo, ni piso, ni lo
 * que él le paga a Lux, ni dónde está la pieza en la tienda.
 */
export function CatalogoRevendedor() {
  const { usuario = '' } = useParams();
  const navegar = useNavigate();
  const { tasa } = useTasa();
  const textos = useTextos();

  const [perfil, setPerfil] = useState<PerfilRevendedor | null>(null);
  const [perfilListo, setPerfilListo] = useState(false);
  const [modelos, setModelos] = useState<ModeloRevendedor[]>([]);
  // Todas las piezas que se han visto, no solo las de la búsqueda actual,
  // como en el catálogo de la tienda. Antes salía de `modelos`: si la
  // clienta agregaba un anillo y después buscaba "cadena", el anillo
  // dejaba de sumar en la barra y desaparecía de "Tu apartado", aunque se
  // mandaba igual al apartar.
  const [porId, setPorId] = useState<Map<number, ModeloRevendedor>>(new Map());
  const [categorias, setCategorias] = useState<string[]>([]);
  const [seleccion, setSeleccion] = useState<Map<number, number>>(new Map());
  const [texto, setTexto] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [parametros, setParametros] = useSearchParams();
  const paso: 'catalogo' | 'apartar' = parametros.get('paso') === 'apartar' ? 'apartar' : 'catalogo';
  const setPaso = (p: 'catalogo' | 'apartar') => setParametros(p === 'apartar' ? { paso: 'apartar' } : {});
  // El tipo en la ruta, como en el catálogo de la tienda: atrás vuelve al inicio.
  const categoria = parametros.get('tipo');
  const setCategoria = (c: string | null) => setParametros(c ? { tipo: c } : {});
  const enLista = Boolean(categoria || texto.trim());
  // De qué consulta son las filas que hay: mientras no sean de la de ahora
  // no se dibujan (la primera letra pintaba las 400 del inicio en la lista).
  const consultaActual = `${categoria ?? ''}|${texto.trim()}`;
  const [cargadoPara, setCargadoPara] = useState<string | null>(null);
  const turno = useRef(0);
  const [datos, setDatos] = useState<EstadoTusDatos>(TUS_DATOS_VACIOS);
  const [apartando, setApartando] = useState(false);
  const [familiaAbierta, setFamiliaAbierta] = useState<number | null>(null);
  const visor = useVisorFoto();
  // "Agrégale un dije": qué piezas son dijes o bases (de la vista pública,
  // que lo dice sin ningún precio), sus dijes con SU precio cuando se
  // piden, y las parejas, para saber si hace falta otra cadena. Aquí no se
  // guardan con el pedido: lo arma él con su clienta.
  const [tipos, setTipos] = useState<Map<number, 'dije' | 'base'>>(new Map());
  const [dijes, setDijes] = useState<ModeloRevendedor[] | null>(null);
  const [pares, setPares] = useState<ParArmado[]>([]);
  const [armandoBase, setArmandoBase] = useState<number | null>(null);

  useTemaRv(perfil?.paleta);
  const primerNombre = perfil?.nombre.trim().split(/\s+/)[0] ?? '';

  // Quién es y sus categorías, una sola vez. Las categorías se piden sin
  // filtrar: si salieran de lo que está en pantalla, elegir una haría
  // desaparecer a las demás.
  useEffect(() => {
    void (async () => {
      const [p, c] = await Promise.all([
        supabase.rpc('rv_perfil_publico', { p_usuario: usuario }),
        supabase.rpc('rv_catalogo_publico', { p_usuario: usuario }).select('categoria'),
      ]);
      // Dos consultas, dos errores mirados.
      const fallo = p.error ?? c.error ?? null;
      if (fallo) setError(mensajeDeError(fallo));
      setPerfil((p.data as PerfilRevendedor | null) ?? null);
      const lista = ((c.data as { categoria: string | null }[] | null) ?? [])
        .map((x) => x.categoria?.trim())
        .filter((x): x is string => !!x);
      setCategorias([...new Set(lista)].sort((a, b) => a.localeCompare(b, 'es')));
      setPerfilListo(true);
    })();
  }, [usuario]);

  // Qué es dije y qué es base. Mirado, pero sin tumbar el catálogo: si no
  // llega, su clienta sigue pidiendo; solo no sale "Agrégale un dije".
  useEffect(() => {
    void (async () => {
      const { data, error: err } = await supabase
        .from('v_disponible_publico')
        .select('id, armado')
        .not('armado', 'is', null)
        .limit(2000);
      if (err) return;
      const mapa = new Map<number, 'dije' | 'base'>();
      for (const f of (data as { id: number; armado: 'dije' | 'base' | null }[] | null) ?? []) {
        if (f.armado) mapa.set(f.id, f.armado);
      }
      setTipos(mapa);
    })();
  }, []);

  useEffect(() => {
    if (perfil) document.title = `${perfil.catalogo_nombre} · Joyas Lux by Emory`;
    return () => { document.title = 'Lux by Emory'; };
  }, [perfil]);

  const cargar = useCallback(async () => {
    setCargando(true);
    // Una respuesta que llega después de otra consulta ya es vieja: se tira.
    const mio = ++turno.current;
    let consulta = supabase
      .rpc('rv_catalogo_publico', { p_usuario: usuario })
      .select(COLUMNAS)
      .order('categoria', { ascending: true })
      .order('nombre', { ascending: true })
      .limit(LIMITE);
    if (categoria) consulta = consulta.eq('categoria', categoria);
    if (texto.trim()) {
      const t = texto.trim().replace(/[%,()"\\:]/g, ' ');
      consulta = consulta.or(`nombre.ilike.%${t}%,categoria.ilike.%${t}%,variante.ilike.%${t}%`);
    }
    const { data, error: err } = await consulta;
    if (mio !== turno.current) return;
    if (err) setError(mensajeDeError(err));
    const filas = (data as unknown as ModeloRevendedor[] | null) ?? [];
    setModelos(filas);
    setPorId((antes) => {
      const copia = new Map(antes);
      for (const f of filas) copia.set(f.id, f);
      return copia;
    });
    setCargadoPara(`${categoria ?? ''}|${texto.trim()}`);
    setCargando(false);
  }, [usuario, texto, categoria]);

  useEffect(() => {
    const t = setTimeout(() => void cargar(), texto ? 300 : 0);
    return () => clearTimeout(t);
  }, [cargar, texto]);

  const resumen = useMemo(() => {
    let piezas = 0;
    const lineas: { precio: number | null; cantidad: number }[] = [];
    for (const [id, n] of seleccion) {
      piezas += n;
      lineas.push({ precio: porId.get(id)?.precio_usd ?? null, cantidad: n });
    }
    return { piezas, totalUsd: totalDeLineas(lineas) };
  }, [seleccion, porId]);

  const familias = useMemo(() => agruparPorFamilia(modelos), [modelos]);

  // Los estantes del inicio y sus cuadros con foto, como en la tienda.
  const estantes = useMemo(() => porCategoria(familias), [familias]);
  const tiposConFoto = useMemo<TipoVitrina[]>(() => estantes.map((e) => {
    const conImagen = e.familias.map((f) => conFoto(f.variantes)).find((p) => p && (p.foto_path || p.foto_thumb_path));
    return {
      nombre: e.categoria,
      cuantas: e.familias.length,
      foto: conImagen ? fuenteFoto(conImagen.foto_path, conImagen.foto_thumb_path, '(max-width: 640px) 31vw, 180px') : null,
    };
  }), [estantes]);

  // Al cambiar de tipo o de paso, arriba: "Tu apartado" no abre a media página.
  useEffect(() => { window.scrollTo(0, 0); }, [categoria, paso]);
  const tituloLista = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (categoria) tituloLista.current?.focus({ preventScroll: true }); }, [categoria]);

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

  const buscarSuClienta = useCallback(
    (cedula: string) => supabase.rpc('rv_buscar_cliente', { p_usuario: usuario, p_cedula: cedula }),
    [usuario],
  );
  const cerrarHoja = useCallback(() => setFamiliaAbierta(null), []);

  function agregarPorId(id: number) {
    cambiar(id, (seleccion.get(id) ?? 0) + 1);
  }

  function cambiar(modeloId: number, cantidad: number) {
    const copia = new Map(seleccion);
    const max = porId.get(modeloId)?.disponible ?? 0;
    const n = Math.max(0, Math.min(cantidad, max));
    if (n === 0) copia.delete(modeloId); else copia.set(modeloId, n);
    setSeleccion(copia);
    // Las parejas que ya no caben se caen: si no, un dije quitado y vuelto
    // a poner suelto contaría como puesto en su cadena.
    setPares((p) => paresVigentes(p, copia));
  }

  /** Los dijes de SU catálogo, con su precio, la primera vez que se pide uno. */
  async function abrirArmar(baseId: number) {
    visor.cerrar();
    if (dijes === null) {
      const ids = [...tipos].filter(([, t]) => t === 'dije').map(([id]) => id);
      const { data, error: err } = ids.length === 0
        ? { data: [], error: null }
        : await supabase
          .rpc('rv_catalogo_publico', { p_usuario: usuario })
          .select(COLUMNAS)
          .in('id', ids)
          .order('nombre', { ascending: true })
          .limit(LIMITE);
      if (err) { setError('No se pudieron traer los dijes: ' + mensajeDeError(err)); return; }
      const filas = (data as unknown as ModeloRevendedor[] | null) ?? [];
      setPorId((antes) => {
        const copia = new Map(antes);
        for (const f of filas) copia.set(f.id, f);
        return copia;
      });
      setDijes(filas);
    }
    setArmandoBase(baseId);
  }

  function armarCon(dijeId: number) {
    if (armandoBase === null) return;
    const hecho = armar(seleccion, pares, armandoBase, dijeId, (id) => porId.get(id)?.disponible ?? 0);
    if (!hecho) {
      setError('Ya no quedan piezas para armar esa: elige otra cadena o pulsera, u otro dije.');
    } else {
      setSeleccion(hecho.seleccion);
      setPares(hecho.pares);
    }
    setArmandoBase(null);
  }

  function verFoto(f: Familia<ModeloRevendedor>) {
    const ficha = fichas.find((x) => x.clave === f.clave);
    if (ficha) visor.abrir(ficha, fichas);
  }

  async function apartar() {
    const quien = datosParaReservar(datos);
    if (!quien) return;
    setApartando(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('rv_apartar', {
      p_usuario: usuario,
      p_items: [...seleccion.entries()].map(([modelo_id, cantidad]) => ({ modelo_id, cantidad })),
      p_cedula: quien.cedula,
      // Si confirmó que es su clienta, van vacíos y la base los pone de la ficha.
      p_nombre: quien.nombre,
      p_apellido: quien.apellido,
      p_telefono: quien.telefono,
    });
    setApartando(false);
    if (err) { setError(mensajeDeError(err)); return; }
    navegar(`/apartado/${data as string}`);
  }

  /* ----------------------------------------------------------- estados */

  if (!perfilListo) return <Cargando texto="Abriendo el catálogo" />;

  if (!perfil) {
    return (
      <div className="pagina pagina--angosta">
        <Vacio titulo="Este catálogo no está disponible">
          <p>Revisa el enlace, o pídele a quien te lo mandó que te lo envíe otra vez.</p>
        </Vacio>
      </div>
    );
  }

  const logo = urlPublicaFoto(perfil.logo_path);
  // SU WhatsApp, nunca el de la tienda: su clienta le escribe y le paga a él.
  const escribirle = enlaceWhatsAppA(perfil.telefono, `Hola ${primerNombre}, vi tu catálogo: ${enlaceCatalogoRv(perfil.usuario)}`);
  const cabecera = (
    <header className="barra barra--publica">
      <div className="barra__interior">
        <div className="rv-marca">
          {logo ? <img className="rv-marca__logo" src={logo} alt="" /> : null}
          <div className="rv-marca__texto">
            <span className="rv-marca__nombre">{perfil.catalogo_nombre}</span>
            <span className="rv-marca__de">Joyas Lux by Emory</span>
          </div>
        </div>
        {escribirle ? (
          <a className="boton boton--secundario barra__contacto" href={escribirle} target="_blank" rel="noopener noreferrer">
            Escribir a {primerNombre}<span className="visualmente-oculto"> por WhatsApp</span>
          </a>
        ) : null}
      </div>
    </header>
  );

  // Cómo pedir con SUS reglas: sus horas para pagarle, su apartado y sus
  // días. Las cifras salen de su perfil; sin ellas, la frase sin cifra.
  const pasos: PasoPedido[] = [
    {
      titulo: 'Elige tus piezas',
      texto: <>Toca <strong>Agregar</strong> en las que te gusten (o <strong>Elegir</strong>, si tiene medidas): se puede pedir desde una pieza.</>,
    },
    {
      titulo: 'Apártalas con tu cédula',
      texto: `Sin pagar todavía: te las guardamos ${perfil.horas_pago ? `${perfil.horas_pago} horas` : 'unas horas'} mientras le pagas a ${primerNombre}.`,
    },
    {
      titulo: `Págale a ${primerNombre} por pago móvil`,
      texto: perfil.dias_credito
        ? `El total, o al menos el ${perfil.inicial_pct ? formatearDescuento(perfil.inicial_pct) : 'mínimo'} y tienes ${perfil.dias_credito} días para pagarle lo demás. Sus datos salen al apartar, y ahí le avisas que pagaste.`
        : 'El total. Sus datos salen al apartar, y ahí le avisas que pagaste.',
    },
    {
      titulo: `${primerNombre} te lo entrega`,
      texto: 'Cuando confirme tu pago, te escribe y cuadran la entrega.',
    },
  ];

  // Lo que cada tarjeta hace con el apartado.
  const pedidoTarjeta = (f: Familia<ModeloRevendedor>): PedidoTarjeta => ({
    destino: 'apartado',
    llevas: (id) => seleccion.get(id) ?? 0,
    disponible: (id) => porId.get(id)?.disponible ?? f.variantes.find((v) => v.id === id)?.disponible ?? 0,
    alAgregar: agregarPorId,
    alCambiar: cambiar,
    alElegir: () => setFamiliaAbierta(f.clave),
  });

  function alInicio() {
    setTexto('');
    setCategoria(null);
  }

  /* ------------------------------------------------------------ apartar */

  if (paso === 'apartar' && seleccion.size === 0) {
    return <Navigate to={`/r/${usuario}`} replace />;
  }

  if (paso === 'apartar') {
    const elegidos = [...seleccion.entries()].map(([id, cantidad]) => ({ m: porId.get(id), cantidad }));
    return (
      <>
        {cabecera}
        <div className="pagina pagina--angosta mostrador">
          <div className="encabezado-pagina">
            <div>
              <h1>Tu apartado</h1>
              <p>{resumen.piezas} pieza{resumen.piezas === 1 ? '' : 's'}.</p>
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
                  <div className="linea-cobro__precio">{formatearBs(m.precio_bs)} · {formatearBcv(m.precio_usd)}</div>
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
            <span className="util secundario">Tu total</span>
            <div>
              <div className="total-cobro__cifra">{formatearBs(precioEnBs(resumen.totalUsd, tasa))}</div>
              <div className="total-cobro__cifra">{formatearBcv(resumen.totalUsd)}</div>
            </div>
          </div>

          <h2 className="seccion-titulo">Tus datos</h2>
          <TusDatos valor={datos} alCambiar={setDatos} buscar={buscarSuClienta} vendedor={primerNombre} />

          <div className="panel">
            <span className="panel__titulo">Cómo funciona</span>
            <p className="prosa">
              Tus piezas quedan apartadas {perfil.horas_pago ? `${perfil.horas_pago} horas` : 'unas horas'} mientras
              le pagas a {primerNombre}. En la pantalla siguiente están sus datos de pago móvil y ahí le avisas
              que ya pagaste.
              {perfil.dias_credito
                ? ` Puedes pagar el total, o al menos el ${perfil.inicial_pct ?? ''} % y tienes ${perfil.dias_credito} días para pagarle lo demás.`
                : ' Se paga el total.'}
            </p>
          </div>

          <div className="acciones">
            <button
              type="button"
              className="boton boton--confirmar"
              disabled={apartando || resumen.piezas === 0 || !datosParaReservar(datos)}
              onClick={() => void apartar()}
            >
              {apartando ? 'Apartando' : 'Apartar mis piezas'}
            </button>
            <button type="button" className="boton boton--secundario" onClick={() => setPaso('catalogo')}>
              Seguir viendo
            </button>
          </div>
          {!datosParaReservar(datos) ? <p className="campo__pista">{queFalta(datos)}</p> : null}
        </div>
      </>
    );
  }

  /* ----------------------------------------------------------- catálogo */

  return (
    <>
      {cabecera}
      {/* `pagina--con-barra` con la barra del apartado, como en la tienda:
          sin él, la barra tapaba la última fila en el teléfono. */}
      <div className={resumen.piezas > 0 ? 'pagina mostrador catalogo-publico pagina--con-barra' : 'pagina mostrador catalogo-publico'}>
        {/* La portada o el título de la lista; el buscador después, siempre
            en el mismo sitio, para que escribir no cierre el teclado. */}
        {enLista ? (
          <div className="lista-cabeza">
            <button type="button" className="volver" onClick={alInicio}>
              <Icono nombre="volver" className="icono icono--sm" />
              Todo el catálogo
            </button>
            <h1 className="lista-cabeza__titulo" ref={tituloLista} tabIndex={-1}>{categoria ? nombreDeTipo(categoria) : `Buscaste “${texto.trim()}”`}</h1>
          </div>
        ) : (
          <section className="portada-catalogo">
            <p className="portada-catalogo__de">Joyas Lux by Emory · con {primerNombre}</p>
            <h1 className="portada-catalogo__titulo">Joyas para usar todos los días</h1>
            {/* En el teléfono, la versión corta; la larga sale en el detalle de cada pieza. */}
            {textos.materiales_largo ? (
              <p className={textos.materiales_corto ? 'portada-catalogo__texto portada-catalogo__texto--largo' : 'portada-catalogo__texto'}>{textos.materiales_largo}</p>
            ) : null}
            {textos.materiales_corto ? (
              <p className={textos.materiales_largo ? 'portada-catalogo__texto portada-catalogo__texto--corto' : 'portada-catalogo__texto'}>{textos.materiales_corto}</p>
            ) : null}
            <AsiPides
              pasos={['Elige tus piezas', 'Apártalas con tu cédula', `Págale a ${primerNombre}`]}
              alVerMas={() => irA('como-pedir')}
            />
          </section>
        )}

        <div className="buscador-catalogo">
          <Campo etiqueta="Buscar una pieza" htmlFor="buscar-rv">
            <input
              id="buscar-rv" type="search" value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Cadena, anillo, choker..." autoComplete="off"
            />
          </Campo>
          {/* El tipo también en el inicio: con más de las que trae, lleva a todas. */}
          {categorias.length > 1 ? (
            <Filtros activos={categoria ? 1 : 0}>
              <Campo etiqueta="Tipo" htmlFor="tipo-rv">
                <select id="tipo-rv" value={categoria ?? ''} onChange={(e) => setCategoria(e.target.value || null)}>
                  <option value="">Todos los tipos</option>
                  {categorias.map((c) => <option key={c} value={c}>{nombreDeTipo(c)}</option>)}
                </select>
              </Campo>
            </Filtros>
          ) : null}
        </div>

        {error ? <Aviso tono="error" titulo="No se pudo cargar el catálogo">{error}</Aviso> : null}

        {cargando || cargadoPara !== consultaActual ? (
          <Cargando texto="Trayendo el catálogo" />
        ) : modelos.length === 0 ? (
          <Vacio titulo={texto ? 'Ninguna pieza coincide' : 'Por ahora no hay piezas disponibles'}>
            <p>{texto ? 'Prueba con otra palabra, o mira todo el catálogo.' : `Vuelve pronto, o escríbele a ${primerNombre}.`}</p>
            {enLista ? <button type="button" className="boton boton--secundario" onClick={alInicio}>Ver todo el catálogo</button> : null}
          </Vacio>
        ) : !enLista ? (
          <>
            <TiposConFoto tipos={tiposConFoto} alElegir={setCategoria} />
            {estantes.map((e) => (
              <Estante
                key={e.categoria}
                titulo={nombreDeTipo(e.categoria)}
                cuantas={e.familias.length}
                alVerTodas={e.familias.length > POR_ESTANTE ? () => setCategoria(e.categoria) : undefined}
              >
                {e.familias.slice(0, POR_ESTANTE).map((f) => (
                  <TarjetaPieza key={f.clave} familia={f} alVer={() => verFoto(f)} pedido={pedidoTarjeta(f)} />
                ))}
              </Estante>
            ))}
          </>
        ) : (
          <div className="rejilla-venta">
            {familias.map((f) => (
              <TarjetaPieza key={f.clave} familia={f} alVer={() => verFoto(f)} pedido={pedidoTarjeta(f)} />
            ))}
          </div>
        )}
        {/* Antes cortaba en 400 sin decirlo: la pieza 401 no salía nunca. */}
        {!cargando && modelos.length >= LIMITE ? (
          <p className="campo__pista" style={{ marginTop: 'var(--e-4)' }}>
            Se ven las primeras {LIMITE} piezas. Busca por nombre o elige una categoría para ver las demás.
          </p>
        ) : null}

        {!cargando ? <ComoPedir id="como-pedir" pasos={pasos} /> : null}

        {/* Su contacto, al final. El de él, nunca el de la tienda: ni su
            dirección, ni su WhatsApp, ni su pago móvil. */}
        {!cargando && escribirle ? (
          <section className="la-tienda" aria-label={`Escríbele a ${primerNombre}`}>
            <div className="la-tienda__tarjeta">
              <div className="la-tienda__dato">
                <span className="la-tienda__etiqueta">{perfil.catalogo_nombre}</span>
                <p className="la-tienda__texto">¿Dudas con una pieza o con tu pedido? Escríbele a {primerNombre}.</p>
                <a className="boton la-tienda__boton" href={escribirle} target="_blank" rel="noopener noreferrer">
                  Escribir a {primerNombre}
                </a>
              </div>
            </div>
          </section>
        ) : null}

        <footer className="pie-catalogo">{perfil.catalogo_nombre} · Joyas Lux by Emory</footer>

        <VisorFoto
          {...visor.props}
          accion={{
            texto: 'Agregar al apartado',
            alTocar: agregarPorId,
            deshabilitada: (id) => {
              const m = porId.get(id);
              return !m || (seleccion.get(id) ?? 0) >= m.disponible;
            },
            llevas: (id) => seleccion.get(id) ?? 0,
          }}
          secundaria={{
            texto: 'Agrégale un dije',
            visible: (id) => tipos.get(id) === 'base',
            alTocar: (id) => void abrirArmar(id),
          }}
        />

        {armandoBase !== null && dijes !== null ? (
          <ArmarDije
            base={nombreConVariante(porId.get(armandoBase)?.nombre ?? 'tu cadena', porId.get(armandoBase)?.variante)}
            dijes={dijes}
            llevas={(id) => seleccion.get(id) ?? 0}
            alElegir={armarCon}
            alCerrar={() => setArmandoBase(null)}
          />
        ) : null}

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
                  quedan: v.disponible,
                  precio: { clave: `${v.precio_bs}|${v.precio_usd}` },
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
              <div className="barra-carrito__piezas">{resumen.piezas} pieza{resumen.piezas === 1 ? '' : 's'}</div>
              <div className="barra-carrito__total">{formatearBs(precioEnBs(resumen.totalUsd, tasa))}</div>
            </div>
            <button type="button" className="boton boton--secundario" onClick={() => { setSeleccion(new Map()); setPares([]); }}>Vaciar</button>
            <button type="button" className="boton" onClick={() => setPaso('apartar')}>Apartar</button>
          </div>
        ) : null}
      </div>
    </>
  );
}
