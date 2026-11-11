import { useMemo, type ReactNode } from 'react';
import { LaTienda } from '../../../componentes/LaTienda';
import { useAparecer } from '../../../hooks/useAparecer';
import type { SeccionLanding, TipoSeccion } from '../../../hooks/useLanding';
import type { UsoOfertas } from '../../../hooks/useOfertas';
import type { useTextos } from '../../../hooks/useTextos';
import '../../../estilos/landing.css';
import { Cintas } from './Cintas';
import { Combos } from './Combos';
import { Escote } from './Escote';
import { Estuche } from './Estuche';
import { OfertasCasa } from './OfertasCasa';
import type { AccionesOferta } from './PiezasOferta';
import { Seleccion } from './Seleccion';
import { ProveedorLanding, idSeccion, type ContextoLanding } from './contexto';
import { Galeria } from './Galeria';
import { Buscamos, Nosotros } from './Historia';
import { Materiales } from './Materiales';
import { Portada } from './Portada';
import { Puertas } from './Puertas';
import { Redes } from './Redes';
import {
  SeccionComoPedir, SeccionEstantes, SeccionProximamente, SeccionTipos,
  type PropsCatalogo,
} from './SeccionesCatalogo';
import { VideoLanding } from './VideoLanding';
import type { OfertasPublicas } from '../../../lib/ofertas';
import type { ModeloPublico } from '../../../lib/tipos';

export interface PropsLanding {
  /** Las secciones de `v_landing`. Null: no llegaron, y se dibuja el inicio de siempre. */
  secciones: SeccionLanding[] | null;
  catalogo: PropsCatalogo;
  ofertas?: UsoOfertas;
  /** Lo que hacen las ofertas con el pedido; sin esto, no se dibuja ninguna sección de ofertas. */
  acciones?: AccionesOferta;
  textos: ReturnType<typeof useTextos>;
  /** El chat de WhatsApp de la tienda, o null sin número válido. */
  whatsapp: string | null;
  /** La portada de siempre, para cuando no hay secciones. */
  portadaDeHoy: ReactNode;
  /** El buscador, que va siempre en el mismo sitio de la página. */
  buscador: ReactNode;
  /** Lo que dice la lista mientras llega o si no hay piezas: el error, "Trayendo el catálogo", "Ninguna pieza". */
  aviso: ReactNode;
}

/** Las secciones de ofertas: se dibujan cuando están sus componentes (Tarea 8). */
const DE_OFERTAS: ReadonlySet<TipoSeccion> = new Set<TipoSeccion>(['estuche', 'combos', 'seleccion', 'escote', 'regalo', 'casa']);

/**
 * Si una sección de ofertas tiene algo que enseñar hoy. Sin datos no se
 * dibuja, y entonces tampoco cuenta para la puerta "Ofertas" ni para un
 * botón con destino a ella: nunca un botón que lleve a un hueco.
 */
function seDibuja(tipo: TipoSeccion, o: OfertasPublicas | null | undefined, hayPiezas: boolean, hayAcciones: boolean): boolean {
  if (!hayAcciones || !o || !o.encendidas) return false;
  switch (tipo) {
    case 'estuche': return true;
    case 'combos': return o.combos.length > 0;
    case 'regalo': return o.regalo.length > 0;
    case 'seleccion': return (o.seleccion?.piezas.length ?? 0) > 0;
    case 'casa': return o.casa.length > 0;
    case 'escote': return o.pareja_pct !== null && hayPiezas;
    default: return false;
  }
}
/** Las que entran con su propio movimiento, o son lo de siempre: no se les añade el de "aparecer". */
const SIN_APARECER: ReadonlySet<TipoSeccion> = new Set<TipoSeccion>(['portada', 'cintas', 'tipos', 'estantes', 'como_pedir', 'proximamente', 'tienda']);

/** Cada sección entra una sola vez, con un fundido corto, al aparecer en pantalla. */
function Seccion({ tipo, children }: { tipo: TipoSeccion; children: ReactNode }) {
  const [ref, visible] = useAparecer<HTMLDivElement>();
  const anima = !SIN_APARECER.has(tipo);
  const clase = !anima ? 'lp-seccion' : visible ? 'lp-seccion lp-aparece lp-aparece--visible' : 'lp-seccion lp-aparece';
  return <div id={idSeccion(tipo)} ref={ref} className={clase} data-tipo={tipo}>{children}</div>;
}

/**
 * El inicio del catálogo público. Lo arman las secciones que el dueño
 * eligió en el panel (`v_landing`): portada con slider, cintas de ofertas,
 * tipos, estantes, historia, materiales, galería, video, redes... en el
 * orden que quiso. Las tres puertas (Joyas, Ofertas, Lo que viene) van
 * fijas arriba.
 *
 * SIN LA LANDING (`secciones` null: el SQL #65 todavía no está o la lectura
 * falló) se dibuja el inicio de siempre, en su orden de siempre, y la clienta
 * no se entera. Eso es lo que hace seguro desplegar primero el SQL y después
 * el navegador, o al revés.
 *
 * Un tipo sin componente (las ofertas, hasta que se dibujen) no sale ni
 * deja un hueco.
 */
