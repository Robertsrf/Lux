import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase, mensajeDeError } from '../../lib/supabase';
import { Aviso, Campo, Cargando, ResumenErrores, Vacio, Filtros } from '../../componentes/Piezas';
import { formatearBcv, formatearBs, precioEnBs, totalDeLineas } from '../../lib/dinero';
import { fuenteFoto, urlPublicaFoto } from '../../lib/fotos';
import { agruparPorFamilia, conFoto, etiquetasDe, nombreConVariante, rangoDe } from '../../lib/familias';
import type { Familia } from '../../lib/familias';
import { enlaceCatalogoRv, enlaceWhatsApp } from '../../lib/revendedor';
import { useTasa } from '../../hooks/useTasa';
import { useTextos } from '../../hooks/useTextos';
import { useTemaRv } from '../../hooks/useTemaRv';
import { VisorFoto, useVisorFoto } from '../../componentes/VisorFoto';
import type { FotoAmpliada } from '../../componentes/VisorFoto';
import { ElegirVariante } from '../../componentes/ElegirVariante';
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
  const [categoria, setCategoria] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [parametros, setParametros] = useSearchParams();
  const paso: 'catalogo' | 'apartar' = parametros.get('paso') === 'apartar' ? 'apartar' : 'catalogo';
  const setPaso = (p: 'catalogo' | 'apartar') => setParametros(p === 'apartar' ? { paso: 'apartar' } : {});
  const [datos, setDatos] = useState<EstadoTusDatos>(TUS_DATOS_VACIOS);
  const [apartando, setApartando] = useState(false);
  const [familiaAbierta, setFamiliaAbierta] = useState<number | null>(null);
  const visor = useVisorFoto();

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

  useEffect(() => {
    if (perfil) document.title = `${perfil.catalogo_nombre} · Joyas Lux by Emory`;
    return () => { document.title = 'Lux by Emory'; };
  }, [perfil]);

  const cargar = useCallback(async () => {
    setCargando(true);
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
    if (err) setError(mensajeDeError(err));
    const filas = (data as unknown as ModeloRevendedor[] | null) ?? [];
    setModelos(filas);
    setPorId((antes) => {
      const copia = new Map(antes);
      for (const f of filas) copia.set(f.id, f);
      return copia;
    });
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
    setSeleccion((prev) => {
      const copia = new Map(prev);
      const max = porId.get(modeloId)?.disponible ?? 0;
      const n = Math.max(0, Math.min(cantidad, max));
      if (n === 0) copia.delete(modeloId); else copia.set(modeloId, n);
      return copia;
    });
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
        {perfil.telefono ? (
          <a
            className="boton boton--secundario boton--pequeno"
            href={enlaceWhatsApp(perfil.telefono, `Hola ${primerNombre}, vi tu catálogo: ${enlaceCatalogoRv(perfil.usuario)}`)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Escribir a {primerNombre}
          </a>
        ) : null}
      </div>
    </header>
  );

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
      <div className="pagina mostrador">
        <div className="encabezado-pagina">
          <div>
            <h1>Catálogo</h1>
            <p>
              Agrega las piezas que te gusten y apártalas; toca una para verla de cerca.
              {perfil.dias_credito ? ` Puedes pagarlas por partes en ${perfil.dias_credito} días.` : ''}
            </p>
          </div>
        </div>

        {textos.materiales_largo ? <p className="sello-materiales">{textos.materiales_largo}</p> : null}

        {error ? <Aviso tono="error" titulo="No se pudo cargar el catálogo">{error}</Aviso> : null}

        <Filtros activos={[texto, categoria].filter(Boolean).length}>
          <Campo etiqueta="Buscar" htmlFor="buscar-rv">
            <input
              id="buscar-rv" type="search" value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Cadena, anillo, choker..." autoComplete="off"
            />
          </Campo>
          {categorias.length > 1 ? (
            <div className="filtros-categoria" role="group" aria-label="Filtrar por categoría">
              <button type="button" aria-pressed={categoria === null} onClick={() => setCategoria(null)}>Todo</button>
              {categorias.map((c) => (
                <button key={c} type="button" aria-pressed={categoria === c} onClick={() => setCategoria(c)}>{c}</button>
              ))}
            </div>
          ) : null}
        </Filtros>

        {cargando ? (
          <Cargando texto="Trayendo el catálogo" />
        ) : modelos.length === 0 ? (
          <Vacio titulo={texto ? 'Ninguna pieza coincide' : 'Por ahora no hay piezas disponibles'}>
            <p>{texto ? 'Prueba con otra palabra.' : `Vuelve pronto, o escríbele a ${primerNombre}.`}</p>
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
              const nombre = unica ? nombreConVariante(m.nombre, m.variante) : m.nombre;
              /*
                Como el catálogo de la tienda desde el 14/10/2026: tocar la
                pieza abre su detalle, y "Agregar" va en su propio botón. Antes
                la tarjeta entera era un botón con la lupa DENTRO (un botón en
                otro, que el lector de pantalla no sabe anunciar) y un toque
                agregaba y dos abrían el detalle.
              */
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
                      {textos.materiales_corto ? <span className="tarjeta-modelo__material">{textos.materiales_corto}</span> : null}
                      {unica && m.variantes_nota ? <span className="celda-nota">{m.variantes_nota}</span> : null}
                      {bs.min !== bs.max ? <span className="tarjeta-modelo__desde">desde</span> : null}
                      <span className="tarjeta-modelo__precio">{formatearBs(bs.min)}</span>
                      <span className="tarjeta-modelo__precio">{formatearBcv(bcv.min)}</span>
                      <span className="tarjeta-modelo__pie">
                        <span className="tarjeta-modelo__datos">
                          <span className={quedan <= 2 ? 'tarjeta-modelo__existencia tarjeta-modelo__existencia--baja' : 'tarjeta-modelo__existencia'}>
                            {quedan === 1 ? 'Queda 1' : `Quedan ${quedan}`}
                          </span>
                        </span>
                      </span>
                    </span>
                  </button>

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
                        aria-label={`Agregar ${nombre} al apartado`}
                      >
                        Agregar
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* Antes cortaba en 400 sin decirlo: la pieza 401 no salía nunca. */}
        {!cargando && modelos.length >= LIMITE ? (
          <p className="campo__pista" style={{ marginTop: 'var(--e-4)' }}>
            Se ven las primeras {LIMITE} piezas. Busca por nombre o elige una categoría para ver las demás.
          </p>
        ) : null}

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
              <div className="barra-carrito__piezas">{resumen.piezas} pieza{resumen.piezas === 1 ? '' : 's'}</div>
              <div className="barra-carrito__total">{formatearBs(precioEnBs(resumen.totalUsd, tasa))}</div>
            </div>
            <button type="button" className="boton boton--secundario" onClick={() => setSeleccion(new Map())}>Vaciar</button>
            <button type="button" className="boton" onClick={() => setPaso('apartar')}>Apartar</button>
          </div>
        ) : null}
      </div>
    </>
  );
}
