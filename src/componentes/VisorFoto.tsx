import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as EventoPuntero } from 'react';
import { urlPublicaFoto } from '../lib/fotos';
import { formatearBcv, formatearBinance, formatearBs } from '../lib/dinero';
import { nombreConVariante } from '../lib/familias';

/** Una de las opciones de la pieza. Una pieza suelta tiene una sola. */
export interface VarianteVisor {
  id: number;
  /** "45 cm". Null si la pieza va suelta. */
  etiqueta: string | null;
  sku?: string;
  /** Ruta de la foto grande; si falta, se cae al thumb. */
  path: string | null;
  thumbPath?: string | null;
  /** Bolivares y dolares BCV, del mismo tamano, como en las etiquetas. */
  bs?: number | null;
  bcv?: number | null;
  /** Solo donde se ensena: mostrador y administracion. Nunca en lo publico. */
  binance?: number | null;
  quedan?: number | null;
  /** La nota libre de la pieza. */
  nota?: string | null;
}

export interface FotoAmpliada {
  clave: number | string;
  nombre: string;
  categoria?: string | null;
  /** De que esta hecha. Es cuando mas importa: se esta mirando de cerca. */
  materiales?: string | null;
  variantes: VarianteVisor[];
}

interface AccionVisor {
  texto: string;
  alTocar: (varianteId: number) => void;
  deshabilitada?: (varianteId: number) => boolean;
  /** Cuantas lleva ya, para decirlo en el boton. */
  llevas?: (varianteId: number) => number;
}

interface PropsVisor {
  foto: FotoAmpliada | null;
  alCerrar: () => void;
  alAnterior?: (() => void) | undefined;
  alSiguiente?: (() => void) | undefined;
  posicion?: { n: number; total: number } | null;
  accion?: AccionVisor;
}

/** Cuanto hay que arrastrar el dedo para que cuente como pasar de pieza. */
const UMBRAL_PX = 48;

/**
 * Visor de la pieza a pantalla completa. Un lightbox es de las pocas veces
 * que una ventana flotante es la respuesta correcta: la tarea es mirar una
 * cosa en grande.
 *
 * Y SE PASA DE UNA A OTRA SIN SALIR. Antes, para ver la pieza siguiente,
 * habia que cerrar, buscarla en la cuadricula y volver a abrir. Ahora:
 *
 *   - en la computadora, las flechas del teclado;
 *   - en el telefono, deslizar el dedo a un lado;
 *   - en los dos, los botones de flecha, que estan siempre a la vista. El
 *     gesto sin boton es invisible: nadie sabe que existe hasta que se lo
 *     dicen, y quien no puede deslizar se queda sin camino.
 *
 * El deslizar solo vive aqui dentro, a pantalla completa. Fuera, en la
 * cuadricula, deslizar a un lado seguiria siendo desplazar la pagina.
 *
 * Se cierra con Escape, tocando el fondo o con el boton, y devuelve el foco
 * a donde estaba: en el mostrador, la pieza que se estaba mirando.
 */