export function Landing({ secciones, catalogo, ofertas, acciones, textos, whatsapp, portadaDeHoy, buscador, aviso }: PropsLanding) {
  const encendidas = ofertas?.ofertas?.encendidas === true;
  const datosOfertas = ofertas?.ofertas ?? null;
  // Las piezas de la tienda, para la guía de escotes: las mismas que enseñan los estantes.
  const piezasDeLaTienda = useMemo<ModeloPublico[]>(
    () => catalogo.estantes.flatMap((e) => e.familias.flatMap((f) => f.variantes)),
    [catalogo.estantes],
  );
  const hayPiezas = piezasDeLaTienda.length > 0;
  const hayAcciones = acciones !== undefined;

  // Todos los useMemo, antes de cualquier return.
  const contexto = useMemo<ContextoLanding>(() => {
    const lista = secciones ?? [];
    const visibles = new Set<string>(
      lista
        .filter((s) => !DE_OFERTAS.has(s.tipo) || seDibuja(s.tipo, datosOfertas, hayPiezas, hayAcciones))
        .map((s) => s.tipo),
    );
    const primeraOferta = lista.find((s) => DE_OFERTAS.has(s.tipo) && seDibuja(s.tipo, datosOfertas, hayPiezas, hayAcciones));
    return {
      irATodas: catalogo.irATodas,
      irATipo: catalogo.irATipo,
      whatsapp,
      seccionesVisibles: visibles,
      idOfertas: primeraOferta ? idSeccion(primeraOferta.tipo) : null,
      hayProximas: visibles.has('proximamente') && catalogo.proximas.length > 0,
    };
  }, [secciones, datosOfertas, hayPiezas, hayAcciones, catalogo.irATodas, catalogo.irATipo, catalogo.proximas.length, whatsapp]);

  if (secciones === null) {
    return (
      <>
        {portadaDeHoy}
        {buscador}
        {aviso}
        <SeccionTipos c={catalogo} />
        <SeccionEstantes c={catalogo} />
        <SeccionComoPedir c={catalogo} />
        <SeccionProximamente c={catalogo} />
        {!catalogo.cargando ? <LaTienda id="la-tienda" textos={textos} /> : null}
      </>
    );
  }

  function dibujar(s: SeccionLanding): ReactNode | undefined {
    switch (s.tipo) {
      case 'portada': return <Portada diapositivas={s.datos.diapositivas ?? []} />;
      case 'cintas': return <Cintas ofertas={encendidas ? (ofertas?.ofertas ?? null) : null} />;
      case 'tipos': return <SeccionTipos c={catalogo} />;
      case 'estantes': return <SeccionEstantes c={catalogo} />;
      case 'como_pedir': return <SeccionComoPedir c={catalogo} />;
      case 'proximamente': return <SeccionProximamente c={catalogo} />;
      case 'nosotros': return <Nosotros seccion={s} />;
      case 'buscamos': return <Buscamos seccion={s} />;
      case 'materiales': return <Materiales seccion={s} />;
      case 'galeria': return <Galeria seccion={s} />;
      case 'video': return <VideoLanding seccion={s} />;
      case 'redes': return <Redes seccion={s} textos={textos} />;
      case 'tienda': return catalogo.cargando ? null : <LaTienda id="la-tienda" textos={textos} />;
      // Las de ofertas: solo con datos y con qué hacer con ellas.
      case 'estuche': return acciones && seDibuja('estuche', datosOfertas, hayPiezas, true)
        ? <Estuche id={`t-${s.id}`} titulo={s.titulo || 'Abre tu estuche'} texto={s.texto} codigos={ofertas?.codigos ?? []} acciones={acciones} /> : undefined;
      case 'combos': return acciones && datosOfertas && seDibuja('combos', datosOfertas, hayPiezas, true)
        ? <Combos id={`t-${s.id}`} titulo={s.titulo || 'Combos de la semana'} texto={s.texto} combos={datosOfertas.combos} origen="combo" acciones={acciones} /> : undefined;
      case 'regalo': return acciones && datosOfertas && seDibuja('regalo', datosOfertas, hayPiezas, true)
        ? <Combos id={`t-${s.id}`} titulo={s.titulo || 'Para regalar'} texto={s.texto} combos={datosOfertas.regalo} origen="regalo" acciones={acciones} /> : undefined;
      case 'seleccion': return acciones && datosOfertas?.seleccion && seDibuja('seleccion', datosOfertas, hayPiezas, true)
        ? <Seleccion id={`t-${s.id}`} titulo={s.titulo || 'Selección de la casa'} texto={s.texto} pct={datosOfertas.seleccion.pct} piezas={datosOfertas.seleccion.piezas} acciones={acciones} /> : undefined;
      case 'casa': return acciones && datosOfertas && seDibuja('casa', datosOfertas, hayPiezas, true)
        ? <OfertasCasa id={`t-${s.id}`} titulo={s.titulo || 'Ofertas de la casa'} texto={s.texto} casas={datosOfertas.casa} acciones={acciones} /> : undefined;
      case 'escote': return acciones && datosOfertas?.pareja_pct != null && seDibuja('escote', datosOfertas, hayPiezas, true)
        ? <Escote id={`t-${s.id}`} titulo={s.titulo || '¿Qué escote usas?'} texto={s.texto} piezas={piezasDeLaTienda} pct={datosOfertas.pareja_pct} acciones={acciones} /> : undefined;
      default: return undefined;
    }
  }

  const partes: ReactNode[] = [];
  let buscadorPuesto = false;
  const ponerBuscador = () => {
    if (buscadorPuesto) return;
    buscadorPuesto = true;
    partes.push(<div key="buscador">{buscador}{aviso}</div>);
  };
  for (const s of secciones) {
    const nodo = dibujar(s);
    if (nodo === undefined) continue;
    // El buscador va justo después de la portada y las cintas.
    if (s.tipo !== 'portada' && s.tipo !== 'cintas') ponerBuscador();
    partes.push(<Seccion key={s.id} tipo={s.tipo}>{nodo}</Seccion>);
  }
  ponerBuscador();

  return (
    <ProveedorLanding valor={contexto}>
      <h1 className="visualmente-oculto">Lux by Emory: joyas para usar todos los días</h1>
      <Puertas />
      {partes}
    </ProveedorLanding>
  );
}
