import { Navigate } from 'react-router-dom';
import { rutaDelCatalogo } from '../../lib/direccion';
import { Aviso, Cargando, Vacio } from '../../componentes/Piezas';
import { formatearBcv, formatearBs } from '../../lib/dinero';
import { ArmarDije } from '../../componentes/ArmarDije';
import { nombreConVariante } from '../../lib/familias';
import { codigoCompleto } from '../../lib/ofertas';
import type { Familia } from '../../lib/familias';
import { VisorFoto, useVisorFoto } from '../../componentes/VisorFoto';
import { ElegirVariante } from '../../componentes/ElegirVariante';
import { irA } from './caras/ComoPedir';
import { POR_ESTANTE } from './caras/Estante';
import { Tarjeta } from './caras/Tarjeta';
import type { PedidoTarjeta } from './caras/Tarjeta';
import { Lista } from './caras/Lista';
import { PaginaPieza } from './caras/PaginaPieza';
import { useLayoutEffect, useRef } from 'react';
import { LaTienda } from '../../componentes/LaTienda';
import { Landing } from './landing/Landing';
import { SeccionComoPedir, SeccionProximamente } from './landing/SeccionesCatalogo';
import type { PropsCatalogo } from './landing/SeccionesCatalogo';
import { HojaCompletalo, HojaPareja } from './landing/Completalo';
import { VentanaOferta } from './landing/VentanaOferta';
import type { ModeloProximo, ModeloPublico } from '../../lib/tipos';
import { useCatalogoLux } from './useCatalogoLux';
import { Cabecera } from './caras/Cabecera';
import { BarraPedido } from './caras/BarraPedido';
import { Pedido } from './caras/Pedido';
import '../../estilos/publico.css';