export function VisorFoto({ foto, alCerrar, alAnterior, alSiguiente, posicion, accion }: PropsVisor) {
  const caja = useRef<HTMLDivElement>(null);
  const previo = useRef<Element | null>(null);
  const inicio = useRef<{ x: number; y: number } | null>(null);
  const [direccion, setDireccion] = useState<'antes' | 'despues' | null>(null);
  const abierto = foto !== null;

  const irAntes = useCallback(() => {
    if (!alAnterior) return;
    setDireccion('antes');
    alAnterior();
  }, [alAnterior]);

  const irDespues = useCallback(() => {
    if (!alSiguiente) return;
    setDireccion('despues');
    alSiguiente();
  }, [alSiguiente]);

  // El foco y el scroll de fondo, solo al abrir y al cerrar: pasar de pieza
  // no le devuelve el foco a la cuadricula.
  useEffect(() => {
    if (!abierto) { setDireccion(null); return; }
    previo.current = document.activeElement;
    caja.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      (previo.current as HTMLElement | null)?.focus?.();
    };
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') alCerrar();
      else if (e.key === 'ArrowLeft') { e.preventDefault(); irAntes(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); irDespues(); }
    };
    document.addEventListener('keydown', alTeclear);
    return () => document.removeEventListener('keydown', alTeclear);
  }, [abierto, alCerrar, irAntes, irDespues]);

  if (!foto) return null;

  // Solo el dedo. Con el raton se usan las flechas: arrastrar para pasar
  // de foto en una computadora es un gesto que nadie espera.
  function alBajar(e: EventoPuntero<HTMLDivElement>) {
    inicio.current = e.pointerType === 'mouse' ? null : { x: e.clientX, y: e.clientY };
  }
  function alSoltar(e: EventoPuntero<HTMLDivElement>) {
    const i = inicio.current;
    inicio.current = null;
    if (!i) return;
    const dx = e.clientX - i.x;
    const dy = e.clientY - i.y;
    // Tiene que ser claramente de lado: un dedo que baja leyendo el
    // nombre no puede cambiar de pieza.
    if (Math.abs(dx) < UMBRAL_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) irDespues(); else irAntes();
  }

  return (
    <div
      className="visor"
      role="dialog"
      aria-modal="true"
      aria-label={`Detalle de ${foto.nombre}`}
      tabIndex={-1}
      ref={caja}
      onClick={alCerrar}
      onPointerDown={alBajar}
      onPointerUp={alSoltar}
      onPointerCancel={() => { inicio.current = null; }}
    >
      <button type="button" className="visor__cerrar" onClick={alCerrar} aria-label="Cerrar el detalle">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>

      {alAnterior ? (
        <button
          type="button"
          className="visor__flecha visor__flecha--antes"
          onClick={(e) => { e.stopPropagation(); irAntes(); }}
          aria-label="Pieza anterior"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
      ) : null}
      {alSiguiente ? (
        <button
          type="button"
          className="visor__flecha visor__flecha--despues"
          onClick={(e) => { e.stopPropagation(); irDespues(); }}
          aria-label="Pieza siguiente"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
      ) : null}

      {/* La clave reinicia la variante elegida al pasar de pieza. */}
      <Contenido
        key={foto.clave}
        foto={foto}
        direccion={direccion}
        posicion={posicion ?? null}
        {...(accion ? { accion } : {})}
      />
    </div>
  );
}

function Contenido({
  foto, direccion, posicion, accion,
}: {
  foto: FotoAmpliada;
  direccion: 'antes' | 'despues' | null;
  posicion: { n: number; total: number } | null;
  accion?: AccionVisor;
}) {
  const [elegida, setElegida] = useState(0);
  const v = foto.variantes[elegida] ?? foto.variantes[0];
  const url = v ? urlPublicaFoto(v.path ?? v.thumbPath ?? null) : null;
  const varias = foto.variantes.length > 1;
  const llevas = v && accion?.llevas ? accion.llevas(v.id) : 0;
  const clase = 'visor__marco' + (direccion ? ` visor__marco--${direccion}` : '');

  return (
    <figure className={clase} onClick={(e) => e.stopPropagation()}>
      {url
        ? <img className="visor__foto" src={url} alt={nombreConVariante(foto.nombre, v?.etiqueta)} draggable={false} />
        : <div className="visor__sinfoto">Esta pieza todavia no tiene foto.</div>}

      <figcaption className="visor__pie">
        {foto.categoria ? <span className="visor__categoria">{foto.categoria}</span> : null}
        <span className="visor__nombre">{foto.nombre}</span>
        {v?.sku ? <span className="visor__sku">{v.sku}</span> : null}

        {/* Las variantes son opciones de ESTA pieza: se eligen aqui, sin
            salir a buscar otra tarjeta. */}
        {varias ? (
          <div className="visor__variantes" role="group" aria-label="Elige la variante">
            {foto.variantes.map((x, i) => (
              <button key={x.id} type="button" aria-pressed={i === elegida} onClick={() => setElegida(i)}>
                {x.etiqueta ?? `Opción ${i + 1}`}
              </button>
            ))}
          </div>
        ) : v?.etiqueta ? (
          <span className="visor__nota">{v.etiqueta}</span>
        ) : null}

        {v && (v.bs != null || v.bcv != null) ? (
          <div className="visor__precios">
            <span className="visor__precio">{formatearBs(v.bs ?? null)}</span>
            <span className="visor__precio">{formatearBcv(v.bcv ?? null)}</span>
            {v.binance != null ? <span className="visor__binance">{formatearBinance(v.binance)}</span> : null}
          </div>
        ) : null}

        {v?.quedan != null ? (
          <span className="visor__nota">{v.quedan === 1 ? 'Queda 1' : `Quedan ${v.quedan}`}</span>
        ) : null}
        {v?.nota ? <span className="visor__nota">{v.nota}</span> : null}
        {foto.materiales ? <span className="visor__materiales">{foto.materiales}</span> : null}

        {accion && v ? (
          <button
            type="button"
            className="boton visor__accion"
            disabled={accion.deshabilitada?.(v.id) ?? false}
            onClick={() => accion.alTocar(v.id)}
          >
            {accion.texto}
            {llevas > 0 ? <span className="visor__llevas">llevas {llevas}</span> : null}
          </button>
        ) : null}

        {posicion && posicion.total > 1 ? (
          <span className="visor__posicion" aria-live="polite">{posicion.n} de {posicion.total}</span>
        ) : null}
      </figcaption>
    </figure>
  );
}

