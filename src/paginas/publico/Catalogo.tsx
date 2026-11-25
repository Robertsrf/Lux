import { Navigate } from 'react-router-dom';
import { rutaDelCatalogo } from '../../lib/direccion';
import { Aviso, Campo, Cargando, ResumenErrores, Vacio } from '../../componentes/Piezas';
import { Icono } from '../../componentes/Iconos';
import { formatearBcv, formatearBs, formatearEntero, formatearDescuento, precioEnBs } from '../../lib/dinero';
import { ArmarDije } from '../../componentes/ArmarDije';
import { urlPublicaFoto } from '../../lib/fotos';
import { nombreConVariante, nombreDeTipo } from '../../lib/familias';
import { codigoCompleto } from '../../lib/ofertas';
import type { Familia } from '../../lib/familias';
import { decirMinutos } from '../../hooks/useReglasPedido';
import { VisorFoto, useVisorFoto } from '../../componentes/VisorFoto';
import { ElegirVariante } from '../../componentes/ElegirVariante';
import { AsiPides, POR_ESTANTE, TarjetaPieza, irA } from '../../componentes/VitrinaPublica';
import type { PedidoTarjeta } from '../../componentes/VitrinaPublica';
import { LaTienda } from '../../componentes/LaTienda';
import { Landing } from './landing/Landing';
import { SeccionComoPedir, SeccionProximamente } from './landing/SeccionesCatalogo';
import type { PropsCatalogo } from './landing/SeccionesCatalogo';
import { HojaCompletalo, HojaPareja } from './landing/Completalo';
import { TusCodigos } from './landing/TusCodigos';
import { VentanaOferta } from './landing/VentanaOferta';
import { TusDatos, datosParaReservar, queFalta } from '../../componentes/TusDatos';
import type { ModeloProximo, ModeloPublico } from '../../lib/tipos';
import { useCatalogoLux, type Orden } from './useCatalogoLux';
import { Cabecera } from './caras/Cabecera';
import { BarraPedido } from './caras/BarraPedido';
import '@fontsource/fraunces/latin-300.css';
import '@fontsource/fraunces/latin-300-italic.css';
import '@fontsource/fraunces/latin-400.css';
import '@fontsource/eb-garamond/latin-400-italic.css';
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
    reglas,
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
    categorias,
    orden,
    setOrden,
    cargando,
    cargandoMas,
    error,
    paso,
    para,
    setPaso,
    categoria,
    setCategoria,
    irATodas,
    elegirPara,
    enLista,
    consultaActual,
    cargadoPara,
    datos,
    setDatos,
    entrega,
    setEntrega,
    empresa,
    setEmpresa,
    agencia,
    setAgencia,
    direccion,
    setDireccion,
    reservando,
    familiaAbierta,
    setFamiliaAbierta,
    dijes,
    armandoBase,
    setArmandoBase,
    proximos,
    totalProximos,
    todosProximos,
    setTodosProximos,
    cargarMas,
    tituloLista,
    resumen,
    armados,
    familias,
    estantes,
    tipos,
    fichas,
    familiasProximas,
    fichasProximas,
    whatsappTienda,
    pasos,
    cerrarHoja,
    cambiar,
    agregarPorId,
    vaciar,
    quererOferta,
    abrirArmar,
    armarCon,
    esBase,
    alInicio,
    reservar,
  } = c;
  const visor = useVisorFoto();
  const visorProximo = useVisorFoto();
  function verFoto(f: Familia<ModeloPublico>) {
    const ficha = fichas.find((x) => x.clave === f.clave);
    if (ficha) visor.abrir(ficha, fichas);
  }

  function verProxima(f: Familia<ModeloProximo>) {
    const ficha = fichasProximas.find((x) => x.clave === f.clave);
    if (ficha) visorProximo.abrir(ficha, fichasProximas);
  }

  // Lo que cada tarjeta hace con el pedido: lo mismo en el inicio y en la lista.
  const pedidoTarjeta = (f: Familia<ModeloPublico>): PedidoTarjeta => ({
    destino: 'pedido',
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

  if (paso === 'pedido') {
    const elegidos = [...seleccion.entries()].map(([id, cantidad]) => ({ id, m: conocidos.get(id), cantidad }));
    const faltaEnvio = entrega === 'envio' && (!agencia.trim() || !direccion.trim());

    return (
      <div className="pub">
        <Cabecera c={c} conBuscador={false} />
        <div className="pagina pagina--angosta mostrador">
          <div className="encabezado-pagina">
            <div>
              <h1>Tu pedido</h1>
              <p>
                {resumen.piezas} pieza{resumen.piezas === 1 ? '' : 's'}
                {resumen.descuento ? `, con ${formatearDescuento(resumen.descuento)} de descuento por cantidad` : ''}.
                {' '}Tres pasos y quedan apartadas.
              </p>
            </div>
          </div>

          {error ? <ResumenErrores titulo="No se pudo apartar">{error}</ResumenErrores> : null}

          {/* Las partes numeradas: la clienta sabe dónde va y cuánto falta. */}
          <h2 className="seccion-titulo paso-pedido"><span className="paso-pedido__n" aria-hidden="true">1</span> Tus piezas</h2>
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
                    {resumen.ofertaDe.has(id) ? (
                      <div className="campo__pista">
                        {(resumen.ofertaDe.get(id) ?? 0) < cantidad ? `${resumen.ofertaDe.get(id)} con tu código` : 'Con tu código'}
                      </div>
                    ) : null}
                    {/* La cadena dice qué dijes lleva puestos, y deja ponerle uno. */}
                    {m?.armado === 'base' ? (
                      <>
                        {armados.some((p) => p.base === id) ? (
                          <div className="campo__pista">
                            Con {armados.filter((p) => p.base === id)
                              .map((p) => nombreConVariante(conocidos.get(p.dije)?.nombre ?? 'un dije', conocidos.get(p.dije)?.variante))
                              .join(', ')}
                          </div>
                        ) : null}
                        <button type="button" className="boton boton--secundario boton--pequeno" onClick={() => void abrirArmar(id, visor.cerrar)}>
                          Agrégale un dije
                        </button>
                      </>
                    ) : null}
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

          <TusCodigos
            codigos={ofertas.codigos}
            estados={resumen.codigos}
            carrito={seleccion}
            alQuitar={ofertas.quitar}
          />

          <div className="total-cobro" aria-busy={resumen.calculando}>
            <div>
              <span className="util secundario">Tu total</span>
              <div className="campo__pista">
                {resumen.piezas === 1 ? '1 pieza vale' : `${resumen.piezas} piezas valen`} {formatearBs(precioEnBs(resumen.subtotal, tasa))}
                {resumen.descuento ? `, menos el descuento por cantidad` : ''}
                {resumen.conOferta ? `${resumen.descuento ? ' y' : ', menos'} tus códigos` : ''}
              </div>
            </div>
            <div>
              <div className="total-cobro__cifra">{formatearBs(precioEnBs(resumen.totalUsd, tasa))}</div>
              <div className="total-cobro__cifra">{formatearBcv(resumen.totalUsd)}</div>
            </div>
          </div>

          <h2 className="seccion-titulo paso-pedido"><span className="paso-pedido__n" aria-hidden="true">2</span> Tus datos</h2>
          <TusDatos valor={datos} alCambiar={setDatos} />

          <h2 className="seccion-titulo paso-pedido"><span className="paso-pedido__n" aria-hidden="true">3</span> Cómo lo recibes</h2>
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
                Te esperamos en la tienda con tu cédula{textos.direccion_tienda ? `: ${textos.direccion_tienda}` : ''}.
              </p>
            )}
          </div>

          {/* Antes del botón, lo que pasa al tocarlo, con las cifras de
              verdad. Antes decía "unos días" y "una parte". */}
          <div className="panel que-pasa">
            <span className="panel__titulo">Qué pasa al apartar</span>
            <p className="prosa">
              {reglas
                ? `Tus piezas quedan guardadas a tu nombre ${decirMinutos(reglas.reserva_minutos)}. En la página de tu pedido pagas el total, o al menos el ${formatearDescuento(reglas.apartado_inicial_pct)} para apartarlas ${reglas.apartado_dias} días y pagar lo demás por partes. Si no terminas de pagar a tiempo, lo abonado no se devuelve y las piezas vuelven a la venta.`
                : 'Tus piezas quedan guardadas a tu nombre mientras pagas. En la página de tu pedido pagas el total, o solo una parte para apartarlas unos días y pagar lo demás por partes; ahí te decimos cuánto y hasta cuándo.'}
              {whatsappTienda ? ' Ahí mismo nos avisas por WhatsApp con un toque.' : ''}
            </p>
          </div>

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
          </div>
          {/* Un boton apagado sin explicacion es una trampa. */}
          {!datosParaReservar(datos)
            ? <p className="campo__pista">{queFalta(datos)}</p>
            : faltaEnvio ? <p className="campo__pista">Falta la agencia y su dirección para el envío.</p> : null}
          {/* Vaciar pesaba lo mismo que seguir: ahora es un enlace, lejos del botón. */}
          <button type="button" className="enlace-texto" onClick={() => { vaciar(); setPaso('catalogo'); }}>
            Vaciar el pedido
          </button>
          {hojaArmar}
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------- catalogo */

  const quedanPorVer = enLista ? Math.max(0, total - modelos.length) : 0;
  // El orden, el mismo en la lista (a la vista) y en el inicio (plegado).
  const campoOrden = (
    <Campo etiqueta="Ordenar" htmlFor="orden-publico">
      <select id="orden-publico" value={orden} onChange={(e) => setOrden(e.target.value as Orden)}>
        <option value="nombre">Por tipo</option>
        <option value="menor">Más baratas primero</option>
        <option value="mayor">Más caras primero</option>
      </select>
    </Campo>
  );
  // Cuántas joyas hay, contadas como tarjetas (un producto con medidas es
  // una): lo que se va a ver al tocar "Ver todas". Si el inicio no las trajo
  // todas, las filas, que es lo que se sabe.
  const cuantasJoyas = total > modelos.length ? total : familias.length;
  const proximasVisibles = todosProximos ? familiasProximas : familiasProximas.slice(0, POR_ESTANTE);

  // El inicio y la lista comparten el buscador y lo que se dice mientras llega
  // (el error, "Trayendo el catálogo", "Ninguna pieza"): se arman una vez.
  const portadaDeHoy = (
    <section className="portada-catalogo">
      <p className="portada-catalogo__de">
        {textos.ciudad ? `Desde ${textos.ciudad} para toda Venezuela` : 'Para toda Venezuela'}
      </p>
      <h1 className="portada-catalogo__titulo">Joyas para usar todos los días</h1>
      {/* En el teléfono, la versión corta; la larga sale en el detalle de cada pieza. */}
      {textos.materiales_largo ? (
        <p className={textos.materiales_corto ? 'portada-catalogo__texto portada-catalogo__texto--largo' : 'portada-catalogo__texto'}>{textos.materiales_largo}</p>
      ) : null}
      {textos.materiales_corto ? (
        <p className={textos.materiales_largo ? 'portada-catalogo__texto portada-catalogo__texto--corto' : 'portada-catalogo__texto'}>{textos.materiales_corto}</p>
      ) : null}
      <AsiPides
        pasos={['Elige tus piezas', 'Apártalas con tu cédula', 'Paga por pago móvil']}
        alVerMas={() => irA('como-pedir')}
      />
      {/* Por dónde empezar, dicho con un botón: quien entra por
          primera vez no sabe que hay que bajar. */}
      <div className="portada-catalogo__empezar">
        <button type="button" className="boton portada-catalogo__boton" onClick={irATodas}>
          Ver todas las joyas
        </button>
        <button type="button" className="asi-pides__mas" onClick={() => irA('tipos')}>
          O elige por tipo
        </button>
      </div>
      {/* Quien no se siente cómodo pidiendo solo, que sepa que no hace
          falta: se le atiende por WhatsApp. */}
      {whatsappTienda ? (
        <p className="portada-catalogo__ayuda">
          ¿Prefieres que te ayudemos?{' '}
          <a href={whatsappTienda} target="_blank" rel="noopener noreferrer">Escríbenos por WhatsApp</a>
          {' '}y te ayudamos a pedir.
        </p>
      ) : null}
    </section>
  );
  // En la lista, qué se ve y en qué orden, a la vista y no plegado: quien
  // no sabe que "Filtrar" se abre, no lo abre. El buscador y "Todas · Dama ·
  // Caballero" viven en la cabecera (Cabecera), siempre en el mismo sitio.
  const controlesLista = (
    <div className="lista-controles">
      {categorias.length > 1 && !texto.trim() ? (
        <div className="lista-controles__tipo">
          <Campo etiqueta="Ver" htmlFor="ver-publico">
            <select
              id="ver-publico"
              value={categoria ?? ''}
              onChange={(e) => (e.target.value ? setCategoria(e.target.value) : irATodas())}
            >
              <option value="">Todas las joyas</option>
              {categorias.map((c) => <option key={c} value={c}>{nombreDeTipo(c)}</option>)}
            </select>
          </Campo>
        </div>
      ) : null}
      {campoOrden}
    </div>
  );
  const aviso = (
    <>
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
    </>
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
    tarjeta: (f) => <TarjetaPieza key={f.clave} familia={f} alVer={() => verFoto(f)} pedido={pedidoTarjeta(f)} {...(cintaDe(f) ? { oferta: cintaDe(f)! } : {})} />,
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
      <Cabecera c={c} conBuscador />

      <div className={resumen.piezas > 0 ? 'pagina mostrador catalogo-publico pagina--con-barra pub-con-barra' : 'pagina mostrador catalogo-publico'}>
        {/* Arriba, o la portada o el título de la lista. El buscador va
            después, siempre en el mismo sitio: si cambiara de lugar al
            escribir, el teléfono cerraría el teclado a media palabra. */}
        {enLista ? (
          <>
            <div className="lista-cabeza">
              <button type="button" className="volver" onClick={alInicio}>
                <Icono nombre="volver" className="icono icono--sm" />
                Volver al inicio
              </button>
              <h1 className="lista-cabeza__titulo" ref={tituloLista} tabIndex={-1}>
                {categoria ? nombreDeTipo(categoria) : (texto.trim() ? `Buscaste “${texto.trim()}”` : para ? `Joyas de ${para}` : 'Todas las joyas')}
              </h1>
              {/* Los tipos a la vista, para pasar de uno a otro sin volver al
                  inicio ni abrir nada: un toque. Se envuelven, no se deslizan.
                  Solo en pantallas anchas: en el teléfono eran cuatro renglones
                  antes de la primera joya, y ahí va la lista "Ver" de abajo. */}
              {categorias.length > 1 && !texto.trim() ? (
                <nav className="tipos-fila" aria-label="Ver otro tipo de joya">
                  <button type="button" className="tipos-fila__tipo" aria-pressed={!categoria} onClick={irATodas}>Todas</button>
                  {categorias.map((c) => (
                    <button key={c} type="button" className="tipos-fila__tipo" aria-pressed={categoria === c} onClick={() => setCategoria(c)}>
                      {nombreDeTipo(c)}
                    </button>
                  ))}
                </nav>
              ) : null}
            </div>
            {controlesLista}
            {aviso}
            {piezasListas ? (
              <>
                <div className="rejilla-venta">
                  {familias.map((f) => (
                    <TarjetaPieza key={f.clave} familia={f} alVer={() => verFoto(f)} pedido={pedidoTarjeta(f)} {...(cintaDe(f) ? { oferta: cintaDe(f)! } : {})} />
                  ))}
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
            ) : null}
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

        <footer className="pie-catalogo">
          {textos.catalogo_pie ?? 'Lux by Emory'}
        </footer>

        <VisorFoto {...visorProximo.props} />

        <VisorFoto
          {...visor.props}
          alAbrirPieza={miradas.abrir}
          alCerrarPieza={miradas.cerrar}
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
        ) : miradas.pareja && parejaPct !== null && !visor.foto && familiaAbierta === null && armandoBase === null
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
      </div>
    </div>
  );
}