/**
 * Catalogo publico. Se abre sin sesion, desde un enlace de WhatsApp.
 *
 * Lo que se ve aqui sale de v_disponible_publico, que no expone ninguna
 * columna de costo y descuenta lo que ya esta reservado por otra persona.
 *
 * DOS VISTAS (rediseño del 24/10/2026)
 * El inicio es una vitrina: qué es Lux y cómo se pide, los tipos con foto,
 * un estante por tipo, cómo pedir con las cifras de verdad, lo que viene y
 * la tienda (dónde está, cuándo abre, cómo se le escribe y a dónde se
 * paga). Un tipo (`?tipo=Anillos`), una búsqueda o el orden por precio
 * abren la lista de siempre, con "Ver más". Antes era una sola rejilla de
 * 23.600 px sin un título, con las categorías plegadas en "Filtrar" y sin
 * una palabra de la tienda.
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
  const c = useCatalogoLux();
  const {
    tasa,
    textos,
    landing,
    ofertas,
    parejaPct,
    miradas,
    ventana,
    setVentana,
    completalo,
    setCompletalo,
    cintaDe,
    modelos,
    total,
    conocidos,
    seleccion,
    texto,
    cargando,
    error,
    paso,
    para,
    setPaso,
    setCategoria,
    irATodas,
    elegirPara,
    enLista,
    consultaActual,
    cargadoPara,
    familiaAbierta,
    setFamiliaAbierta,
    dijes,
    armandoBase,
    setArmandoBase,
    proximos,
    totalProximos,
    todosProximos,
    setTodosProximos,
    resumen,
    familias,
    estantes,
    tipos,
    familiasProximas,
    whatsappTienda,
    pasos,
    cerrarHoja,
    cambiar,
    agregarPorId,
    quererOferta,
    abrirArmar,
    armarCon,
    esBase,
    alInicio,
    pieza,
    abrirPieza,
    parametros,
  } = c;
  const visor = useVisorFoto();
  const visorProximo = useVisorFoto();
  // La pieza abre su página (`?pieza=`); al volver, el catálogo queda donde
  // estaba: se guarda el desplazamiento al abrirla y se devuelve al cerrarla,
  // SOLO si se vuelve a la misma vista (no al pedido, ni al inicio desde el
  // logo, ni a otro "para quién").
  const scrollAntes = useRef<{ y: number; vista: string } | null>(null);
  const vistaDe = (p: URLSearchParams) => { const q = new URLSearchParams(p); q.delete('pieza'); return q.toString(); };
  // Lo que espera la transición de vista para tomar la foto de después: la
  // pieza ya pintada (BrowserRouter cambia la ruta en una transición de
  // React, que flushSync no vacía).
  const piezaPintada = useRef<(() => void) | null>(null);
  // Donde el navegador sabe (View Transitions), la foto de la tarjeta crece
  // hasta la de la página; donde no, o con movimiento reducido, cambia sin más.
  const verPieza = (id: number, familia?: number) => {
    scrollAntes.current = { y: window.scrollY, vista: vistaDe(parametros) };
    const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (quieto || typeof document.startViewTransition !== 'function') { abrirPieza(id); return; }
    const foto = familia !== undefined ? document.querySelector<HTMLElement>(`img[data-familia="${familia}"]`) : null;
    if (foto) foto.style.viewTransitionName = 'pub-foto';
    const t = document.startViewTransition(() => new Promise<void>((listo) => {
      piezaPintada.current = listo;
      abrirPieza(id);
      // Si algo tarda, la transición no se queda esperando.
      window.setTimeout(listo, 600);
    }));
    void t.finished.finally(() => { if (foto) foto.style.viewTransitionName = ''; });
  };
  const vistaActual = vistaDe(parametros);
  useLayoutEffect(() => {
    if (pieza !== null) {
      window.scrollTo(0, 0);
      piezaPintada.current?.();
      piezaPintada.current = null;
      return;
    }
    const antes = scrollAntes.current;
    scrollAntes.current = null;
    if (antes && paso === 'catalogo' && antes.vista === vistaActual) {
      requestAnimationFrame(() => window.scrollTo(0, antes.y));
    }
  }, [pieza, paso, vistaActual]);
  const verFoto = (f: Familia<ModeloPublico>) => verPieza(f.cabeza.id, f.clave);
  const verProxima = (f: Familia<ModeloProximo>) => verPieza(f.cabeza.id, f.clave);

  // Lo que cada tarjeta hace con el pedido: lo mismo en el inicio y en la lista.
  const pedidoTarjeta = (f: Familia<ModeloPublico>): PedidoTarjeta => ({
    llevas: (id) => seleccion.get(id) ?? 0,
    disponible: (id) => conocidos.get(id)?.disponible ?? f.variantes.find((v) => v.id === id)?.disponible ?? 0,
    alAgregar: agregarPorId,
    alCambiar: cambiar,
    alElegir: () => setFamiliaAbierta(f.clave),
  });

  // La hoja de "Agrégale un dije": sale en el catálogo y en "Tu pedido".
  const hojaArmar = armandoBase !== null && dijes !== null ? (
    <ArmarDije
      base={nombreConVariante(conocidos.get(armandoBase)?.nombre ?? 'tu cadena', conocidos.get(armandoBase)?.variante)}
      dijes={dijes}
      llevas={(id) => seleccion.get(id) ?? 0}
      alElegir={armarCon}
      alCerrar={() => setArmandoBase(null)}
    />
  ) : null;


  /* ------------------------------------------------------------ pedido */

  // Volver atras despues de apartar deja la seleccion vacia: en vez de un
  // formulario de pedido sin piezas, se regresa al catalogo.
  if (paso === 'pedido' && seleccion.size === 0) {
    return <Navigate to={rutaDelCatalogo()} replace />;
  }

  if (paso === 'pedido') return <Pedido c={c} hojaArmar={hojaArmar} />;

  /* ---------------------------------------------------------- catalogo */

  // Cuántas joyas hay, contadas como tarjetas (un producto con medidas es
  // una): lo que se va a ver al tocar "Ver todas". Si el inicio no las trajo
  // todas, las filas, que es lo que se sabe.
  const cuantasJoyas = total > modelos.length ? total : familias.length;
  const proximasVisibles = todosProximos ? familiasProximas : familiasProximas.slice(0, POR_ESTANTE);

  // El inicio y la lista comparten el buscador y lo que se dice mientras llega
  // (el error, "Trayendo el catálogo", "Ninguna pieza"): se arman una vez.
  // La portada de siempre (sin la landing, o mientras no llega): la frase,
  // los materiales, cómo se pide en tres pasos y por dónde empezar.
  const portadaDeHoy = (
    <section className="pub-contenedor pub-portada-sola">
      <p className="pub-etiqueta">
        {textos.ciudad ? `Desde ${textos.ciudad} para toda Venezuela` : 'Para toda Venezuela'}
      </p>
      <h1 className="pub-titulo pub-titulo--grande">Joyas para usar <em>todos los días</em></h1>
      {textos.materiales_corto || textos.materiales_largo ? (
        <p className="pub-prosa">{textos.materiales_corto ?? textos.materiales_largo}</p>
      ) : null}
      <ol className="pub-portada-sola__pasos">
        {['Elige tus piezas', 'Apártalas con tu cédula', 'Paga por pago móvil'].map((p, n) => (
          <li key={p}><span aria-hidden="true">{n + 1}</span>{p}</li>
        ))}
      </ol>
      {/* Por dónde empezar, dicho con un botón: quien entra por primera vez no sabe que hay que bajar. */}
      <div className="pub-portada-sola__botones">
        <button type="button" className="pub-boton" onClick={irATodas}>Ver todas las joyas</button>
        <button type="button" className="pub-boton pub-boton--claro" onClick={() => irA('como-pedir')}>Cómo pedir</button>
      </div>
      <button type="button" className="pub-enlace" onClick={() => irA('tipos')}>O elige por tipo</button>
      {/* Quien no se siente cómodo pidiendo solo, que sepa que no hace falta. */}
      {whatsappTienda ? (
        <p className="pub-secundario">
          ¿Prefieres que te ayudemos? <a href={whatsappTienda} target="_blank" rel="noopener noreferrer">Escríbenos por WhatsApp</a> y te ayudamos a pedir.
        </p>
      ) : null}
    </section>
  );
  const aviso = (
    <div className="pub-contenedor pub-aviso">
      {error ? <Aviso tono="error" titulo="No se pudo cargar el catálogo">{error}</Aviso> : null}

      {cargando || cargadoPara !== consultaActual ? (
        <Cargando texto="Trayendo el catálogo" />
      ) : modelos.length === 0 ? (
        <Vacio titulo={texto ? 'Ninguna pieza coincide' : para ? `Por ahora no hay piezas de ${para} a la venta` : 'Por ahora no hay piezas disponibles'}>
          <p>{texto ? 'Prueba con otra palabra, o mira todo el catálogo.' : para ? 'Mira lo que viene en camino, o ve todas las joyas.' : 'Vuelve pronto: estamos surtiendo la vitrina.'}</p>
          {para && !texto ? (
            <button type="button" className="boton boton--secundario" onClick={() => elegirPara(null)}>Ver todas las joyas</button>
          ) : enLista ? (
            <button type="button" className="boton boton--secundario" onClick={alInicio}>Ver todo el catálogo</button>
          ) : null}
        </Vacio>
      ) : null}
    </div>
  );
  // Las piezas del inicio ya son las de esta consulta (si no, se estaba
  // escribiendo una letra y la base no ha respondido).
  const piezasListas = !cargando && cargadoPara === consultaActual && modelos.length > 0;
  const catalogoProps: PropsCatalogo = {
    cargando,
    tipos: piezasListas ? tipos : [],
    estantes: piezasListas ? estantes : [],
    cuantasJoyas,
    traidas: modelos.length,
    totalEnBase: total,
    tarjeta: (f, ancho = 'estante') => <Tarjeta key={f.clave} familia={f} ancho={ancho} alVer={() => verFoto(f)} pedido={pedidoTarjeta(f)} {...(cintaDe(f) ? { oferta: cintaDe(f)! } : {})} />,
    irATodas,
    irATipo: setCategoria,
    pasos,
    pieComoPedir: whatsappTienda ? 'Al apartar te sale un botón para avisarnos por WhatsApp.' : null,
    proximas: familiasProximas,
    proximasVisibles,
    totalProximos,
    cargadosProximos: proximos.length,
    todosProximos,
    alternarProximos: () => setTodosProximos((x) => !x),
    alVerProxima: verProxima,
  };

  return (
    <div className="pub">
      <Cabecera c={c} conBuscador={pieza === null} />

      <main className={resumen.piezas > 0 ? 'pub-pagina pub-con-barra' : 'pub-pagina'}>
        {/* Arriba, o la portada o el título de la lista. El buscador va
            después, siempre en el mismo sitio: si cambiara de lugar al
            escribir, el teléfono cerraría el teclado a media palabra. */}
        {pieza !== null ? (
          <PaginaPieza c={c} alAmpliar={(ficha, proxima) => (proxima ? visorProximo : visor).abrir(ficha)} />
        ) : null}
        <div hidden={pieza !== null}>
        {enLista ? (
          <>
            <Lista c={c} tarjeta={(f) => catalogoProps.tarjeta(f, 'rejilla')} aviso={aviso} listas={piezasListas} />
            <SeccionComoPedir c={catalogoProps} />
            <SeccionProximamente c={catalogoProps} />
            {!cargando ? <LaTienda id="la-tienda" textos={textos} /> : null}
          </>
        ) : (
          landing.cargando ? (
            <div className="lp-espera" role="status" aria-busy="true"><span className="visualmente-oculto">Cargando</span></div>
          ) : <Landing
            secciones={landing.secciones}
            catalogo={catalogoProps}
            ofertas={ofertas}
            acciones={{ tasa, querer: quererOferta, verCodigo: setVentana }}
            textos={textos}
            whatsapp={whatsappTienda}
            portadaDeHoy={portadaDeHoy}
            buscador={null}
            aviso={aviso}
          />
        )}
        </div>

        <footer className="pie-catalogo">
          {textos.catalogo_pie ?? 'Lux by Emory'}
        </footer>

        <VisorFoto {...visorProximo.props} />

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
          secundaria={{
            texto: 'Agrégale un dije',
            visible: esBase,
            alTocar: (id) => void abrirArmar(id, visor.cerrar),
          }}
        />

        {hojaArmar}

        {ventana ? (
          <VentanaOferta
            codigo={ventana}
            tasa={tasa}
            faltan={codigoCompleto(ventana, seleccion) ? [] : ventana.piezas.filter((p) => (seleccion.get(p.modelo_id) ?? 0) < p.cantidad)}
            alVerPedido={() => { setVentana(null); setPaso('pedido'); }}
            alCerrar={() => setVentana(null)}
          />
        ) : completalo && parejaPct !== null && conocidos.get(completalo.a) && conocidos.get(completalo.b) ? (
          <HojaCompletalo
            a={conocidos.get(completalo.a)!}
            b={conocidos.get(completalo.b)!}
            pct={parejaPct}
            alQuerer={() => quererOferta('complemento', [completalo.a, completalo.b])}
            alCerrar={() => setCompletalo(null)}
          />
        ) : miradas.pareja && parejaPct !== null && !visor.foto && pieza === null && familiaAbierta === null && armandoBase === null
          && conocidos.get(miradas.pareja[0]) && conocidos.get(miradas.pareja[1]) ? (
          <HojaPareja
            a={conocidos.get(miradas.pareja[0])!}
            b={conocidos.get(miradas.pareja[1])!}
            pct={parejaPct}
            alQuerer={() => quererOferta('dos_vistas', [miradas.pareja![0], miradas.pareja![1]])}
            alCerrar={miradas.descartar}
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

        <BarraPedido c={c} />
      </main>
    </div>
  );
}
