import { useCallback, useEffect, useRef, useState } from 'react';
import { urlPublicaFoto } from '../lib/fotos';

export interface FotoAmpliada {
  nombre: string;
  sku?: string;
  nota?: string | null;
  /** Ruta de la foto grande; si falta, se cae al thumb. */
  path: string | null;
  thumbPath?: string | null;
  /** De que esta hecha la pieza. Es cuando mas importa: se esta mirando de cerca. */
  materiales?: string | null;
}

/**
 * Visor de foto a pantalla completa. Un lightbox es de las pocas veces que
 * una ventana flotante es la respuesta correcta y no pereza: la tarea es
 * mirar una sola cosa en grande y volver.
 *
 * Se cierra con Escape, tocando el fondo o con el boton. Devuelve el foco a
 * donde estaba, que en el mostrador es la pieza que se estaba mirando.
 */
export function VisorFoto({ foto, alCerrar }: { foto: FotoAmpliada | null; alCerrar: () => void }) {
  const caja = useRef<HTMLDivElement>(null);
  const previo = useRef<Element | null>(null);

  useEffect(() => {
    if (!foto) return;
    previo.current = document.activeElement;
    caja.current?.focus();

    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') alCerrar(); };
    document.addEventListener('keydown', alTeclear);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', alTeclear);
      document.body.style.overflow = overflow;
      (previo.current as HTMLElement | null)?.focus?.();
    };
  }, [foto, alCerrar]);

  if (!foto) return null;
  const url = urlPublicaFoto(foto.path ?? foto.thumbPath ?? null);

  return (
    <div
      className="visor"
      role="dialog"
      aria-modal="true"
      aria-label={`Foto de ${foto.nombre}`}
      tabIndex={-1}
      ref={caja}
      onClick={alCerrar}
    >
      <button type="button" className="visor__cerrar" onClick={alCerrar} aria-label="Cerrar la foto">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>

      <figure className="visor__marco" onClick={(e) => e.stopPropagation()}>
        {url
          ? <img className="visor__foto" src={url} alt={foto.nombre} />
          : <div className="visor__sinfoto">Esta pieza todavia no tiene foto.</div>}
        <figcaption className="visor__pie">
          <span className="visor__nombre">{foto.nombre}</span>
          {foto.sku ? <span className="visor__sku">{foto.sku}</span> : null}
          {foto.nota ? <span className="visor__nota">{foto.nota}</span> : null}
          {foto.materiales ? <span className="visor__materiales">{foto.materiales}</span> : null}
        </figcaption>
      </figure>
    </div>
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

/** Estado del visor, para no repetirlo en cada pantalla. */
export function useVisorFoto() {
  const [foto, setFoto] = useState<FotoAmpliada | null>(null);
  const cerrar = useCallback(() => setFoto(null), []);
  return { foto, abrir: setFoto, cerrar };
}