/**
 * Detecta el doble toque sin retrasar el toque simple.
 *
 * En el mostrador el toque simple agrega una pieza y tiene que ser
 * instantaneo, asi que no se puede esperar a ver si viene un segundo. Se
 * deja pasar el primero y, si llega el segundo dentro de la ventana, se
 * avisa para que quien llama deshaga lo que hicieron los dos toques.
 */
export function useDobleToque(ventanaMs = 320) {
  const ultimo = useRef<{ id: number; t: number } | null>(null);

  return useCallback((id: number) => {
    const ahora = Date.now();
    const anterior = ultimo.current;
    if (anterior && anterior.id === id && ahora - anterior.t < ventanaMs) {
      ultimo.current = null;
      return true;      // fue doble: quien llama deshace el primer toque
    }
    ultimo.current = { id, t: ahora };
    return false;
  }, [ventanaMs]);
}

/**
 * Estado del visor, para no repetirlo en cada pantalla.
 *
 * `abrir(pieza, lista)` recibe la pieza y la lista de la que forma parte,
 * que es lo que permite pasar a la siguiente sin cerrar. Sin lista, el
 * visor ensena esa sola, como antes.
 */
export function useVisorFoto() {
  const [estado, setEstado] = useState<{ lista: FotoAmpliada[]; i: number } | null>(null);

  const abrir = useCallback((foto: FotoAmpliada, lista?: FotoAmpliada[]) => {
    const todas = lista && lista.length > 0 ? lista : [foto];
    setEstado({ lista: todas, i: Math.max(0, todas.findIndex((f) => f.clave === foto.clave)) });
  }, []);

  const cerrar = useCallback(() => setEstado(null), []);

  const mover = useCallback((paso: number) => {
    setEstado((e) => {
      if (!e) return e;
      const i = e.i + paso;
      return i < 0 || i >= e.lista.length ? e : { ...e, i };
    });
  }, []);
  const anterior = useCallback(() => mover(-1), [mover]);
  const siguiente = useCallback(() => mover(1), [mover]);

  // La vecina se descarga mientras se mira esta: en la conexion de la
  // tienda, pasar de pieza no deberia ensenar una foto a medio cargar.
  useEffect(() => {
    if (!estado) return;
    for (const j of [estado.i + 1, estado.i - 1]) {
      const v = estado.lista[j]?.variantes[0];
      const url = v ? urlPublicaFoto(v.path ?? v.thumbPath ?? null) : null;
      if (url) { const img = new Image(); img.src = url; }
    }
  }, [estado]);

  const foto = estado ? estado.lista[estado.i] ?? null : null;

  return {
    foto,
    abrir,
    cerrar,
    /** Lo que se le pasa tal cual a <VisorFoto {...visor.props} />. */
    props: {
      foto,
      alCerrar: cerrar,
      alAnterior: estado && estado.i > 0 ? anterior : undefined,
      alSiguiente: estado && estado.i < estado.lista.length - 1 ? siguiente : undefined,
      posicion: estado ? { n: estado.i + 1, total: estado.lista.length } : null,
    },
  };
}
